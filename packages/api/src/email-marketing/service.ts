import { and, db, desc, eq, inArray, isNull, lt } from "@crm-fran/db";
import { normalizeLeadEmail } from "@crm-fran/db/lead-identity";
import {
  EMAIL_MARKETING_CAMPAIGN_STATUS,
  EMAIL_MARKETING_COPY_STATUS,
  EMAIL_MARKETING_PERMISSION_STATUS,
  emailMarketingAudienceMembers,
  emailMarketingAudienceSnapshots,
  emailMarketingCampaigns,
  emailMarketingContentVersions,
  emailMarketingExportAudits,
  emailMarketingPermissionEvents,
  emailMarketingPermissions,
  emailMarketingSuppressionEvents,
  emailMarketingSuppressions,
  leads,
  type EmailMarketingEvidence,
  type EmailMarketingSegmentCriteria,
  type LeadQASession,
} from "@crm-fran/db/schema/index";

import { parseConfirmedFacts } from "../commercial-evidence/facts";
import { assertAuthorityChangeOrder, buildEmailAudienceSnapshot } from "./domain";
import { buildCsv, canApprovePreparedCopy, matchesSegmentCriteria, revalidateFrozenAudience } from "./preparation";

export class EmailMarketingNotFoundError extends Error {}
export class EmailMarketingConflictError extends Error {}

export type EmailMarketingAuditInput = {
  email: string;
  leadId?: string;
  source: string;
  evidence: string;
  reference?: string;
  occurredAt: Date;
  actorId: string;
};

function normalizedEmail(email: string) {
  const value = normalizeLeadEmail(email).normalized;
  if (!value) throw new EmailMarketingConflictError("A normalized email is required");
  return value;
}

function auditEvidence(input: { evidence: string; reference?: string }): EmailMarketingEvidence {
  return { note: input.evidence, ...(input.reference ? { reference: input.reference } : {}) };
}

function rejectStaleAuthorityChange(currentOccurredAt: Date, nextOccurredAt: Date) {
  try {
    assertAuthorityChangeOrder({ currentOccurredAt, nextOccurredAt });
  } catch (error) {
    throw new EmailMarketingConflictError(error instanceof Error ? error.message : "Stale authority evidence");
  }
}
async function recordPermission(input: EmailMarketingAuditInput, status: "granted" | "revoked") {
  return db.transaction(async (tx) => {
    const email = normalizedEmail(input.email);
    const [current] = await tx.select().from(emailMarketingPermissions).where(eq(emailMarketingPermissions.normalizedEmail, email)).for("update").limit(1);
    if (current) rejectStaleAuthorityChange(current.occurredAt, input.occurredAt);
    const id = current?.id ?? crypto.randomUUID();
    const version = (current?.version ?? 0) + 1;
    const values = {
      normalizedEmail: email,
      leadId: input.leadId ?? null,
      status,
      source: input.source,
      evidence: auditEvidence(input),
      occurredAt: input.occurredAt,
      recordedById: input.actorId,
      version,
      updatedAt: new Date(),
    };
    if (current) await tx.update(emailMarketingPermissions).set(values).where(eq(emailMarketingPermissions.id, id));
    else await tx.insert(emailMarketingPermissions).values({ id, ...values });
    await tx.insert(emailMarketingPermissionEvents).values({
      id: crypto.randomUUID(), permissionId: id, normalizedEmail: email, leadId: input.leadId ?? null,
      action: status, source: input.source, evidence: auditEvidence(input), occurredAt: input.occurredAt,
      actorId: input.actorId, permissionVersion: version,
    });
    return { id, normalizedEmail: email, status, version };
  });
}

