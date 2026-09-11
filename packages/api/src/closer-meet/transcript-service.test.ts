import { describe, expect, it, vi } from "vitest";
import { createCloserMeetTranscriptService, TranscriptAccessError } from "./transcript-service";
import { createOpenAITranscriptAnalyzer } from "./transcript-analysis";
import { parseStoredTranscript } from "./repository";

const stored = { id: "session-1", leadId: "lead-1", closerId: "closer-1", transcriptResourceName: "conferenceRecords/record-1/transcripts/transcript-1", characterCount: 6, encryptionVersion: "aes-256-gcm-v1" as const, keyId: "meet-v1", nonce: "n", ciphertext: "c", authTag: "a" };
const coachingDraft = {
  rubricVersion: "closer-v1",
  criteria: [{ key: "diagnosis", rating: "unknown" as const, evidenceSignals: ["evidence_insufficient" as const], recommendation: "Confirma el diagnóstico antes de actuar." }],
  summary: "Análisis pendiente de revisión humana.",
  requiresPersonalReview: true,
  reviewReasons: ["uncertain_evidence" as const],
};

describe("Closer Meet transcript access and analysis", () => {
  it("allows only the assigned closer or Admin and denies horizontal coaching access", async () => {
    const repository = { findEncryptedTranscript: vi.fn().mockResolvedValue(stored), listEncryptedTranscriptsByLead: vi.fn().mockResolvedValue([stored]) };
    const service = createCloserMeetTranscriptService({ repository, cipher: { decrypt: () => "secret" }, analyzer: { analyze: vi.fn().mockResolvedValue(coachingDraft) }, recordDraft: vi.fn() });
    await expect(service.read({ sessionId: "session-1", actorId: "closer-1", permissions: [] })).resolves.toMatchObject({ transcript: "secret" });
    await expect(service.read({ sessionId: "session-1", actorId: "other", permissions: [] })).rejects.toBeInstanceOf(TranscriptAccessError);
    await expect(service.read({ sessionId: "session-1", actorId: "coach", permissions: ["coaching:read"] })).rejects.toBeInstanceOf(TranscriptAccessError);
    await expect(service.read({ sessionId: "session-1", actorId: "admin", permissions: ["*"] })).resolves.toMatchObject({ transcript: "secret" });
  });

  it("limits server-selected aggregate analysis characters", async () => {
    const oversized = { ...stored, characterCount: 100_001 };
    const service = createCloserMeetTranscriptService({ repository: { findEncryptedTranscript: vi.fn(), listEncryptedTranscriptsByLead: vi.fn().mockResolvedValue([oversized]) }, cipher: { decrypt: () => "x".repeat(100_001) }, analyzer: { analyze: vi.fn() }, recordDraft: vi.fn() });
    await expect(service.analyzeLead({ leadId: "lead-1", actorId: "closer-1", permissions: [] })).rejects.toThrow("character limit exceeded");
  });

  it("persists a private Closer coaching draft without returning transcript or draft content", async () => {
    const recordDraft = vi.fn().mockResolvedValue({ id: "analysis-1" });
    const analyzer = { analyze: vi.fn().mockResolvedValue(coachingDraft) };
    const service = createCloserMeetTranscriptService({
      repository: { findEncryptedTranscript: vi.fn(), listEncryptedTranscriptsByLead: vi.fn().mockResolvedValue([stored]) },
      cipher: { decrypt: () => "sensitive words" },
      analyzer,
      recordDraft,
    });

    const result = await service.analyzeLead({ leadId: "lead-1", actorId: "closer-1", permissions: [] });

    expect(analyzer.analyze).toHaveBeenCalledWith(["sensitive words"]);
    expect(recordDraft).toHaveBeenCalledWith({ actorId: "closer-1", analyzedUserId: "closer-1", leadId: "lead-1", role: "closer", draft: coachingDraft, permissions: [] });
    expect(result).toEqual({ analysisId: "analysis-1", status: "draft", requiresHumanReview: true });
    expect(JSON.stringify(result)).not.toContain("sensitive words");
    expect(JSON.stringify(result)).not.toContain(coachingDraft.summary);
  });

  it("fails closed when one lead has transcripts attributed to different Closers", async () => {
    const analyzer = { analyze: vi.fn() };
    const recordDraft = vi.fn();
    const service = createCloserMeetTranscriptService({
      repository: { findEncryptedTranscript: vi.fn(), listEncryptedTranscriptsByLead: vi.fn().mockResolvedValue([stored, { ...stored, id: "session-2", closerId: "closer-2" }]) },
      cipher: { decrypt: vi.fn() },
      analyzer,
      recordDraft,
    });

    await expect(service.analyzeLead({ leadId: "lead-1", actorId: "admin", permissions: ["*"] })).rejects.toThrow("single Closer");
    expect(analyzer.analyze).not.toHaveBeenCalled();
    expect(recordDraft).not.toHaveBeenCalled();
  });

  it("calls OpenAI with store false and returns a validated uncertain coaching draft", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: JSON.stringify(coachingDraft) });
    const analyzer = createOpenAITranscriptAnalyzer({ responses: { create } }, "model-1");
    await expect(analyzer.analyze(["sensitive words"])).resolves.toEqual(coachingDraft);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ store: false, model: "model-1", text: expect.objectContaining({ format: expect.objectContaining({ type: "json_schema", strict: true }) }) }));
  });

  it("rejects encrypted database rows with an unsupported envelope version", () => {
    const row = { ...stored, encryptionVersion: "aes-256-gcm-v0" };
    expect(parseStoredTranscript(row)).toBeNull();
    expect(parseStoredTranscript(stored)).toEqual(stored);
  });
});