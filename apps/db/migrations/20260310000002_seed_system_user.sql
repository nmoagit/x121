-- Seed the system user (id=1) used for background job submission.
-- The pipeline/worker processes reference SYSTEM_USER_ID = 1 when creating jobs.
INSERT INTO users (id, username, email, password_hash, role_id, is_active)
VALUES (1, 'system', 'system@x121.local', 'NOLOGIN', 1, true)
ON CONFLICT (id) DO NOTHING;

-- Ensure the sequence is past id=1 so normal user creation doesn't collide.
SELECT setval('users_id_seq', GREATEST(nextval('users_id_seq'), 2));
