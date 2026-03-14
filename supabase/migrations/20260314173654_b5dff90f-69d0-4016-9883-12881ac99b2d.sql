-- Delete duplicate facebook_pages keeping only the most recently updated row per page_id
DELETE FROM facebook_pages
WHERE id NOT IN (
  SELECT DISTINCT ON (page_id) id
  FROM facebook_pages
  ORDER BY page_id, updated_at DESC
);