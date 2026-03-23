-- Link y122 scene types to the "main" track.
-- The seed migration created both but didn't associate them.
INSERT INTO scene_type_tracks (scene_type_id, track_id)
SELECT st.id, t.id
FROM scene_types st
CROSS JOIN tracks t
WHERE st.pipeline_id = (SELECT id FROM pipelines WHERE code = 'y122')
  AND t.pipeline_id = st.pipeline_id
  AND t.slug = 'main'
  AND st.deleted_at IS NULL
ON CONFLICT DO NOTHING;
