-- PRD-122: Seed a default "Local Storage" backend if none exists.
INSERT INTO storage_backends (name, backend_type_id, status_id, tier, config, is_default)
SELECT 'Local Storage', 1, 1, 'hot', '{"root": "./storage"}'::jsonb, true
WHERE NOT EXISTS (
    SELECT 1 FROM storage_backends WHERE is_default = true
);
