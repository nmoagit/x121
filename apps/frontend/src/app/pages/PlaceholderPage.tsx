import { useSetPageTitle } from "@/hooks/useSetPageTitle";

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  useSetPageTitle(title, description);
  return <div />;
}
