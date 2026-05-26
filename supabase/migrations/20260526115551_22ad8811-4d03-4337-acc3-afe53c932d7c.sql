
-- Persistent page blacklist keyed by user + page_id so blacklist survives delete/resync
CREATE TABLE IF NOT EXISTS public.facebook_page_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_id text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_fb_page_blacklist_user_page
  ON public.facebook_page_blacklist(user_id, page_id);

ALTER TABLE public.facebook_page_blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own blacklist select"
  ON public.facebook_page_blacklist FOR SELECT
  USING (user_id = effective_user_id());

CREATE POLICY "Users manage own blacklist insert"
  ON public.facebook_page_blacklist FOR INSERT
  WITH CHECK (user_id = effective_user_id());

CREATE POLICY "Users manage own blacklist update"
  ON public.facebook_page_blacklist FOR UPDATE
  USING (user_id = effective_user_id());

CREATE POLICY "Users manage own blacklist delete"
  ON public.facebook_page_blacklist FOR DELETE
  USING (user_id = effective_user_id());

-- Backfill from currently blacklisted pages
INSERT INTO public.facebook_page_blacklist (user_id, page_id, reason, created_at)
SELECT fp.user_id, p.page_id, p.blacklist_reason, COALESCE(p.blacklisted_at, now())
FROM public.facebook_pages p
JOIN public.facebook_profiles fp ON fp.id = p.profile_id
WHERE p.is_blacklisted = true
ON CONFLICT (user_id, page_id) DO NOTHING;

-- Trigger to auto-apply blacklist on any insert/upsert into facebook_pages
CREATE OR REPLACE FUNCTION public.apply_facebook_page_blacklist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_entry record;
BEGIN
  SELECT user_id INTO v_user_id FROM public.facebook_profiles WHERE id = NEW.profile_id;
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT reason, created_at INTO v_entry
  FROM public.facebook_page_blacklist
  WHERE user_id = v_user_id AND page_id = NEW.page_id;

  IF FOUND THEN
    NEW.is_blacklisted := true;
    NEW.blacklist_reason := v_entry.reason;
    NEW.blacklisted_at := v_entry.created_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_blacklist_on_pages ON public.facebook_pages;
CREATE TRIGGER trg_apply_blacklist_on_pages
BEFORE INSERT ON public.facebook_pages
FOR EACH ROW
EXECUTE FUNCTION public.apply_facebook_page_blacklist();
