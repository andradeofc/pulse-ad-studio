-- Migrate all 54 catalog monitors of test account from disconnected profile (Gabriela Farias)
-- to active profile (Renata Siqueira) and activate them.

-- Step 1: Copy missing product_sets to Renata's catalogs (only those used by monitors)
INSERT INTO public.facebook_product_sets (catalog_id, product_set_id, name, filter, product_count)
SELECT DISTINCT new_fc.id, old_ps.product_set_id, old_ps.name, old_ps.filter, old_ps.product_count
FROM public.catalog_media_monitors m
JOIN public.facebook_product_sets old_ps ON old_ps.id = m.product_set_id
JOIN public.facebook_catalogs old_fc ON old_fc.id = old_ps.catalog_id
JOIN public.facebook_catalogs new_fc
  ON new_fc.profile_id = '4202db66-9c4f-48b4-89e7-923f0e6212fc'
 AND new_fc.catalog_id = old_fc.catalog_id
WHERE m.user_id = '5bae9575-7b21-492a-82c1-20e77407a5a8'
  AND m.profile_id = '93c28456-a2cb-4dfe-ba87-184114ca7d12'
  AND NOT EXISTS (
    SELECT 1 FROM public.facebook_product_sets np
    WHERE np.catalog_id = new_fc.id AND np.product_set_id = old_ps.product_set_id
  );

-- Step 2: Repoint monitors to Renata's catalog/product_set and activate
UPDATE public.catalog_media_monitors m
SET profile_id = '4202db66-9c4f-48b4-89e7-923f0e6212fc',
    catalog_id = new_fc.id,
    product_set_id = new_ps.id,
    is_active = true,
    updated_at = now()
FROM public.facebook_product_sets old_ps
JOIN public.facebook_catalogs old_fc ON old_fc.id = old_ps.catalog_id
JOIN public.facebook_catalogs new_fc
  ON new_fc.profile_id = '4202db66-9c4f-48b4-89e7-923f0e6212fc'
 AND new_fc.catalog_id = old_fc.catalog_id
JOIN public.facebook_product_sets new_ps
  ON new_ps.catalog_id = new_fc.id
 AND new_ps.product_set_id = old_ps.product_set_id
WHERE m.user_id = '5bae9575-7b21-492a-82c1-20e77407a5a8'
  AND m.profile_id = '93c28456-a2cb-4dfe-ba87-184114ca7d12'
  AND m.product_set_id = old_ps.id;