import { describe, expect, it } from "vitest";
import { resolveEntityLabel } from "./select-label";

describe("entity select labels", () => {
  const users = [{ id: "uuid-1", name: "Ana", email: "ana@example.com" }];
  it("shows a readable closer name instead of its id", () => expect(resolveEntityLabel(users, "uuid-1", "Closer no disponible")).toBe("Ana"));
  it("shows name and email when requested", () => expect(resolveEntityLabel(users, "uuid-1", "Usuario no disponible", true)).toBe("Ana · ana@example.com"));
  it("uses a readable fallback and never leaks an unknown id", () => expect(resolveEntityLabel(users, "very-long-secret-id", "Usuario no disponible", true)).toBe("Usuario no disponible"));
});
