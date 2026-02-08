-- Fix RLS policy for api_call_logs INSERT (too permissive)
DROP POLICY IF EXISTS "Service can insert API logs" ON public.api_call_logs;

-- Only authenticated users or service role can insert
CREATE POLICY "Authenticated can insert API logs"
ON public.api_call_logs FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Add DELETE policy for user_profiles (missing)
CREATE POLICY "Users can delete their own profile"
ON public.user_profiles FOR DELETE
USING (user_id = auth.uid() OR public.is_admin());

-- Add DELETE policy for user_roles (missing - only admins)
CREATE POLICY "Only admins can delete roles"
ON public.user_roles FOR DELETE
USING (public.is_admin());

-- Add UPDATE policy for api_call_logs (missing - admins only)
CREATE POLICY "Admins can update API logs"
ON public.api_call_logs FOR UPDATE
USING (public.is_admin());

-- Add DELETE policy for api_call_logs (admins only for cleanup)
CREATE POLICY "Admins can delete API logs"
ON public.api_call_logs FOR DELETE
USING (public.is_admin());