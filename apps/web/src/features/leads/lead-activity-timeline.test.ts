import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useLeadActivity: vi.fn() }));

vi.mock("./use-lead-activity", () => ({
  useLeadActivity: mocks.useLeadActivity,
}));

import { attributionChangeSummary, LeadActivityTimeline } from "./lead-activity-timeline";

afterEach(() => {
  cleanup();
  mocks.useLeadActivity.mockReset();
});

describe("attributionChangeSummary", () => {
  it("returns only changed attribution values", () => {
    expect(attributionChangeSummary({ before: { source: "Meta", ad: null }, after: { source: "Meta", ad: "Vídeo" } })).toEqual([
      { key: "ad", label: "Anuncio", previous: null, current: "Vídeo" },
    ]);
  });
});

describe("LeadActivityTimeline", () => {
  it("renders every valid feedback question in order and ignores malformed metadata", () => {
    mocks.useLeadActivity.mockReturnValue({
      isPending: false,
      isError: false,
      data: [
        {
          id: "caller-event",
          leadId: "lead-1",
          actorId: "caller-1",
          actorRole: "caller",
          actorName: "Caller",
          kind: "caller_feedback",
          title: "Feedback del caller",
          description: null,
          metadata: {
            questions: [
              { question: "Pregunta repetida", answer: "Primera" },
              { question: "Pregunta desconocida", answer: "<b>Texto seguro</b>" },
              { question: "Pregunta repetida", answer: "Segunda" },
              { question: "Inválida", answer: 42 },
              null,
            ],
          },
          dedupeKey: "caller-event",
          occurredAt: "2026-09-10T10:00:00.000Z",
          createdAt: "2026-09-10T10:00:00.000Z",
          reconstructed: false,
        },
        {
          id: "closer-event",
          leadId: "lead-1",
          actorId: "closer-1",
          actorRole: "closer",
          actorName: "Closer",
          kind: "closer_feedback",
          title: "Feedback del closer",
          description: null,
          metadata: { questions: [{ question: "Resultado", answer: "Seguimiento" }] },
          dedupeKey: "closer-event",
          occurredAt: "2026-09-09T10:00:00.000Z",
          createdAt: "2026-09-09T10:00:00.000Z",
          reconstructed: false,
        },
        {
          id: "not-feedback",
          leadId: "lead-1",
          actorId: null,
          actorRole: null,
          actorName: null,
          kind: "state_changed",
          title: "Estado actualizado",
          description: null,
          metadata: { questions: [{ question: "No mostrar", answer: "Fuera de evento feedback" }] },
          dedupeKey: "not-feedback",
          occurredAt: "2026-09-08T10:00:00.000Z",
          createdAt: "2026-09-08T10:00:00.000Z",
          reconstructed: false,
        },
        {
          id: "malformed-feedback",
          leadId: "lead-1",
          actorId: "closer-1",
          actorRole: "closer",
          actorName: "Closer",
          kind: "closer_feedback",
          title: "Feedback malformado",
          description: null,
          metadata: { questions: "not-an-array" },
          dedupeKey: "malformed-feedback",
          occurredAt: "2026-09-07T10:00:00.000Z",
          createdAt: "2026-09-07T10:00:00.000Z",
          reconstructed: false,
        },
      ],
    });

    const { container } = render(createElement(LeadActivityTimeline, { leadId: "lead-1", enabled: true }));

    expect(Array.from(container.querySelectorAll("dt"), (item) => item.textContent)).toEqual([
      "Pregunta repetida",
      "Pregunta desconocida",
      "Pregunta repetida",
      "Resultado",
    ]);
    expect(Array.from(container.querySelectorAll("dd"), (item) => item.textContent)).toEqual([
      "Primera",
      "<b>Texto seguro</b>",
      "Segunda",
      "Seguimiento",
    ]);
    expect(screen.queryByText("No mostrar")).not.toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
  });
});
