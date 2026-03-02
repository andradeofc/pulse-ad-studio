import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CatalogSchedule {
  id: string;
  user_id: string;
  creative_id: string;
  profile_id: string;
  catalog_id: string;
  product_set_id: string;
  scheduled_at: string;
  status: string;
}

interface Creative {
  id: string;
  url: string;
  type: string;
}

// FacebookProfile interface removed - access_token now stored in facebook_credentials

interface FacebookCatalog {
  catalog_id: string;
}

interface FacebookProductSet {
  product_set_id: string;
}

interface FacebookProduct {
  id: string;
  retailer_id: string;
  name?: string;
}

interface BatchRequest {
  method: 'UPDATE';
  retailer_id: string;
  data: Record<string, unknown>;
}

interface BatchResponse {
  handles?: string[];
  validation_status?: Array<{
    retailer_id?: string;
    status: string;
    errors?: Array<{ message: string }>;
    warnings?: Array<{ message: string }>;
  }>;
  error?: {
    message: string;
    code: number;
  };
}

interface BatchStatusResponse {
  data?: Array<{
    handle: string;
    status: 'finished' | 'in_progress' | 'error';
    errors?: Array<{ id: string; message: string }>;
    warnings?: Array<{ id: string; message: string }>;
    ids_of_invalid_requests?: string[];
  }>;
  error?: {
    message: string;
    code: number;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Check the status of a batch request using the handle
async function checkBatchStatus(
  catalogId: string,
  handle: string,
  accessToken: string,
  maxAttempts = 10,
  intervalMs = 2000
): Promise<{ finished: boolean; errors: string[]; invalidRetailerIds: string[] }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url = `https://graph.facebook.com/v21.0/${catalogId}/check_batch_request_status?handle=${encodeURIComponent(handle)}&load_ids_of_invalid_requests=true&access_token=${accessToken}`;
    
    const response = await fetch(url, { method: 'GET' });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[process-catalog-schedules] check_batch_request_status failed: ${errorText}`);
      return { finished: false, errors: [`Status check failed: ${errorText}`], invalidRetailerIds: [] };
    }
    
    const result: BatchStatusResponse = await response.json();
    
    if (result.error) {
      console.error(`[process-catalog-schedules] check_batch_request_status error:`, result.error);
      return { finished: false, errors: [result.error.message], invalidRetailerIds: [] };
    }
    
    if (result.data && result.data.length > 0) {
      const status = result.data[0];
      console.log(`[process-catalog-schedules] Batch status check ${attempt}/${maxAttempts}: ${status.status}`);
      
      if (status.status === 'finished') {
        const errors: string[] = [];
        const invalidRetailerIds: string[] = status.ids_of_invalid_requests || [];
        
        if (status.errors && status.errors.length > 0) {
          for (const err of status.errors) {
            errors.push(`${err.id}: ${err.message}`);
          }
        }
        
        if (status.warnings && status.warnings.length > 0) {
          console.warn(`[process-catalog-schedules] Batch warnings:`, status.warnings);
        }
        
        console.log(`[process-catalog-schedules] Batch finished. Errors: ${errors.length}, Invalid IDs: ${invalidRetailerIds.length}`);
        return { finished: true, errors, invalidRetailerIds };
      }
      
      if (status.status === 'error') {
        const errors = status.errors?.map(e => `${e.id}: ${e.message}`) || ['Unknown batch error'];
        return { finished: true, errors, invalidRetailerIds: status.ids_of_invalid_requests || [] };
      }
      
      // status === 'in_progress' - continue polling
    }
    
    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }
  
  console.warn(`[process-catalog-schedules] Batch status check timed out after ${maxAttempts} attempts`);
  return { finished: false, errors: ['Status check timed out - batch may still be processing'], invalidRetailerIds: [] };
}

const canonicalizeRetailerId = (value: unknown) => {
  let s = String(value ?? '');

  // Normalize unicode (defensive) so visually-identical strings become identical.
  try {
    s = s.normalize('NFKC');
  } catch {
    // ignore if normalize isn't available
  }

  // Remove invisible/zero-width + control chars that Meta may ignore.
  // These can cause "Duplicate retailer_id" even when IDs look unique in logs/UI.
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/[\u0000-\u001F\u007F]/g, '');

  return s.trim();
};

const containsDuplicateRetailerIdError = (message: string) => /duplicate retailer_id/i.test(message);

// Fetch with retry for rate limits
async function fetchWithRetry(url: string, options: RequestInit, label: string, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, options);
    
    if (res.status === 429 || res.status >= 500) {
      const waitMs = Math.min(5000, 1000 * Math.pow(2, attempt - 1));
      console.warn(`[process-catalog-schedules] ${label} got HTTP ${res.status}, attempt ${attempt}/${maxAttempts}. Waiting ${waitMs}ms`);
      
      if (attempt === maxAttempts) {
        const errorText = await res.text();
        throw new Error(`${label} failed after ${maxAttempts} retries: ${errorText}`);
      }
      
      await sleep(waitMs);
      continue;
    }
    
    return res;
  }
  
  throw new Error(`${label} failed unexpectedly`);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('[process-catalog-schedules] Starting execution...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find pending schedules that are due
    const now = new Date().toISOString();
    console.log(`[process-catalog-schedules] Checking for schedules due before: ${now}`);

    const { data: pendingSchedules, error: fetchError } = await supabase
      .from('catalog_schedules')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error('[process-catalog-schedules] Error fetching schedules:', fetchError);
      throw fetchError;
    }

    if (!pendingSchedules || pendingSchedules.length === 0) {
      console.log('[process-catalog-schedules] No pending schedules found');
      return new Response(
        JSON.stringify({ message: 'No pending schedules', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[process-catalog-schedules] Found ${pendingSchedules.length} pending schedules`);

