/**
 * Inheritance tree view for scene types (PRD-100).
 *
 * Renders the parent-child hierarchy as an indented list, allowing
 * selection and showing active/inactive status badges.
 */

import { useMemo } from "react";

import { Badge } from "@/components/primitives/Badge";
import { cn } from "@/lib/cn";
import type { SceneType } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface InheritanceTreeProps {
  sceneTypes: SceneType[];
  selectedId?: number | null;
  onSelect: (id: number) => void;
}

/* --------------------------------------------------------------------------
   Tree node type
   -------------------------------------------------------------------------- */

interface TreeNode {
  sceneType: SceneType;
  children: TreeNode[];
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Build a tree from a flat list using parent_scene_type_id. */
function buildTree(sceneTypes: SceneType[]): TreeNode[] {
  const nodeMap = new Map<number, TreeNode>();

  for (const st of sceneTypes) {
    nodeMap.set(st.id, { sceneType: st, children: [] });
  }

  const roots: TreeNode[] = [];

  for (const st of sceneTypes) {
    const node = nodeMap.get(st.id);
    if (!node) continue;
    if (st.parent_scene_type_id !== null) {
      const parent = nodeMap.get(st.parent_scene_type_id);
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent not in list -- treat as root.
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  selectedId?: number | null;
  onSelect: (id: number) => void;
}

function TreeNodeRow({ node, depth, selectedId, onSelect }: TreeNodeRowProps) {
  const { sceneType } = node;
  const isSelected = selectedId === sceneType.id;

  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(sceneType.id)}
        className={cn(
          "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          "hover:bg-[var(--color-surface-secondary)]",
          isSelected &&
            "bg-[var(--color-action-primary)]/10 text-[var(--color-action-primary)] font-medium",
          !isSelected && "text-[var(--color-text-primary)]",
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        aria-current={isSelected ? "true" : undefined}
      >
        <span className="truncate">{sceneType.name}</span>
        <Badge
          variant={sceneType.is_active ? "success" : "default"}
          size="sm"
        >
          {sceneType.is_active ? "Active" : "Inactive"}
        </Badge>
      </button>
      {node.children.map((child) => (
        <TreeNodeRow
          key={child.sceneType.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function InheritanceTree({
  sceneTypes,
  selectedId,
  onSelect,
}: InheritanceTreeProps) {
  const tree = useMemo(() => buildTree(sceneTypes), [sceneTypes]);

  if (sceneTypes.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        No scene types available.
      </p>
    );
  }

  return (
    <nav aria-label="Scene type inheritance tree" className="flex flex-col">
      {tree.map((node) => (
        <TreeNodeRow
          key={node.sceneType.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}
