BEGIN;

-- Backfill existing seed slots with media_type: "image"
UPDATE pipelines
SET seed_slots = (
    SELECT jsonb_agg(
        elem || '{"media_type": "image", "allowed_extensions": [], "track_affinity": null}'::jsonb
    )
    FROM jsonb_array_elements(seed_slots) elem
)
WHERE seed_slots IS NOT NULL AND jsonb_array_length(seed_slots) > 0;

COMMIT;