    const results = [];

    for (const schedule of pendingSchedules as CatalogSchedule[]) {
      console.log(`[process-catalog-schedules] Processing schedule ${schedule.id}`);

      try {
        // Update status to processing
        await supabase
          .from('catalog_schedules')
          .update({ status: 'processing' })
          .eq('id', schedule.id);

        // Get creative details
        const { data: creative, error: creativeError } = await supabase
          .from('creatives')
          .select('id, url, type')
          .eq('id', schedule.creative_id)
          .single();

        if (creativeError || !creative) {
          throw new Error(`Creative not found: ${schedule.creative_id}`);
        }

        // Get profile details (without access token - it's now stored securely)
        const { data: profile, error: profileError } = await supabase
          .from('facebook_profiles')
          .select('id')
          .eq('id', schedule.profile_id)
          .single();

        if (profileError || !profile) {
          throw new Error(`Profile not found: ${schedule.profile_id}`);
        }

        // Get access token securely from facebook_credentials (service role has access)
        const { data: credentials, error: credError } = await supabase
          .from('facebook_credentials')
          .select('access_token')
          .eq('profile_id', schedule.profile_id)
          .single();

        // Fallback to facebook_profiles.access_token if credentials not found (migration period)
        let accessToken: string;
        if (credentials?.access_token) {
          accessToken = credentials.access_token;
          console.log(`[process-catalog-schedules] Using secure credentials for profile ${schedule.profile_id}`);
        } else {
          // Fallback during migration
          const { data: fallbackProfile } = await supabase
            .from('facebook_profiles')
            .select('access_token')
            .eq('id', schedule.profile_id)
            .single();
          
          if (!fallbackProfile?.access_token) {
            throw new Error(`No access token found for profile: ${schedule.profile_id}`);
          }
          accessToken = fallbackProfile.access_token;
          console.warn(`[process-catalog-schedules] Using fallback token for profile ${schedule.profile_id}`);
        }

        // Get catalog Facebook ID
        const { data: catalog, error: catalogError } = await supabase
          .from('facebook_catalogs')
          .select('catalog_id')
          .eq('id', schedule.catalog_id)
          .single();

        if (catalogError || !catalog) {
          throw new Error(`Catalog not found: ${schedule.catalog_id}`);
        }

        // Get product set Facebook ID
        const { data: productSet, error: productSetError } = await supabase
          .from('facebook_product_sets')
          .select('product_set_id')
          .eq('id', schedule.product_set_id)
          .single();

        if (productSetError || !productSet) {
          throw new Error(`Product set not found: ${schedule.product_set_id}`);
        }

        const typedCatalog = catalog as FacebookCatalog;
        const typedProductSet = productSet as FacebookProductSet;
        const typedCreative = creative as Creative;

        // Fetch all products from the product set with pagination
        console.log(`[process-catalog-schedules] Fetching products from set ${typedProductSet.product_set_id}`);
        
        const allProducts: FacebookProduct[] = [];
        let nextUrl: string | null = `https://graph.facebook.com/v21.0/${typedProductSet.product_set_id}/products?fields=id,retailer_id,name&limit=500&access_token=${accessToken}`;
        
        while (nextUrl) {
          const productsResponse = await fetchWithRetry(nextUrl, { method: 'GET' }, 'fetch products');
          
          if (!productsResponse.ok) {
            const errorData = await productsResponse.json();
            throw new Error(`Failed to fetch products: ${JSON.stringify(errorData)}`);
          }
          
          const productsData = await productsResponse.json();
          allProducts.push(...(productsData.data || []));
          
          // Check for next page
          nextUrl = productsData.paging?.next || null;
          
          // Safety limit
          if (allProducts.length >= 5000) {
            console.warn('[process-catalog-schedules] Reached 5000 products limit');
            break;
          }
        }

        console.log(`[process-catalog-schedules] Found ${allProducts.length} products in set (before dedup)`);

        // Deduplicate products by retailer_id (Facebook can return duplicates for variants)
        // Also normalize retailer_id (trim) because the Batch API can treat whitespace variants as duplicates.
        const uniqueProductsMap = new Map<string, FacebookProduct>();
        const duplicateRetailerIds: string[] = [];

        for (const product of allProducts) {
          const canonicalRetailerId = canonicalizeRetailerId(product.retailer_id);
          if (!canonicalRetailerId) continue;

          if (uniqueProductsMap.has(canonicalRetailerId)) {
            if (duplicateRetailerIds.length < 20) duplicateRetailerIds.push(canonicalRetailerId);
            continue;
          }

          uniqueProductsMap.set(canonicalRetailerId, { ...product, retailer_id: canonicalRetailerId });
        }

        const uniqueProducts = Array.from(uniqueProductsMap.values());

        console.log(`[process-catalog-schedules] Unique products after dedup: ${uniqueProducts.length}`);
        if (duplicateRetailerIds.length > 0) {
          console.warn(
            `[process-catalog-schedules] Detected ${duplicateRetailerIds.length} duplicate retailer_id values (showing up to 20): ${duplicateRetailerIds.join(', ')}`
          );
        }

        // Helpful debug for small sets
        if (uniqueProducts.length > 0 && uniqueProducts.length <= 50) {
          console.log(
            `[process-catalog-schedules] Retailer IDs to update (<=50): ${uniqueProducts.map((p) => p.retailer_id).join(', ')}`
          );
        }

        if (uniqueProducts.length === 0) {
          throw new Error('No products found in the product set');
        }

        // Insert product tracking records
        const productRecords = uniqueProducts.map((product) => ({
          schedule_id: schedule.id,
          retailer_id: canonicalizeRetailerId(product.retailer_id),
          product_name: product.name || null,
          status: 'pending',
        }));

        const { error: insertProductsError } = await supabase
          .from('catalog_schedule_products')
          .insert(productRecords);

        if (insertProductsError) {
          console.warn('[process-catalog-schedules] Failed to insert product tracking records:', insertProductsError);
        } else {
          console.log(`[process-catalog-schedules] Inserted ${productRecords.length} product tracking records`);
        }

        let productsUpdated = 0;
        const errors: string[] = [];

        const sendItemsBatchOnce = async (reqs: BatchRequest[], label: string) => {
          const batchResponse = await fetchWithRetry(
            `https://graph.facebook.com/v21.0/${typedCatalog.catalog_id}/items_batch`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                access_token: accessToken,
                item_type: 'PRODUCT_ITEM',
                requests: reqs,
              }),
            },
            label
          );

