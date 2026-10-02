-- Proposal text and a stable key so derived alerts update in place.
-- window_locked keeps a planner delay from being extended by the flight feed.

ALTER TABLE alert ADD COLUMN detail TEXT NOT NULL DEFAULT '';
ALTER TABLE alert ADD COLUMN delay_min INTEGER;
ALTER TABLE alert ADD COLUMN proposal TEXT;
ALTER TABLE alert ADD COLUMN source_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS alert_source_key ON alert(source_key) WHERE source_key IS NOT NULL;

ALTER TABLE flight ADD COLUMN window_locked INTEGER NOT NULL DEFAULT 0;