async function recordSuppression(input: EmailMarketingAuditInput & { reason: string }) {
  return db.transaction(async (tx) => {
    const email = normalizedEmail(input.email);
    const [current] = await tx.select().from(emailMarketingSuppressions).where(eq(emailMarketingSuppressions.normalizedEmail, email)).for("update").limit(1);
    if (current) rejectStaleAuthorityChange(current.liftedAt ?? current.occurredAt, input.occurredAt);
    const id = current?.id ?? crypto.randomUUID();
    const version = (current?.version ?? 0) + 1;
    const values = {
      normalizedEmail: email, active: true, reason: input.reason, source: input.source, evidence: auditEvidence(input), occurredAt: input.occurredAt,
      suppressedById: input.actorId, liftedAt: null, liftedById: null, liftReason: null, version, updatedAt: new Date(),
    };
    if (current) await tx.update(emailMarketingSuppressions).set(values).where(eq(emailMarketingSuppressions.id, id));
    else await tx.insert(emailMarketingSuppressions).values({ id, ...values });
    await tx.insert(emailMarketingSuppressionEvents).values({
      id: crypto.randomUUID(), suppressionId: id, normalizedEmail: email, action: "suppressed", reason: input.reason,
      source: input.source, evidence: auditEvidence(input), occurredAt: input.occurredAt, actorId: input.actorId, suppressionVersion: version,
    });
    return { id, normalizedEmail: email, active: true, version };
  });
}

async function liftSuppression(input: EmailMarketingAuditInput & { reason: string }) {
  return db.transaction(async (tx) => {
    const email = normalizedEmail(input.email);
    const [current] = await tx.select().from(emailMarketingSuppressions).where(eq(emailMarketingSuppressions.normalizedEmail, email)).for("update").limit(1);
    if (!current?.active) throw new EmailMarketingNotFoundError("Active suppression not found");
    rejectStaleAuthorityChange(current.occurredAt, input.occurredAt);
    const version = current.version + 1;
    await tx.update(emailMarketingSuppressions).set({
      active: false, liftedAt: input.occurredAt, liftedById: input.actorId, liftReason: input.reason, version, updatedAt: new Date(),
    }).where(eq(emailMarketingSuppressions.id, current.id));
    await tx.insert(emailMarketingSuppressionEvents).values({
      id: crypto.randomUUID(), suppressionId: current.id, normalizedEmail: email, action: "lifted", reason: input.reason,
      source: input.source, evidence: auditEvidence(input), occurredAt: input.occurredAt, actorId: input.actorId, suppressionVersion: version,
    });
    return { id: current.id, normalizedEmail: email, active: false, version };
  });
}

async function createCampaign(input: { name: string; actorId: string }) {
  const [campaign] = await db.insert(emailMarketingCampaigns).values({
    id: crypto.randomUUID(), name: input.name.trim(), status: EMAIL_MARKETING_CAMPAIGN_STATUS.DRAFT, createdById: input.actorId,
  }).returning();
  if (!campaign) throw new EmailMarketingConflictError("Campaign could not be created");
  return campaign;
}

