-- Create table to track individual product updates
CREATE TABLE public.catalog_schedule_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES public.catalog_schedules(id) ON DELETE CASCADE,
  retailer_id TEXT NOT NULL,
  product_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.catalog_schedule_products ENABLE ROW LEVEL SECURITY;

-- Create policies (access via schedule ownership)
CREATE POLICY "Users can view products from their schedules"
ON public.catalog_schedule_products
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM catalog_schedules
  WHERE catalog_schedules.id = catalog_schedule_products.schedule_id
  AND catalog_schedules.user_id = auth.uid()
));

CREATE POLICY "Users can insert products to their schedules"
ON public.catalog_schedule_products
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM catalog_schedules
  WHERE catalog_schedules.id = catalog_schedule_products.schedule_id
  AND catalog_schedules.user_id = auth.uid()
));

-- Create index for faster queries
CREATE INDEX idx_catalog_schedule_products_schedule_id ON public.catalog_schedule_products(schedule_id);

-- Add trigger for updated_at
CREATE TRIGGER update_catalog_schedule_products_updated_at
BEFORE UPDATE ON public.catalog_schedule_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();