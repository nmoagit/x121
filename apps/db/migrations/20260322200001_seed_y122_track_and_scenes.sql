-- Create "main" track for y122 pipeline (single-track pipeline)
INSERT INTO tracks (name, slug, sort_order, is_active, pipeline_id)
SELECT 'Main', 'main', 1, true, p.id
FROM pipelines p WHERE p.code = 'y122';

-- Update y122 seed slot name from "speaker" to "reference"
UPDATE pipelines
SET seed_slots = '[{"name": "reference", "required": true, "description": "Reference image of the presenter"}]'::jsonb
WHERE code = 'y122';

-- Create default scene types for y122 pipeline
INSERT INTO scene_types (name, slug, status_id, sort_order, is_active, pipeline_id, description)
SELECT unnest(ARRAY['Presenting', 'Listening', 'Reacting', 'Thinking', 'Idle']),
       unnest(ARRAY['presenting', 'listening', 'reacting', 'thinking', 'idle']),
       1, -- active status
       generate_series(1, 5),
       true,
       p.id,
       unnest(ARRAY[
         'Actively gesturing and engaging with the camera',
         'Attentive listening posture, nodding',
         'Subtle facial responses and reactions',
         'Pausing, looking thoughtful',
         'Neutral, waiting position'
       ])
FROM pipelines p WHERE p.code = 'y122';