async function buildAudience(input: { campaignId: string; actorId: string; criteria?: EmailMarketingSegmentCriteria }) {
  return db.transaction(async (tx) => {
    const [campaign] = await tx.select().from(emailMarketingCampaigns).where(eq(emailMarketingCampaigns.id, input.campaignId)).limit(1);
    if (!campaign) throw new EmailMarketingNotFoundError("Campaign not found");
    const candidateRows = await tx.select({
      leadId: leads.id,
      leadName: leads.name,
      normalizedEmail: leads.normalizedEmail,
      source: leads.source,
      campaign: leads.campaign,
      utmContent: leads.utmContent,
      acquisitionAngle: leads.acquisitionAngle,
      questions: leads.questions,
    }).from(leads).where(isNull(leads.mergedIntoLeadId));
    const selectedRows = candidateRows.filter((lead) => matchesSegmentCriteria({
      source: lead.source,
      campaign: lead.campaign,
      utmContent: lead.utmContent,
      theme: lead.acquisitionAngle,
      confirmedFeedback: parseConfirmedFacts(lead.questions).motivations,
    }, input.criteria));
    const emails = [...new Set(selectedRows.flatMap((lead) => lead.normalizedEmail ? [lead.normalizedEmail] : []))];
    const permissionRows = emails.length === 0 ? [] : await tx.select().from(emailMarketingPermissions).where(inArray(emailMarketingPermissions.normalizedEmail, emails));
    const suppressionRows = emails.length === 0 ? [] : await tx.select().from(emailMarketingSuppressions).where(inArray(emailMarketingSuppressions.normalizedEmail, emails));
    const permissionByEmail = new Map(permissionRows.map((permission) => [permission.normalizedEmail, permission]));
    const suppressionByEmail = new Map(suppressionRows.map((suppression) => [suppression.normalizedEmail, suppression]));
    const snapshot = buildEmailAudienceSnapshot(selectedRows.map((lead) => ({
      ...lead,
      permission: lead.normalizedEmail ? permissionByEmail.get(lead.normalizedEmail) ?? null : null,
      suppression: lead.normalizedEmail ? suppressionByEmail.get(lead.normalizedEmail) ?? null : null,
    })));
    const [latest] = await tx.select({ version: emailMarketingAudienceSnapshots.version }).from(emailMarketingAudienceSnapshots)
      .where(eq(emailMarketingAudienceSnapshots.campaignId, input.campaignId)).orderBy(desc(emailMarketingAudienceSnapshots.version)).limit(1);
    const snapshotId = crypto.randomUUID();
    const version = (latest?.version ?? 0) + 1;
    await tx.insert(emailMarketingAudienceSnapshots).values({
      id: snapshotId,
      campaignId: input.campaignId,
      version,
      sourceKind: snapshot.sourceKind,
      policyVersion: snapshot.policyVersion,
      criteria: input.criteria ?? null,
      candidateCount: snapshot.candidateCount,
      includedCount: snapshot.includedCount,
      createdById: input.actorId,
    });
    if (snapshot.members.length > 0) {
      await tx.insert(emailMarketingAudienceMembers).values(snapshot.members.map((memberRow) => ({
        id: crypto.randomUUID(),
        snapshotId,
        leadId: memberRow.leadId,
        decision: memberRow.decision,
        reason: memberRow.reason,
        evidence: memberRow.evidence,
      })));
    }
    const [approved] = await tx.select({ id: emailMarketingContentVersions.id }).from(emailMarketingContentVersions).where(and(
      eq(emailMarketingContentVersions.campaignId, input.campaignId),
      eq(emailMarketingContentVersions.status, EMAIL_MARKETING_COPY_STATUS.APPROVED),
    )).limit(1);
    if (approved && snapshot.includedCount > 0) {
      await tx.update(emailMarketingCampaigns).set({ status: EMAIL_MARKETING_CAMPAIGN_STATUS.READY, updatedAt: new Date() }).where(eq(emailMarketingCampaigns.id, input.campaignId));
    }
    return { id: snapshotId, campaignId: input.campaignId, version, criteria: input.criteria ?? null, ...snapshot };
  }, { isolationLevel: "repeatable read" });
}
async function addCopyVersion(input: { campaignId: string; subject: string; previewText?: string; bodyText: string; actorId: string; origin?: "manual" | "ai"; contextHash?: string }) {
  return db.transaction(async (tx) => {
    const [campaign] = await tx.select({ id: emailMarketingCampaigns.id }).from(emailMarketingCampaigns).where(eq(emailMarketingCampaigns.id, input.campaignId)).limit(1);
    if (!campaign) throw new EmailMarketingNotFoundError("Campaign not found");
    const [latest] = await tx.select({ version: emailMarketingContentVersions.version }).from(emailMarketingContentVersions)
      .where(eq(emailMarketingContentVersions.campaignId, input.campaignId)).orderBy(desc(emailMarketingContentVersions.version)).limit(1);
    const [created] = await tx.insert(emailMarketingContentVersions).values({
      id: crypto.randomUUID(), campaignId: input.campaignId, version: (latest?.version ?? 0) + 1,
      subject: input.subject.trim(), previewText: input.previewText?.trim() || null, bodyText: input.bodyText.trim(),
      origin: input.origin ?? "manual", contextHash: input.contextHash ?? null,
      status: EMAIL_MARKETING_COPY_STATUS.DRAFT, createdById: input.actorId,
    }).returning();
    if (!created) throw new EmailMarketingConflictError("Content version could not be created");
    await tx.update(emailMarketingCampaigns).set({ status: EMAIL_MARKETING_CAMPAIGN_STATUS.DRAFT, updatedAt: new Date() }).where(eq(emailMarketingCampaigns.id, input.campaignId));
    return created;
  });
}

