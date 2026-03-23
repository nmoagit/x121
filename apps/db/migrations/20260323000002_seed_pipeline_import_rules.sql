-- Seed import rules for x121 (matches current hardcoded behavior)
UPDATE pipelines SET import_rules = '{
  "seed_patterns": [
    {"slot": "clothed", "pattern": "{avatar}_clothed.{ext}", "extensions": ["png", "jpg", "jpeg", "webp"]},
    {"slot": "clothed", "pattern": "clothed.{ext}", "extensions": ["png", "jpg", "jpeg", "webp"]},
    {"slot": "topless", "pattern": "{avatar}_topless.{ext}", "extensions": ["png", "jpg", "jpeg", "webp"]},
    {"slot": "topless", "pattern": "topless.{ext}", "extensions": ["png", "jpg", "jpeg", "webp"]}
  ],
  "video_patterns": [
    {"pattern": "{scene_type}.{ext}", "extensions": ["mp4"]},
    {"pattern": "{track}_{scene_type}.{ext}", "extensions": ["mp4"]},
    {"pattern": "topless_{scene_type}.{ext}", "extensions": ["mp4"]}
  ],
  "metadata_patterns": [
    {"type": "bio", "pattern": "bio.json"},
    {"type": "tov", "pattern": "tov.json"},
    {"type": "metadata", "pattern": "metadata.json"}
  ],
  "case_sensitive": false
}'::jsonb WHERE code = 'x121';

-- Seed import rules for y122 (single reference seed)
UPDATE pipelines SET import_rules = '{
  "seed_patterns": [
    {"slot": "reference", "pattern": "{avatar}.{ext}", "extensions": ["png", "jpg", "jpeg", "webp"]},
    {"slot": "reference", "pattern": "reference.{ext}", "extensions": ["png", "jpg", "jpeg", "webp"]}
  ],
  "video_patterns": [
    {"pattern": "{scene_type}.{ext}", "extensions": ["mp4"]}
  ],
  "metadata_patterns": [
    {"type": "bio", "pattern": "bio.json"},
    {"type": "tov", "pattern": "tov.json"}
  ],
  "case_sensitive": false
}'::jsonb WHERE code = 'y122';
