-- Migration 000091: Placement rules for model file auto-organization (PRD-104)

CREATE TABLE placement_rules (
    id BIGSERIAL PRIMARY KEY,
    model_type TEXT NOT NULL,
    base_model TEXT,
    target_directory TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_placement_rules_model_type ON placement_rules(model_type);
CREATE INDEX idx_placement_rules_active ON placement_rules(is_active) WHERE is_active = true;
CREATE TRIGGER trg_placement_rules_updated_at BEFORE UPDATE ON placement_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO placement_rules (model_type, base_model, target_directory, priority) VALUES
    ('checkpoint', NULL, '/models/checkpoints/', 0),
    ('checkpoint', 'SDXL', '/models/checkpoints/sdxl/', 10),
    ('checkpoint', 'SD 1.5', '/models/checkpoints/sd15/', 10),
    ('checkpoint', 'Flux', '/models/checkpoints/flux/', 10),
    ('lora', NULL, '/models/loras/', 0),
    ('lora', 'SDXL', '/models/loras/sdxl/', 10),
    ('lora', 'SD 1.5', '/models/loras/sd15/', 10),
    ('lora', 'Flux', '/models/loras/flux/', 10),
    ('embedding', NULL, '/models/embeddings/', 0),
    ('vae', NULL, '/models/vae/', 0),
    ('controlnet', NULL, '/models/controlnet/', 0);