async function approveCopyVersion(input: { campaignId: string; contentVersionId: string; actorId: string }) {
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(emailMarketingContentVersions).where(and(
      eq(emailMarketingContentVersions.id, input.contentVersionId), eq(emailMarketingContentVersions.campaignId, input.campaignId),
    )).limit(1);
    if (!target) throw new EmailMarketingNotFoundError("Content version not found");
    if (target.status === EMAIL_MARKETING_COPY_STATUS.APPROVED) return target;
    if (target.status !== EMAIL_MARKETING_COPY_STATUS.DRAFT) throw new EmailMarketingConflictError("Only draft copy can be approved");
    if (!canApprovePreparedCopy({ origin: target.origin, creatorId: target.createdById, approverId: input.actorId })) {
      throw new EmailMarketingConflictError("AI-origin copy requires a different human approver");
    }
    await tx.update(emailMarketingContentVersions).set({ status: EMAIL_MARKETING_COPY_STATUS.RETIRED }).where(and(
      eq(emailMarketingContentVersions.campaignId, input.campaignId), eq(emailMarketingContentVersions.status, EMAIL_MARKETING_COPY_STATUS.APPROVED),
    ));
    const approvedAt = new Date();
    const [approved] = await tx.update(emailMarketingContentVersions).set({
      status: EMAIL_MARKETING_COPY_STATUS.APPROVED, approvedById: input.actorId, approvedAt,
    }).where(eq(emailMarketingContentVersions.id, input.contentVersionId)).returning();
    const [snapshot] = await tx.select({ includedCount: emailMarketingAudienceSnapshots.includedCount }).from(emailMarketingAudienceSnapshots)
      .where(eq(emailMarketingAudienceSnapshots.campaignId, input.campaignId)).orderBy(desc(emailMarketingAudienceSnapshots.version)).limit(1);
    await tx.update(emailMarketingCampaigns).set({
      status: snapshot && snapshot.includedCount > 0 ? EMAIL_MARKETING_CAMPAIGN_STATUS.READY : EMAIL_MARKETING_CAMPAIGN_STATUS.DRAFT,
      updatedAt: approvedAt,
    }).where(eq(emailMarketingCampaigns.id, input.campaignId));
    return approved;
  });
}

async function listCampaigns() {
  const campaigns = await db.select().from(emailMarketingCampaigns).orderBy(desc(emailMarketingCampaigns.updatedAt));
  const snapshots = await db.select().from(emailMarketingAudienceSnapshots).orderBy(desc(emailMarketingAudienceSnapshots.version));
  const contentVersions = await db.select().from(emailMarketingContentVersions).orderBy(desc(emailMarketingContentVersions.version));
  return campaigns.map((campaign) => ({
    ...campaign,
    latestAudience: snapshots.find((snapshot) => snapshot.campaignId === campaign.id) ?? null,
    contentVersions: contentVersions.filter((version) => version.campaignId === campaign.id),
  }));
}

