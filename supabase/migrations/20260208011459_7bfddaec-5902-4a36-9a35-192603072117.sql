-- Create catalog_schedules table for scheduling media updates to catalog products
CREATE TABLE public.catalog_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  creative_id UUID NOT NULL REFERENCES public.creatives(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.facebook_profiles(id) ON DELETE CASCADE,
  catalog_id UUID NOT NULL REFERENCES public.facebook_catalogs(id) ON DELETE CASCADE,
  product_set_id UUID NOT NULL REFERENCES public.facebook_product_sets(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMP WITH TIME ZONE,
  products_updated INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.catalog_schedules ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own schedules"
ON public.catalog_schedules
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own schedules"
ON public.catalog_schedules
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own schedules"
ON public.catalog_schedules
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own schedules"
ON public.catalog_schedules
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_catalog_schedules_updated_at
BEFORE UPDATE ON public.catalog_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for efficient querying of pending schedules
CREATE INDEX idx_catalog_schedules_status_scheduled ON public.catalog_schedules(status, scheduled_at)
WHERE status = 'pending';

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE public.catalog_schedules;