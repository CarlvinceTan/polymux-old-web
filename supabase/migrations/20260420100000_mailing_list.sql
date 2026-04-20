-- Create mailing_list table for guest subscriptions
CREATE TABLE mailing_list (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP WITH TIME ZONE NULL,
  verification_token VARCHAR(255) UNIQUE,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_mailing_list_email ON mailing_list(email);
CREATE INDEX idx_mailing_list_user_id ON mailing_list(user_id);
CREATE INDEX idx_mailing_list_verification_token ON mailing_list(verification_token);

-- Enable RLS
ALTER TABLE mailing_list ENABLE ROW LEVEL SECURITY;

-- Allow anon inserts (guest subscriptions)
CREATE POLICY "anon_insert_mailing_list"
  ON mailing_list FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow anon to select own email for verification flow
CREATE POLICY "anon_select_mailing_list"
  ON mailing_list FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anon to update for verification
CREATE POLICY "anon_update_mailing_list"
  ON mailing_list FOR UPDATE
  TO anon, authenticated
  USING (true);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_mailing_list_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mailing_list_updated_at_trigger
BEFORE UPDATE ON mailing_list
FOR EACH ROW
EXECUTE FUNCTION update_mailing_list_updated_at();
