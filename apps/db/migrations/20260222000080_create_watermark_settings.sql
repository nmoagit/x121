-- Migration 000080: Create watermark_settings table (PRD-39)
--
-- Stores named watermark configurations (text or image) with
-- position, opacity, and optional timecode overlay.

CREATE TABLE IF NOT EXISTS watermark_settings (
    id                BIGSERIAL PRIMARY KEY,
    name              TEXT NOT NULL,
    watermark_type    TEXT NOT NULL CHECK (watermark_type IN ('text', 'image')),
    content           TEXT NOT NULL,
    position          TEXT NOT NULL DEFAULT 'center' CHECK (position IN ('center', 'top_left', 'top_right', 'bottom_left', 'bottom_right')),
    opacity           REAL NOT NULL DEFAULT 0.3 CHECK (opacity >= 0.0 AND opacity <= 1.0),
    include_timecode  BOOLEAN NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_watermark_settings_updated_at
    BEFORE UPDATE ON watermark_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
