import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  TEAM_PRESENCE_POLL_INTERVAL_MS,
  TeamPresenceContent,
  TeamPresenceTrigger,
  mapPathToPresenceCategory,
  shouldAttemptHeartbeat,
  shouldSendHeartbeat,
} from "./team-presence-view";

const members = [
  { userId: "u1", displayName: "Ana López", roleName: "Caller", status: "online", category: "sales", lastActiveBucket: "now" },
  { userId: "u2", displayName: "Luis Pérez", status: "away", category: "coaching", lastActiveBucket: "recently" },
] as const;

describe("team presence UI", () => {
  it("uses an accessible compact trigger", () => {
    const html = renderToStaticMarkup(<TeamPresenceTrigger onlineCount={1} />);
    expect(html).toContain('aria-label="Ver presencia del equipo"');
    expect(html).toContain("1 online");
  });

  it("renders loading, unavailable and empty states without breaking navigation", () => {
    expect(renderToStaticMarkup(<TeamPresenceContent state="loading" members={[]} />)).toContain('role="status"');
    expect(renderToStaticMarkup(<TeamPresenceContent state="error" members={[]} />)).toContain("Presencia no disponible");
    expect(renderToStaticMarkup(<TeamPresenceContent state="ready" members={[]} />)).toContain("No hay miembros activos");
  });

  it("shows only coarse status, category and approximate activity", () => {
    const html = renderToStaticMarkup(<TeamPresenceContent state="ready" members={[...members]} />);
    expect(html).toContain("Ana López");
    expect(html).toContain("Ventas");
    expect(html).toContain("Ahora");
    expect(html).not.toContain("/leads");
    expect(html).not.toContain("leadId");
  });

  it("keeps cadence state outside route-dependent effects", () => {
    const runtime = readFileSync(resolve(process.cwd(), "src/features/team-presence/team-presence.tsx"), "utf8");
    expect(runtime).toContain("const lastAttemptAtMs = useRef<number | null>(null)");
    expect(runtime).not.toContain("let lastAttemptAt");
  });

  it("maps routes locally to an allowlisted coarse category and pauses heartbeat when hidden", () => {
    expect(mapPathToPresenceCategory("/leads-generales/lead-123")).toBe("sales");
    expect(mapPathToPresenceCategory("/estadisticas-personales")).toBe("coaching");
    expect(mapPathToPresenceCategory("/users")).toBe("administration");
    expect(mapPathToPresenceCategory("/")).toBe("crm");
    expect(shouldSendHeartbeat("hidden")).toBe(false);
    expect(shouldSendHeartbeat("visible")).toBe(true);
    expect(TEAM_PRESENCE_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
    expect(shouldAttemptHeartbeat({ visibility: "visible", nowMs: 1_000, lastAttemptAtMs: null })).toBe(true);
    expect(shouldAttemptHeartbeat({ visibility: "visible", nowMs: 60_999, lastAttemptAtMs: 1_000 })).toBe(false);
    expect(shouldAttemptHeartbeat({ visibility: "visible", nowMs: 61_000, lastAttemptAtMs: 1_000 })).toBe(true);
    expect(shouldAttemptHeartbeat({ visibility: "hidden", nowMs: 120_000, lastAttemptAtMs: 1_000 })).toBe(false);
  });
});
