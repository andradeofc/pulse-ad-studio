-- Create table for user naming presets
CREATE TABLE public.naming_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  context TEXT NOT NULL CHECK (context IN ('campaign', 'adset', 'ad')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for user custom naming variables
CREATE TABLE public.naming_variables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

-- Enable RLS
ALTER TABLE public.naming_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.naming_variables ENABLE ROW LEVEL SECURITY;

-- RLS policies for naming_presets
CREATE POLICY "Users can view their own presets"
  ON public.naming_presets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own presets"
  ON public.naming_presets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own presets"
  ON public.naming_presets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own presets"
  ON public.naming_presets FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for naming_variables
CREATE POLICY "Users can view their own variables"
  ON public.naming_variables FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own variables"
  ON public.naming_variables FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own variables"
  ON public.naming_variables FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own variables"
  ON public.naming_variables FOR DELETE
  USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_naming_presets_updated_at
  BEFORE UPDATE ON public.naming_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_naming_variables_updated_at
  BEFORE UPDATE ON public.naming_variables
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();