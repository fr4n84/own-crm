import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmailMarketingAccessBoundary, EmailMarketingDeliveryStatus } from "./access-boundary";
import { EmailMarketingCopyReview } from "./copy-review";

describe("email marketing admin boundary", () => {
  it("does not expose marketing data to non-admin roles", () => {
    const html = renderToStaticMarkup(<EmailMarketingAccessBoundary permissions={["leads:read"]}><div>private campaign</div></EmailMarketingAccessBoundary>);
    expect(html).toContain("Acceso restringido");
    expect(html).not.toContain("private campaign");
  });

  it("shows that delivery is server-disabled without rendering an activation action", () => {
    const html = renderToStaticMarkup(<EmailMarketingDeliveryStatus capability={{ status: "disabled", provider: null, reason: "not_configured" }} />);
    expect(html).toContain("Delivery not configured/disabled");
    expect(html).not.toContain("<button");
  });

  it("renders the protected content for wildcard administrators", () => {
    const html = renderToStaticMarkup(<EmailMarketingAccessBoundary permissions={["*"]}><div>private campaign</div></EmailMarketingAccessBoundary>);
    expect(html).toContain("private campaign");
  });

  it("shows the exact subject, preview, and body before a copy version can be approved", () => {
    const html = renderToStaticMarkup(<EmailMarketingCopyReview version={{
      id: "copy-2",
      version: 2,
      subject: "Security review subject",
      previewText: "Exact preview text",
      bodyText: "Exact body line one\nExact body line two",
      status: "draft",
      origin: "ai",
    }} />);

    expect(html).toContain("v2");
    expect(html).toContain("Security review subject");
    expect(html).toContain("Exact preview text");
    expect(html).toContain("Exact body line one\nExact body line two");
    expect(html).toContain("Borrador creado con IA");
  });
});
