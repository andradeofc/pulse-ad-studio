
CREATE TABLE public.user_dismissed_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  notification_key text NOT NULL,
  dismissed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_key)
);

ALTER TABLE public.user_dismissed_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own dismissed notifications"
ON public.user_dismissed_notifications
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_user_dismissed_notifications_user_id ON public.user_dismissed_notifications(user_id);
