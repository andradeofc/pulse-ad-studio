-- Create table for Facebook product catalogs
CREATE TABLE public.facebook_catalogs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.facebook_profiles(id) ON DELETE CASCADE,
  catalog_id TEXT NOT NULL,
  name TEXT NOT NULL,
  business_id TEXT,
  business_name TEXT,
  product_count INTEGER DEFAULT 0,
  vertical TEXT, -- e.g., 'commerce', 'hotels', 'flights', 'destinations', 'vehicles'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(profile_id, catalog_id)
);

-- Create table for Facebook product sets (subsets of catalogs)
CREATE TABLE public.facebook_product_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  catalog_id UUID NOT NULL REFERENCES public.facebook_catalogs(id) ON DELETE CASCADE,
  product_set_id TEXT NOT NULL,
  name TEXT NOT NULL,
  filter TEXT, -- JSON filter string
  product_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(catalog_id, product_set_id)
);

-- Enable RLS
ALTER TABLE public.facebook_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_product_sets ENABLE ROW LEVEL SECURITY;

-- RLS policies for catalogs
CREATE POLICY "Users can view catalogs from their profiles"
ON public.facebook_catalogs
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_catalogs.profile_id
  AND facebook_profiles.user_id = auth.uid()
));

CREATE POLICY "Users can insert catalogs from their profiles"
ON public.facebook_catalogs
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_catalogs.profile_id
  AND facebook_profiles.user_id = auth.uid()
));

CREATE POLICY "Users can update catalogs from their profiles"
ON public.facebook_catalogs
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_catalogs.profile_id
  AND facebook_profiles.user_id = auth.uid()
));

CREATE POLICY "Users can delete catalogs from their profiles"
ON public.facebook_catalogs
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_catalogs.profile_id
  AND facebook_profiles.user_id = auth.uid()
));

-- RLS policies for product sets (through catalog ownership)
CREATE POLICY "Users can view product sets from their catalogs"
ON public.facebook_product_sets
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM facebook_catalogs
  JOIN facebook_profiles ON facebook_profiles.id = facebook_catalogs.profile_id
  WHERE facebook_catalogs.id = facebook_product_sets.catalog_id
  AND facebook_profiles.user_id = auth.uid()
));

CREATE POLICY "Users can insert product sets from their catalogs"
ON public.facebook_product_sets
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM facebook_catalogs
  JOIN facebook_profiles ON facebook_profiles.id = facebook_catalogs.profile_id
  WHERE facebook_catalogs.id = facebook_product_sets.catalog_id
  AND facebook_profiles.user_id = auth.uid()
));

CREATE POLICY "Users can update product sets from their catalogs"
ON public.facebook_product_sets
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM facebook_catalogs
  JOIN facebook_profiles ON facebook_profiles.id = facebook_catalogs.profile_id
  WHERE facebook_catalogs.id = facebook_product_sets.catalog_id
  AND facebook_profiles.user_id = auth.uid()
));

CREATE POLICY "Users can delete product sets from their catalogs"
ON public.facebook_product_sets
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM facebook_catalogs
  JOIN facebook_profiles ON facebook_profiles.id = facebook_catalogs.profile_id
  WHERE facebook_catalogs.id = facebook_product_sets.catalog_id
  AND facebook_profiles.user_id = auth.uid()
));

-- Trigger to update updated_at
CREATE TRIGGER update_facebook_catalogs_updated_at
BEFORE UPDATE ON public.facebook_catalogs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();