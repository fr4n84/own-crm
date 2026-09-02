import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/usuarios-accesos/page.tsx", "utf8");
const view = readFileSync("src/features/users-access/users-access-view.tsx", "utf8");

describe("users and access visual contract", () => {
  it("is an Arc surface with compact responsive filters", () => {
    expect(`${page}\n${view}`).toContain("Usuarios y accesos");
    expect(view).toContain("dashboard-arc-theme");
    expect(view).toContain("sm:grid-cols");
    expect(view).toContain("lg:hidden");
    expect(view).toContain("hidden overflow-x-auto lg:block");
    expect(view).not.toContain("localStorage");
  });

  it("explains the server authority and renders explicit states", () => {
    expect(view).toContain("La API sigue siendo la autoridad");
    expect(view).toContain("Skeleton");
    expect(view).toContain("No se pudo cargar");
    expect(view).toContain("No hay usuarios");
  });

  it("offers a role-by-module editor with explicit pending controls and confirmation", () => {
    expect(view).toContain("Visibilidad del menú por rol");
    expect(view).toContain("Checkbox");
    expect(view).toContain("Guardar cambios");
    expect(view).toContain("Cancelar");
    expect(view).toContain("window.confirm");
    expect(view).toContain("Los permisos de la API no cambiarán");
  });
});