async function permissionSummary() {
  const permissions = await db.select({ status: emailMarketingPermissions.status }).from(emailMarketingPermissions);
  const suppressions = await db.select({ active: emailMarketingSuppressions.active }).from(emailMarketingSuppressions);
  return {
    granted: permissions.filter((permission) => permission.status === EMAIL_MARKETING_PERMISSION_STATUS.GRANTED).length,
    revoked: permissions.filter((permission) => permission.status === EMAIL_MARKETING_PERMISSION_STATUS.REVOKED).length,
    suppressed: suppressions.filter((suppression) => suppression.active).length,
  };
}

async function explainContact(input: { campaignId: string; email: string }) {
  const email = normalizedEmail(input.email);
  const [snapshot] = await db.select().from(emailMarketingAudienceSnapshots).where(eq(emailMarketingAudienceSnapshots.campaignId, input.campaignId))
    .orderBy(desc(emailMarketingAudienceSnapshots.version)).limit(1);
  if (!snapshot) return { normalizedEmail: email, snapshot: null, members: [] };
  const members = await db.select({
    id: emailMarketingAudienceMembers.id,
    snapshotId: emailMarketingAudienceMembers.snapshotId,
    leadId: emailMarketingAudienceMembers.leadId,
    decision: emailMarketingAudienceMembers.decision,
    reason: emailMarketingAudienceMembers.reason,
    evidence: emailMarketingAudienceMembers.evidence,
    createdAt: emailMarketingAudienceMembers.createdAt,
  }).from(emailMarketingAudienceMembers)
    .innerJoin(leads, eq(emailMarketingAudienceMembers.leadId, leads.id))
    .where(and(
      eq(emailMarketingAudienceMembers.snapshotId, snapshot.id),
      eq(leads.normalizedEmail, email),
    ));
  return { normalizedEmail: email, snapshot, members };
}

async function listAudienceMembers(input: { snapshotId: string; cursor?: string; limit: number }) {
  return db.transaction(async (tx) => {
    const [snapshot] = await tx.select({ id: emailMarketingAudienceSnapshots.id })
      .from(emailMarketingAudienceSnapshots)
      .where(eq(emailMarketingAudienceSnapshots.id, input.snapshotId))
      .limit(1);
    if (!snapshot) throw new EmailMarketingNotFoundError("Audience snapshot not found");

    const rows = await tx.select({
      id: emailMarketingAudienceMembers.id,
      decision: emailMarketingAudienceMembers.decision,
      frozenReason: emailMarketingAudienceMembers.reason,
      leadId: emailMarketingAudienceMembers.leadId,
      name: leads.name,
      email: leads.normalizedEmail,
      phone: leads.phone,
      source: leads.source,
      campaign: leads.campaign,
      utmContent: leads.utmContent,
      theme: leads.acquisitionAngle,
      questions: leads.questions,
      permissionStatus: emailMarketingPermissions.status,
      suppressionActive: emailMarketingSuppressions.active,
    }).from(emailMarketingAudienceMembers)
      .leftJoin(leads, eq(emailMarketingAudienceMembers.leadId, leads.id))
      .leftJoin(emailMarketingPermissions, eq(leads.normalizedEmail, emailMarketingPermissions.normalizedEmail))
      .leftJoin(emailMarketingSuppressions, eq(leads.normalizedEmail, emailMarketingSuppressions.normalizedEmail))
      .where(and(
        eq(emailMarketingAudienceMembers.snapshotId, input.snapshotId),
        input.cursor ? lt(emailMarketingAudienceMembers.id, input.cursor) : undefined,
      ))
      .orderBy(desc(emailMarketingAudienceMembers.id))
      .limit(input.limit + 1);

    const pageRows = rows.slice(0, input.limit);
    return {
      items: pageRows.map((row) => {
        const isCurrentlyEligible = row.decision === "included"
          && Boolean(row.leadId && row.email)
          && row.permissionStatus === EMAIL_MARKETING_PERMISSION_STATUS.GRANTED
          && row.suppressionActive !== true;
        const currentReason = row.suppressionActive === true
          ? "suppressed"
          : row.permissionStatus === EMAIL_MARKETING_PERMISSION_STATUS.REVOKED
            ? "revoked"
            : !row.leadId || !row.email || row.permissionStatus === null
              ? "missing_current_authority"
              : row.frozenReason;
        return {
          id: row.id,
          decision: isCurrentlyEligible ? "included" as const : "excluded" as const,
          reason: isCurrentlyEligible ? "eligible" : currentReason,
          contact: row.leadId && row.name
            ? { name: row.name, email: row.email ?? "", phone: row.phone ?? "" }
            : null,
          detail: row.leadId
            ? {
                source: row.source,
                campaign: row.campaign,
                utmContent: row.utmContent,
                theme: row.theme,
                confirmedFeedback: parseConfirmedFacts(row.questions ?? []).motivations,
              }
            : null,
        };
      }),
      nextCursor: rows.length > input.limit ? pageRows.at(-1)?.id ?? null : null,
    };
  }, { isolationLevel: "repeatable read" });
}

