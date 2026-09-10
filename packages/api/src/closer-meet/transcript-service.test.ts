import { describe, expect, it, vi } from "vitest";
import { createCloserMeetTranscriptService, TranscriptAccessError } from "./transcript-service";
import { createOpenAITranscriptAnalyzer } from "./transcript-analysis";
import { parseStoredTranscript } from "./repository";

const stored = { id: "session-1", leadId: "lead-1", closerId: "closer-1", transcriptResourceName: "conferenceRecords/record-1/transcripts/transcript-1", characterCount: 6, encryptionVersion: "aes-256-gcm-v1" as const, keyId: "meet-v1", nonce: "n", ciphertext: "c", authTag: "a" };

describe("Closer Meet transcript access and analysis", () => {
  it("allows the assigned closer or coaching authority and denies horizontal access", async () => {
    const repository = { findEncryptedTranscript: vi.fn().mockResolvedValue(stored), listEncryptedTranscriptsByLead: vi.fn().mockResolvedValue([stored]) };
    const service = createCloserMeetTranscriptService({ repository, cipher: { decrypt: () => "secret" }, analyzer: { analyze: vi.fn().mockResolvedValue({ summary: "ok", patterns: [], uncertainties: [], requiresHumanReview: true as const }) } });
    await expect(service.read({ sessionId: "session-1", actorId: "closer-1", permissions: [] })).resolves.toMatchObject({ transcript: "secret" });
    await expect(service.read({ sessionId: "session-1", actorId: "other", permissions: [] })).rejects.toBeInstanceOf(TranscriptAccessError);
    await expect(service.read({ sessionId: "session-1", actorId: "coach", permissions: ["coaching:read"] })).resolves.toMatchObject({ transcript: "secret" });
  });

  it("limits server-selected aggregate analysis characters", async () => {
    const oversized = { ...stored, characterCount: 100_001 };
    const service = createCloserMeetTranscriptService({ repository: { findEncryptedTranscript: vi.fn(), listEncryptedTranscriptsByLead: vi.fn().mockResolvedValue([oversized]) }, cipher: { decrypt: () => "x".repeat(100_001) }, analyzer: { analyze: vi.fn() } });
    await expect(service.analyzeLead({ leadId: "lead-1", actorId: "closer-1", permissions: [] })).rejects.toThrow("character limit exceeded");
  });

  it("calls OpenAI with store false and returns validated non-quoting structured output", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: JSON.stringify({ summary: "Shared pattern", patterns: ["Needs discovery"], uncertainties: ["Limited sample"], requiresHumanReview: true }) });
    const analyzer = createOpenAITranscriptAnalyzer({ responses: { create } }, "model-1");
    await analyzer.analyze(["sensitive words"]);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ store: false, model: "model-1", text: expect.objectContaining({ format: expect.objectContaining({ type: "json_schema", strict: true }) }) }));
  });
  it("rejects encrypted database rows with an unsupported envelope version", () => {
    const row = { ...stored, encryptionVersion: "aes-256-gcm-v0" };
    expect(parseStoredTranscript(row)).toBeNull();
    expect(parseStoredTranscript(stored)).toEqual(stored);
  });
});



