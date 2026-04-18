--- Supabase SQL for storing shared operation logs
CREATE TABLE IF NOT EXISTS operation_logs (
  id uuid PRIMARY KEY,
  timestamp timestamptz NOT NULL,
  user_id text NOT NULL,
  user_name text NOT NULL,
  operation text NOT NULL,
  module text NOT NULL,
  details jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS operation_logs_timestamp_idx ON operation_logs (timestamp DESC);

-- If Supabase Row Level Security is enabled for this table, allow the app to insert and select logs.
ALTER TABLE operation_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operation_logs_allow_select ON operation_logs;
CREATE POLICY operation_logs_allow_select
  ON operation_logs
  FOR SELECT
  USING (true);
DROP POLICY IF EXISTS operation_logs_allow_insert ON operation_logs;
CREATE POLICY operation_logs_allow_insert
  ON operation_logs
  FOR INSERT
  WITH CHECK (true);
