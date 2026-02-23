-- Wiki articles for the Studio Wiki & Contextual Help feature (PRD-56).

CREATE TABLE wiki_articles (
    id          BIGSERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    slug        TEXT NOT NULL,
    content_md  TEXT NOT NULL DEFAULT '',
    category    TEXT,
    tags        TEXT[],
    is_builtin  BOOLEAN NOT NULL DEFAULT false,
    is_pinned   BOOLEAN NOT NULL DEFAULT false,
    pin_location TEXT,
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_wiki_articles_slug ON wiki_articles(slug);
CREATE INDEX idx_wiki_articles_category ON wiki_articles(category);
CREATE INDEX idx_wiki_articles_tags ON wiki_articles USING gin(tags);
CREATE INDEX idx_wiki_articles_created_by ON wiki_articles(created_by);
CREATE INDEX idx_wiki_articles_is_pinned ON wiki_articles(is_pinned) WHERE is_pinned = true;

CREATE TRIGGER trg_wiki_articles_updated_at
    BEFORE UPDATE ON wiki_articles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
