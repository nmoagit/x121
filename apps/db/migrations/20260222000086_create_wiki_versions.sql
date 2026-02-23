-- Wiki article version history for the Studio Wiki & Contextual Help feature (PRD-56).
-- Versions are immutable — no updated_at trigger.

CREATE TABLE wiki_versions (
    id           BIGSERIAL PRIMARY KEY,
    article_id   BIGINT NOT NULL REFERENCES wiki_articles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    version      INTEGER NOT NULL,
    content_md   TEXT NOT NULL,
    edited_by    BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    edit_summary TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wiki_versions_article_id ON wiki_versions(article_id);
CREATE UNIQUE INDEX uq_wiki_versions_article_version ON wiki_versions(article_id, version);
CREATE INDEX idx_wiki_versions_edited_by ON wiki_versions(edited_by);
