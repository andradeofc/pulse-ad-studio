-- Drop and recreate the RLS policies for facebook_pixels to use direct check instead of function
DROP POLICY IF EXISTS "Users can view pixels from their profiles" ON public.facebook_pixels;
DROP POLICY IF EXISTS "Users can insert pixels from their profiles" ON public.facebook_pixels;
DROP POLICY IF EXISTS "Users can update pixels from their profiles" ON public.facebook_pixels;
DROP POLICY IF EXISTS "Users can delete pixels from their profiles" ON public.facebook_pixels;

-- Create new policies with direct join check
CREATE POLICY "Users can view pixels from their profiles"
ON public.facebook_pixels
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.facebook_profiles
    WHERE facebook_profiles.id = facebook_pixels.profile_id
    AND facebook_profiles.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert pixels from their profiles"
ON public.facebook_pixels
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.facebook_profiles
    WHERE facebook_profiles.id = facebook_pixels.profile_id
    AND facebook_profiles.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update pixels from their profiles"
ON public.facebook_pixels
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.facebook_profiles
    WHERE facebook_profiles.id = facebook_pixels.profile_id
    AND facebook_profiles.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete pixels from their profiles"
ON public.facebook_pixels
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.facebook_profiles
    WHERE facebook_profiles.id = facebook_pixels.profile_id
    AND facebook_profiles.user_id = auth.uid()
  )
);