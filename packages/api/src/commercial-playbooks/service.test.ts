import { describe, expect, it } from "vitest";

import type { CommercialLibraryVersionRecord, CommercialPlaybookProposalRecord, CommercialPlaybooksRepository } from "./service";
import { createCommercialPlaybooksService } from "./service";
import type { PlaybookEvidenceFacts } from "./domain";

const now = new Date("2026-08-26T12:00:00.000Z");

function evidenceFacts(): PlaybookEvidenceFacts {
  return {
    asOf: now,
    feedbackEvents: Array.from({ length: 30 }, (_, index) => ({
      id: `feedback-${index}`, leadId: `lead-${index}`, occurredAt: new Date("2026-06-01T10:00:00.000Z"),
      metadata: { questions: [{ questionKey: "primaryProfile", answer: "parado_desempleado" }, { questionKey: "objectionTypes", answer: JSON.stringify(["price"]) }] },
    })),
    outcomeEvents: [], libraryVersions: [], experiments: [],
  };
}

class FakeRepository implements CommercialPlaybooksRepository {
  proposals: CommercialPlaybookProposalRecord[] = [];
  libraries: CommercialLibraryVersionRecord[] = [];
  facts = evidenceFacts();
  operationalWrites = 0;
  failApprovedProposalInsert = false;

  async transaction<T>(work: (repository: CommercialPlaybooksRepository) => Promise<T>): Promise<T> {
    const proposals = structuredClone(this.proposals);
    const libraries = structuredClone(this.libraries);
    try { return await work(this); }
    catch (error) { this.proposals = proposals; this.libraries = libraries; throw error; }
  }
  async loadEvidenceFacts(asOf: Date) { return { ...this.facts, asOf, libraryVersions: this.libraries }; }
  async listProposalVersions() { return this.proposals; }
  async listLibraryVersions() { return this.libraries; }
  async findProposalVersions(lineageKey: string) { return this.proposals.filter((row) => row.lineageKey === lineageKey); }
  async lockProposalLineage() { return; }
  async insertProposalVersion(value: CommercialPlaybookProposalRecord) {
    if (this.failApprovedProposalInsert && value.status === "approved") throw new Error("proposal insert failed");
    this.proposals.push(value); return value;
  }
  async findLibraryVersions(lineageKey: string) { return this.libraries.filter((row) => row.lineageKey === lineageKey); }
  async findLibraryVersion(id: string) { return this.libraries.find((row) => row.id === id) ?? null; }
  async lockLibraryLineage() { return; }
  async insertLibraryVersion(value: CommercialLibraryVersionRecord) { this.libraries.push(value); return value; }
}

const admin = { actorId: "admin-1", permissions: ["*"] as const };

