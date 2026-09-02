import { TRPCError } from "@trpc/server";

import type {
  CommercialLibraryChangeKind,
  CommercialLibraryEvidence,
  CommercialLibraryStatus,
  CommercialLibraryTargeting,
  CommercialPlaybookEvidenceSnapshot,
  CommercialPlaybookProposalSource,
  CommercialPlaybookProposalStatus,
} from "@crm-fran/db/schema/index";

import { normalizeCommercialLibraryEvidenceLabel } from "../commercial-library/domain";
import { buildCommercialPlaybookCandidates, type CommercialPlaybookCandidate, type PlaybookEvidenceFacts } from "./domain";

export type CommercialPlaybookProposalRecord = {
  id: string;
  lineageKey: string;
  version: number;
  status: CommercialPlaybookProposalStatus;
  source: CommercialPlaybookProposalSource;
  libraryLineageKey: string;
  baseLibraryVersionId: string | null;
  title: string;
  content: string;
  changeSummary: string;
  targeting: CommercialLibraryTargeting;
  evidenceSnapshot: CommercialPlaybookEvidenceSnapshot;
  experimentSourceId: string | null;
  publishedLibraryVersionId: string | null;
  actorId: string;
  decisionById: string | null;
  decisionReason: string | null;
  decidedAt: Date | null;
  createdAt: Date;
};

export type CommercialLibraryVersionRecord = {
  id: string;
  lineageKey: string;
  version: number;
  status: CommercialLibraryStatus;
  type: string;
  title: string;
  content: string;
  targeting: CommercialLibraryTargeting;
  evidence: CommercialLibraryEvidence;
  parentVersionId: string | null;
  changeKind: CommercialLibraryChangeKind;
  changeReason: string | null;
  restoredFromVersionId: string | null;
  actorId: string;
  approvedById: string | null;
  approvedAt: Date | null;
  originExperimentId: string | null;
  createdAt: Date;
};

export type CommercialPlaybooksRepository = {
  transaction<T>(work: (repository: CommercialPlaybooksRepository) => Promise<T>): Promise<T>;
  loadEvidenceFacts(asOf: Date): Promise<PlaybookEvidenceFacts>;
  listLibraryVersions(): Promise<CommercialLibraryVersionRecord[]>;
  listProposalVersions(): Promise<CommercialPlaybookProposalRecord[]>;
  findProposalVersions(lineageKey: string): Promise<CommercialPlaybookProposalRecord[]>;
  lockProposalLineage(lineageKey: string): Promise<void>;
  insertProposalVersion(value: CommercialPlaybookProposalRecord): Promise<CommercialPlaybookProposalRecord>;
  findLibraryVersions(lineageKey: string): Promise<CommercialLibraryVersionRecord[]>;
  findLibraryVersion(id: string): Promise<CommercialLibraryVersionRecord | null>;
  lockLibraryLineage(lineageKey: string): Promise<void>;
  insertLibraryVersion(value: CommercialLibraryVersionRecord): Promise<CommercialLibraryVersionRecord>;
};

type Actor = { actorId: string; permissions: readonly string[] };

type PublicEvidenceSnapshot = Omit<CommercialPlaybookEvidenceSnapshot, "evidenceIds">;
type PublicCommercialPlaybookCandidate = Omit<CommercialPlaybookCandidate, "proposalLineageKey" | "libraryLineageKey" | "baseLibraryVersionId" | "experimentSourceId" | "evidenceSnapshot"> & { evidenceSnapshot: PublicEvidenceSnapshot };
type PublicCommercialPlaybookProposal = Omit<CommercialPlaybookProposalRecord, "actorId" | "decisionById" | "baseLibraryVersionId" | "experimentSourceId" | "publishedLibraryVersionId" | "evidenceSnapshot"> & {
  evidenceSnapshot: PublicEvidenceSnapshot;
  decisionRecorded: boolean;
};
type PublicCommercialLibraryVersion = Pick<CommercialLibraryVersionRecord, "id" | "lineageKey" | "version" | "status" | "type" | "title" | "content" | "targeting" | "parentVersionId" | "changeKind" | "changeReason" | "restoredFromVersionId" | "approvedAt" | "createdAt"> & {
  evidence: Pick<CommercialLibraryEvidence, "sampleSize" | "conversionRate" | "evidenceLabel">;
};

function requireAdmin(input: Actor) {
  if (!input.permissions.includes("*")) throw new TRPCError({ code: "FORBIDDEN", message: "Learning playbooks require wildcard administration" });
}

