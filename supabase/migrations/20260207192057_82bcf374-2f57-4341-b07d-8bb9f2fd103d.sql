-- Add sync_status column to track background sync progress
ALTER TABLE public.facebook_profiles 
ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'idle';

-- Add comment for clarity
COMMENT ON COLUMN public.facebook_profiles.sync_status IS 'Sync status: idle, syncing, completed, error';