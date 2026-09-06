import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => ({ isPending: false }), signUp: { email: mocks.signUp } } }));
import SignUpForm from "./sign-up-form";
afterEach(cleanup);
describe("public signup commercial roles", () => {
  it("shows readable labels after selection and never offers Admin", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    const role = screen.getByRole("combobox");
    await user.click(role);
    expect(screen.queryByRole("option", { name: "Admin" })).toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    await user.click(screen.getByRole("option", { name: "Hybrid" }));
    expect(role).toHaveTextContent("Hybrid");
    expect(role).not.toHaveTextContent("role-caller-closer");
  });
  it("finishes on a pending-approval message without entering the CRM", async () => {
    mocks.signUp.mockImplementation(async (_input, callbacks) => callbacks.onSuccess());
    const user = userEvent.setup();
    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Name"), "Ana Test");
    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    await user.type(screen.getByLabelText("Password"), "safe-password");
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Caller" }));
    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("pendiente de aprobación"));
    expect(screen.getByRole("link", { name: "Volver a iniciar sesión" })).toHaveAttribute("href", "/login");
  });
});
