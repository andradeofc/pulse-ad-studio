-- Reassign catalog media monitors and associated catalogs to the new active profile (Vinicius Silva)
UPDATE public.facebook_catalogs
SET profile_id = 'b5fff6c4-c5e3-4473-bfb6-fad784c256cf'
WHERE profile_id = 'f0e7f0af-3fd4-4f1a-8c56-ce69ceb1b420'
  AND id IN (SELECT DISTINCT catalog_id FROM public.catalog_media_monitors);

UPDATE public.catalog_media_monitors
SET profile_id = 'b5fff6c4-c5e3-4473-bfb6-fad784c256cf',
    is_active = true,
    updated_at = now()
WHERE user_id = '5bae9575-7b21-492a-82c1-20e77407a5a8'
  AND profile_id = 'f0e7f0af-3fd4-4f1a-8c56-ce69ceb1b420';