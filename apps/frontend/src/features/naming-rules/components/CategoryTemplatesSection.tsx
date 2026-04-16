/**
 * Category templates section for the pipeline naming rules editor (PRD-141).
 *
 * Shows naming engine categories grouped by type, with platform defaults
 * as read-only reference and editable pipeline overrides.
 */

import { Button, Input } from "@/components/primitives";
import { Stack } from "@/components/layout";
import {
  TERMINAL_BODY,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_LABEL,
  TERMINAL_PANEL,
  TERMINAL_ROW_HOVER,
} from "@/lib/ui-classes";
import { cn } from "@/lib/cn";
import { Trash2 } from "@/tokens/icons";

import type { NamingCategory, NamingRule } from "../types";
import { CATEGORY_GROUPS } from "../types";
import { TYPO_DATA_CYAN, TYPO_DATA_MUTED } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface CategoryTemplatesSectionProps {
  categories: NamingCategory[] | undefined;
  platformRules: NamingRule[] | undefined;
  categoryTemplates: Record<string, string>;
  onSetTemplate: (categoryName: string, template: string) => void;
  onRemoveTemplate: (categoryName: string) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CategoryTemplatesSection({
  categories,
  platformRules,
  categoryTemplates,
  onSetTemplate,
  onRemoveTemplate,
}: CategoryTemplatesSectionProps) {
  /** Build platform default lookup */
  const platformTemplateMap = new Map<string, string>();
  if (categories && platformRules) {
    for (const rule of platformRules) {
      const cat = categories.find((c) => c.id === rule.category_id);
      if (cat && rule.is_active) {
        platformTemplateMap.set(cat.name, rule.template);
      }
    }
  }

  return (
    <div className={TERMINAL_PANEL}>
      <div className={TERMINAL_HEADER}>
        <h3 className={TERMINAL_HEADER_TITLE}>Category Templates</h3>
      </div>
      <div className={TERMINAL_BODY}>
        <Stack gap={4}>
          <p className="text-[10px] text-[var(--color-text-muted)] font-mono">
            Override platform default templates per category. Leave blank to use the platform default.
          </p>

          {CATEGORY_GROUPS.map((group) => {
            const groupCategories = categories?.filter((c) => group.categories.includes(c.name)) ?? [];
            if (groupCategories.length === 0) return null;

            return (
              <div key={group.label}>
                <span className={cn(TERMINAL_LABEL, "mb-2 block")}>{group.label}</span>
                <div className="space-y-1">
                  {groupCategories.map((cat) => {
                    const platformDefault = platformTemplateMap.get(cat.name);
                    const pipelineOverride = categoryTemplates[cat.name];
                    const hasOverride = pipelineOverride !== undefined && pipelineOverride !== "";

                    return (
                      <div
                        key={cat.id}
                        className={cn(
                          "flex items-center gap-3 px-2 py-1.5 rounded-[var(--radius-sm)]",
                          TERMINAL_ROW_HOVER,
                        )}
                      >
                        <span className={`${TYPO_DATA_CYAN} min-w-[160px] shrink-0`}>
                          {cat.name}
                        </span>
                        <div className="flex-1 min-w-0">
                          {platformDefault && !hasOverride && (
                            <span
                              className="font-mono text-[10px] text-[var(--color-text-muted)] truncate block"
                              title={`Platform default: ${platformDefault}`}
                            >
                              {platformDefault}
                            </span>
                          )}
                          <Input
                            value={pipelineOverride ?? ""}
                            onChange={(e) => onSetTemplate(cat.name, e.target.value)}
                            placeholder={platformDefault ?? "No platform default"}
                            className="!text-xs !py-0.5 font-mono"
                          />
                        </div>
                        {hasOverride && (
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={<Trash2 size={12} />}
                            onClick={() => onRemoveTemplate(cat.name)}
                            title="Remove override (use platform default)"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {(!categories || categories.length === 0) && (
            <p className={TYPO_DATA_MUTED}>
              Loading naming categories...
            </p>
          )}
        </Stack>
      </div>
    </div>
  );
}
