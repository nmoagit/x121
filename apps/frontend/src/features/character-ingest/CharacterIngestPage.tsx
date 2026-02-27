/**
 * Character ingest page (PRD-113).
 *
 * Top-level page with two tabs:
 * 1. Import — launch the folder import wizard
 * 2. Validation — project-wide validation dashboard
 */

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/primitives";
import { Tabs } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Plus } from "@/tokens/icons";
import { FolderImportWizard } from "./FolderImportWizard";
import { ValidationDashboard } from "./ValidationDashboard";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

/** Default project ID (in a real app this would come from context/route params). */
const DEFAULT_PROJECT_ID = 1;

const PAGE_TABS = [
  { id: "import", label: "Import" },
  { id: "validation", label: "Validation" },
];

export function CharacterIngestPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"import" | "validation">("import");
  const [showWizard, setShowWizard] = useState(false);

  const projectId = DEFAULT_PROJECT_ID;

  function handleComplete(characterIds: number[]) {
    setShowWizard(false);
    if (characterIds.length > 0) {
      navigate({ to: "/projects/$projectId", params: { projectId: String(projectId) } });
    }
  }

  return (
    <Stack gap={6} className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Character Ingest</h1>
        {activeTab === "import" && !showWizard && (
          <Button onClick={() => setShowWizard(true)}>
            <Plus className="mr-1 h-4 w-4" />
            New Import
          </Button>
        )}
      </div>

      <Tabs
        tabs={PAGE_TABS}
        activeTab={activeTab}
        onTabChange={(id) => {
          setActiveTab(id as "import" | "validation");
          setShowWizard(false);
        }}
      />

      {activeTab === "import" && (
        <>
          {showWizard ? (
            <FolderImportWizard
              projectId={projectId}
              onComplete={handleComplete}
              onCancel={() => setShowWizard(false)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-12 text-center">
              <p className="text-muted-foreground">
                Import characters from folder structures or text lists.
              </p>
              <Button variant="secondary" onClick={() => setShowWizard(true)}>
                Start Import Wizard
              </Button>
            </div>
          )}
        </>
      )}

      {activeTab === "validation" && (
        <ValidationDashboard projectId={projectId} />
      )}
    </Stack>
  );
}
