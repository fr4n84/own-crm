import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AdminQAEditor from "./admin-qa-editor";

afterEach(() => {
  cleanup();
});

describe("AdminQAEditor — sin Tabs propios, controlado por activeTab", () => {
  it("renders ONLY the caller form when activeTab='caller'", () => {
    render(
      <AdminQAEditor
        activeTab="caller"
        initialCallerAnswers={{}}
        initialCloserAnswers={{}}
      />,
    );

    expect(screen.getByTestId("admin-caller-form")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-closer-form")).not.toBeInTheDocument();
  });

  it("renders ONLY the closer form when activeTab='closer'", () => {
    render(
      <AdminQAEditor
        activeTab="closer"
        initialCallerAnswers={{}}
        initialCloserAnswers={{}}
      />,
    );

    expect(screen.getByTestId("admin-closer-form")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-caller-form")).not.toBeInTheDocument();
  });

  it("does NOT render any submit button of its own (el padre controla el submit)", () => {
    render(
      <AdminQAEditor
        activeTab="caller"
        initialCallerAnswers={{}}
        initialCloserAnswers={{}}
      />,
    );

    // Ningún form interno debe contener un <button type="submit">.
    const callerForm = screen.getByTestId("admin-caller-form");
    const submitButtons = callerForm.querySelectorAll('button[type="submit"]');
    expect(submitButtons).toHaveLength(0);
  });

  it("does NOT render Tabs (la lógica de tabs vive en el padre)", () => {
    render(
      <AdminQAEditor
        activeTab="caller"
        initialCallerAnswers={{}}
        initialCloserAnswers={{}}
      />,
    );

    // shadcn Tabs renderiza [role="tablist"] con role explícito
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
