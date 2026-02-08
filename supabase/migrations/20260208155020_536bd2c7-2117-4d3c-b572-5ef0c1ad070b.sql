-- Add is_favorite column to naming_presets table
ALTER TABLE public.naming_presets 
ADD COLUMN is_favorite boolean NOT NULL DEFAULT false;

-- Add index for faster sorting by favorite status
CREATE INDEX idx_naming_presets_favorite ON public.naming_presets(user_id, is_favorite DESC, created_at ASC);