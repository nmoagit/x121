import { SearchBar } from "@/features/search";

export function SearchPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-[var(--color-text-primary)]">Search</h1>
      <SearchBar />
    </div>
  );
}
