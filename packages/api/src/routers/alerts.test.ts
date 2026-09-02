import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { db, eq, inArray } from "@crm-fran/db";
import {
  alerts,
  leads,
  LEAD_POOL_STATUS,
  roles,
  user,
} from "@crm-fran/db/schema/index";
import { LEAD_STATE } from "@crm-fran/db/schema/state";
import { ALERT_KIND, ALERT_SEVERITY } from "@crm-fran/db/schema/alerts";
import { appRouter } from "./index";
import type { Context } from "../context";
import type { Permission } from "@crm-fran/db/schema/auth";

describe("alerts router", () => {
  const created = {
    userIds: [] as string[],
    leadIds: [] as string[],
    alertIds: [] as string[],
  };

  beforeAll(async () => {
    await db
      .insert(roles)
      .values([
        { id: "role-caller", name: "Caller", permissions: ["leads:*", "users:read"] },
        { id: "role-closer", name: "Closer", permissions: ["leads:*", "alerts:*"] },
        { id: "role-admin", name: "Admin", permissions: ["*"] },
      ])
      .onConflictDoNothing();
  });

  afterEach(async () => {
    if (created.alertIds.length > 0) {
      await db.delete(alerts).where(inArray(alerts.id, created.alertIds));
    }
    if (created.leadIds.length > 0) {
      await db.delete(leads).where(inArray(leads.id, created.leadIds));
    }
    if (created.userIds.length > 0) {
      await db.delete(user).where(inArray(user.id, created.userIds));
    }
    created.alertIds = [];
    created.leadIds = [];
    created.userIds = [];
  });

  async function insertUser(input: { id: string; name: string; email: string; roleId: string }) {
    created.userIds.push(input.id);
    await db.insert(user).values(input);
    return input;
  }

  async function insertLead(input: { id: string; callerId?: string; closerId?: string }) {
    created.leadIds.push(input.id);
    await db.insert(leads).values({
      id: input.id,
      name: "Test Lead",
      email: `lead-${input.id}@test.com`,
      phone: "123456789",
      state: LEAD_STATE.SIN_ASIGNAR,
      callerId: input.callerId ?? null,
      closerId: input.closerId ?? null,
    });
    return input;
  }

  async function insertAlert(input: {
    id?: string;
    leadId: string;
    targetUserId: string;
    kind?: string;
    nextShowAt?: Date;
    occurrences?: number;
    maxOccurrences?: number | null;
    dismissedAt?: Date | null;
    resolvedAt?: Date | null;
  }) {
    const id = input.id ?? crypto.randomUUID();
    created.alertIds.push(id);
    await db.insert(alerts).values({
      id,
      leadId: input.leadId,
      targetUserId: input.targetUserId,
      kind: (input.kind ?? ALERT_KIND.FOLLOW_UP) as never,
      message: "Test alert",
      severity: ALERT_SEVERITY.INFO,
      intervalMinutes: 60,
      nextShowAt: input.nextShowAt ?? new Date(),
      occurrences: input.occurrences ?? 0,
      maxOccurrences: input.maxOccurrences ?? null,
      dismissedAt: input.dismissedAt ?? null,
      resolvedAt: input.resolvedAt ?? null,
    });
    return id;
  }

  function createCaller(userId: string, roleId: string, permissions: Permission[]) {
    const ctx = {
      session: {
        user: {
          id: userId,
          roleId,
          name: "Test",
          email: "test@example.com",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      role: { id: roleId, name: roleId, permissions },
      permissions,
    } as Context;
    return appRouter.createCaller(ctx);
  }

  it("creates an alert with kind defaults", async () => {
    const closerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();
    await insertUser({ id: closerId, name: "Closer", email: "closer@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId });

    const caller = createCaller(closerId, "role-closer", ["leads:*", "alerts:*"]);

    const result = await caller.alerts.createAlert({
      leadId,
      targetUserId: closerId,
      kind: ALERT_KIND.NO_CONTACT,
    });

    expect(result.leadId).toBe(leadId);
    expect(result.targetUserId).toBe(closerId);
    expect(result.kind).toBe(ALERT_KIND.NO_CONTACT);
    expect(result.message).toBe("No se pudo contactar al lead");
    expect(result.severity).toBe(ALERT_SEVERITY.URGENT);
    expect(result.intervalMinutes).toBe(1440);
    expect(result.occurrences).toBe(0);
    expect(result.nextShowAt).toBeInstanceOf(Date);
    created.alertIds.push(result.id);
  });

  it("lists unresolved alerts for all users", async () => {
    const closerId = crypto.randomUUID();
    const otherCloserId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: closerId, name: "Closer A", email: "closer-a@test.com", roleId: "role-closer" });
    await insertUser({ id: otherCloserId, name: "Closer B", email: "closer-b@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId, callerId: closerId });

    const ownAlertId = await insertAlert({ leadId, targetUserId: closerId });
    const otherAlertId = await insertAlert({ leadId, targetUserId: otherCloserId });
    const dismissedAlertId = await insertAlert({ leadId, targetUserId: closerId, dismissedAt: new Date() });
    const resolvedAlertId = await insertAlert({ leadId, targetUserId: closerId, resolvedAt: new Date() });

    const caller = createCaller(closerId, "role-closer", ["leads:*", "alerts:read"]);
    const result = await caller.alerts.listAlerts({ includeDismissed: true, includeResolved: true });

    expect(result.map((a) => a.id)).toContain(ownAlertId);
    expect(result.map((a) => a.id)).toContain(otherAlertId);
    expect(result.map((a) => a.id)).not.toContain(dismissedAlertId);
    expect(result.map((a) => a.id)).not.toContain(resolvedAlertId);
    expect(result.find((alert) => alert.id === ownAlertId)?.lead?.caller).toMatchObject({
      id: closerId,
      name: "Closer A",
    });
  });

  it("rejects a work mode outside the authenticated role", async () => {
    const callerId = crypto.randomUUID();
    await insertUser({ id: callerId, name: "Caller mode", email: `caller-mode-${callerId}@test.com`, roleId: "role-caller" });
    const caller = createCaller(callerId, "role-caller", ["alerts:read"]);

    await expect(caller.alerts.listNextBestActions({ mode: "closer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("resolves caller, closer, multi-role, and wildcard admin modes from authenticated responsibility", async () => {
    const callerId = crypto.randomUUID();
    const closerId = crypto.randomUUID();
    const multiRoleId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    await insertUser({ id: callerId, name: "Caller", email: `caller-${callerId}@test.com`, roleId: "role-caller" });
    await insertUser({ id: closerId, name: "Closer", email: `closer-${closerId}@test.com`, roleId: "role-closer" });
    await insertUser({ id: multiRoleId, name: "Multi", email: `multi-${multiRoleId}@test.com`, roleId: "role-caller" });
    await insertUser({ id: adminId, name: "Admin", email: `admin-${adminId}@test.com`, roleId: "role-admin" });
    await insertLead({ id: crypto.randomUUID(), callerId: multiRoleId, closerId: multiRoleId });

    await expect(createCaller(callerId, "role-caller", ["alerts:read"]).alerts.getNextBestActionModes()).resolves.toEqual(["caller"]);
    await expect(createCaller(closerId, "role-closer", ["alerts:read"]).alerts.getNextBestActionModes()).resolves.toEqual(["closer"]);
    await expect(createCaller(multiRoleId, "role-caller", ["alerts:read"]).alerts.getNextBestActionModes()).resolves.toEqual(["caller", "closer"]);
    await expect(createCaller(adminId, "role-admin", ["*"]).alerts.getNextBestActionModes()).resolves.toEqual(["caller", "closer"]);
  });

  it("isolates the caller queue by authenticated user even when a foreign lead targets that user", async () => {
    const actorId = crypto.randomUUID();
    const otherId = crypto.randomUUID();
    const ownLeadId = crypto.randomUUID();
    const foreignLeadId = crypto.randomUUID();
    await insertUser({ id: actorId, name: "Caller A", email: `caller-a-${actorId}@test.com`, roleId: "role-caller" });
    await insertUser({ id: otherId, name: "Caller B", email: `caller-b-${otherId}@test.com`, roleId: "role-caller" });
    await insertLead({ id: ownLeadId, callerId: actorId });
    await insertLead({ id: foreignLeadId, callerId: otherId });
    await insertAlert({ leadId: ownLeadId, targetUserId: actorId, kind: ALERT_KIND.FUTURE_CALL });
    await insertAlert({ leadId: foreignLeadId, targetUserId: actorId, kind: ALERT_KIND.FUTURE_CALL });

    const result = await createCaller(actorId, "role-caller", ["alerts:read"]).alerts.listNextBestActions({ mode: "caller" });
    expect(result.map(({ lead }) => lead.id)).toEqual([ownLeadId]);
  });

  it("isolates the closer queue by authenticated agenda ownership", async () => {
    const actorId = crypto.randomUUID();
    const otherId = crypto.randomUUID();
    const ownLeadId = crypto.randomUUID();
    const foreignLeadId = crypto.randomUUID();
    await insertUser({ id: actorId, name: "Closer A", email: `closer-a-${actorId}@test.com`, roleId: "role-closer" });
    await insertUser({ id: otherId, name: "Closer B", email: `closer-b-${otherId}@test.com`, roleId: "role-closer" });
    await insertLead({ id: ownLeadId, closerId: actorId });
    await insertLead({ id: foreignLeadId, closerId: otherId });
    await insertAlert({ leadId: ownLeadId, targetUserId: actorId, kind: ALERT_KIND.APPOINTMENT });
    await insertAlert({ leadId: foreignLeadId, targetUserId: actorId, kind: ALERT_KIND.APPOINTMENT });

    const result = await createCaller(actorId, "role-closer", ["alerts:read"]).alerts.listNextBestActions({ mode: "closer" });
    expect(result.map(({ lead }) => lead.id)).toEqual([ownLeadId]);
  });

  it("counts unresolved alerts for all users", async () => {
    const closerId = crypto.randomUUID();
    const otherCloserId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: closerId, name: "Closer A", email: "closer-a@test.com", roleId: "role-closer" });
    await insertUser({ id: otherCloserId, name: "Closer B", email: "closer-b@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId });

    const caller = createCaller(closerId, "role-closer", ["leads:*", "alerts:read"]);
    const countBeforeInsertion = await caller.alerts.countAlerts();

    await insertAlert({ leadId, targetUserId: closerId });
    await insertAlert({ leadId, targetUserId: otherCloserId });

    await expect(caller.alerts.countAlerts()).resolves.toBe(countBeforeInsertion + 2);
  });

  it("narrows global pending alerts with an explicit targetUserId filter", async () => {
    const closerId = crypto.randomUUID();
    const otherCloserId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: closerId, name: "Closer A", email: "closer-a@test.com", roleId: "role-closer" });
    await insertUser({ id: otherCloserId, name: "Closer B", email: "closer-b@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId });

    const ownAlertId = await insertAlert({ leadId, targetUserId: closerId });
    const otherAlertId = await insertAlert({ leadId, targetUserId: otherCloserId });

    const caller = createCaller(closerId, "role-closer", ["leads:*", "alerts:read"]);
    const result = await caller.alerts.listAlerts({ targetUserId: otherCloserId });
    const resultIds = result.map((alert) => alert.id);

    expect(resultIds).toContain(otherAlertId);
    expect(resultIds).not.toContain(ownAlertId);
  });

  it("returns all unresolved alerts for admin users", async () => {
    const adminId = crypto.randomUUID();
    const closerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: adminId, name: "Admin", email: "admin@test.com", roleId: "role-admin" });
    await insertUser({ id: closerId, name: "Closer", email: "closer@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId });

    const ownAlertId = await insertAlert({ leadId, targetUserId: adminId });
    const otherAlertId = await insertAlert({ leadId, targetUserId: closerId });

    const caller = createCaller(adminId, "role-admin", ["*"]);
    const result = await caller.alerts.listAlerts();

    expect(result.map((a) => a.id)).toContain(ownAlertId);
    expect(result.map((a) => a.id)).toContain(otherAlertId);
  });

  it("dismisses an alert and sets dismissedBy", async () => {
    const closerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: closerId, name: "Closer", email: "closer@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId });
    const alertId = await insertAlert({ leadId, targetUserId: closerId });

    const caller = createCaller(closerId, "role-closer", ["leads:*", "alerts:write"]);
    const result = await caller.alerts.dismissAlert({ id: alertId });

    expect(result.id).toBe(alertId);
    expect(result.dismissedAt).toBeInstanceOf(Date);
    expect(result.dismissedBy).toBe(closerId);
  });

  it("resolves an alert and stops recurrence", async () => {
    const closerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: closerId, name: "Closer", email: "closer@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId });
    const alertId = await insertAlert({ leadId, targetUserId: closerId });

    const caller = createCaller(closerId, "role-closer", ["leads:*", "alerts:write"]);
    const result = await caller.alerts.resolveAlert({ id: alertId });

    expect(result.id).toBe(alertId);
    expect(result.resolvedAt).toBeInstanceOf(Date);
  });

  it("throws FORBIDDEN when dismissing an alert owned by another user", async () => {
    const closerId = crypto.randomUUID();
    const otherCloserId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: closerId, name: "Closer A", email: "closer-a@test.com", roleId: "role-closer" });
    await insertUser({ id: otherCloserId, name: "Closer B", email: "closer-b@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId });
    const alertId = await insertAlert({ leadId, targetUserId: otherCloserId });

    const caller = createCaller(closerId, "role-closer", ["leads:*", "alerts:write"]);

    await expect(caller.alerts.dismissAlert({ id: alertId })).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.alerts.dismissAlert({ id: alertId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when resolving an alert owned by another user", async () => {
    const closerId = crypto.randomUUID();
    const otherCloserId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: closerId, name: "Closer A", email: "closer-a@test.com", roleId: "role-closer" });
    await insertUser({ id: otherCloserId, name: "Closer B", email: "closer-b@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId });
    const alertId = await insertAlert({ leadId, targetUserId: otherCloserId });

    const caller = createCaller(closerId, "role-closer", ["leads:*", "alerts:write"]);

    await expect(caller.alerts.resolveAlert({ id: alertId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND when resolving a non-existent alert", async () => {
    const closerId = crypto.randomUUID();
    await insertUser({ id: closerId, name: "Closer", email: "closer@test.com", roleId: "role-closer" });

    const caller = createCaller(closerId, "role-closer", ["leads:*", "alerts:write"]);

    await expect(caller.alerts.resolveAlert({ id: crypto.randomUUID() })).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.alerts.resolveAlert({ id: crypto.randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST when resolving an already resolved alert", async () => {
    const closerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: closerId, name: "Closer", email: "closer@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId });
    const alertId = await insertAlert({ leadId, targetUserId: closerId, resolvedAt: new Date() });

    const caller = createCaller(closerId, "role-closer", ["leads:*", "alerts:write"]);

    await expect(caller.alerts.resolveAlert({ id: alertId })).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.alerts.resolveAlert({ id: alertId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("advanceRecurringAlerts processes only the caller's due alerts", async () => {
    const closerId = crypto.randomUUID();
    const otherCloserId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: closerId, name: "Closer", email: "closer@test.com", roleId: "role-closer" });
    await insertUser({ id: otherCloserId, name: "Other", email: "other@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId });

    const now = new Date();
    const ownAlertId = await insertAlert({
      leadId,
      targetUserId: closerId,
      nextShowAt: new Date(now.getTime() - 1_000),
      occurrences: 0,
    });
    const otherAlertId = await insertAlert({
      leadId,
      targetUserId: otherCloserId,
      nextShowAt: new Date(now.getTime() - 1_000),
      occurrences: 0,
    });

    const caller = createCaller(closerId, "role-closer", ["leads:*", "alerts:read"]);
    const result = await caller.alerts.advanceRecurringAlerts();

    expect(result).toBeGreaterThanOrEqual(1);

    const updatedOwn = await db.query.alerts.findFirst({ where: (table, { eq }) => eq(table.id, ownAlertId) });
    const unchangedOther = await db.query.alerts.findFirst({ where: (table, { eq }) => eq(table.id, otherAlertId) });
    expect(updatedOwn?.occurrences).toBe(1);
    expect(unchangedOther?.occurrences).toBe(0);
  });

  it("recovers a lead on each expired no-contact alert and discards it after the third impact", async () => {
    const callerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();
    await insertUser({
      id: callerId,
      name: "Caller",
      email: `caller-${callerId}@test.com`,
      roleId: "role-caller",
    });
    await insertLead({ id: leadId, callerId });

    const caller = createCaller(callerId, "role-caller", ["leads:*", "alerts:read"]);

    for (const expectedImpact of [1, 2, 3]) {
      if (expectedImpact > 1) {
        await db
          .update(leads)
          .set({ callerId })
          .where(eq(leads.id, leadId));
      }

      const alertId = await insertAlert({
        leadId,
        targetUserId: callerId,
        kind: ALERT_KIND.NO_CONTACT,
        nextShowAt: new Date(Date.now() - 1_000),
      });

      await caller.alerts.countAlerts();

      const recoveredLead = await db.query.leads.findFirst({
        where: (table, operators) => operators.eq(table.id, leadId),
      });
      const expiredAlert = await db.query.alerts.findFirst({
        where: (table, operators) => operators.eq(table.id, alertId),
      });

      expect(recoveredLead?.callerId).toBeNull();
      expect(recoveredLead?.noContactImpactCount).toBe(expectedImpact);
      expect(recoveredLead?.poolStatus).toBe(
        expectedImpact === 3
          ? LEAD_POOL_STATUS.DISCARDED
          : LEAD_POOL_STATUS.RECOVERED,
      );
      expect(expiredAlert?.expiredAt).toBeInstanceOf(Date);
    }
  }, 15_000);

  it("advanceRecurringAlerts throws UNAUTHORIZED when not authenticated", async () => {
    const unauthCtx = {
      session: null,
      role: null,
      permissions: null,
    } as unknown as Context;

    const caller = appRouter.createCaller(unauthCtx);

    await expect(caller.alerts.advanceRecurringAlerts()).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.alerts.advanceRecurringAlerts()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
