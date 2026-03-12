import { SearchBar } from "@/features/search";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";

export function SearchPage() {
  useSetPageTitle("Search");
  return (
    <div>
      <SearchBar />
    </div>
  );
}
