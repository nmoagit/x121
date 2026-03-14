-- Fix backfilled generation_snapshot: previous migration collapsed duplicate
-- slot_labels into one entry. This version uses node_id as key to preserve
-- all prompt slots, and adds the workflow name.

UPDATE scene_video_versions svv
SET generation_snapshot = jsonb_build_object(
    'scene_type', st.name,
    'workflow', w.name,
    'clip_position', 'full_clip',
    'seed_image', COALESCE(iv.file_path, ''),
    'segment_index', 0,
    'prompts', COALESCE(prompts.obj, '{}'::jsonb),
    'generation_params', COALESCE(st.generation_params, 'null'::jsonb),
    'lora_config', COALESCE(st.lora_config, 'null'::jsonb),
    'comfyui_instance_id', 0,
    'generated_at', svv.created_at,
    'backfilled', true
)
FROM scenes s
JOIN scene_types st ON s.scene_type_id = st.id
LEFT JOIN image_variants iv ON s.image_variant_id = iv.id
LEFT JOIN scene_type_track_configs stc
    ON stc.scene_type_id = st.id AND stc.track_id = s.track_id
LEFT JOIN workflows w ON w.id = COALESCE(stc.workflow_id, st.workflow_id)
LEFT JOIN LATERAL (
    -- Use "slot_label (node_id)" as key to preserve all prompt slots
    SELECT jsonb_object_agg(
        wps.slot_label || ' [' || wps.node_id || ']',
        COALESCE(stpd.prompt_text, wps.default_text, '')
    ) AS obj
    FROM workflow_prompt_slots wps
    LEFT JOIN scene_type_prompt_defaults stpd
        ON stpd.scene_type_id = st.id AND stpd.prompt_slot_id = wps.id
    WHERE wps.workflow_id = COALESCE(stc.workflow_id, st.workflow_id)
) prompts ON true
WHERE svv.scene_id = s.id
  AND svv.source = 'generated'
  AND svv.deleted_at IS NULL
  AND (svv.generation_snapshot IS NULL OR svv.generation_snapshot ? 'backfilled');
