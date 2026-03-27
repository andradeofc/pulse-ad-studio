-- Remove product sets linked to catalogs of disconnected profiles (test account only)
DELETE FROM facebook_product_sets
WHERE catalog_id IN (
  SELECT fc.id FROM facebook_catalogs fc
  JOIN facebook_profiles fp ON fp.id = fc.profile_id
  WHERE fp.user_id = '5bae9575-7b21-492a-82c1-20e77407a5a8'
  AND fp.status = 'disconnected'
);

-- Remove catalogs of disconnected profiles (test account only)
DELETE FROM facebook_catalogs
WHERE profile_id IN (
  SELECT id FROM facebook_profiles
  WHERE user_id = '5bae9575-7b21-492a-82c1-20e77407a5a8'
  AND status = 'disconnected'
)