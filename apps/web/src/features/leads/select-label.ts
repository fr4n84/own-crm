type Entity = { id: string; name: string | null; email?: string | null };

export function resolveEntityLabel(
  entities: readonly Entity[] | undefined,
  selectedId: string,
  fallback: string,
  includeEmail = false,
) {
  const entity = entities?.find(({ id }) => id === selectedId);
  if (!entity?.name) return fallback;
  return includeEmail && entity.email ? `${entity.name} · ${entity.email}` : entity.name;
}
