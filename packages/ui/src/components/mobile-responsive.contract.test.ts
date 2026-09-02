import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function source(file: string) {
  return readFileSync(resolve(__dirname, file), "utf8")
}

describe("shared mobile interaction contract", () => {
  it("keeps primary controls touchable on mobile and compact on desktop", () => {
    expect(source("button.tsx")).toMatch(/min-h-11.*min-w-11.*sm:min-h-0.*sm:min-w-0/s)
    expect(source("input.tsx")).toMatch(/h-11.*sm:h-8/s)
    expect(source("select.tsx")).toContain("data-[size=default]:h-11")
    expect(source("select.tsx")).toContain("sm:data-[size=default]:h-8")
    expect(source("select.tsx")).toContain("min-h-11")
    expect(source("toggle.tsx")).toMatch(/min-h-11.*min-w-11.*sm:min-h-0.*sm:min-w-0/s)
  })

  it("keeps tabs on one touchable, horizontally discoverable mobile row", () => {
    const tabs = source("tabs.tsx")
    expect(tabs).toMatch(/max-w-full.*overflow-x-auto/s)
    expect(tabs).toMatch(/min-h-11.*shrink-0/s)
    expect(tabs).toContain("[scrollbar-width:none]")
  })

  it("protects overlays from the mobile viewport and virtual keyboard", () => {
    const dialog = source("dialog.tsx")
    const sheet = source("sheet.tsx")
    const drawer = source("drawer.tsx")
    expect(dialog).toContain("max-h-[calc(100dvh-2rem)]")
    expect(dialog).toContain("overflow-y-auto")
    expect(sheet).toContain("max-h-dvh")
    expect(sheet).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]")
    expect(drawer).toContain("data-[swipe-axis=x]:[--drawer-content-width:100%]")
  })

  it("makes the mobile sidebar touchable and exposes safe-area support", () => {
    const sidebar = source("sidebar.tsx")
    expect(sidebar).toMatch(/min-h-11.*md:min-h-0/s)
    expect(sidebar).toContain("env(safe-area-inset-bottom)")
  })
})