function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

function latest<T extends { version: number; id: string }>(rows: readonly T[]) {
  return [...rows].sort((a, b) => b.version - a.version || a.id.localeCompare(b.id))[0] ?? null;
}

function latestByLineage<T extends { lineageKey: string; version: number; id: string }>(rows: readonly T[]) {
  const result = new Map<string, T>();
  for (const row of [...rows].sort((a, b) => b.version - a.version || a.id.localeCompare(b.id))) if (!result.has(row.lineageKey)) result.set(row.lineageKey, row);
  return [...result.values()];
}

function requireReason(value: string) {
  const reason = value.trim();
  if (!reason) throw new TRPCError({ code: "BAD_REQUEST", message: "A decision reason is required" });
  return reason;
}

function requireEditableText(value: string, field: string) {
  const text = value.trim();
  if (!text) throw new TRPCError({ code: "BAD_REQUEST", message: `${field} is required` });
  return text;
}

function publicEvidenceSnapshot(snapshot: CommercialPlaybookEvidenceSnapshot): PublicEvidenceSnapshot {
  const { evidenceIds: _evidenceIds, ...safe } = snapshot;
  return safe;
}

function publicCandidate(candidate: CommercialPlaybookCandidate): PublicCommercialPlaybookCandidate {
  const { proposalLineageKey: _proposalLineageKey, libraryLineageKey: _libraryLineageKey, baseLibraryVersionId: _baseLibraryVersionId, experimentSourceId: _experimentSourceId, evidenceSnapshot, ...safe } = candidate;
  return { ...safe, evidenceSnapshot: publicEvidenceSnapshot(evidenceSnapshot) };
}

function publicProposal(proposal: CommercialPlaybookProposalRecord): PublicCommercialPlaybookProposal {
  const {
    actorId: _actorId,
    decisionById,
    baseLibraryVersionId: _baseLibraryVersionId,
    experimentSourceId: _experimentSourceId,
    publishedLibraryVersionId: _publishedLibraryVersionId,
    evidenceSnapshot,
    ...safe
  } = proposal;
  return { ...safe, evidenceSnapshot: publicEvidenceSnapshot(evidenceSnapshot), decisionRecorded: decisionById !== null };
}

function publicLibrary(row: CommercialLibraryVersionRecord): PublicCommercialLibraryVersion {
  return {
    id: row.id,
    lineageKey: row.lineageKey,
    version: row.version,
    status: row.status,
    type: row.type,
    title: row.title,
    content: row.content,
    targeting: row.targeting,
    parentVersionId: row.parentVersionId,
    evidence: {
      sampleSize: row.evidence.sampleSize,
      conversionRate: row.evidence.conversionRate,
      evidenceLabel: normalizeCommercialLibraryEvidenceLabel(row.evidence.evidenceLabel),
    },
    changeKind: row.changeKind,
    changeReason: row.changeReason,
    restoredFromVersionId: row.restoredFromVersionId,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
  };
}

function requireHumanEditedProposal(proposal: CommercialPlaybookProposalRecord, versions: readonly CommercialPlaybookProposalRecord[]) {
  const initial = [...versions].sort((a, b) => a.version - b.version || a.id.localeCompare(b.id))[0];
  const containsPlaceholder = /borrador pendiente de edici[oó]n humana/i.test(proposal.content);
  const hasRealEdit = initial
    && proposal.version > initial.version
    && proposal.title.trim() !== initial.title.trim()
    && proposal.content.trim() !== initial.content.trim()
    && proposal.changeSummary.trim() !== initial.changeSummary.trim();
  if (!hasRealEdit || containsPlaceholder) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Edit the title, content and change summary before approval" });
  }
}

