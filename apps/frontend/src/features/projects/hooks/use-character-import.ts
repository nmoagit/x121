/**
 * Shared hook for drag-and-drop character import flow.
 *
 * Encapsulates the import state, handlers, and bulk-create mutation
 * so that both ProjectCharactersTab and ProjectGroupsTab can share
 * identical import behavior without duplicating code.
 */

import { useRef, useState } from "react";

import { useBulkCreateCharacters } from "./use-project-characters";

export function useCharacterImport(projectId: number) {
  const bulkCreate = useBulkCreateCharacters(projectId);
  const [importNames, setImportNames] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const browseFolderRef = useRef<(() => void) | null>(null);

  function handleImportDrop(names: string[]) {
    setImportNames(names);
    setImportOpen(true);
  }

  function handleImportConfirm(names: string[], groupId?: number) {
    bulkCreate.mutate(
      { names, group_id: groupId },
      {
        onSuccess: () => {
          setImportOpen(false);
          setImportNames([]);
        },
      },
    );
  }

  function closeImport() {
    setImportOpen(false);
  }

  function browseFolder() {
    browseFolderRef.current?.();
  }

  return {
    importNames,
    importOpen,
    handleImportDrop,
    handleImportConfirm,
    closeImport,
    bulkCreatePending: bulkCreate.isPending,
    browseFolderRef,
    browseFolder,
  };
}
