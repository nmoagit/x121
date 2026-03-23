-- Add templates map to existing naming_rules JSON (no-op if already present).
-- This allows pipelines to define per-category naming template overrides
-- that sit between platform defaults and project-level overrides.
UPDATE pipelines
SET naming_rules = naming_rules || '{"templates": {}}'::jsonb
WHERE naming_rules IS NOT NULL
  AND NOT (naming_rules ? 'templates');
