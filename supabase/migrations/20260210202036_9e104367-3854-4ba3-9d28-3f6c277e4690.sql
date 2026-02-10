
-- Create folders table for organizing creatives
CREATE TABLE public.creative_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.creative_folders(id) ON DELETE CASCADE,
  color TEXT DEFAULT '#10b981',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add folder reference to creatives table
ALTER TABLE public.creatives ADD COLUMN folder_id UUID REFERENCES public.creative_folders(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.creative_folders ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own folders"
  ON public.creative_folders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own folders"
  ON public.creative_folders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own folders"
  ON public.creative_folders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own folders"
  ON public.creative_folders FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_creative_folders_updated_at
  BEFORE UPDATE ON public.creative_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_creative_folders_user_id ON public.creative_folders(user_id);
CREATE INDEX idx_creatives_folder_id ON public.creatives(folder_id);
