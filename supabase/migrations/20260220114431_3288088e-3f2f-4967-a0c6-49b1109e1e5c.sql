
-- Table for user Z-API settings (credentials + global recipients)
CREATE TABLE public.user_zapi_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  instance_id TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL DEFAULT '',
  client_token TEXT NOT NULL DEFAULT '',
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_zapi_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own Z-API settings"
ON public.user_zapi_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Z-API settings"
ON public.user_zapi_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Z-API settings"
ON public.user_zapi_settings FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Z-API settings"
ON public.user_zapi_settings FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_user_zapi_settings_updated_at
BEFORE UPDATE ON public.user_zapi_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
