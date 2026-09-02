import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(resolve(__dirname, path), "utf8")
}

describe("mobile operational flows", () => {
  it("closes the mobile navigation after choosing a destination", () => {
    const navigation = source("../../../../packages/ui/src/components/nav-main.tsx")
    expect(navigation).toContain("setOpenMobile(false)")
  })

  it("uses a full-height lead workspace with visible close and safe footer", () => {
    const drawer = source("../components/lead-drawer/lead-drawer.tsx")
    expect(drawer).toContain("h-dvh")
    expect(drawer).toContain('aria-label="Cerrar ficha del lead"')
    expect(drawer).toContain("env(safe-area-inset-bottom)")
  })

  it("uses a mobile master-detail messages flow with an explicit back action", () => {
    const messages = source("messages/messages-view.tsx")
    expect(messages).toContain("showConversationOnMobile")
    expect(messages).toContain('aria-label="Volver a conversaciones"')
    expect(messages).toContain("min-h-dvh")
  })

  it("does not register row-wide touch dragging that conflicts with table scrolling", () => {
    const table = source("../../../../packages/ui/src/components/data-table.tsx")
    expect(table).not.toContain("TouchSensor")
  })

  it("keeps the application header bounded on narrow screens", () => {
    const header = source("../../../../packages/ui/src/components/site-header.tsx")
    expect(header).toContain("min-w-0")
    expect(header).toContain("truncate")
  })

  it("defaults the calendar to one day on mobile and preserves touch targets", () => {
    const calendar = source("calendar/calendar-view.tsx")
    const styles = source("../app/calendar/calendar.module.css")
    expect(calendar).toContain("hasAppliedMobileDefault")
    expect(calendar).toContain("setViewDays(1)")
    expect(styles).toContain("min-height: 2.75rem")
  })

  it("keeps identifying and action columns visible while a table scrolls", () => {
    const table = source("../../../../packages/ui/src/components/table.tsx")
    expect(table).toContain("max-md:first:sticky")
    expect(table).toContain("max-md:last:sticky")
  })

  it("redirects obsolete duplicate pages to maintained mobile surfaces", () => {
    const routes = {
      analytical: "/",
      campaigns: "/rentabilidad",
      ranking: "/estadisticas-personales/rankings",
      tickets: "/messages",
      users: "/usuarios-accesos",
    }

    for (const [route, destination] of Object.entries(routes)) {
      const page = source(`../app/${route}/page.tsx`)
      expect(page).toContain(`redirect(\"${destination}\")`)
    }
  })
})
