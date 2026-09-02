import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { db, eq, inArray } from "@crm-fran/db";
import {
  alerts,
  leads,
  roles,
  user,
  ALERT_KIND,
  ALERT_SEVERITY,
  LEAD_POOL_STATUS,
} from "@crm-fran/db/schema/index";
import { LEAD_STATE } from "@crm-fran/db/schema/state";
import { LEAD_QA_ROLE, type LeadQASessionItem } from "@crm-fran/db/schema/index";
import { assignLead } from "../leads/services/assign-lead";
import { assignLeadInput } from "./leads";

describe("assignLead service", () => {
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

  async function insertLead(input: { id: string; state?: string }) {
    created.leadIds.push(input.id);
    await db.insert(leads).values({
      id: input.id,
      name: "Test Lead",
      email: `lead-${input.id}@test.com`,
      phone: "123456789",
      state: (input.state ?? LEAD_STATE.SIN_ASIGNAR) as never,
    });
    return input;
  }

  it("assigns a lead and persists Q&A when isContacted is Si", async () => {
    const callerId = crypto.randomUUID();
    const closerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: callerId, name: "Caller", email: "caller@test.com", roleId: "role-caller" });
    await insertUser({ id: closerId, name: "Closer", email: "closer@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId });

    const questions = [
      { questionKey: "isDecisionMaker", question: "Is decision maker?", answer: "yes" },
      { questionKey: "decisionMakerName", question: "Decision maker name", answer: "John Doe" },
    ];

    const expectedQuestions: LeadQASessionItem[] = questions.map((q) => ({
      ...q,
      authorRole: LEAD_QA_ROLE.CALLER,
      authorId: callerId,
    }));

    const result = await assignLead({
      callerId,
      input: {
        leadId,
        isContacted: "Si",
        closerId,
        scheduledDate: "2026-07-26",
        scheduledTime: "10:00",
        questions,
        extraNotes: "Notes",
      },
    });

    expect(result.leadId).toBe(leadId);

    const updated = await db.query.leads.findFirst({ where: (table, { eq }) => eq(table.id, leadId) });
    expect(updated?.state).toBe(LEAD_STATE.ASIGNADO);
    expect(updated?.callerId).toBe(callerId);
    expect(updated?.closerId).toBe(closerId);
    expect(updated?.questions).toEqual(expectedQuestions);

    const alertRows = await db.select().from(alerts).where(eq(alerts.leadId, leadId));
    expect(alertRows).toHaveLength(1);

    const followUpAlert = alertRows[0];
    created.alertIds.push(followUpAlert?.id ?? "");
    expect(followUpAlert?.kind).toBe("follow_up");
    expect(followUpAlert?.targetUserId).toBe(closerId);
    expect(followUpAlert?.nextShowAt).toBeInstanceOf(Date);
  });

  it("creates a no_contact alert when isContacted is No", async () => {
    const callerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: callerId, name: "Caller", email: "caller2@test.com", roleId: "role-caller" });
    await insertLead({ id: leadId });

    const result = await assignLead({
      callerId,
      input: { leadId, isContacted: "No" },
    });

    expect(result.leadId).toBe(leadId);

    const updated = await db.query.leads.findFirst({ where: (table, { eq }) => eq(table.id, leadId) });
    expect(updated?.state).toBe(LEAD_STATE.ASIGNADO);
    expect(updated?.callerId).toBe(callerId);
    expect(updated?.questions).toEqual([
      {
        questionKey: "isContacted",
        question: "¿Fué contactado?",
        answer: "No",
        authorRole: LEAD_QA_ROLE.CALLER,
        authorId: callerId,
      },
    ]);

    const alertRows = await db.select().from(alerts).where(eq(alerts.leadId, leadId));
    expect(alertRows).toHaveLength(1);

    const alert = alertRows[0];
    created.alertIds.push(alert?.id ?? "");
    expect(alert?.kind).toBe("no_contact");
    expect(alert?.severity).toBe("urgent");
    expect(alert?.intervalMinutes).toBe(1440);
    expect(alert?.targetUserId).toBe(callerId);
    expect(alert?.nextShowAt).toBeInstanceOf(Date);
  });

  it("replaces the caller's isContacted answer with No while preserving other questions", async () => {
    const callerId = crypto.randomUUID();
    const otherCallerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: callerId, name: "Caller", email: "caller5@test.com", roleId: "role-caller" });
    await insertUser({ id: otherCallerId, name: "Other Caller", email: "caller6@test.com", roleId: "role-caller" });

    const existingQuestions: LeadQASessionItem[] = [
      { questionKey: "isContacted", question: "Q1", answer: "A1", authorRole: LEAD_QA_ROLE.CALLER, authorId: callerId },
      { questionKey: "budget", question: "Budget?", answer: "500", authorRole: LEAD_QA_ROLE.CALLER, authorId: callerId },
      { questionKey: "isContacted", question: "Contacted?", answer: "Si", authorRole: LEAD_QA_ROLE.CALLER, authorId: otherCallerId },
      { questionKey: "budget", question: "Budget?", answer: "1000", authorRole: LEAD_QA_ROLE.CLOSER, authorId: "closer-1" },
    ];

    await insertLead({ id: leadId });
    await db
      .update(leads)
      .set({ questions: existingQuestions })
      .where(eq(leads.id, leadId));

    const result = await assignLead({
      callerId,
      input: { leadId, isContacted: "No" },
    });

    expect(result.leadId).toBe(leadId);

    const updated = await db.query.leads.findFirst({ where: (table, { eq }) => eq(table.id, leadId) });
    expect(updated?.questions).toEqual([
      existingQuestions[1],
      existingQuestions[2],
      existingQuestions[3],
      {
        questionKey: "isContacted",
        question: "Q1",
        answer: "No",
        authorRole: LEAD_QA_ROLE.CALLER,
        authorId: callerId,
      },
    ]);

    const callerContactedItems = (updated?.questions as LeadQASessionItem[]).filter(
      (item) =>
        item.questionKey === "isContacted" &&
        item.authorRole === LEAD_QA_ROLE.CALLER &&
        item.authorId === callerId,
    );
    expect(callerContactedItems).toHaveLength(1);
    expect(callerContactedItems[0]?.answer).toBe("No");
  });

  it("discards and unassigns a lead when its phone number does not exist", async () => {
    const callerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: callerId, name: "Caller", email: "wrong-number@test.com", roleId: "role-caller" });
    await insertLead({ id: leadId });

    const result = await assignLead({
      callerId,
      input: { leadId, isContacted: "No", phoneStatus: "invalid" },
    });

    expect(result.leadId).toBe(leadId);

    const updated = await db.query.leads.findFirst({ where: (table, { eq }) => eq(table.id, leadId) });
    expect(updated?.state).toBe(LEAD_STATE.NUMERO_ERRONEO);
    expect(updated?.poolStatus).toBe(LEAD_POOL_STATUS.DISCARDED);
    expect(updated?.callerId).toBeNull();
    expect(updated?.closerId).toBeNull();
    expect(updated?.questions).toEqual([
      {
        questionKey: "isContacted",
        question: "¿Fué contactado?",
        answer: "No",
        authorRole: LEAD_QA_ROLE.CALLER,
        authorId: callerId,
      },
      {
        questionKey: "phoneStatus",
        question: "Estado del número",
        answer: "Número no existe",
        authorRole: LEAD_QA_ROLE.CALLER,
        authorId: callerId,
      },
    ]);

    const alertRows = await db.select().from(alerts).where(eq(alerts.leadId, leadId));
    expect(alertRows).toHaveLength(0);
  });

  it("preserves closer items when caller resubmits with Si", async () => {
    const callerId = crypto.randomUUID();
    const closerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: callerId, name: "Caller", email: "caller-partition@test.com", roleId: "role-caller" });
    await insertUser({ id: closerId, name: "Closer", email: "closer-partition@test.com", roleId: "role-closer" });

    const existingQuestions: LeadQASessionItem[] = [
      { questionKey: "isContacted", question: "Contacted?", answer: "Si", authorRole: LEAD_QA_ROLE.CALLER, authorId: callerId },
      { questionKey: "budget", question: "Budget?", answer: "1000", authorRole: LEAD_QA_ROLE.CLOSER, authorId: closerId },
    ];

    await insertLead({ id: leadId });
    await db.update(leads).set({ questions: existingQuestions, closerId }).where(eq(leads.id, leadId));

    await assignLead({
      callerId,
      input: {
        leadId,
        isContacted: "Si",
        closerId,
        questions: [
          { questionKey: "isContacted", question: "Contacted?", answer: "Si" },
          { questionKey: "budget", question: "Budget?", answer: "2000" },
        ],
      },
    });

    const updated = await db.query.leads.findFirst({ where: (table, { eq }) => eq(table.id, leadId) });
    const updatedQuestions = updated?.questions as LeadQASessionItem[];

    // Closer items preserved
    const closerItems = updatedQuestions.filter((q) => q.authorRole === LEAD_QA_ROLE.CLOSER);
    expect(closerItems).toHaveLength(1);
    expect(closerItems[0]?.authorId).toBe(closerId);
    expect(closerItems[0]?.answer).toBe("1000");

    // Caller items replaced with new ones
    const callerItems = updatedQuestions.filter((q) => q.authorRole === LEAD_QA_ROLE.CALLER);
    expect(callerItems).toHaveLength(2);
    expect(callerItems[0]?.answer).toBe("Si");
    expect(callerItems[1]?.answer).toBe("2000");
    expect(callerItems[0]?.authorId).toBe(callerId);
  });

  it("preserves other-caller items when one caller resubmits with Si", async () => {
    const callerA = crypto.randomUUID();
    const callerB = crypto.randomUUID();
    const closerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: callerA, name: "Caller A", email: "callerA@test.com", roleId: "role-caller" });
    await insertUser({ id: callerB, name: "Caller B", email: "callerB@test.com", roleId: "role-caller" });
    await insertUser({ id: closerId, name: "Closer", email: "closer-other@test.com", roleId: "role-closer" });

    const existingQuestions: LeadQASessionItem[] = [
      { questionKey: "isContacted", question: "Contacted?", answer: "Si", authorRole: LEAD_QA_ROLE.CALLER, authorId: callerA },
      { questionKey: "isContacted", question: "Contacted?", answer: "No", authorRole: LEAD_QA_ROLE.CALLER, authorId: callerB },
      { questionKey: "budget", question: "Budget?", answer: "500", authorRole: LEAD_QA_ROLE.CLOSER, authorId: closerId },
    ];

    await insertLead({ id: leadId });
    await db.update(leads).set({ questions: existingQuestions, closerId }).where(eq(leads.id, leadId));

    // Caller A resubmits
    await assignLead({
      callerId: callerA,
      input: {
        leadId,
        isContacted: "Si",
        closerId,
        questions: [{ questionKey: "isContacted", question: "Contacted?", answer: "Si" }],
      },
    });

    const updated = await db.query.leads.findFirst({ where: (table, { eq }) => eq(table.id, leadId) });
    const updatedQuestions = updated?.questions as LeadQASessionItem[];

    // Caller B items preserved
    const callerBItems = updatedQuestions.filter(
      (q) => q.authorRole === LEAD_QA_ROLE.CALLER && q.authorId === callerB,
    );
    expect(callerBItems).toHaveLength(1);
    expect(callerBItems[0]?.answer).toBe("No");

    // Closer items preserved
    const closerItems = updatedQuestions.filter((q) => q.authorRole === LEAD_QA_ROLE.CLOSER);
    expect(closerItems).toHaveLength(1);
    expect(closerItems[0]?.answer).toBe("500");

    // Caller A items replaced
    const callerAItems = updatedQuestions.filter(
      (q) => q.authorRole === LEAD_QA_ROLE.CALLER && q.authorId === callerA,
    );
    expect(callerAItems).toHaveLength(1);
    expect(callerAItems[0]?.answer).toBe("Si");
  });

  it("creates one scheduled alert for a future call with selected severity", async () => {
    const callerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: callerId, name: "Caller", email: "future-call@test.com", roleId: "role-caller" });
    await insertLead({ id: leadId });

    await assignLead({
      callerId,
      input: {
        leadId,
        isContacted: "Si",
        outcome: "future_call",
        scheduledDate: "2099-01-01",
        scheduledTime: "10:00",
        alertSeverity: "warning",
      },
    });

    const alertRows = await db.select().from(alerts).where(eq(alerts.leadId, leadId));
    expect(alertRows).toHaveLength(1);
    expect(alertRows[0]?.kind).toBe(ALERT_KIND.FUTURE_CALL);
    expect(alertRows[0]?.severity).toBe(ALERT_SEVERITY.WARNING);
    expect(alertRows[0]?.maxOccurrences).toBe(1);
    expect(alertRows[0]?.nextShowAt).toEqual(new Date("2099-01-01T10:00"));

    const lead = await db.query.leads.findFirst({ where: (table, { eq }) => eq(table.id, leadId) });
    expect(lead?.questions).toEqual([
      expect.objectContaining({
        questionKey: "callerOutcome",
        answer: "Llamar a futuro",
        authorId: callerId,
      }),
      expect.objectContaining({
        questionKey: "scheduledDate",
        answer: "2099-01-01",
        authorId: callerId,
      }),
      expect.objectContaining({
        questionKey: "scheduledTime",
        answer: "10:00",
        authorId: callerId,
      }),
      expect.objectContaining({
        questionKey: "alertSeverity",
        answer: "warning",
        authorId: callerId,
      }),
    ]);
  });

  it("saves an appointment with its first schedule and a closer alert", async () => {
    const callerId = crypto.randomUUID();
    const closerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: callerId, name: "Caller", email: "appointment-caller@test.com", roleId: "role-caller" });
    await insertUser({ id: closerId, name: "Closer", email: "appointment-closer@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId });

    await assignLead({
      callerId,
      input: {
        leadId,
        isContacted: "Si",
        outcome: "appointment",
        closerId,
        scheduledDate: "2099-01-01",
        scheduledTime: "10:00",
      },
    });

    const alertRows = await db.select().from(alerts).where(eq(alerts.leadId, leadId));
    expect(alertRows).toHaveLength(1);
    expect(alertRows[0]?.kind).toBe(ALERT_KIND.APPOINTMENT);
    expect(alertRows[0]?.targetUserId).toBe(closerId);
    expect(alertRows[0]?.nextShowAt).toEqual(new Date("2099-01-01T10:00"));

    const lead = await db.query.leads.findFirst({ where: (table, { eq }) => eq(table.id, leadId) });
    expect(lead?.closerId).toBe(closerId);
    expect(lead?.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ questionKey: "callerOutcome", answer: "Agenda" }),
        expect.objectContaining({ questionKey: "closerId", answer: closerId }),
        expect.objectContaining({ questionKey: "scheduledDate", answer: "2099-01-01" }),
        expect.objectContaining({ questionKey: "scheduledTime", answer: "10:00" }),
        expect.objectContaining({ questionKey: "firstAppointmentDate", answer: "2099-01-01" }),
        expect.objectContaining({ questionKey: "firstAppointmentTime", answer: "10:00" }),
        expect.objectContaining({ questionKey: "appointmentRescheduled", answer: "No" }),
      ]),
    );
  });

  it("turns an appointment alert into a reschedule while preserving the first schedule", async () => {
    const callerId = crypto.randomUUID();
    const closerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: callerId, name: "Caller", email: "reschedule-caller@test.com", roleId: "role-caller" });
    await insertUser({ id: closerId, name: "Closer", email: "reschedule-closer@test.com", roleId: "role-closer" });
    await insertLead({ id: leadId });

    await assignLead({
      callerId,
      input: {
        leadId,
        isContacted: "Si",
        outcome: "appointment",
        closerId,
        scheduledDate: "2099-01-01",
        scheduledTime: "10:00",
      },
    });

    const [firstAlert] = await db.select().from(alerts).where(eq(alerts.leadId, leadId));

    await assignLead({
      callerId,
      input: {
        leadId,
        isContacted: "Si",
        outcome: "appointment",
        closerId,
        scheduledDate: "2099-01-02",
        scheduledTime: "11:00",
      },
    });

    const alertRows = await db.select().from(alerts).where(eq(alerts.leadId, leadId));
    expect(alertRows).toHaveLength(1);
    expect(alertRows[0]?.id).toBe(firstAlert?.id);
    expect(alertRows[0]?.kind).toBe(ALERT_KIND.RESCHEDULED);
    expect(alertRows[0]?.nextShowAt).toEqual(new Date("2099-01-02T11:00"));

    const lead = await db.query.leads.findFirst({ where: (table, { eq }) => eq(table.id, leadId) });
    expect(lead?.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ questionKey: "firstAppointmentDate", answer: "2099-01-01" }),
        expect.objectContaining({ questionKey: "firstAppointmentTime", answer: "10:00" }),
        expect.objectContaining({ questionKey: "appointmentRescheduled", answer: "Si" }),
        expect.objectContaining({ questionKey: "appointmentRescheduledAt" }),
        expect.objectContaining({
          questionKey: "appointmentHistory",
          answer: JSON.stringify([
            { date: "2099-01-01", time: "10:00" },
            { date: "2099-01-02", time: "11:00" },
          ]),
        }),
      ]),
    );
  });

  it("allows a closer to reschedule without replacing the original caller", async () => {
    const callerId = crypto.randomUUID();
    const closerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({
      id: callerId,
      name: "Caller",
      email: `caller-${callerId}@test.com`,
      roleId: "role-caller",
    });
    await insertUser({
      id: closerId,
      name: "Closer",
      email: `closer-${closerId}@test.com`,
      roleId: "role-closer",
    });
    await insertLead({ id: leadId });

    await assignLead({
      callerId,
      input: {
        leadId,
        isContacted: "Si",
        outcome: "appointment",
        closerId,
        scheduledDate: "2099-01-01",
        scheduledTime: "10:00",
      },
    });

    const [firstAlert] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.leadId, leadId));
    if (!firstAlert) throw new Error("Expected appointment alert");

    await assignLead({
      callerId: closerId,
      authorRole: LEAD_QA_ROLE.CLOSER,
      permissions: ["alerts:*", "leads:*"],
      input: {
        leadId,
        sourceAlertId: firstAlert.id,
        isContacted: "Si",
        outcome: "appointment",
        closerId,
        scheduledDate: "2099-01-02",
        scheduledTime: "11:00",
      },
    });

    const lead = await db.query.leads.findFirst({
      where: (table, { eq }) => eq(table.id, leadId),
    });
    const [updatedAlert] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.leadId, leadId));

    expect(lead?.callerId).toBe(callerId);
    expect(updatedAlert?.id).toBe(firstAlert?.id);
    expect(updatedAlert?.kind).toBe(ALERT_KIND.RESCHEDULED);
    expect(updatedAlert?.resolvedAt).toBeNull();
    expect(lead?.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          questionKey: "scheduledDate",
          answer: "2099-01-02",
          authorRole: LEAD_QA_ROLE.CLOSER,
          authorId: closerId,
        }),
        expect.objectContaining({
          questionKey: "appointmentHistory",
          answer: JSON.stringify([
            { date: "2099-01-01", time: "10:00" },
            { date: "2099-01-02", time: "11:00" },
          ]),
        }),
      ]),
    );
  });

  it("resolves the source alert when the recorded outcome is terminal", async () => {
    const callerId = crypto.randomUUID();
    const closerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({
      id: callerId,
      name: "Caller",
      email: `terminal-caller-${callerId}@test.com`,
      roleId: "role-caller",
    });
    await insertUser({
      id: closerId,
      name: "Closer",
      email: `terminal-closer-${closerId}@test.com`,
      roleId: "role-closer",
    });
    await insertLead({ id: leadId });

    await assignLead({
      callerId,
      input: {
        leadId,
        isContacted: "Si",
        outcome: "appointment",
        closerId,
        scheduledDate: "2099-01-01",
        scheduledTime: "10:00",
      },
    });

    const [sourceAlert] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.leadId, leadId));
    if (!sourceAlert) throw new Error("Expected appointment alert");

    await assignLead({
      callerId,
      authorRole: LEAD_QA_ROLE.CALLER,
      permissions: ["alerts:*", "leads:*"],
      input: {
        leadId,
        sourceAlertId: sourceAlert.id,
        isContacted: "Si",
        outcome: "not_fit",
      },
    });

    const resolved = await db.query.alerts.findFirst({
      where: (table, { eq }) => eq(table.id, sourceAlert.id),
    });
    const lead = await db.query.leads.findFirst({
      where: (table, { eq }) => eq(table.id, leadId),
    });

    expect(resolved?.resolvedAt).toBeInstanceOf(Date);
    expect(lead?.callerId).toBe(callerId);
  });

  it.each([
    ["not_fit", "No encaja"],
    ["not_interested", "No interesado"],
  ] as const)("saves %s without extra answers or alerts", async (outcome, label) => {
    const callerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: callerId, name: "Caller", email: `${outcome}@test.com`, roleId: "role-caller" });
    await insertLead({ id: leadId });

    await assignLead({ callerId, input: { leadId, isContacted: "Si", outcome } });

    const alertRows = await db.select().from(alerts).where(eq(alerts.leadId, leadId));
    expect(alertRows).toHaveLength(0);
    const lead = await db.query.leads.findFirst({ where: (table, { eq }) => eq(table.id, leadId) });
    expect(lead?.questions).toEqual([
      expect.objectContaining({ questionKey: "callerOutcome", answer: label }),
    ]);
  });

  it("rejects old yes/no encoding via Zod schema", () => {
    const resultSi = assignLeadInput.safeParse({
      leadId: "test",
      isContacted: "Si",
      closerId: "closer",
      questions: [{ questionKey: "q1", question: "Q?", answer: "A" }],
    });
    expect(resultSi.success).toBe(true);

    const resultNo = assignLeadInput.safeParse({
      leadId: "test",
      isContacted: "No",
    });
    expect(resultNo.success).toBe(true);

    const resultWrongNumber = assignLeadInput.safeParse({
      leadId: "test",
      isContacted: "No",
      phoneStatus: "invalid",
    });
    expect(resultWrongNumber.success).toBe(true);

    const resultOldYes = assignLeadInput.safeParse({
      leadId: "test",
      isContacted: "yes",
      closerId: "closer",
      questions: [{ questionKey: "q1", question: "Q?", answer: "A" }],
    });
    expect(resultOldYes.success).toBe(false);

    const resultOldNo = assignLeadInput.safeParse({
      leadId: "test",
      isContacted: "no",
    });
    expect(resultOldNo.success).toBe(false);
  });

  it("throws NOT_FOUND when the lead does not exist", async () => {
    const callerId = crypto.randomUUID();
    await insertUser({ id: callerId, name: "Caller", email: "caller3@test.com", roleId: "role-caller" });

    await expect(
      assignLead({
        callerId,
        input: { leadId: crypto.randomUUID(), isContacted: "No" },
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    await expect(
      assignLead({
        callerId,
        input: { leadId: crypto.randomUUID(), isContacted: "No" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rolls back the transaction when closerId does not exist", async () => {
    const callerId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    await insertUser({ id: callerId, name: "Caller", email: "caller4@test.com", roleId: "role-caller" });
    await insertLead({ id: leadId });

    await expect(
      assignLead({
        callerId,
        input: {
          leadId,
          isContacted: "Si",
          closerId: crypto.randomUUID(),
          scheduledDate: "2026-07-26",
          scheduledTime: "10:00",
          questions: [{ questionKey: "q1", question: "Q", answer: "A" }],
        },
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    await expect(
      assignLead({
        callerId,
        input: {
          leadId,
          isContacted: "Si",
          closerId: crypto.randomUUID(),
          scheduledDate: "2026-07-26",
          scheduledTime: "10:00",
          questions: [{ questionKey: "q1", question: "Q", answer: "A" }],
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const unchanged = await db.query.leads.findFirst({ where: (table, { eq }) => eq(table.id, leadId) });
    expect(unchanged?.state).toBe(LEAD_STATE.SIN_ASIGNAR);
    expect(unchanged?.callerId).toBeNull();
  });
});
