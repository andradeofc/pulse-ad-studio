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

interface FacebookProfile {
  id: string;
  access_token: string;
}

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

        // Get profile with access token
        const { data: profile, error: profileError } = await supabase
          .from('facebook_profiles')
          .select('id, access_token')
          .eq('id', schedule.profile_id)
          .single();

        if (profileError || !profile) {
          throw new Error(`Profile not found: ${schedule.profile_id}`);
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

        const typedProfile = profile as FacebookProfile;
        const typedCatalog = catalog as FacebookCatalog;
        const typedProductSet = productSet as FacebookProductSet;
        const typedCreative = creative as Creative;

        // Fetch all products from the product set with pagination
        console.log(`[process-catalog-schedules] Fetching products from set ${typedProductSet.product_set_id}`);
        
        const allProducts: FacebookProduct[] = [];
        let nextUrl: string | null = `https://graph.facebook.com/v21.0/${typedProductSet.product_set_id}/products?fields=id,retailer_id,name&limit=500&access_token=${typedProfile.access_token}`;
        
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
                access_token: typedProfile.access_token,
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

            for (const status of batchResult.validation_status) {
              if (status.status === 'success') {
                updated++;
                continue;
              }

              const errorMsg = status.errors?.map((e) => e.message).join(', ') || 'Unknown error';
              const retailerIdLabel = status.retailer_id ? status.retailer_id : 'batch';
              outErrors.push(`${retailerIdLabel}: ${errorMsg}`);
            }

            return { updated, errors: outErrors, duplicateError };
          }

          if (batchResult.handles && batchResult.handles.length > 0) {
            console.log(`[process-catalog-schedules] ${label} accepted with handles: ${batchResult.handles.join(', ')}`);
            return { updated: reqs.length, errors: outErrors, duplicateError: false };
          }

          console.warn(
            `[process-catalog-schedules] ${label} unexpected response shape: ${JSON.stringify(batchResult).slice(0, 1500)}`
          );
          return { updated: 0, errors: outErrors.length ? outErrors : ['batch: Unknown response'], duplicateError: false };
        };

        const sendItemsBatchWithSplit = async (
          reqs: BatchRequest[],
          label: string,
          depth: number
        ): Promise<{ updated: number; errors: string[] }> => {
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

            return { updated: ra.updated + rb.updated, errors: [...ra.errors, ...rb.errors] };
          }

          return { updated: result.updated, errors: result.errors };
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

          console.log(`[process-catalog-schedules] Sending batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batchRequests.length} products`);

           // Send batch update using items_batch endpoint (with adaptive splitting on duplicate retailer_id)
           const outcome = await sendItemsBatchWithSplit(
             batchRequests,
             `batch update ${Math.floor(i / BATCH_SIZE) + 1}`,
             0
           );

           productsUpdated += outcome.updated;
           errors.push(...outcome.errors);

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
