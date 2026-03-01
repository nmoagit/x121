/**
 * Wiki articles management page (PRD-56).
 *
 * Renders a list/detail view: article list on the left (with search),
 * article viewer or editor on the right. Supports creating, editing,
 * and viewing version history.
 */

import { useCallback, useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Button, Input, LoadingPane, SelectableRow } from "@/components/primitives";
import { EmptyState } from "@/components/domain";

import {
  WikiArticleEditor,
  WikiArticleViewer,
  WikiVersionHistory,
  useCreateArticle,
  useDeleteArticle,
  useDiffVersions,
  useRevertVersion,
  useUpdateArticle,
  useWikiArticle,
  useWikiArticles,
  useWikiVersions,
} from "@/features/wiki";

/* --------------------------------------------------------------------------
   View modes
   -------------------------------------------------------------------------- */

type ViewMode = "list" | "view" | "edit" | "create" | "history";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WikiPage() {
  const [mode, setMode] = useState<ViewMode>("list");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [diffV1, setDiffV1] = useState(0);
  const [diffV2, setDiffV2] = useState(0);

  const { data: articles, isLoading: articlesLoading } = useWikiArticles();
  const { data: article } = useWikiArticle(selectedSlug ?? "");
  const { data: versions } = useWikiVersions(
    mode === "history" && selectedSlug ? selectedSlug : "",
  );
  const { data: diffData } = useDiffVersions(
    selectedSlug ?? "",
    diffV1,
    diffV2,
  );

  const createArticle = useCreateArticle();
  const updateArticle = useUpdateArticle(selectedSlug ?? "");
  const deleteArticle = useDeleteArticle();
  const revertVersion = useRevertVersion(selectedSlug ?? "");

  const filteredArticles = articles?.filter((a) =>
    searchQuery
      ? a.title.toLowerCase().includes(searchQuery.toLowerCase())
      : true,
  );

  const handleSelectArticle = useCallback((slug: string) => {
    setSelectedSlug(slug);
    setMode("view");
    setDiffV1(0);
    setDiffV2(0);
  }, []);

  const handleDiffSelect = useCallback((v1: number, v2: number) => {
    setDiffV1(v1);
    setDiffV2(v2);
  }, []);

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Wiki"
          description="Browse contextual help articles and platform documentation."
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          {/* Article list sidebar */}
          <Stack gap={3}>
            <Stack direction="horizontal" gap={2}>
              <div className="flex-1">
                <Input
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="primary" size="sm" onClick={() => setMode("create")}>
                New
              </Button>
            </Stack>

            {articlesLoading && <LoadingPane size="md" />}

            {!articlesLoading && filteredArticles && filteredArticles.length === 0 && (
              <EmptyState title="No Articles" description="No wiki articles found." />
            )}

            {filteredArticles?.map((a) => (
              <SelectableRow
                key={a.slug}
                isSelected={selectedSlug === a.slug}
                onSelect={() => handleSelectArticle(a.slug)}
              >
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {a.title}
                </span>
                {a.category && (
                  <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                    {a.category}
                  </span>
                )}
              </SelectableRow>
            ))}
          </Stack>

          {/* Content area */}
          <div>
            {mode === "list" && (
              <EmptyState
                title="Select an Article"
                description="Choose an article from the list or create a new one."
              />
            )}

            {mode === "view" && article && (
              <Stack gap={4}>
                <WikiArticleViewer
                  article={article}
                  onEdit={() => setMode("edit")}
                />
                <Stack direction="horizontal" gap={2}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setMode("history")}
                  >
                    Version History
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      deleteArticle.mutate(article.slug, {
                        onSuccess: () => {
                          setSelectedSlug(null);
                          setMode("list");
                        },
                      });
                    }}
                    disabled={deleteArticle.isPending}
                  >
                    Delete
                  </Button>
                </Stack>
              </Stack>
            )}

            {mode === "edit" && article && (
              <WikiArticleEditor
                initialValues={{
                  title: article.title,
                  content_md: article.content_md,
                  category: article.category,
                  tags: article.tags,
                }}
                onSave={(data) => {
                  updateArticle.mutate(data, {
                    onSuccess: () => setMode("view"),
                  });
                }}
                onCancel={() => setMode("view")}
                isSubmitting={updateArticle.isPending}
              />
            )}

            {mode === "create" && (
              <WikiArticleEditor
                onSave={(data) => {
                  createArticle.mutate(data, {
                    onSuccess: (newArticle) => {
                      setSelectedSlug(newArticle.slug);
                      setMode("view");
                    },
                  });
                }}
                onCancel={() => setMode("list")}
                isSubmitting={createArticle.isPending}
              />
            )}

            {mode === "history" && versions && (
              <WikiVersionHistory
                versions={versions}
                diffLines={diffData?.lines}
                onDiffSelect={handleDiffSelect}
                onRevert={(version) => {
                  revertVersion.mutate(version, {
                    onSuccess: () => setMode("view"),
                  });
                }}
                isReverting={revertVersion.isPending}
              />
            )}
          </div>
        </div>
      </Stack>
    </div>
  );
}
