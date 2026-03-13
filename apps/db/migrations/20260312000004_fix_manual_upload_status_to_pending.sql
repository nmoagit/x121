-- Correct previous migration: manually uploaded variants should be Pending (1),
-- not Approved (2), since they haven't been through approval.
UPDATE image_variants
SET    status_id  = 1,
       updated_at = NOW()
WHERE  provenance = 'manual_upload'
  AND  status_id  IN (2, 5)
  AND  deleted_at IS NULL;
