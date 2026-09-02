import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, db, eq, inArray, isNull } from "@crm-fran/db";
import {
  ALERT_KIND,
  ALERT_SEVERITY,
  alerts,
  leads,
  roles,
  user,
} from "@crm-fran/db/schema/index";

import type { Context } from "../context";
import { listNextBestActions } from "../alerts/services/next-best-actions";
import { recordCloserAnswers } from "../leads/services/record-closer-answers";

describe("closer feedback alert lifecycle", () => {
  const userIds: string[] = [];
  const leadIds: string[] = [];

  beforeAll(async () => {
    await db
      .insert(roles)
      .values([
        { id: "role-closer", name: "Closer", permissions: ["leads:*", "alerts:*"] },
        { id: "role-admin", name: "Admin", permissions: ["*"] },
      ])
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

  async function createUser(roleId = "role-closer") {
    const id = crypto.randomUUID();
    userIds.push(id);
    await db.insert(user).values({
      id,
      roleId,
      name: roleId === "role-admin" ? "Admin" : "Closer",
      email: `${id}@test.com`,
    });
    return id;
  }

  async function createLead(closerId: string) {
    const id = crypto.randomUUID();
    leadIds.push(id);
    await db.insert(leads).values({
      id,
      name: "Lead",
      email: `${id}@lead.test`,
      phone: "600000000",
      closerId,
    });
    return id;
  }

  function context(userId: string, roleId = "role-closer", wildcard = false) {
    const permissions = wildcard ? ["*"] : ["leads:write", "alerts:read"];
    return {
      session: {
        user: {
          id: userId,
          roleId,
          name: "User",
          email: `${userId}@test.com`,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      role: { id: roleId, name: roleId, permissions },
      permissions,
    } as Context;
  }

  async function createAppointmentAlert(leadId: string, closerId: string) {
    const id = crypto.randomUUID();
    await db.insert(alerts).values({
      id,
      leadId,
      targetUserId: closerId,
      kind: ALERT_KIND.APPOINTMENT,
      message: "Agenda",
      severity: ALERT_SEVERITY.INFO,
      intervalMinutes: 60,
      maxOccurrences: 1,
      nextShowAt: new Date("2099-01-01T10:00"),
    });
    return id;
  }

  const outcomeQuestion = (answer: string) => ({
    questionKey: "closerOutcome",
    question: "¿Qué sucedió?",
    answer,
  });

  it("upserts Seguimiento and No-show for the assigned closer, then resolves obsolete work", async () => {
    const closerId = await createUser();
    const leadId = await createLead(closerId);
    const originalAlertId = await createAppointmentAlert(leadId, closerId);

    await recordCloserAnswers({
      ctx: context(closerId),
      input: {
        leadId,
        isContacted: "Si",
        scheduledDate: "2099-01-02",
        scheduledTime: "11:30",
        questions: [outcomeQuestion("Seguimiento")],
      },
    });
    await recordCloserAnswers({
      ctx: context(closerId),
      input: {
        leadId,
        isContacted: "Si",
        scheduledDate: "2099-01-02",
        scheduledTime: "11:30",
        questions: [outcomeQuestion("Seguimiento")],
      },
    });

    let active = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.leadId, leadId), isNull(alerts.resolvedAt)));
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      id: originalAlertId,
      targetUserId: closerId,
      kind: ALERT_KIND.FOLLOW_UP,
      nextShowAt: new Date("2099-01-02T11:30"),
    });

    await recordCloserAnswers({
      ctx: context(closerId),
      input: {
        leadId,
        isContacted: "No",
        questions: [outcomeQuestion("No-show")],
      },
    });
    active = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.leadId, leadId), isNull(alerts.resolvedAt)));
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      id: originalAlertId,
      targetUserId: closerId,
      kind: ALERT_KIND.NO_CONTACT,
    });

    await recordCloserAnswers({
      ctx: context(closerId),
      input: {
        leadId,
        isContacted: "Si",
        questions: [outcomeQuestion("Venta")],
      },
    });
    await expect(
      db
        .select()
        .from(alerts)
        .where(and(eq(alerts.leadId, leadId), isNull(alerts.resolvedAt))),
    ).resolves.toHaveLength(0);
  }, 20_000);

  it("creates a dated Reagenda alert for the assigned closer, including admin-authored feedback", async () => {
    const closerId = await createUser();
    const adminId = await createUser("role-admin");
    const leadId = await createLead(closerId);

    await recordCloserAnswers({
      ctx: context(adminId, "role-admin", true),
      input: {
        leadId,
        isContacted: "Si",
        scheduledDate: "2099-02-03",
        scheduledTime: "09:15",
        questions: [outcomeQuestion("Reagenda")],
      },
    });

    const [alert] = await db.select().from(alerts).where(eq(alerts.leadId, leadId));
    expect(alert).toMatchObject({
      targetUserId: closerId,
      kind: ALERT_KIND.RESCHEDULED,
      nextShowAt: new Date("2099-02-03T09:15"),
    });
  });

  it("rejects undated scheduled outcomes and never triggers from free text", async () => {
    const closerId = await createUser();
    const leadId = await createLead(closerId);

    await expect(
      recordCloserAnswers({
        ctx: context(closerId),
        input: {
          leadId,
          isContacted: "Si",
          questions: [outcomeQuestion("Seguimiento")],
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await recordCloserAnswers({
      ctx: context(closerId),
      input: {
        leadId,
        isContacted: "Si",
        questions: [
          outcomeQuestion("Venta"),
          {
            questionKey: "closerFeedback",
            question: "Feedback del closer",
            answer: "Reagenda y seguimiento la próxima semana",
          },
        ],
      },
    });

    await expect(
      db.select().from(alerts).where(eq(alerts.leadId, leadId)),
    ).resolves.toHaveLength(0);
  });

  it("shows closer feedback actions only to the assigned closer and never in Caller mode", async () => {
    const firstCloserId = await createUser();
    const secondCloserId = await createUser();
    const adminId = await createUser("role-admin");
    const firstLeadId = await createLead(firstCloserId);
    const secondLeadId = await createLead(secondCloserId);

    for (const [closerId, leadId] of [
      [firstCloserId, firstLeadId],
      [secondCloserId, secondLeadId],
    ] as const) {
      await recordCloserAnswers({
        ctx: context(closerId),
        input: {
          leadId,
          isContacted: "No",
          questions: [outcomeQuestion("No-show")],
        },
      });
    }

    const firstQueue = await listNextBestActions({
      actorId: firstCloserId,
      roleId: "role-closer",
      permissions: ["alerts:read"],
      mode: "closer",
    });
    const secondQueue = await listNextBestActions({
      actorId: secondCloserId,
      roleId: "role-closer",
      permissions: ["alerts:read"],
      mode: "closer",
    });
    const callerMode = await listNextBestActions({
      actorId: adminId,
      roleId: "role-admin",
      permissions: ["*"],
      mode: "caller",
    });

    expect(firstQueue.map(({ lead }) => lead.id)).toEqual([firstLeadId]);
    expect(secondQueue.map(({ lead }) => lead.id)).toEqual([secondLeadId]);
    expect(callerMode.map(({ lead }) => lead.id)).not.toContain(firstLeadId);
    expect(callerMode.map(({ lead }) => lead.id)).not.toContain(secondLeadId);
  }, 20_000);
});
