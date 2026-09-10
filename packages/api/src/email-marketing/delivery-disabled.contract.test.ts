import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativeUrl: string) {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), "utf8");
}

describe("email marketing disabled-delivery surface", () => {
  it("exposes no active delivery route, mutation, worker, webhook, or tracking hook", () => {
    const router = source("../routers/email-marketing.ts");
    const view = source("../../../../apps/web/src/features/email-marketing/email-marketing-view.tsx");
    const route = source("../../../../apps/web/src/app/email-marketing/page.tsx");

    expect(router).not.toMatch(/\b(?:send|dispatch|activateDelivery|webhook|tracking|outbox)\s*:/i);
    expect(view).not.toMatch(/trpc\.emailMarketing\.(?:send|dispatch|activateDelivery)/);
    expect(route).not.toMatch(/(?:send|dispatch|webhook|tracking|outbox)/i);
  });

  it("keeps provider credentials and runtime selection out of example configuration", () => {
    const exampleEnvironment = source("../../../../apps/web/.env.example");
    const providerBoundary = source("./delivery-provider.ts");

    expect(exampleEnvironment).not.toMatch(/^(?:RESEND|SENDGRID|MAILCHIMP|POSTMARK|AWS_SES|SMTP|EMAIL_MARKETING_PROVIDER)[A-Z0-9_]*=/m);
    expect(providerBoundary).not.toMatch(/@(?:resend|sendgrid|mailchimp|postmark)|process\.env|@crm-fran\/env/i);
    expect(providerBoundary).not.toMatch(/class\s+\w+\s+implements\s+EmailMarketingDeliveryProvider/);
  });
});