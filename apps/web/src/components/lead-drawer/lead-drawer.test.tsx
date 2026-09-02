import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LeadDrawer from "./lead-drawer";

afterEach(() => {
  cleanup();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

interface RenderProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  type?: "view" | "edit";
  submitFormId?: string;
  submitLabel?: string;
}

function renderDrawer(props: RenderProps = {}) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  return render(
    <LeadDrawer
      open={props.open ?? true}
      onOpenChange={onOpenChange}
      title="Test drawer"
      type={props.type ?? "edit"}
      submitFormId={props.submitFormId}
      submitLabel={props.submitLabel}
    >
      <form id={props.submitFormId ?? "test-form"} data-testid="child-form">
        <input name="dummy" />
      </form>
    </LeadDrawer>,
  );
}

// ── Tests: type="view" ───────────────────────────────────────────────────────

describe("LeadDrawer — type=view", () => {
  it("does not render the footer (no Cancelar, no Guardar)", () => {
    renderDrawer({ type: "view", submitFormId: "any-form" });

    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
  });

  it("renders children regardless of type", () => {
    renderDrawer({ type: "view" });

    expect(screen.getByTestId("child-form")).toBeInTheDocument();
  });
});

// ── Tests: type="edit" ───────────────────────────────────────────────────────

describe("LeadDrawer — type=edit with submitFormId", () => {
  it("renders footer with Cancelar and Guardar buttons", () => {
    renderDrawer({ type: "edit", submitFormId: "test-form" });

    expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeInTheDocument();
  });

  it("binds the Guardar button to the submitFormId via the form attribute", () => {
    renderDrawer({ type: "edit", submitFormId: "my-custom-form" });

    const submitButton = screen.getByRole("button", { name: /guardar/i });
    expect(submitButton).toHaveAttribute("form", "my-custom-form");
  });

  it("uses a custom submitLabel when provided", () => {
    renderDrawer({ type: "edit", submitFormId: "test-form", submitLabel: "Editar" });

    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
  });

  it("triggers onOpenChange(false) when Cancelar is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    renderDrawer({
      type: "edit",
      submitFormId: "test-form",
      onOpenChange,
    });

    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("fires the submit event of the form identified by submitFormId", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent<HTMLFormElement>) => e.preventDefault());

    render(
      <LeadDrawer
        open
        onOpenChange={vi.fn()}
        title="Test"
        type="edit"
        submitFormId="real-form"
      >
        <form id="real-form" onSubmit={onSubmit} data-testid="real-form">
          <input name="dummy" defaultValue="x" />
        </form>
      </LeadDrawer>,
    );

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

// ── Tests: type="edit" sin submitFormId ──────────────────────────────────────

describe("LeadDrawer — type=edit without submitFormId", () => {
  it("does not render the Guardar button (degradación segura)", () => {
    renderDrawer({ type: "edit" });

    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
  });
});
