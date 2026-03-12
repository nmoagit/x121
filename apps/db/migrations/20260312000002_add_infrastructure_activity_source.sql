-- Add "infrastructure" source for auto-scaling and cloud lifecycle activity logs.
INSERT INTO activity_log_sources (name, label)
VALUES ('infrastructure', 'Infrastructure')
ON CONFLICT (name) DO NOTHING;