describe("learning playbook workflow", () => {
  it("recomputes candidate evidence on the server and deduplicates generation", async () => {
    const repository = new FakeRepository();
    const service = createCommercialPlaybooksService(repository, () => now);
    const candidate = (await service.overview(admin)).candidates[0];
    expect(candidate).toBeDefined();

    const first = await service.generate({ ...admin, candidateKey: candidate!.candidateKey });
    const second = await service.generate({ ...admin, candidateKey: candidate!.candidateKey });

    expect(first.id).toBe(second.id);
    expect(repository.proposals).toHaveLength(1);
    expect(first.evidenceSnapshot.sampleSize).toBe(30);
    expect(first.evidenceSnapshot.evidenceLabel).toBe("observational");
  });

  it("keeps candidate identity stable across clock ticks but rejects the old key after a material backfill", async () => {
    const repository = new FakeRepository();
    let current = now;
    const service = createCommercialPlaybooksService(repository, () => current);
    const candidate = (await service.overview(admin)).candidates[0]!;

    current = new Date(now.getTime() + 1);
    const generated = await service.generate({ ...admin, candidateKey: candidate.candidateKey });
    expect(generated.evidenceSnapshot.asOf).toBe(current.toISOString());
    expect(repository.proposals).toHaveLength(1);

    current = new Date(now.getTime() + 2);
    const deduplicated = await service.generate({ ...admin, candidateKey: candidate.candidateKey });
    expect(deduplicated.id).toBe(generated.id);
    expect(repository.proposals).toHaveLength(1);

    repository.facts.outcomeEvents.push({ id: "sale-backfill", leadId: "lead-0", kind: "sale", occurredAt: new Date("2026-06-20T10:00:00.000Z") });
    await expect(service.generate({ ...admin, candidateKey: candidate.candidateKey })).rejects.toMatchObject({ code: "CONFLICT" });
    const refreshed = (await service.overview(admin)).candidates.find((item) => item.targeting.objections?.includes("price"))!;
    const backfilled = await service.generate({ ...admin, candidateKey: refreshed.candidateKey });
    expect(backfilled).toMatchObject({ lineageKey: generated.lineageKey, version: 2, status: "draft" });
    expect(backfilled.evidenceSnapshot.cohortFingerprint).not.toBe(generated.evidenceSnapshot.cohortFingerprint);
  });

  it("rejects stale and insufficient candidates instead of trusting client metrics", async () => {
    const repository = new FakeRepository();
    const service = createCommercialPlaybooksService(repository, () => now);
    await expect(service.generate({ ...admin, candidateKey: "client-crafted-key" })).rejects.toMatchObject({ code: "CONFLICT" });
    repository.facts.feedbackEvents = repository.facts.feedbackEvents.slice(0, 29);
    const candidate = (await service.overview(admin)).candidates[0];
    await expect(service.generate({ ...admin, candidateKey: candidate!.candidateKey })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("edits by appending a draft and detects optimistic concurrency", async () => {
    const repository = new FakeRepository();
    const service = createCommercialPlaybooksService(repository, () => now);
    const candidate = (await service.overview(admin)).candidates[0]!;
    const draft = await service.generate({ ...admin, candidateKey: candidate.candidateKey });
    const edited = await service.edit({ ...admin, lineageKey: draft.lineageKey, expectedVersion: 1, title: "Título humano", content: "Contenido humano", changeSummary: "Resumen humano" });

    expect(edited).toMatchObject({ version: 2, status: "draft", title: "Título humano" });
    expect(repository.proposals).toHaveLength(2);
    await expect(service.edit({ ...admin, lineageKey: draft.lineageKey, expectedVersion: 1, title: "Otra", content: "Otra", changeSummary: "Otra" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(service.edit({ ...admin, lineageKey: edited.lineageKey, expectedVersion: 2, title: "   ", content: "Contenido", changeSummary: "Resumen" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps the complete append-only proposal history while exposing one current row per lineage", async () => {
    const repository = new FakeRepository();
    const service = createCommercialPlaybooksService(repository, () => now);
    const candidate = (await service.overview(admin)).candidates[0]!;
    const draft = await service.generate({ ...admin, candidateKey: candidate.candidateKey });
    const edited = await service.edit({ ...admin, lineageKey: draft.lineageKey, expectedVersion: 1, title: "Revisión", content: "Contenido", changeSummary: "Revisión humana" });
    await service.reject({ ...admin, lineageKey: edited.lineageKey, expectedVersion: 2, decisionReason: "No procede" });

    const overview = await service.overview(admin);
    expect(overview.proposals).toHaveLength(1);
    expect(overview.proposals[0]).toMatchObject({ version: 3, status: "rejected" });
    expect(overview.proposalHistory.map((row) => row.version)).toEqual([3, 2, 1]);
  });

  it("publishes approval atomically, rejects without publication and detects base conflicts", async () => {
    const repository = new FakeRepository();
    const service = createCommercialPlaybooksService(repository, () => now);
    const candidate = (await service.overview(admin)).candidates[0]!;
    const draft = await service.generate({ ...admin, candidateKey: candidate.candidateKey });
    await expect(service.approve({ ...admin, lineageKey: draft.lineageKey, expectedVersion: 1, decisionReason: "No se editó" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const edited = await service.edit({ ...admin, lineageKey: draft.lineageKey, expectedVersion: 1, title: "Respuesta humana", content: "Contenido revisado por una persona", changeSummary: "Cambio humano explícito" });
    repository.failApprovedProposalInsert = true;
    await expect(service.approve({ ...admin, lineageKey: draft.lineageKey, expectedVersion: edited.version, decisionReason: "Evidencia revisada" })).rejects.toThrow("proposal insert failed");
    expect(repository.libraries).toHaveLength(0);
    repository.failApprovedProposalInsert = false;
    const approved = await service.approve({ ...admin, lineageKey: draft.lineageKey, expectedVersion: edited.version, decisionReason: "Evidencia revisada" });
    expect(approved.proposal.status).toBe("approved");
    expect(approved.library).toMatchObject({ version: 1, status: "published", changeKind: "learned" });

    const nextRepository = new FakeRepository();
    const nextService = createCommercialPlaybooksService(nextRepository, () => now);
    const nextCandidate = (await nextService.overview(admin)).candidates[0]!;
    const nextDraft = await nextService.generate({ ...admin, candidateKey: nextCandidate.candidateKey });
    const nextEdited = await nextService.edit({ ...admin, lineageKey: nextDraft.lineageKey, expectedVersion: 1, title: "Nueva respuesta", content: "Nueva versión humana", changeSummary: "Revisión completa" });
    nextRepository.libraries.push({ ...repository.libraries[0]!, id: "concurrent", version: 1, lineageKey: nextDraft.libraryLineageKey });
    await expect(nextService.approve({ ...admin, lineageKey: nextDraft.lineageKey, expectedVersion: nextEdited.version, decisionReason: "Revisada" })).rejects.toMatchObject({ code: "CONFLICT" });

    const rejectedRepository = new FakeRepository();
    const rejectedService = createCommercialPlaybooksService(rejectedRepository, () => now);
    const rejectedCandidate = (await rejectedService.overview(admin)).candidates[0]!;
    const rejectedDraft = await rejectedService.generate({ ...admin, candidateKey: rejectedCandidate.candidateKey });
    const rejected = await rejectedService.reject({ ...admin, lineageKey: rejectedDraft.lineageKey, expectedVersion: 1, decisionReason: "No procede" });
    expect(rejected.status).toBe("rejected");
    expect(rejectedRepository.libraries).toHaveLength(0);
  });

  it("rolls back by appending a published copy and never reactivating or deleting history", async () => {
    const repository = new FakeRepository();
    const base = { id: "lib-1", lineageKey: "library-1", version: 1, status: "published" as const, type: "playbook", title: "Original", content: "Original", targeting: {}, evidence: {}, parentVersionId: null, changeKind: "manual" as const, changeReason: null, restoredFromVersionId: null, actorId: "admin-1", approvedById: "admin-1", approvedAt: now, originExperimentId: null, createdAt: now };
    repository.libraries.push(base, { ...base, id: "lib-2", version: 2, title: "Current", content: "Current", parentVersionId: "lib-1", changeKind: "learned" });
    const service = createCommercialPlaybooksService(repository, () => now);
    const rolledBack = await service.rollback({ ...admin, libraryLineageKey: "library-1", expectedCurrentVersion: 2, restoreVersionId: "lib-1", decisionReason: "Regresión confirmada" });

    expect(rolledBack).toMatchObject({ version: 3, status: "published", title: "Original", parentVersionId: "lib-2", changeKind: "rollback", restoredFromVersionId: "lib-1", changeReason: "Regresión confirmada" });
    expect(repository.libraries.map((row) => row.id)).toEqual(["lib-1", "lib-2", rolledBack.id]);
    await expect(service.rollback({ ...admin, libraryLineageKey: "library-1", expectedCurrentVersion: 3, restoreVersionId: rolledBack.id, decisionReason: "Self rollback" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects rollback from a non-published current version or a non-playbook lineage", async () => {
    const repository = new FakeRepository();
    const base = { id: "lib-1", lineageKey: "library-1", version: 1, status: "published" as const, type: "playbook", title: "Original", content: "Original", targeting: {}, evidence: {}, parentVersionId: null, changeKind: "manual" as const, changeReason: null, restoredFromVersionId: null, actorId: "admin-1", approvedById: "admin-1", approvedAt: now, originExperimentId: null, createdAt: now };
    repository.libraries.push(base, { ...base, id: "lib-2", version: 2, status: "draft" });
    const service = createCommercialPlaybooksService(repository, () => now);

    await expect(service.rollback({ ...admin, libraryLineageKey: "library-1", expectedCurrentVersion: 2, restoreVersionId: "lib-1", decisionReason: "No debe saltar el borrador" })).rejects.toMatchObject({ code: "CONFLICT" });

    repository.libraries = [{ ...base, type: "script" }, { ...base, id: "lib-2", version: 2, type: "script" }];
    await expect(service.rollback({ ...admin, libraryLineageKey: "library-1", expectedCurrentVersion: 2, restoreVersionId: "lib-1", decisionReason: "No es un playbook" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("deeply sanitizes overview evidence, lead references and raw actor identifiers", async () => {
    const repository = new FakeRepository();
    repository.facts.feedbackEvents[0] = {
      id: "feedback-private", leadId: "lead-private", occurredAt: new Date("2026-06-01T10:00:00.000Z"),
      metadata: {
        transcript: "private transcript", summary: "private summary",
        questions: [{ questionKey: "primaryProfile", answer: "parado_desempleado" }, { questionKey: "objectionTypes", answer: JSON.stringify(["price"]) }],
      },
    };
    repository.libraries.push({
      id: "library-private", lineageKey: "library-private", version: 1, status: "published", type: "playbook", title: "Private", content: "Safe content", targeting: {},
      evidence: { sampleSize: 1, references: [{ feedbackEventId: "feedback-private-reference", leadId: "lead-private-reference" }], evidenceLabel: "observational" },
      parentVersionId: null, changeKind: "manual", changeReason: null, restoredFromVersionId: null,
      actorId: "actor-private", approvedById: "approver-private", approvedAt: now, originExperimentId: null, createdAt: now,
    });
    const service = createCommercialPlaybooksService(repository, () => now);
    const candidate = (await service.overview(admin)).candidates.find((item) => item.targeting.objections?.includes("price"))!;
    await service.generate({ ...admin, candidateKey: candidate.candidateKey });
    const overview = await service.overview(admin);
    const serialized = JSON.stringify(overview);

    expect(serialized).not.toContain("lead-private");
    expect(serialized).not.toContain("feedback-private");
    expect(serialized).not.toContain("private transcript");
    expect(serialized).not.toContain("private summary");
    expect(serialized).not.toContain("actor-private");
    expect(serialized).not.toContain("approver-private");
    for (const privateKey of ["leadId", "feedbackEventId", "evidenceIds", "references", "actorId", "decisionById", "approvedById"]) {
      expect(serialized).not.toContain(`\"${privateKey}\"`);
    }
  });

  it("keeps experiment-derived edited content experiment-supported and never labels it causal", async () => {
    const repository = new FakeRepository();
    const base = { id: "library-v1", lineageKey: "library-1", version: 1, status: "published" as const, type: "playbook", title: "Tested", content: "Tested", targeting: {}, evidence: {}, parentVersionId: null, changeKind: "manual" as const, changeReason: null, restoredFromVersionId: null, actorId: "admin-1", approvedById: "admin-1", approvedAt: now, originExperimentId: null, createdAt: now };
    repository.libraries.push(base);
    repository.proposals.push({
      id: "proposal-v1", lineageKey: "proposal:experimental", version: 1, status: "draft", source: "approved_experiment", libraryLineageKey: base.lineageKey,
      baseLibraryVersionId: base.id, title: "Placeholder", content: "Borrador pendiente de edición humana basado en una versión vinculada al tratamiento.", changeSummary: "Placeholder",
      targeting: {}, evidenceSnapshot: { asOf: now.toISOString(), cutoff: now.toISOString(), cohortFingerprint: "fingerprint", policyVersion: "commercial-playbooks-v1", source: "approved_experiment", maturityDays: 30, windowDays: 30, sampleSize: 80, denominators: { control: 40, treatment: 40 }, rates: { control: 0.1, treatment: 0.4 }, confidence: "experiment_supported", confidenceInterval95: { lowerPp: 5, upperPp: 40, method: "test" }, evidenceIds: ["assignment-private"], evidenceLabel: "experimental", limitations: [] },
      experimentSourceId: "experiment-1", publishedLibraryVersionId: null, actorId: "admin-1", decisionById: null, decisionReason: null, decidedAt: null, createdAt: now,
    });
    const service = createCommercialPlaybooksService(repository, () => now);
    const edited = await service.edit({ ...admin, lineageKey: "proposal:experimental", expectedVersion: 1, title: "Título humano", content: "Contenido humano distinto del probado", changeSummary: "Edición humana" });
    const approved = await service.approve({ ...admin, lineageKey: edited.lineageKey, expectedVersion: edited.version, decisionReason: "Aprobada como derivada" });

    expect(approved.library.evidence.evidenceLabel).toBe("experiment_supported");
    expect(JSON.stringify(approved)).not.toContain("causal");
  });

  it("normalizes legacy causal library evidence before exposing playbooks", async () => {
    const repository = new FakeRepository();
    repository.libraries.push({
      id: "legacy-library", lineageKey: "legacy-library", version: 1, status: "published", type: "playbook", title: "Legacy", content: "Safe", targeting: {},
      evidence: { evidenceLabel: "causal" as never }, parentVersionId: null, changeKind: "manual", changeReason: null, restoredFromVersionId: null,
      actorId: "admin-1", approvedById: "admin-1", approvedAt: now, originExperimentId: "experiment-legacy", createdAt: now,
    });
    const overview = await createCommercialPlaybooksService(repository, () => now).overview(admin);
    expect(overview.currentLibraries[0]?.evidence.evidenceLabel).toBe("experiment_supported");
    expect(JSON.stringify(overview.currentLibraries)).not.toContain('"causal"');
  });

  it("requires wildcard administration and exposes no operational write capability", async () => {
    const repository = new FakeRepository();
    const service = createCommercialPlaybooksService(repository, () => now);
    await expect(service.overview({ actorId: "caller-1", permissions: ["leads:read"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.operationalWrites).toBe(0);
    expect(Object.keys(repository)).not.toEqual(expect.arrayContaining(["leads", "alerts", "assignments", "rules", "nextBestActions"]));
  });
});
