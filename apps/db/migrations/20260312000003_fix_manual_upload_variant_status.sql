-- Fix image variants that were manually uploaded but incorrectly given
-- status_id = 5 (Generated) instead of status_id = 2 (Approved).
UPDATE image_variants
SET    status_id  = 2,
       updated_at = NOW()
WHERE  provenance = 'manual_upload'
  AND  status_id  = 5
  AND  deleted_at IS NULL;
