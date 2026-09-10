import { and, db, desc, eq, inArray, isNull } from "@crm-fran/db";
import { normalizeLeadEmail } from "@crm-fran/db/lead-identity";
import {
  EMAIL_MARKETING_CAMPAIGN_STATUS,
  EMAIL_MARKETING_COPY_STATUS,
  EMAIL_MARKETING_PERMISSION_STATUS,
  emailMarketingAudienceMembers,
  emailMarketingAudienceSnapshots,
  emailMarketingCampaigns,
  emailMarketingContentVersions,
  emailMarketingPermissionEvents,
  emailMarketingPermissions,
  emailMarketingSuppressionEvents,
  emailMarketingSuppressions,
  leads,
  type EmailMarketingEvidence,
} from "@crm-fran/db/schema/index";

import { assertAuthorityChangeOrder, buildEmailAudienceSnapshot } from "./domain";

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

async function buildAudience(input: { campaignId: string; actorId: string }) {
  return db.transaction(async (tx) => {
    const [campaign] = await tx.select().from(emailMarketingCampaigns).where(eq(emailMarketingCampaigns.id, input.campaignId)).limit(1);
    if (!campaign) throw new EmailMarketingNotFoundError("Campaign not found");
    const candidateRows = await tx.select({
      leadId: leads.id, leadName: leads.name, normalizedEmail: leads.normalizedEmail,
    }).from(leads).where(isNull(leads.mergedIntoLeadId));
    const emails = [...new Set(candidateRows.flatMap((lead) => lead.normalizedEmail ? [lead.normalizedEmail] : []))];
    const permissionRows = emails.length === 0 ? [] : await tx.select().from(emailMarketingPermissions).where(inArray(emailMarketingPermissions.normalizedEmail, emails));
    const suppressionRows = emails.length === 0 ? [] : await tx.select().from(emailMarketingSuppressions).where(inArray(emailMarketingSuppressions.normalizedEmail, emails));
    const permissionByEmail = new Map(permissionRows.map((permission) => [permission.normalizedEmail, permission]));
    const suppressionByEmail = new Map(suppressionRows.map((suppression) => [suppression.normalizedEmail, suppression]));
    const snapshot = buildEmailAudienceSnapshot(candidateRows.map((lead) => ({
      ...lead,
      permission: lead.normalizedEmail ? permissionByEmail.get(lead.normalizedEmail) ?? null : null,
      suppression: lead.normalizedEmail ? suppressionByEmail.get(lead.normalizedEmail) ?? null : null,
    })));
    const [latest] = await tx.select({ version: emailMarketingAudienceSnapshots.version }).from(emailMarketingAudienceSnapshots)
      .where(eq(emailMarketingAudienceSnapshots.campaignId, input.campaignId)).orderBy(desc(emailMarketingAudienceSnapshots.version)).limit(1);
    const snapshotId = crypto.randomUUID();
    const version = (latest?.version ?? 0) + 1;
    await tx.insert(emailMarketingAudienceSnapshots).values({
      id: snapshotId, campaignId: input.campaignId, version, sourceKind: snapshot.sourceKind, policyVersion: snapshot.policyVersion,
      candidateCount: snapshot.candidateCount, includedCount: snapshot.includedCount, createdById: input.actorId,
    });
    if (snapshot.members.length > 0) {
      await tx.insert(emailMarketingAudienceMembers).values(snapshot.members.map((memberRow) => ({
        id: crypto.randomUUID(), snapshotId, leadId: memberRow.leadId, leadName: memberRow.leadName, normalizedEmail: memberRow.normalizedEmail,
        decision: memberRow.decision, reason: memberRow.reason, evidence: memberRow.evidence,
      })));
    }
    const [approved] = await tx.select({ id: emailMarketingContentVersions.id }).from(emailMarketingContentVersions).where(and(
      eq(emailMarketingContentVersions.campaignId, input.campaignId), eq(emailMarketingContentVersions.status, EMAIL_MARKETING_COPY_STATUS.APPROVED),
    )).limit(1);
    if (approved && snapshot.includedCount > 0) await tx.update(emailMarketingCampaigns).set({ status: EMAIL_MARKETING_CAMPAIGN_STATUS.READY, updatedAt: new Date() }).where(eq(emailMarketingCampaigns.id, input.campaignId));
    return { id: snapshotId, campaignId: input.campaignId, version, ...snapshot };
  });
}

async function addCopyVersion(input: { campaignId: string; subject: string; previewText?: string; bodyText: string; actorId: string }) {
  return db.transaction(async (tx) => {
    const [campaign] = await tx.select({ id: emailMarketingCampaigns.id }).from(emailMarketingCampaigns).where(eq(emailMarketingCampaigns.id, input.campaignId)).limit(1);
    if (!campaign) throw new EmailMarketingNotFoundError("Campaign not found");
    const [latest] = await tx.select({ version: emailMarketingContentVersions.version }).from(emailMarketingContentVersions)
      .where(eq(emailMarketingContentVersions.campaignId, input.campaignId)).orderBy(desc(emailMarketingContentVersions.version)).limit(1);
    const [created] = await tx.insert(emailMarketingContentVersions).values({
      id: crypto.randomUUID(), campaignId: input.campaignId, version: (latest?.version ?? 0) + 1,
      subject: input.subject.trim(), previewText: input.previewText?.trim() || null, bodyText: input.bodyText.trim(),
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
  const members = await db.select().from(emailMarketingAudienceMembers).where(and(
    eq(emailMarketingAudienceMembers.snapshotId, snapshot.id), eq(emailMarketingAudienceMembers.normalizedEmail, email),
  ));
  return { normalizedEmail: email, snapshot, members };
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
};


