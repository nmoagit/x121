import { useEffect } from "react";
import { usePageTitle } from "@/app/usePageTitle";

/** Set the global page title shown in the header bar. Clears on unmount. */
export function useSetPageTitle(title: string, description?: string) {
  const setPageTitle = usePageTitle((s) => s.setPageTitle);

  useEffect(() => {
    setPageTitle(title, description);
    return () => setPageTitle("", "");
  }, [title, description, setPageTitle]);
}
