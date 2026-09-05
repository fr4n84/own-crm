import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => ({ isPending: false }), signUp: { email: vi.fn() } } }));
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
});
