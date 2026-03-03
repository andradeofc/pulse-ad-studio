-- Add is_primary column to facebook_profiles
ALTER TABLE public.facebook_profiles ADD COLUMN is_primary boolean NOT NULL DEFAULT false;

-- Create a function to ensure only one primary profile per user
CREATE OR REPLACE FUNCTION public.ensure_single_primary_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    -- Unset any other primary profile for this user
    UPDATE public.facebook_profiles
    SET is_primary = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger
CREATE TRIGGER ensure_single_primary_profile_trigger
BEFORE INSERT OR UPDATE OF is_primary ON public.facebook_profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_primary_profile();