          const batchResult: BatchResponse = await batchResponse.json();

          const duplicateError =
            (batchResult.error?.message && containsDuplicateRetailerIdError(batchResult.error.message)) ||
            (batchResult.validation_status?.some((vs) =>
              (vs.errors || []).some((e) => containsDuplicateRetailerIdError(e.message))
            ) ?? false);

          const outErrors: string[] = [];

          if (batchResult.error) {
            outErrors.push(`batch: ${batchResult.error.message}`);
            console.error(`[process-catalog-schedules] ${label} batch error:`, batchResult.error);
            return { updated: 0, errors: outErrors, duplicateError };
          }

          if (batchResult.validation_status) {
            let updated = 0;
            const successRetailerIds: string[] = [];
            const failedRetailerIds: { retailer_id: string; error: string }[] = [];

            for (const status of batchResult.validation_status) {
              if (status.status === 'success') {
                updated++;
                if (status.retailer_id) successRetailerIds.push(status.retailer_id);
                continue;
              }

              const errorMsg = status.errors?.map((e) => e.message).join(', ') || 'Unknown error';
              const retailerIdLabel = status.retailer_id ? status.retailer_id : 'batch';
              outErrors.push(`${retailerIdLabel}: ${errorMsg}`);
              if (status.retailer_id) {
                failedRetailerIds.push({ retailer_id: status.retailer_id, error: errorMsg });
              }
            }

            console.log(`[process-catalog-schedules] ${label} validation results: ${updated} success, ${failedRetailerIds.length} failed`);
            if (failedRetailerIds.length > 0) {
              console.log(`[process-catalog-schedules] Failed retailer_ids: ${JSON.stringify(failedRetailerIds)}`);
            }

            return { updated, errors: outErrors, duplicateError, successRetailerIds, failedRetailerIds };
          }

