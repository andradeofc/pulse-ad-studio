
-- facebook_business_managers: team member policies
CREATE POLICY "Team members can view owner BMs"
ON public.facebook_business_managers FOR SELECT
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_business_managers.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can insert owner BMs"
ON public.facebook_business_managers FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_business_managers.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can update owner BMs"
ON public.facebook_business_managers FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_business_managers.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can delete owner BMs"
ON public.facebook_business_managers FOR DELETE
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_business_managers.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

-- facebook_pages: team member policies
CREATE POLICY "Team members can view owner pages"
ON public.facebook_pages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_pages.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can insert owner pages"
ON public.facebook_pages FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_pages.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can update owner pages"
ON public.facebook_pages FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_pages.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can delete owner pages"
ON public.facebook_pages FOR DELETE
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_pages.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

-- facebook_pixels: team member policies
CREATE POLICY "Team members can view owner pixels"
ON public.facebook_pixels FOR SELECT
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_pixels.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can insert owner pixels"
ON public.facebook_pixels FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_pixels.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can update owner pixels"
ON public.facebook_pixels FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_pixels.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can delete owner pixels"
ON public.facebook_pixels FOR DELETE
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_pixels.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

-- facebook_catalogs: team member policies
CREATE POLICY "Team members can view owner catalogs"
ON public.facebook_catalogs FOR SELECT
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_catalogs.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can insert owner catalogs"
ON public.facebook_catalogs FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_catalogs.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can update owner catalogs"
ON public.facebook_catalogs FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_catalogs.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can delete owner catalogs"
ON public.facebook_catalogs FOR DELETE
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_catalogs.profile_id
    AND facebook_profiles.user_id = effective_user_id()
));

-- facebook_product_sets: team member policies
CREATE POLICY "Team members can view owner product sets"
ON public.facebook_product_sets FOR SELECT
USING (EXISTS (
  SELECT 1 FROM facebook_catalogs
  JOIN facebook_profiles ON facebook_profiles.id = facebook_catalogs.profile_id
  WHERE facebook_catalogs.id = facebook_product_sets.catalog_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can insert owner product sets"
ON public.facebook_product_sets FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM facebook_catalogs
  JOIN facebook_profiles ON facebook_profiles.id = facebook_catalogs.profile_id
  WHERE facebook_catalogs.id = facebook_product_sets.catalog_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can update owner product sets"
ON public.facebook_product_sets FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM facebook_catalogs
  JOIN facebook_profiles ON facebook_profiles.id = facebook_catalogs.profile_id
  WHERE facebook_catalogs.id = facebook_product_sets.catalog_id
    AND facebook_profiles.user_id = effective_user_id()
));

CREATE POLICY "Team members can delete owner product sets"
ON public.facebook_product_sets FOR DELETE
USING (EXISTS (
  SELECT 1 FROM facebook_catalogs
  JOIN facebook_profiles ON facebook_profiles.id = facebook_catalogs.profile_id
  WHERE facebook_catalogs.id = facebook_product_sets.catalog_id
    AND facebook_profiles.user_id = effective_user_id()
));
