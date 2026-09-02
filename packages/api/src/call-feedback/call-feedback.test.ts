import { describe, expect, it, vi } from "vitest";

import {
  OBJECTION_TYPES,
  callFeedbackDraftSchema,
  canProcessLeadRecording,
  estimateCallFeedbackCostMicroUsd,
  processCallRecording,
} from "../call-feedback";
import type { CallFeedbackDependencies } from "../call-feedback";

const validDraft = {
  isContacted: "Si",
  outcome: "not_interested",
  primaryProfile: "latino_extranjero",
  subProfile: "parado_desempleado",
  motivationAngles: ["income_extra_to_primary"],
  objectionTypes: ["price"],
  isDecisionMaker: "",
  decisionMakerName: "",
  financialSource: "",
  trainingAndPriceAwareness: "",
  urgencyReason: "",
  summary: "No desea continuar",
  extraInfo: "transient transcript",
  scheduledDate: "",
  scheduledTime: "",
  alertSeverity: "",
} as const;

function dependencies(
  overrides: Partial<CallFeedbackDependencies> = {},
): CallFeedbackDependencies {
  return {
    findLead: vi.fn().mockResolvedValue({ id: "lead-1", callerId: "caller-1" }),
    transcribe: vi.fn().mockResolvedValue("transient transcript"),
    summarize: vi.fn().mockResolvedValue({
      outputText: JSON.stringify({ ...validDraft, extraInfo: undefined }),
      inputTokens: 1_000,
      outputTokens: 200,
    }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("call feedback", () => {
  it("calculates estimated cost in integer micro-USD", () => {
    expect(
      estimateCallFeedbackCostMicroUsd({
        durationMs: 60_000,
        summaryInputTokens: 1_000,
        summaryOutputTokens: 200,
      }),
    ).toBe(3_270);
  });

  it("allows the assigned caller and wildcard administrators", () => {
    expect(
      canProcessLeadRecording({
        permissions: ["leads:write"],
        userId: "caller-1",
        callerId: "caller-1",
      }),
    ).toBe(true);
    expect(
      canProcessLeadRecording({
        permissions: ["*"],
        userId: "admin-1",
        callerId: "caller-1",
      }),
    ).toBe(true);
    expect(
      canProcessLeadRecording({
        permissions: ["leads:write"],
        userId: "caller-2",
        callerId: "caller-1",
      }),
    ).toBe(false);
  });

  it("accepts only drafts compatible with the existing feedback form", () => {
    expect(
      callFeedbackDraftSchema.parse({
        isContacted: "Si",
        outcome: "future_call",
        primaryProfile: "mayor_edad_avanzada",
        subProfile: "",
        motivationAngles: ["financial_stability"],
        objectionTypes: ["timing"],
        isDecisionMaker: "Si",
        decisionMakerName: "",
        financialSource: "Ahorros",
        trainingAndPriceAwareness: "Sabe que es una formación y conoce el precio",
        urgencyReason: "Quiere empezar este mes",
        summary: "Quiere empezar este mes y prefiere llamadas por la tarde",
        extraInfo: "Transcripción completa de la llamada",
        scheduledDate: "2026-09-01",
        scheduledTime: "17:30",
        alertSeverity: "warning",
      }),
    ).toMatchObject({ outcome: "future_call", alertSeverity: "warning" });

    expect(() =>
      callFeedbackDraftSchema.parse({
        isContacted: "Si",
        outcome: "won",
      }),
    ).toThrow();
  });

  it("accepts only explicit objection taxonomy values and defaults legacy data to empty", () => {
    expect(OBJECTION_TYPES.length).toBeGreaterThan(0);
    expect(callFeedbackDraftSchema.parse({ ...validDraft, objectionTypes: undefined }).objectionTypes).toEqual([]);
    expect(() => callFeedbackDraftSchema.parse({ ...validDraft, objectionTypes: ["invented"] })).toThrow();
  });

  it.each(["transcription", "summary"] as const)(
    "does not record usage when %s fails",
    async (failureStage) => {
      const recordUsage = vi.fn();
      const deps = dependencies({
        ...(failureStage === "transcription"
          ? { transcribe: vi.fn().mockRejectedValue(new Error("provider failed")) }
          : { summarize: vi.fn().mockRejectedValue(new Error("provider failed")) }),
        recordUsage,
      });

      await expect(
        processCallRecording({
          audio: new File(["audio"], "call.webm", { type: "audio/webm" }),
          durationMs: 60_000,
          leadId: "lead-1",
          userId: "caller-1",
          permissions: ["leads:write"],
          dependencies: deps,
        }),
      ).rejects.toThrow("provider failed");
      expect(recordUsage).not.toHaveBeenCalled();
    },
  );

  it("records only accounting metadata after successful processing", async () => {
    const recordUsage = vi.fn().mockResolvedValue(undefined);
    const deps = dependencies({ recordUsage });

    const result = await processCallRecording({
      audio: new File(["audio"], "call.webm", { type: "audio/webm" }),
      durationMs: 60_000,
      leadId: "lead-1",
      userId: "caller-1",
      permissions: ["leads:write"],
      dependencies: deps,
    });

    expect(result.draft).toEqual(validDraft);
    expect(result.draft.extraInfo).toBe("transient transcript");
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "caller-1",
        leadId: "lead-1",
        processedDurationMs: 60_000,
        estimatedCostMicroUsd: 3_270,
      }),
    );
    const persisted = recordUsage.mock.calls[0]?.[0];
    expect(persisted).not.toHaveProperty("audio");
    expect(persisted).not.toHaveProperty("transcript");
  });

  it("rejects a caller who does not own the lead before invoking providers", async () => {
    const transcribe = vi.fn();
    const deps = dependencies({ transcribe });

    await expect(
      processCallRecording({
        audio: new File(["audio"], "call.webm", { type: "audio/webm" }),
        durationMs: 60_000,
        leadId: "lead-1",
        userId: "caller-2",
        permissions: ["leads:write"],
        dependencies: deps,
      }),
    ).rejects.toThrow("Lead is not assigned to this caller");
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("rejects missing write permission before loading the lead or invoking providers", async () => {
    const findLead = vi.fn();
    const transcribe = vi.fn();
    const deps = dependencies({ findLead, transcribe });

    await expect(
      processCallRecording({
        audio: new File(["audio"], "call.webm", { type: "audio/webm" }),
        durationMs: 60_000,
        leadId: "lead-1",
        userId: "caller-1",
        permissions: ["leads:read"],
        dependencies: deps,
      }),
    ).rejects.toThrow("Permission denied");
    expect(findLead).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });
});
