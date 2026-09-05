import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/utils/trpc", () => ({ trpc: { users: {
  updateCommercialRole: { mutationOptions: (options: object) => ({ mutationFn: mocks.mutate, ...options }) },
  accessDirectory: { queryKey: () => ["directory"] },
} } }));
vi.mock("@crm-fran/ui/components/select", () => ({
  Select: ({ value, onValueChange, disabled, items }: { value: string; onValueChange: (value: string) => void; disabled: boolean; items: { value: string; label: string }[] }) => <select aria-label="Role" value={value} disabled={disabled} onChange={(e) => onValueChange(e.target.value)}>{items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>,
  SelectContent: () => null, SelectGroup: () => null, SelectItem: () => null, SelectTrigger: () => null, SelectValue: () => null,
}));
import { CommercialRoleEditor } from "./users-access-view";
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, "confirm").mockReturnValue(true); });
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CommercialRoleEditor userId="commercial" name="Test" roleId="role-caller" /></QueryClientProvider>);
  return client;
}
describe("commercial role save recovery", () => {
  it("does not offer to save an already committed role when directory refresh fails", async () => {
    mocks.mutate.mockResolvedValue({ id: "commercial", roleId: "role-closer" });
    const client = setup();
    vi.spyOn(client, "invalidateQueries").mockRejectedValue(new Error("Refresh offline"));
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "role-closer" } });
    fireEvent.click(screen.getByText("Guardar rol"));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByText("Guardar rol")).toBeDisabled());
    expect(mocks.success).toHaveBeenCalledWith("Rol actualizado");
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("guardado"));
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["directory"] }, { throwOnError: true });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "role-caller-closer" } });
    fireEvent.click(screen.getByText("Guardar rol"));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
    expect(mocks.mutate.mock.calls[1]?.[0]).toEqual({ userId: "commercial", expectedRoleId: "role-closer", roleId: "role-caller-closer" });
  });
  it("keeps the prior role on mutation failure so retry uses the same concurrency guard", async () => {
    mocks.mutate.mockRejectedValue(new Error("Save offline"));
    setup();
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "role-closer" } });
    fireEvent.click(screen.getByText("Guardar rol"));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Save offline"));
    expect(screen.getByText("Guardar rol")).toBeEnabled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.mutate.mock.calls[0]?.[0]).toEqual({ userId: "commercial", expectedRoleId: "role-caller", roleId: "role-closer" });
  });
});
