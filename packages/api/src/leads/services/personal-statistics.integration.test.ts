import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, inArray } from "@crm-fran/db";
import {
  leadActivityEvents,
  leads,
  roles,
  user,
} from "@crm-fran/db/schema/index";

import { getPersonalStatistics } from "./personal-statistics";

describe("personal statistics historical intervals", () => {
  const userIds: string[] = [];
  const leadIds: string[] = [];

  beforeAll(async () => {
    await db
      .insert(roles)
      .values({ id: "role-caller", name: "Caller", permissions: ["leads:read"] })
      .onConflictDoNothing();
  });

  afterEach(async () => {
    if (leadIds.length > 0) {
      await db.delete(leads).where(inArray(leads.id, leadIds));
    }
    if (userIds.length > 0) {
      await db.delete(user).where(inArray(user.id, userIds));
    }
    leadIds.length = 0;
    userIds.length = 0;
  });

  it("uses activity occurrence dates instead of the lead update date", async () => {
    const callerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();
    userIds.push(callerId);
    leadIds.push(leadId);

    await db.insert(user).values({
      id: callerId,
      name: "Historical Caller",
      email: `${callerId}@test.com`,
      roleId: "role-caller",
    });
    await db.insert(leads).values({
      id: leadId,
      name: "Historical Lead",
      email: `${leadId}@test.com`,
      phone: "600000000",
      callerId,
      updatedAt: new Date("2026-08-15T10:00:00.000Z"),
    });
    await db.insert(leadActivityEvents).values([
      {
        id: crypto.randomUUID(),
        leadId,
        actorId: callerId,
        actorRole: "caller",
        kind: "caller_feedback",
        title: "Feedback del caller registrado",
        description: "Agenda",
        metadata: {
          questions: [
            {
              questionKey: "callerOutcome",
              question: "Resultado",
              answer: "Agenda",
              authorRole: "caller",
              authorId: callerId,
            },
          ],
        },
        dedupeKey: `test:historical-agenda:${leadId}`,
        occurredAt: new Date("2026-08-02T10:00:00.000Z"),
      },
      {
        id: crypto.randomUUID(),
        leadId,
        actorId: callerId,
        actorRole: "caller",
        kind: "caller_feedback",
        title: "Feedback del caller registrado",
        description: "No interesado",
        metadata: {
          questions: [
            {
              questionKey: "callerOutcome",
              question: "Resultado",
              answer: "No interesado",
              authorRole: "caller",
              authorId: callerId,
            },
          ],
        },
        dedupeKey: `test:historical-not-interested:${leadId}`,
        occurredAt: new Date("2026-08-15T10:00:00.000Z"),
      },
    ]);

    const result = await getPersonalStatistics({
      callerId,
      from: "2026-08-01",
      to: "2026-08-05",
    });

    expect(result.total).toBe(1);
    expect(result.counts.appointment).toBe(1);
    expect(result.counts.not_interested).toBe(0);
  });

  it("uses the lead date for imported rows that predate the activity ledger", async () => {
    const callerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();
    userIds.push(callerId);
    leadIds.push(leadId);

    await db.insert(user).values({
      id: callerId,
      name: "Imported Caller",
      email: `${callerId}@test.com`,
      roleId: "role-caller",
    });
    await db.insert(leads).values({
      id: leadId,
      name: "Imported Lead",
      email: `${leadId}@test.com`,
      phone: "600000001",
      callerId,
      createdAt: new Date("2026-06-10T10:00:00.000Z"),
      updatedAt: new Date("2026-06-10T10:00:00.000Z"),
      questions: [
        {
          questionKey: "csvSourceState",
          question: "Estado de origen (importado)",
          answer: "Asignado",
          authorRole: "caller",
          authorId: callerId,
        },
        {
          questionKey: "callerOutcome",
          question: "¿Qué ha sucedido?",
          answer: "Agenda",
          authorRole: "caller",
          authorId: callerId,
        },
      ],
    });

    const result = await getPersonalStatistics({
      callerId,
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(result.total).toBe(1);
    expect(result.counts.appointment).toBe(1);
  });
});
