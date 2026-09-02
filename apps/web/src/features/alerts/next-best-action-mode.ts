import { isCallerRoleId, isCloserRoleId } from "@/lib/role-capabilities";

export type NextBestActionWorkMode = "caller" | "closer";

export function availableWorkModes(
  roleId: string | null | undefined,
  permissions: readonly string[],
): NextBestActionWorkMode[] {
  if (permissions.includes("*")) return ["caller", "closer"];
  const modes: NextBestActionWorkMode[] = [];
  if (isCallerRoleId(roleId)) modes.push("caller");
  if (isCloserRoleId(roleId)) modes.push("closer");
  return modes;
}

export function normalizeWorkMode(
  persistedMode: string | null | undefined,
  availableModes: readonly NextBestActionWorkMode[],
): NextBestActionWorkMode {
  if (persistedMode === "caller" && availableModes.includes("caller")) return "caller";
  if (persistedMode === "closer" && availableModes.includes("closer")) return "closer";
  return availableModes[0] ?? "caller";
}
