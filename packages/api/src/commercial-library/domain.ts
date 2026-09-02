export type LibraryStatus = "draft" | "published" | "archived";
export type LibraryAction = "create_draft" | "publish" | "archive";

export type CommercialLibraryEvidenceLabel = "observational" | "experiment_supported";

export function normalizeCommercialLibraryEvidenceLabel(value: string | null | undefined): CommercialLibraryEvidenceLabel {
  return value === "experiment_supported" || value === "causal" ? "experiment_supported" : "observational";
}

export function commercialLibraryAdvisoryLockKey(lineageKey: string) {
  return `commercial-library:${lineageKey}`;
}

export function planLibraryTransition(
  existing: readonly { version: number; status: LibraryStatus; type: string }[],
  action: LibraryAction,
  requestedType?: string,
) {
  const latest = [...existing].sort((a, b) => b.version - a.version)[0];
  if (!latest) {
    if (action !== "create_draft" || !requestedType) throw new Error("A lineage must start as a draft");
    return { version: 1, status: "draft" as const, type: requestedType };
  }
  if (requestedType && requestedType !== latest.type) throw new Error("Library lineage type is immutable");
  if (action === "publish" && latest.status === "draft") return { version: latest.version + 1, status: "published" as const, type: latest.type };
  if (action === "archive" && latest.status === "published") return { version: latest.version + 1, status: "archived" as const, type: latest.type };
  throw new Error(`Invalid library transition from ${latest.status}`);
}

export function planManualLibraryVersionAppend(
  existing: readonly { id: string; version: number; status: LibraryStatus; type: string }[],
  action: LibraryAction,
  requestedType?: string,
) {
  const next = planLibraryTransition(existing, action, requestedType);
  const parent = [...existing].sort((a, b) => b.version - a.version || a.id.localeCompare(b.id))[0] ?? null;
  return {
    ...next,
    parentVersionId: parent?.id ?? null,
    changeKind: "manual" as const,
    changeReason: null,
    restoredFromVersionId: null,
  };
}

export function latestLibraryVersions<T extends { lineageKey: string; version: number; status: LibraryStatus }>(rows: readonly T[]) {
  const latest = new Map<string, T>();
  for (const row of [...rows].sort((a, b) => b.version - a.version)) if (!latest.has(row.lineageKey)) latest.set(row.lineageKey, row);
  return [...latest.values()];
}

export const latestVisibleLibraryVersions = <T extends { lineageKey: string; version: number; status: LibraryStatus }>(rows: readonly T[]) => latestLibraryVersions(rows).filter((row) => row.status === "published");

export function experimentEvidenceLabel(input: { status: string; finalDecision: string | null; approvedById: string | null }) {
  return input.status === "completed" && input.finalDecision === "approved" && input.approvedById ? "experiment_supported" as const : "observational" as const;
}