function aggregateConfirmedMotivations(questionSets: readonly LeadQASession[]) {
  const counts = new Map<string, number>();
  for (const questions of questionSets) {
    for (const motivation of parseConfirmedFacts(questions).motivations) {
      counts.set(motivation, (counts.get(motivation) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([motivation, count]) => ({ motivation, count }));
}

async function generateCopyDraft(input: { campaignId: string; actorId: string }) {
  const aggregateContext = await db.transaction(async (tx) => {
    const [campaign] = await tx.select({ id: emailMarketingCampaigns.id, name: emailMarketingCampaigns.name })
      .from(emailMarketingCampaigns)
      .where(eq(emailMarketingCampaigns.id, input.campaignId))
      .limit(1);
    if (!campaign) throw new EmailMarketingNotFoundError("Campaign not found");
    const [snapshot] = await tx.select({ id: emailMarketingAudienceSnapshots.id })
      .from(emailMarketingAudienceSnapshots)
      .where(eq(emailMarketingAudienceSnapshots.campaignId, input.campaignId))
      .orderBy(desc(emailMarketingAudienceSnapshots.version))
      .limit(1);
    const memberRows = snapshot
      ? await tx.select({ leadId: emailMarketingAudienceMembers.leadId })
        .from(emailMarketingAudienceMembers)
        .where(and(
          eq(emailMarketingAudienceMembers.snapshotId, snapshot.id),
          eq(emailMarketingAudienceMembers.decision, "included"),
        ))
      : [];
    const leadIds = memberRows.flatMap((member) => member.leadId ? [member.leadId] : []);
    const questionRows = leadIds.length === 0
      ? []
      : await tx.select({ questions: leads.questions }).from(leads).where(inArray(leads.id, leadIds));
    return {
      campaignName: campaign.name,
      snapshotId: snapshot?.id ?? null,
      motivations: aggregateConfirmedMotivations(questionRows.map((row) => row.questions)),
    };
  }, { isolationLevel: "repeatable read" });

  const contextHash = await sha256(JSON.stringify(aggregateContext));
  const { generateEmailMarketingCopyDraft } = await import("./copy-runtime");
  const draft = await generateEmailMarketingCopyDraft({
    productContext: aggregateContext.campaignName,
    motivationSummary: JSON.stringify(aggregateContext.motivations),
  });
  return addCopyVersion({
    campaignId: input.campaignId,
    subject: draft.subject,
    previewText: draft.previewText ?? undefined,
    bodyText: draft.bodyText,
    actorId: input.actorId,
    origin: "ai",
    contextHash,
  });
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function exportAudience(input: {
  snapshotId: string;
  purpose: string;
  operationId: string;
  actorId: string;
}) {
  return db.transaction(async (tx) => {
    const [snapshot] = await tx.select().from(emailMarketingAudienceSnapshots)
      .where(eq(emailMarketingAudienceSnapshots.id, input.snapshotId))
      .for("update")
      .limit(1);
    if (!snapshot) throw new EmailMarketingNotFoundError("Audience snapshot not found");
    const members = await tx.select({ leadId: emailMarketingAudienceMembers.leadId })
      .from(emailMarketingAudienceMembers)
      .where(and(
        eq(emailMarketingAudienceMembers.snapshotId, input.snapshotId),
        eq(emailMarketingAudienceMembers.decision, "included"),
      ));
    const leadIds = members.flatMap((member) => member.leadId ? [member.leadId] : []);
    const contactRows = leadIds.length === 0 ? [] : await tx.select({
      leadId: leads.id,
      name: leads.name,
      email: leads.normalizedEmail,
      phone: leads.phone,
    }).from(leads).where(inArray(leads.id, leadIds));
    const emails = contactRows.flatMap((contact) => contact.email ? [contact.email] : []);
    const permissions = emails.length === 0 ? [] : await tx.select({
      email: emailMarketingPermissions.normalizedEmail,
      status: emailMarketingPermissions.status,
    }).from(emailMarketingPermissions).where(inArray(emailMarketingPermissions.normalizedEmail, emails));
    const suppressions = emails.length === 0 ? [] : await tx.select({
      email: emailMarketingSuppressions.normalizedEmail,
      active: emailMarketingSuppressions.active,
    }).from(emailMarketingSuppressions).where(inArray(emailMarketingSuppressions.normalizedEmail, emails));
    const permissionByEmail = new Map(permissions.map((permission) => [permission.email, permission.status]));
    const suppressionByEmail = new Map(suppressions.map((suppression) => [suppression.email, suppression.active]));
    const revalidated = revalidateFrozenAudience({
      members,
      contacts: contactRows.map((contact) => ({
        ...contact,
        permission: contact.email ? permissionByEmail.get(contact.email) ?? null : null,
        suppressed: contact.email ? suppressionByEmail.get(contact.email) === true : false,
      })),
    });
    const csv = buildCsv(revalidated.eligible);
    const contentHash = await sha256(csv);
    const purpose = input.purpose.trim();
    const [inserted] = await tx.insert(emailMarketingExportAudits).values({
      id: crypto.randomUUID(),
      snapshotId: input.snapshotId,
      actorId: input.actorId,
      purpose,
      contentHash,
      exportedCount: revalidated.eligible.length,
      exclusions: revalidated.exclusions,
      operationId: input.operationId,
    }).onConflictDoNothing({
      target: emailMarketingExportAudits.operationId,
    }).returning({ id: emailMarketingExportAudits.id });
    if (inserted) {
      return { csv, contentHash, exportedCount: revalidated.eligible.length, exclusions: revalidated.exclusions, idempotent: false as const };
    }

    const [existing] = await tx.select().from(emailMarketingExportAudits)
      .where(eq(emailMarketingExportAudits.operationId, input.operationId))
      .limit(1);
    if (!existing) throw new EmailMarketingConflictError("Existing export operation could not be resolved");
    if (
      existing.snapshotId !== input.snapshotId
      || existing.actorId !== input.actorId
      || existing.purpose !== purpose
      || existing.contentHash !== contentHash
    ) {
      throw new EmailMarketingConflictError("Export operation was already used with different data");
    }
    return { csv, contentHash, exportedCount: existing.exportedCount, exclusions: existing.exclusions, idempotent: true as const };
  }, { isolationLevel: "read committed" });
}
export const emailMarketingService = {
  recordConsent: (input: EmailMarketingAuditInput) => recordPermission(input, "granted"),
  revokeConsent: (input: EmailMarketingAuditInput) => recordPermission(input, "revoked"),
  suppress: recordSuppression,
  liftSuppression,
  createCampaign,
  buildAudience,
  addCopyVersion,
  approveCopyVersion,
  listCampaigns,
  permissionSummary,
  explainContact,
  listAudienceMembers,
  exportAudience,
  generateCopyDraft,
};
