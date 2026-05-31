
CREATE OR REPLACE FUNCTION public.migrate_catalog_monitors_to_profile(
  p_old_profile_id uuid,
  p_new_profile_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.effective_user_id();
  v_owns_old boolean;
  v_owns_new boolean;
  v_monitors_migrated int := 0;
  v_cat record;
  v_ps record;
  v_new_cat_uuid uuid;
  v_new_ps_uuid uuid;
  v_old_cat_fb text;
  v_old_ps_fb text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM facebook_profiles WHERE id = p_old_profile_id AND user_id = v_user) INTO v_owns_old;
  SELECT EXISTS(SELECT 1 FROM facebook_profiles WHERE id = p_new_profile_id AND user_id = v_user) INTO v_owns_new;
  IF NOT v_owns_old OR NOT v_owns_new THEN
    RAISE EXCEPTION 'Not authorized to migrate between these profiles';
  END IF;

  -- For each catalog under old profile referenced by monitors of this user
  FOR v_cat IN
    SELECT DISTINCT fc.id AS cat_uuid, fc.catalog_id AS fb_catalog_id
    FROM facebook_catalogs fc
    JOIN catalog_media_monitors m ON m.catalog_id = fc.id
    WHERE fc.profile_id = p_old_profile_id AND m.user_id = v_user
  LOOP
    -- Find or re-parent catalog in new profile
    SELECT id INTO v_new_cat_uuid
    FROM facebook_catalogs
    WHERE profile_id = p_new_profile_id AND catalog_id = v_cat.fb_catalog_id;

    IF v_new_cat_uuid IS NULL THEN
      UPDATE facebook_catalogs SET profile_id = p_new_profile_id, updated_at = now()
      WHERE id = v_cat.cat_uuid;
      v_new_cat_uuid := v_cat.cat_uuid;
    END IF;

    -- For each product_set under this old catalog referenced by user's monitors
    FOR v_ps IN
      SELECT DISTINCT ps.id AS ps_uuid, ps.product_set_id AS fb_ps_id
      FROM facebook_product_sets ps
      JOIN catalog_media_monitors m ON m.product_set_id = ps.id
      WHERE ps.catalog_id = v_cat.cat_uuid AND m.user_id = v_user
    LOOP
      SELECT id INTO v_new_ps_uuid
      FROM facebook_product_sets
      WHERE catalog_id = v_new_cat_uuid AND product_set_id = v_ps.fb_ps_id;

      IF v_new_ps_uuid IS NULL THEN
        UPDATE facebook_product_sets SET catalog_id = v_new_cat_uuid, updated_at = now()
        WHERE id = v_ps.ps_uuid;
        v_new_ps_uuid := v_ps.ps_uuid;
      END IF;

      UPDATE catalog_media_monitors
      SET profile_id = p_new_profile_id,
          catalog_id = v_new_cat_uuid,
          product_set_id = v_new_ps_uuid,
          is_active = true,
          updated_at = now()
      WHERE user_id = v_user
        AND profile_id = p_old_profile_id
        AND product_set_id = v_ps.ps_uuid;

      GET DIAGNOSTICS v_monitors_migrated = ROW_COUNT;
    END LOOP;
  END LOOP;

  -- Fallback: any remaining monitors still on old profile (catalogs already migrated etc.)
  UPDATE catalog_media_monitors
  SET profile_id = p_new_profile_id, is_active = true, updated_at = now()
  WHERE user_id = v_user AND profile_id = p_old_profile_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.migrate_catalog_monitors_to_profile(uuid, uuid) TO authenticated;
