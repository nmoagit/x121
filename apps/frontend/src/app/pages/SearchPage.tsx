import { SearchBar } from "@/features/search";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";

export function SearchPage() {
  useSetPageTitle("Search", "Search across projects, avatars, scenes, and workflows.");
  return (
    <div>
      <SearchBar />
    </div>
  );
}
