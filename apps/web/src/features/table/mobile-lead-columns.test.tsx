import { describe, expect, it } from "vitest";
import { createLeadColumns } from "./columns";

describe("mobile lead columns", () => {
  it("keeps only name, phone and actions visible on mobile", () => {
    const columns = createLeadColumns(() => null);
    for (const column of columns) {
      const key = "accessorKey" in column ? column.accessorKey : column.id;
      const hidden = (column.meta as { mobileHidden?: boolean } | undefined)?.mobileHidden;
      expect(Boolean(hidden)).toBe(!["name", "phone", "actions"].includes(String(key)));
    }
  });
});
