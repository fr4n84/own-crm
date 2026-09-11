import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AudiencePreviewTable, type AudiencePreviewItem } from "./audience-preview";

const item: AudiencePreviewItem = {
  id: "member-1",
  decision: "included",
  reason: "eligible",
  contact: { name: "Ada", email: "ada@example.com", phone: "+34600000001" },
  detail: {
    source: "Meta",
    campaign: "Otoño",
    utmContent: "video-1",
    theme: "Libertad",
    confirmedFeedback: ["time_freedom"],
  },
};

describe("email marketing preparation UI", () => {
  it("shows the authorized contact fields and exposes extra information only behind an accessible eye control", () => {
    const html = renderToStaticMarkup(<AudiencePreviewTable items={[item]} />);

    expect(html).toContain("Ada");
    expect(html).toContain("ada@example.com");
    expect(html).toContain("+34600000001");
    expect(html).toContain('aria-label="Ver detalle de Ada"');
    expect(html).not.toContain("video-1");
    expect(html).not.toContain("time_freedom");
  });

  it("uses four accessible tabs and a browser-only CSV download without any send action", () => {
    const sourcePath = path.resolve(
      process.cwd(),
      fs.existsSync(path.resolve(process.cwd(), "apps/web"))
        ? "apps/web/src/features/email-marketing/email-marketing-view.tsx"
        : "src/features/email-marketing/email-marketing-view.tsx",
    );
    const source = fs.readFileSync(sourcePath, "utf8");

    for (const token of [
      '<TabsList aria-label="Secciones de Email Marketing"',
      '<TabsTrigger value="audiences">Audiencias</TabsTrigger>',
      '<TabsTrigger value="consent">Consentimiento</TabsTrigger>',
      '<TabsTrigger value="copy">Copy</TabsTrigger>',
      '<TabsTrigger value="export">Exportación</TabsTrigger>',
      "trpc.emailMarketing.listAudienceMembers",
      "trpc.emailMarketing.exportAudience",
      "URL.createObjectURL",
      "link.download",
    ]) expect(source).toContain(token);
    expect(source).not.toContain("sendEmail");
    expect(source).not.toContain("dispatchEmail");
  });
});
