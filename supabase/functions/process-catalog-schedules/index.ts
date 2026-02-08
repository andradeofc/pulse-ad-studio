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

        // Get all products from the product set
        console.log(`[process-catalog-schedules] Fetching products from set ${typedProductSet.product_set_id}`);
        
        const productsResponse = await fetch(
          `https://graph.facebook.com/v21.0/${typedProductSet.product_set_id}/products?fields=id,retailer_id,name&limit=500&access_token=${typedProfile.access_token}`
        );

        if (!productsResponse.ok) {
          const errorData = await productsResponse.json();
          throw new Error(`Failed to fetch products: ${JSON.stringify(errorData)}`);
        }

        const productsData = await productsResponse.json();
        const products = productsData.data || [];

        console.log(`[process-catalog-schedules] Found ${products.length} products in set`);

        let productsUpdated = 0;
        const errors: string[] = [];

        // Update each product with the creative
        for (const product of products) {
          try {
            // Prepare the update payload based on creative type
            const updatePayload: Record<string, string> = {};
            
            if (typedCreative.type === 'video') {
              updatePayload.video = JSON.stringify([{ url: typedCreative.url }]);
            } else {
              updatePayload.additional_image_urls = JSON.stringify([typedCreative.url]);
            }

            // Update product via Facebook API
            const updateResponse = await fetch(
              `https://graph.facebook.com/v21.0/${typedCatalog.catalog_id}:${product.retailer_id}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  access_token: typedProfile.access_token,
                  ...updatePayload,
                }),
              }
            );

            if (updateResponse.ok) {
              productsUpdated++;
              console.log(`[process-catalog-schedules] Updated product ${product.retailer_id}`);
            } else {
              const errorData = await updateResponse.json();
              errors.push(`${product.retailer_id}: ${JSON.stringify(errorData.error?.message || errorData)}`);
              console.warn(`[process-catalog-schedules] Failed to update product ${product.retailer_id}:`, errorData);
            }
          } catch (productError) {
            errors.push(`${product.retailer_id}: ${productError instanceof Error ? productError.message : 'Unknown error'}`);
          }
        }

        // Update schedule status to completed
        const finalStatus = productsUpdated > 0 ? 'completed' : 'failed';
        const errorMessage = errors.length > 0 ? errors.slice(0, 5).join('; ') : null;

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
          errorsCount: errors.length,
        });

        console.log(`[process-catalog-schedules] Schedule ${schedule.id} completed: ${productsUpdated} products updated`);

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
