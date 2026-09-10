import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LeadViewDrawer from "./lead-view-drawer";

vi.mock("@/components/lead-drawer/lead-drawer", () => ({
  default: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? <section role="dialog" aria-label={title}>{children}</section> : null,
}));

vi.mock("./lead-activity-timeline", () => ({
  LeadActivityTimeline: () => null,
}));

afterEach(cleanup);

describe("LeadViewDrawer", () => {
  it("shows legacy feedback and every current question in source order as plain text", () => {
    render(
      <LeadViewDrawer
        triggerAriaLabel="Ver feedback de Agenda Lead"
        lead={{
          id: "lead-1",
          feedback: "<strong>Feedback histórico</strong>",
          questions: [
            { question: "Pregunta repetida", questionKey: "custom", answer: "Primera respuesta", authorRole: "caller", authorId: null },
            { question: "Pregunta del closer", questionKey: "closerCustom", answer: "<em>Respuesta sin HTML</em>", authorRole: "closer", authorId: null },
            { question: "Pregunta repetida", questionKey: "custom", answer: "Segunda respuesta", authorRole: "caller", authorId: null },
            { question: "", questionKey: "unknownQuestion", answer: "Respuesta desconocida", authorRole: "closer", authorId: null },
          ],
        }}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Ver feedback de Agenda Lead" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Información del lead" });
    const legacy = within(dialog).getByRole("region", { name: "Feedback histórico" });
    expect(legacy).toHaveTextContent("<strong>Feedback histórico</strong>");

    const questions = within(dialog).getByRole("region", { name: "Preguntas actuales" });
    expect(Array.from(questions.querySelectorAll("dt"), (item) => item.textContent)).toEqual([
      "Pregunta repetida",
      "Pregunta del closer",
      "Pregunta repetida",
      "unknownQuestion",
    ]);
    expect(Array.from(questions.querySelectorAll("dd"), (item) => item.textContent)).toEqual([
      "Primera respuesta",
      "<em>Respuesta sin HTML</em>",
      "Segunda respuesta",
      "Respuesta desconocida",
    ]);
    expect(dialog.querySelector("strong")).toBeNull();
    expect(dialog.querySelector("em")).toBeNull();
  });
});