          // When we get handles, we need to poll for actual completion status
          if (batchResult.handles && batchResult.handles.length > 0) {
            const handle = batchResult.handles[0];
            console.log(`[process-catalog-schedules] ${label} accepted with handle: ${handle}. Polling for completion...`);
            
            // Poll the check_batch_request_status endpoint to verify actual completion
            const statusResult = await checkBatchStatus(
              typedCatalog.catalog_id,
              handle,
              accessToken,
              15, // max attempts (15 * 2s = 30s max wait)
              2000 // 2 second intervals
            );
            
            const allRetailerIds = reqs.map((r) => r.retailer_id);
            
            if (!statusResult.finished) {
              // Timeout - mark as pending, not success
              console.warn(`[process-catalog-schedules] ${label} batch processing not confirmed within timeout`);
              outErrors.push('Batch processing timeout - status uncertain');
              return { 
                updated: 0, 
                errors: outErrors, 
                duplicateError: false, 
                successRetailerIds: [], 
                failedRetailerIds: allRetailerIds.map(id => ({ retailer_id: id, error: 'Processing timeout' }))
              };
            }
            
            // Check which products failed
            const invalidSet = new Set(statusResult.invalidRetailerIds);
            const successRetailerIds: string[] = [];
            const failedRetailerIds: { retailer_id: string; error: string }[] = [];
            
            for (const retailerId of allRetailerIds) {
              if (invalidSet.has(retailerId)) {
                failedRetailerIds.push({ retailer_id: retailerId, error: 'Rejected by Facebook' });
              } else {
                successRetailerIds.push(retailerId);
              }
            }
            
            // Add any batch-level errors
            for (const err of statusResult.errors) {
              outErrors.push(err);
            }
            
            console.log(`[process-catalog-schedules] ${label} confirmed: ${successRetailerIds.length} success, ${failedRetailerIds.length} failed`);
            
            return { 
              updated: successRetailerIds.length, 
              errors: outErrors, 
              duplicateError: false, 
              successRetailerIds, 
              failedRetailerIds 
            };
          }

