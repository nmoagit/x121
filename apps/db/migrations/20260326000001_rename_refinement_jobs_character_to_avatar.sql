-- Fix: rename character_id → avatar_id in refinement_jobs table.
-- This was missed in the original character→avatar rename migration (20260322100001).

ALTER TABLE refinement_jobs RENAME COLUMN character_id TO avatar_id;
