-- Add niche column to northstar_daily_blocks for multi-goal daily board support.
-- Run this in the Supabase Dashboard SQL Editor, NOT through the REST API.

ALTER TABLE northstar_daily_blocks ADD COLUMN IF NOT EXISTS niche text;

-- Verify:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'northstar_daily_blocks' AND column_name = 'niche';