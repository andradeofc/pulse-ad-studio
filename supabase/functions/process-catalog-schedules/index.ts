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
  data: Record<string, string>;
}

interface BatchResponse {
  handles?: string[];
  validation_status?: Array<{
    retailer_id: string;
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
        const uniqueProductsMap = new Map<string, FacebookProduct>();
        for (const product of allProducts) {
          if (product.retailer_id && !uniqueProductsMap.has(product.retailer_id)) {
            uniqueProductsMap.set(product.retailer_id, product);
          }
        }
        const uniqueProducts = Array.from(uniqueProductsMap.values());

        console.log(`[process-catalog-schedules] Unique products after dedup: ${uniqueProducts.length}`);

        if (uniqueProducts.length === 0) {
          throw new Error('No products found in the product set');
        }

        let productsUpdated = 0;
        const errors: string[] = [];

        // Process products in batches of 5000 (Facebook's limit per request)
        const BATCH_SIZE = 4999;
        
        for (let i = 0; i < uniqueProducts.length; i += BATCH_SIZE) {
          const productBatch = uniqueProducts.slice(i, i + BATCH_SIZE);
          
          // Prepare batch requests
          const batchRequests: BatchRequest[] = productBatch.map((product) => {
            const data: Record<string, string> = {};
            
            if (typedCreative.type === 'video') {
              // For video, use the video field with array of objects
              data.video = JSON.stringify([{ url: typedCreative.url }]);
            } else {
              // For images, use additional_image_link (comma-separated URLs)
              data.additional_image_link = typedCreative.url;
            }
            
            return {
              method: 'UPDATE' as const,
              retailer_id: product.retailer_id,
              data,
            };
          });

          console.log(`[process-catalog-schedules] Sending batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batchRequests.length} products`);

          // Send batch update using items_batch endpoint
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
                requests: batchRequests,
              }),
            },
            `batch update ${Math.floor(i / BATCH_SIZE) + 1}`
          );

          const batchResult: BatchResponse = await batchResponse.json();

          if (batchResult.error) {
            errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchResult.error.message}`);
            console.error(`[process-catalog-schedules] Batch error:`, batchResult.error);
            continue;
          }

          // Check validation status if available
          if (batchResult.validation_status) {
            for (const status of batchResult.validation_status) {
              if (status.status === 'success') {
                productsUpdated++;
              } else {
                const errorMsg = status.errors?.map(e => e.message).join(', ') || 'Unknown error';
                errors.push(`${status.retailer_id}: ${errorMsg}`);
              }
            }
          } else if (batchResult.handles && batchResult.handles.length > 0) {
            // If we got handles, the batch was accepted for processing
            productsUpdated += productBatch.length;
            console.log(`[process-catalog-schedules] Batch accepted with handles: ${batchResult.handles.join(', ')}`);
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
