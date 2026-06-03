ALTER TABLE users ADD COLUMN IF NOT EXISTS learning_schedules JSONB DEFAULT '{}'::jsonb;
