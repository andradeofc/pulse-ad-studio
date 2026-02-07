-- Create storage bucket for creatives
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'creatives', 
  'creatives', 
  true,
  104857600, -- 100MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
);

-- Storage policies for creatives bucket
CREATE POLICY "Users can upload their own creatives"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'creatives' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own creatives"
ON storage.objects FOR SELECT
USING (bucket_id = 'creatives' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own creatives"
ON storage.objects FOR DELETE
USING (bucket_id = 'creatives' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own creatives"
ON storage.objects FOR UPDATE
USING (bucket_id = 'creatives' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create creatives table for metadata
CREATE TABLE public.creatives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('video', 'image')),
  file_path TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  width INTEGER,
  height INTEGER,
  size INTEGER NOT NULL,
  duration NUMERIC, -- for videos, in seconds
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.creatives ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own creatives"
ON public.creatives FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own creatives"
ON public.creatives FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own creatives"
ON public.creatives FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own creatives"
ON public.creatives FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_creatives_updated_at
BEFORE UPDATE ON public.creatives
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_creatives_user_id ON public.creatives(user_id);
CREATE INDEX idx_creatives_type ON public.creatives(type);