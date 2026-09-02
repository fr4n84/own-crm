export type PersonFilters = {
  callerId: string;
  closerId: string;
};

export function selectCallerFilter(
  current: PersonFilters,
  callerId: string,
): PersonFilters {
  return {
    callerId,
    closerId: callerId === "all" ? current.closerId : "all",
  };
}

export function selectCloserFilter(
  current: PersonFilters,
  closerId: string,
): PersonFilters {
  return {
    callerId: closerId === "all" ? current.callerId : "all",
    closerId,
  };
}

export function toggleConditionFilter(
  selected: readonly string[],
  condition: string,
): string[] {
  if (!selected.includes(condition)) return [...selected, condition];
  if (selected.length === 1) return [...selected];
  return selected.filter((value) => value !== condition);
}
