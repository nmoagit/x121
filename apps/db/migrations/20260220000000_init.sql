-- Initial migration: pgvector extension and shared trigger function.

-- Enable pgvector for embedding/similarity search (PRD-20, PRD-76).
CREATE EXTENSION IF NOT EXISTS vector;

-- Shared trigger function to auto-update `updated_at` columns.
-- Applied to each table in its own migration via:
--   CREATE TRIGGER trg_{table}_updated_at
--       BEFORE UPDATE ON {table}
--       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Alias: some migrations reference the function as trigger_set_updated_at().
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
