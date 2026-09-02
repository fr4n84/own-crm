export const ROLE_ID = {
  CALLER: "role-caller",
  CLOSER: "role-closer",
  COMBINED: "role-caller-closer",
} as const;

export function isCallerRoleId(roleId: string | null | undefined) {
  return roleId === ROLE_ID.CALLER || roleId === ROLE_ID.COMBINED;
}

export function isCloserRoleId(roleId: string | null | undefined) {
  return roleId === ROLE_ID.CLOSER || roleId === ROLE_ID.COMBINED;
}