          console.warn(
            `[process-catalog-schedules] ${label} unexpected response shape: ${JSON.stringify(batchResult).slice(0, 1500)}`
          );
          return { updated: 0, errors: outErrors.length ? outErrors : ['batch: Unknown response'], duplicateError: false, successRetailerIds: [], failedRetailerIds: [] };
        };

        const sendItemsBatchWithSplit = async (
          reqs: BatchRequest[],
          label: string,
          depth: number
        ): Promise<{ updated: number; errors: string[]; successRetailerIds: string[]; failedRetailerIds: { retailer_id: string; error: string }[] }> => {
          const result = await sendItemsBatchOnce(reqs, label);

          // Professional fallback: if Meta complains about duplicate retailer_id at the batch level,
          // recursively split the payload until the problematic pair is separated.
          if (result.duplicateError && reqs.length > 1 && depth < 12) {
            console.warn(
              `[process-catalog-schedules] ${label} reported duplicate retailer_id; splitting payload (size=${reqs.length}, depth=${depth})`
            );

            const a: BatchRequest[] = [];
            const b: BatchRequest[] = [];
            reqs.forEach((r, idx) => (idx % 2 === 0 ? a : b).push(r));

            const ra = await sendItemsBatchWithSplit(a, `${label}.a`, depth + 1);
            // small delay to reduce rate-limit pressure if we need many calls
            await sleep(200);
            const rb = await sendItemsBatchWithSplit(b, `${label}.b`, depth + 1);

            return { 
              updated: ra.updated + rb.updated, 
              errors: [...ra.errors, ...rb.errors],
              successRetailerIds: [...ra.successRetailerIds, ...rb.successRetailerIds],
              failedRetailerIds: [...ra.failedRetailerIds, ...rb.failedRetailerIds],
            };
          }

          return { 
            updated: result.updated, 
            errors: result.errors,
            successRetailerIds: result.successRetailerIds || [],
            failedRetailerIds: result.failedRetailerIds || [],
          };
        };

        // Process products in batches of 5000 (Facebook's limit per request)
        const BATCH_SIZE = 4999;
        
        for (let i = 0; i < uniqueProducts.length; i += BATCH_SIZE) {
          const productBatch = uniqueProducts.slice(i, i + BATCH_SIZE);
          
          // Safety: ensure uniqueness inside the batch (defensive, should already be unique)
          const seenRetailerIds = new Set<string>();
          const dedupedBatch = productBatch.filter((p) => {
            const id = canonicalizeRetailerId(p.retailer_id);
            if (!id) return false;
            if (seenRetailerIds.has(id)) return false;
            seenRetailerIds.add(id);
            return true;
          });

          if (dedupedBatch.length !== productBatch.length) {
            console.warn(
              `[process-catalog-schedules] Dropped ${productBatch.length - dedupedBatch.length} duplicate/invalid retailer_id entries inside batch ${Math.floor(i / BATCH_SIZE) + 1}`
            );
          }

          // Prepare batch requests
          const batchRequests: BatchRequest[] = dedupedBatch.map((product) => {
            const canonicalId = canonicalizeRetailerId(product.retailer_id);
            const data: Record<string, unknown> = {
              // CRITICAL: Facebook requires 'id' field in data object for UPDATE operations
              id: canonicalId,
            };

            if (typedCreative.type === 'video') {
              // For video, use the video field - array of objects with url property
              // DO NOT JSON.stringify - the whole body is serialized later
              data.video = [{ url: typedCreative.url }];
            } else {
              // For images, additional_image_link is an array of strings (up to 50 URLs)
              // DO NOT JSON.stringify - the whole body is serialized later
              data.additional_image_link = [typedCreative.url];
            }

            return {
              method: 'UPDATE' as const,
              retailer_id: canonicalId,
              data,
            };
          });

          // Log detailed payload for debugging (first 3 requests only)
          if (batchRequests.length > 0) {
            const samplePayload = {
              access_token: '[REDACTED]',
              item_type: 'PRODUCT_ITEM',
              requests: batchRequests.slice(0, 3),
            };
            console.log(`[process-catalog-schedules] Sample payload (first 3 items): ${JSON.stringify(samplePayload, null, 2)}`);
          }

          console.log(`[process-catalog-schedules] Sending batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batchRequests.length} products`);

           // Send batch update using items_batch endpoint (with adaptive splitting on duplicate retailer_id)
           const outcome = await sendItemsBatchWithSplit(
             batchRequests,
             `batch update ${Math.floor(i / BATCH_SIZE) + 1}`,
             0
           );

           productsUpdated += outcome.updated;
           errors.push(...outcome.errors);

           // Update product tracking records
           if (outcome.successRetailerIds.length > 0) {
             const { error: updateSuccessError } = await supabase
               .from('catalog_schedule_products')
               .update({ status: 'success', updated_at: new Date().toISOString() })
               .eq('schedule_id', schedule.id)
               .in('retailer_id', outcome.successRetailerIds);
             
             if (updateSuccessError) {
               console.warn('[process-catalog-schedules] Failed to update success product records:', updateSuccessError);
             }
           }

           if (outcome.failedRetailerIds.length > 0) {
             for (const failed of outcome.failedRetailerIds) {
               await supabase
                 .from('catalog_schedule_products')
                 .update({ status: 'failed', error_message: failed.error, updated_at: new Date().toISOString() })
                 .eq('schedule_id', schedule.id)
                 .eq('retailer_id', failed.retailer_id);
             }
           }

           // Small delay between batches to avoid rate limiting
           if (i + BATCH_SIZE < uniqueProducts.length) {
             await sleep(500);
           }
        }

        // Update schedule status
        const finalStatus = productsUpdated > 0 ? 'completed' : 'failed';
        const errorMessage = errors.length > 0 ? errors.slice(0, 10).join('; ') : null;

        await supabase
          .from('catalog_schedules')
          .update({
            status: finalStatus,
            processed_at: new Date().toISOString(),
            products_updated: productsUpdated,
            error_message: errorMessage,
          })
          .eq('id', schedule.id);

        results.push({
          scheduleId: schedule.id,
          status: finalStatus,
          productsUpdated,
          totalProducts: uniqueProducts.length,
          errorsCount: errors.length,
        });

        console.log(`[process-catalog-schedules] Schedule ${schedule.id} completed: ${productsUpdated}/${uniqueProducts.length} products updated`);

        // Auto-create monitor with auto-repair after successful schedule
        if (finalStatus === 'completed' && productsUpdated > 0) {
          try {
            // Check if a monitor already exists for this product set + user
            const { data: existingMonitor } = await supabase
              .from('catalog_media_monitors')
              .select('id, is_active, auto_repair')
              .eq('user_id', schedule.user_id)
              .eq('product_set_id', schedule.product_set_id)
              .maybeSingle();

            if (!existingMonitor) {
              // Create new monitor with auto-repair enabled
              const { error: monitorError } = await supabase
                .from('catalog_media_monitors')
                .insert({
                  user_id: schedule.user_id,
                  profile_id: schedule.profile_id,
                  catalog_id: schedule.catalog_id,
                  product_set_id: schedule.product_set_id,
                  product_set_name: (typedProductSet as any).name || 'Unknown',
                  creative_id: schedule.creative_id,
                  auto_repair: true,
                  is_active: true,
                  source: 'schedule',
                });

              if (monitorError) {
                console.error(`[process-catalog-schedules] Failed to create auto-monitor:`, monitorError);
              } else {
                console.log(`[process-catalog-schedules] Auto-monitor created for product set ${schedule.product_set_id} with auto-repair enabled`);
              }
            } else if (!existingMonitor.is_active || !existingMonitor.auto_repair) {
              // Reactivate existing monitor and ensure auto-repair is on
              const { error: updateError } = await supabase
                .from('catalog_media_monitors')
                .update({
                  is_active: true,
                  auto_repair: true,
                  creative_id: schedule.creative_id,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existingMonitor.id);

              if (updateError) {
                console.error(`[process-catalog-schedules] Failed to reactivate monitor:`, updateError);
              } else {
                console.log(`[process-catalog-schedules] Existing monitor ${existingMonitor.id} reactivated with auto-repair`);
              }
            } else {
              console.log(`[process-catalog-schedules] Monitor already active with auto-repair for product set ${schedule.product_set_id}`);
            }
          } catch (monitorErr) {
            console.error(`[process-catalog-schedules] Auto-monitor creation error:`, monitorErr);
          }
        }

      } catch (error) {
        console.error(`[process-catalog-schedules] Error processing schedule ${schedule.id}:`, error);

        // Update schedule status to failed
        await supabase
          .from('catalog_schedules')
          .update({
            status: 'failed',
            processed_at: new Date().toISOString(),
            error_message: error instanceof Error ? error.message : 'Unknown error',
          })
          .eq('id', schedule.id);

        results.push({
          scheduleId: schedule.id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`[process-catalog-schedules] Finished processing ${results.length} schedules`);

    return new Response(
      JSON.stringify({ 
        message: 'Processing complete', 
        processed: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[process-catalog-schedules] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
