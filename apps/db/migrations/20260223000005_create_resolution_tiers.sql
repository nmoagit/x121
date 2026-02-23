-- PRD-59: Multi-Resolution Pipeline
-- Creates the resolution_tiers table for managing draft/preview/production quality tiers.

CREATE TABLE resolution_tiers (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    quality_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    speed_factor DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    is_default BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON resolution_tiers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO resolution_tiers (name, display_name, width, height, speed_factor, is_default, sort_order) VALUES
    ('draft', 'Draft', 512, 512, 5.0, true, 1),
    ('preview', 'Preview', 768, 768, 2.5, false, 2),
    ('production', 'Production', 1920, 1080, 1.0, false, 3);