export function createCommercialPlaybooksService(repository: CommercialPlaybooksRepository, clock: () => Date = () => new Date()) {
  async function lockedLatestProposal(transaction: CommercialPlaybooksRepository, lineageKey: string, expectedVersion: number) {
    await transaction.lockProposalLineage(lineageKey);
    const current = latest(await transaction.findProposalVersions(lineageKey));
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Playbook proposal not found" });
    if (current.version !== expectedVersion) conflict("Proposal changed concurrently");
    if (current.status !== "draft") conflict("Only the latest draft proposal can be changed");
    return { current, versions: await transaction.findProposalVersions(lineageKey) };
  }

  return {
    async overview(input: Actor) {
      requireAdmin(input);
      const asOf = clock();
      const [facts, proposalRows, libraryRows] = await Promise.all([repository.loadEvidenceFacts(asOf), repository.listProposalVersions(), repository.listLibraryVersions()]);
      const evidence = buildCommercialPlaybookCandidates(facts);
      const visibleProposalRows = proposalRows.filter((row) => row.createdAt <= asOf);
      const proposals = latestByLineage(visibleProposalRows).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
      const proposalHistory = [...visibleProposalRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.version - a.version || a.id.localeCompare(b.id));
      const playbookLibraries = libraryRows.filter((row) => row.type === "playbook" && row.createdAt <= asOf);
      return {
        ...evidence,
        candidates: evidence.candidates.map(publicCandidate),
        proposals: proposals.map(publicProposal),
        proposalHistory: proposalHistory.map(publicProposal),
        published: proposals.filter((proposal) => proposal.status === "approved").map(publicProposal),
        currentLibraries: latestByLineage(playbookLibraries).filter((row) => row.status === "published").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id)).map(publicLibrary),
        libraryHistory: [...playbookLibraries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.version - a.version || a.id.localeCompare(b.id)).map(publicLibrary),
        counts: {
          readySignals: evidence.candidates.filter((candidate) => candidate.availability === "ready").length,
          insufficientSignals: evidence.candidates.filter((candidate) => candidate.availability === "insufficient").length,
          drafts: proposals.filter((proposal) => proposal.status === "draft").length,
          approved: proposals.filter((proposal) => proposal.status === "approved").length,
          rejected: proposals.filter((proposal) => proposal.status === "rejected").length,
        },
      };
    },

    async generate(input: Actor & { candidateKey: string }) {
      requireAdmin(input);
      const asOf = clock();
      const candidate = buildCommercialPlaybookCandidates(await repository.loadEvidenceFacts(asOf)).candidates.find((item) => item.candidateKey === input.candidateKey);
      if (!candidate) conflict("Candidate is stale or no longer available; refresh the evidence");
      if (candidate.availability !== "ready") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "At least 30 mature observations are required" });
      const lineageKey = candidate.proposalLineageKey;
      const proposal = await repository.transaction(async (transaction) => {
        await transaction.lockProposalLineage(lineageKey);
        const existing = await transaction.findProposalVersions(lineageKey);
        const current = latest(existing);
        if (current?.evidenceSnapshot.cohortFingerprint === candidate.evidenceSnapshot.cohortFingerprint) return current;
        const createdAt = clock();
        return transaction.insertProposalVersion({
          id: crypto.randomUUID(), lineageKey, version: (current?.version ?? 0) + 1, status: "draft", source: candidate.source,
          libraryLineageKey: candidate.libraryLineageKey, baseLibraryVersionId: candidate.baseLibraryVersionId,
          title: candidate.title, content: candidate.content, changeSummary: candidate.changeSummary,
          targeting: candidate.targeting, evidenceSnapshot: candidate.evidenceSnapshot,
          experimentSourceId: candidate.experimentSourceId, publishedLibraryVersionId: null,
          actorId: input.actorId, decisionById: null, decisionReason: null, decidedAt: null, createdAt,
        });
      });
      return publicProposal(proposal);
    },

    async edit(input: Actor & { lineageKey: string; expectedVersion: number; title: string; content: string; changeSummary: string }) {
      requireAdmin(input);
      const title = requireEditableText(input.title, "Title");
      const content = requireEditableText(input.content, "Content");
      const changeSummary = requireEditableText(input.changeSummary, "Change summary");
      const proposal = await repository.transaction(async (transaction) => {
        const { current } = await lockedLatestProposal(transaction, input.lineageKey, input.expectedVersion);
        return transaction.insertProposalVersion({
          ...current, id: crypto.randomUUID(), version: current.version + 1,
          title, content, changeSummary,
          actorId: input.actorId, createdAt: clock(),
        });
      });
      return publicProposal(proposal);
    },

    async approve(input: Actor & { lineageKey: string; expectedVersion: number; decisionReason: string }) {
      requireAdmin(input);
      const decisionReason = requireReason(input.decisionReason);
      const result = await repository.transaction(async (transaction) => {
        const { current: proposal, versions } = await lockedLatestProposal(transaction, input.lineageKey, input.expectedVersion);
        requireHumanEditedProposal(proposal, versions);
        await transaction.lockLibraryLineage(proposal.libraryLineageKey);
        const libraryRows = await transaction.findLibraryVersions(proposal.libraryLineageKey);
        const currentLibrary = latest(libraryRows);
        if (currentLibrary && currentLibrary.type !== "playbook") conflict("Learning proposals can only publish playbook lineages");
        if (proposal.baseLibraryVersionId === null && currentLibrary !== null) conflict("Library base changed after proposal generation");
        if (proposal.baseLibraryVersionId !== null && currentLibrary?.id !== proposal.baseLibraryVersionId) conflict("Library base changed after proposal generation");
        const now = clock();
        const evidence: CommercialLibraryEvidence = {
          sampleSize: proposal.evidenceSnapshot.sampleSize,
          conversionRate: proposal.evidenceSnapshot.rates.saleRate ?? proposal.evidenceSnapshot.rates.treatment,
          evidenceLabel: proposal.evidenceSnapshot.evidenceLabel === "experimental" ? "experiment_supported" : "observational",
        };
        const library = await transaction.insertLibraryVersion({
          id: crypto.randomUUID(), lineageKey: proposal.libraryLineageKey, version: (currentLibrary?.version ?? 0) + 1,
          status: "published", type: currentLibrary?.type ?? "playbook", title: proposal.title, content: proposal.content,
          targeting: proposal.targeting, evidence, parentVersionId: currentLibrary?.id ?? null,
          changeKind: "learned", changeReason: decisionReason, restoredFromVersionId: null,
          actorId: input.actorId, approvedById: input.actorId, approvedAt: now,
          originExperimentId: proposal.experimentSourceId, createdAt: now,
        });
        const approved = await transaction.insertProposalVersion({
          ...proposal, id: crypto.randomUUID(), version: proposal.version + 1, status: "approved",
          publishedLibraryVersionId: library.id, actorId: input.actorId, decisionById: input.actorId,
          decisionReason, decidedAt: now, createdAt: now,
        });
        return { proposal: approved, library };
      });
      return { proposal: publicProposal(result.proposal), library: publicLibrary(result.library) };
    },

    async reject(input: Actor & { lineageKey: string; expectedVersion: number; decisionReason: string }) {
      requireAdmin(input);
      const decisionReason = requireReason(input.decisionReason);
      const proposal = await repository.transaction(async (transaction) => {
        const { current: proposal } = await lockedLatestProposal(transaction, input.lineageKey, input.expectedVersion);
        const now = clock();
        return transaction.insertProposalVersion({
          ...proposal, id: crypto.randomUUID(), version: proposal.version + 1, status: "rejected",
          actorId: input.actorId, decisionById: input.actorId, decisionReason, decidedAt: now, createdAt: now,
        });
      });
      return publicProposal(proposal);
    },

    async rollback(input: Actor & { libraryLineageKey: string; expectedCurrentVersion: number; restoreVersionId: string; decisionReason: string }) {
      requireAdmin(input);
      const decisionReason = requireReason(input.decisionReason);
      const library = await repository.transaction(async (transaction) => {
        await transaction.lockLibraryLineage(input.libraryLineageKey);
        const rows = await transaction.findLibraryVersions(input.libraryLineageKey);
        const current = latest(rows);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Commercial library lineage not found" });
        if (current.version !== input.expectedCurrentVersion) conflict("Library changed concurrently");
        if (current.status !== "published") conflict("Only a current published playbook can be rolled back");
        if (current.type !== "playbook") throw new TRPCError({ code: "BAD_REQUEST", message: "Only playbook lineages can be rolled back here" });
        const restore = await transaction.findLibraryVersion(input.restoreVersionId);
        if (!restore || restore.lineageKey !== input.libraryLineageKey || restore.status !== "published" || restore.type !== "playbook") throw new TRPCError({ code: "BAD_REQUEST", message: "Restore version must be a published playbook version in the same lineage" });
        if (restore.id === current.id || restore.version >= current.version) throw new TRPCError({ code: "BAD_REQUEST", message: "Restore version must be older than the current published version" });
        const now = clock();
        return transaction.insertLibraryVersion({
          ...restore, id: crypto.randomUUID(), version: current.version + 1, status: "published",
          parentVersionId: current.id, changeKind: "rollback", changeReason: decisionReason,
          restoredFromVersionId: restore.id, actorId: input.actorId, approvedById: input.actorId,
          approvedAt: now, createdAt: now,
        });
      });
      return publicLibrary(library);
    },

    async history(input: Actor & { lineageKey?: string }) {
      requireAdmin(input);
      const rows = input.lineageKey ? await repository.findProposalVersions(input.lineageKey) : await repository.listProposalVersions();
      return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.version - a.version || a.id.localeCompare(b.id)).map(publicProposal);
    },
  };
}
