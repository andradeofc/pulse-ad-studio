
UPDATE catalog_media_monitors
SET profile_id = 'f0e7f0af-3fd4-4f1a-8c56-ce69ceb1b420',
    is_active = true,
    updated_at = now()
WHERE user_id = '5bae9575-7b21-492a-82c1-20e77407a5a8'
  AND profile_id = '8f1d79d3-aca8-4975-8b8c-f7edaa727210';
