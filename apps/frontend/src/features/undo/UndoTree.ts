/**
 * Undo tree data structure with branching support (PRD-51).
 *
 * Implements a tree-based undo/redo model where branching occurs when
 * a new action is pushed while not at the tip of the current branch.
 */

import type { UndoableAction, UndoNode, UndoTreeData } from "./types";

/** Maximum tree depth before pruning is recommended. */
const MAX_TREE_DEPTH = 500;

/** Maximum branches per node. */
const MAX_BRANCHES_PER_NODE = 50;

/** Generate a unique node ID. */
function generateNodeId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export class UndoTree {
  private nodes: Map<string, UndoNode>;
  private rootId: string;
  private currentNodeId: string;

  constructor() {
    const rootId = "root";
    const rootNode: UndoNode = {
      id: rootId,
      parentId: null,
      action: {
        type: "init",
        label: "Initial state",
        forward: { type: "noop", payload: {} },
        reverse: { type: "noop", payload: {} },
      },
      timestamp: Date.now(),
      children: [],
    };

    this.nodes = new Map([[rootId, rootNode]]);
    this.rootId = rootId;
    this.currentNodeId = rootId;
  }

  /** Push a new action onto the tree. Creates a branch if not at the tip. */
  pushAction(action: UndoableAction): UndoNode {
    const currentNode = this.nodes.get(this.currentNodeId);
    if (!currentNode) {
      throw new Error(`Current node ${this.currentNodeId} not found`);
    }

    if (currentNode.children.length >= MAX_BRANCHES_PER_NODE) {
      throw new Error(
        `Node ${this.currentNodeId} has reached the maximum number of branches (${MAX_BRANCHES_PER_NODE})`,
      );
    }

    const depth = this.getDepth(this.currentNodeId);
    if (depth >= MAX_TREE_DEPTH) {
      throw new Error(`Tree has reached maximum depth (${MAX_TREE_DEPTH})`);
    }

    const newId = generateNodeId();
    const newNode: UndoNode = {
      id: newId,
      parentId: this.currentNodeId,
      action,
      timestamp: Date.now(),
      children: [],
    };

    this.nodes.set(newId, newNode);
    currentNode.children.push(newId);
    this.currentNodeId = newId;

    return newNode;
  }

  /** Undo: move to the parent node. Returns the action that was undone, or null. */
  undo(): UndoableAction | null {
    const currentNode = this.nodes.get(this.currentNodeId);
    if (!currentNode || !currentNode.parentId) {
      return null;
    }

    const action = currentNode.action;
    this.currentNodeId = currentNode.parentId;
    return action;
  }

  /** Redo: move to a child node. Returns the action at the child, or null. */
  redo(branchIndex = 0): UndoableAction | null {
    const currentNode = this.nodes.get(this.currentNodeId);
    if (!currentNode || currentNode.children.length === 0) {
      return null;
    }

    const clampedIndex = Math.min(branchIndex, currentNode.children.length - 1);
    const childId = currentNode.children[clampedIndex];
    if (!childId) {
      return null;
    }

    const childNode = this.nodes.get(childId);
    if (!childNode) {
      return null;
    }

    this.currentNodeId = childId;
    return childNode.action;
  }

  /** Get the current node. */
  getCurrentNode(): UndoNode | undefined {
    return this.nodes.get(this.currentNodeId);
  }

  /** Get the current node ID. */
  getCurrentNodeId(): string {
    return this.currentNodeId;
  }

  /** Get the root node ID. */
  getRootId(): string {
    return this.rootId;
  }

  /** Get available branch IDs from the current node. */
  getBranches(): string[] {
    const currentNode = this.nodes.get(this.currentNodeId);
    return currentNode ? [...currentNode.children] : [];
  }

  /** Whether the tree can undo (current node has a parent). */
  get canUndo(): boolean {
    const currentNode = this.nodes.get(this.currentNodeId);
    return currentNode?.parentId != null;
  }

  /** Whether the tree can redo (current node has children). */
  get canRedo(): boolean {
    const currentNode = this.nodes.get(this.currentNodeId);
    return (currentNode?.children.length ?? 0) > 0;
  }

  /** Get a node by ID. */
  getNode(nodeId: string): UndoNode | undefined {
    return this.nodes.get(nodeId);
  }

  /** Get all nodes as a record. */
  getAllNodes(): Record<string, UndoNode> {
    const result: Record<string, UndoNode> = {};
    for (const [id, node] of this.nodes) {
      result[id] = node;
    }
    return result;
  }

  /** Navigate directly to a specific node by ID. */
  navigateTo(nodeId: string): boolean {
    if (this.nodes.has(nodeId)) {
      this.currentNodeId = nodeId;
      return true;
    }
    return false;
  }

  /** Calculate the depth of a node from the root. */
  private getDepth(nodeId: string): number {
    let depth = 0;
    let current = this.nodes.get(nodeId);
    while (current?.parentId) {
      depth++;
      current = this.nodes.get(current.parentId);
    }
    return depth;
  }

  /** Serialize the tree to a plain JSON object. */
  toJSON(): UndoTreeData {
    return {
      nodes: this.getAllNodes(),
      rootId: this.rootId,
      currentNodeId: this.currentNodeId,
    };
  }

  /** Deserialize a tree from a JSON object. */
  static fromJSON(data: UndoTreeData): UndoTree {
    const tree = new UndoTree();
    tree.nodes = new Map(Object.entries(data.nodes));
    tree.rootId = data.rootId;
    tree.currentNodeId = data.currentNodeId;
    return tree;
  }
}
