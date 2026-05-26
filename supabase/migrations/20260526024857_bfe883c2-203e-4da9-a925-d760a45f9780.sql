
-- Pairing codes (short-lived, 60s TTL)
CREATE TABLE public.extension_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_extension_pairing_codes_code ON public.extension_pairing_codes(code);
CREATE INDEX idx_extension_pairing_codes_user ON public.extension_pairing_codes(user_id);

ALTER TABLE public.extension_pairing_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pairing codes"
  ON public.extension_pairing_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own pairing codes"
  ON public.extension_pairing_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own pairing codes"
  ON public.extension_pairing_codes FOR DELETE
  USING (auth.uid() = user_id);

-- Extension tokens (long-lived bearer tokens)
CREATE TABLE public.extension_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text DEFAULT 'Chrome Extension',
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '365 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_extension_tokens_hash ON public.extension_tokens(token_hash);
CREATE INDEX idx_extension_tokens_user ON public.extension_tokens(user_id);

ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own extension tokens"
  ON public.extension_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users revoke own extension tokens"
  ON public.extension_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own extension tokens"
  ON public.extension_tokens FOR DELETE
  USING (auth.uid() = user_id);
