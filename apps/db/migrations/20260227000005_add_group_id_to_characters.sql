-- Add group_id to characters (PRD-112 Req 1.4)
ALTER TABLE characters
    ADD COLUMN group_id BIGINT REFERENCES character_groups(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- FK index for group_id lookups
CREATE INDEX idx_characters_group_id ON characters(group_id);
