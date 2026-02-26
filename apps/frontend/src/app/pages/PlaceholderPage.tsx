interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-[var(--color-text-primary)]">{title}</h1>
      <p className="text-[var(--color-text-secondary)]">{description}</p>
    </div>
  );
}
