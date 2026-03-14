-- Backfill generation_snapshot for existing generated clips that used default
-- workflows and prompts. Reconstructs the snapshot JSON from current workflow
-- prompt slots, scene type prompt defaults, and scene metadata.

UPDATE scene_video_versions svv
SET generation_snapshot = jsonb_build_object(
    'scene_type', st.name,
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
-- Resolve the effective workflow: track config override > scene_type default
LEFT JOIN scene_type_track_configs stc
    ON stc.scene_type_id = st.id AND stc.track_id = s.track_id
LEFT JOIN LATERAL (
    SELECT jsonb_object_agg(wps.slot_label, COALESCE(stpd.prompt_text, wps.default_text, '')) AS obj
    FROM workflow_prompt_slots wps
    LEFT JOIN scene_type_prompt_defaults stpd
        ON stpd.scene_type_id = st.id AND stpd.prompt_slot_id = wps.id
    WHERE wps.workflow_id = COALESCE(stc.workflow_id, st.workflow_id)
) prompts ON true
WHERE svv.scene_id = s.id
  AND svv.source = 'generated'
  AND svv.generation_snapshot IS NULL
  AND svv.deleted_at IS NULL;
