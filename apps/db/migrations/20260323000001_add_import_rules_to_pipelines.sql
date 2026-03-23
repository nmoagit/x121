-- Add import_rules JSONB column to pipelines table (PRD-141)
ALTER TABLE pipelines ADD COLUMN import_rules JSONB NOT NULL DEFAULT '{}'::jsonb;
