import { act, render } from "@testing-library/react";
import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssignedLeadsTable } from "@/features/leads/assigned-leads-table";
import LeadsPage from "./page";

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  useQuery: vi.fn(),
  listAllQueryOptions: vi.fn(() => ({})),
  listByUserIdQueryOptions: vi.fn(() => ({})),
  dateRangePickerOnChange: undefined as
    | ((range: { from?: string; to?: string }) => void)
    | undefined,
  dateFieldSelectOnValueChange: undefined as
    | ((value: string | null) => void)
    | undefined,
  dateFieldSelectValueLabel: undefined as string | undefined,
  closerSelectOnValueChange: undefined as
    | ((value: string | null) => void)
    | undefined,
  closerSelectValueLabel: undefined as string | undefined,
  closerSelectOptions: [] as { value: string; label: string }[],
  responseSelectOnValueChange: undefined as
    | ((value: string | null) => void)
    | undefined,
  responseSelectValueLabel: undefined as string | undefined,
  responseSelectOptions: [] as { value: string; label: string }[],
  feedbackSelectOnValueChange: undefined as
    | ((value: string | null) => void)
    | undefined,
  feedbackSelectValueLabel: undefined as string | undefined,
  feedbackSelectOptions: [] as { value: string; label: string }[],
  dataTableData: [] as unknown[][],
}));

function getCloserSelectValueLabel(children: ReactNode) {
  const selectTrigger = Children.toArray(children)[0];
  if (!isValidElement<{ children?: ReactNode }>(selectTrigger)) return undefined;

  const selectValue = Children.toArray(selectTrigger.props.children)[0];
  if (!isValidElement<{ children?: ReactNode }>(selectValue)) return undefined;

  return selectValue.props.children == null
    ? undefined
    : String(selectValue.props.children);
}

function getSelectTriggerAriaLabel(children: ReactNode) {
  const selectTrigger = Children.toArray(children)[0];
  if (!isValidElement<{ "aria-label"?: string }>(selectTrigger)) return undefined;

  return selectTrigger.props["aria-label"];
}

function getCloserSelectOptions(children: ReactNode) {
  const selectContent = Children.toArray(children)[1];
  if (!isValidElement<{ children?: ReactNode }>(selectContent)) return [];

  const selectGroup = Children.toArray(selectContent.props.children)[0];
  if (!isValidElement<{ children?: ReactNode }>(selectGroup)) return [];

  return Children.toArray(selectGroup.props.children).flatMap((child) => {
    if (!isValidElement<{ value: string; children: ReactNode }>(child)) return [];

    return [{
      value: child.props.value,
      label: String(child.props.children),
    }];
  });
}

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: mocks.useSession },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("@/utils/trpc", () => ({
  trpc: {
    leads: {
      listAll: { queryOptions: mocks.listAllQueryOptions },
      listByUserId: { queryOptions: mocks.listByUserIdQueryOptions },
    },
  },
}));

vi.mock("@/components/date-range-picker", () => ({
  DateRangePicker: (props: {
    onChange: (range: { from?: string; to?: string }) => void;
  }) => {
    mocks.dateRangePickerOnChange = props.onChange;
    return null;
  },
}));

vi.mock("@crm-fran/ui/components/data-table", () => ({
  DataTable: (props: { data: unknown[] }) => {
    mocks.dataTableData.push(props.data);
    return null;
  },
}));

vi.mock("@crm-fran/ui/components/select", () => ({
  Select: (props: {
    value: string;
    onValueChange: (value: string | null) => void;
    children?: ReactNode;
  }) => {
    if (props.value === "createdAt" || props.value === "updatedAt") {
      mocks.dateFieldSelectOnValueChange = props.onValueChange;
    mocks.dateFieldSelectValueLabel = getCloserSelectValueLabel(props.children);
    } else if (getSelectTriggerAriaLabel(props.children) === "Closer para filtrar") {
      mocks.closerSelectOnValueChange = props.onValueChange;
      mocks.closerSelectValueLabel = getCloserSelectValueLabel(props.children);
      mocks.closerSelectOptions = getCloserSelectOptions(props.children);
    } else if (getSelectTriggerAriaLabel(props.children) === "Respuesta para filtrar") {
      mocks.responseSelectOnValueChange = props.onValueChange;
      mocks.responseSelectValueLabel = getCloserSelectValueLabel(props.children);
      mocks.responseSelectOptions = getCloserSelectOptions(props.children);
    } else if (getSelectTriggerAriaLabel(props.children) === "Tipo de feedback") {
      mocks.feedbackSelectOnValueChange = props.onValueChange;
      mocks.feedbackSelectValueLabel = getCloserSelectValueLabel(props.children);
      mocks.feedbackSelectOptions = getCloserSelectOptions(props.children);
    }
    return null;
  },
  SelectContent: () => null,
  SelectGroup: () => null,
  SelectItem: () => null,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

vi.mock("@/features/table/columns", () => ({
  createLeadColumns: () => [],
}));

vi.mock("@/features/leads/lead-view-drawer", () => ({
  default: () => null,
}));

vi.mock("@/features/leads/assign-lead-drawer", () => ({
  default: () => null,
}));

describe("LeadsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dataTableData = [];
    mocks.dateFieldSelectOnValueChange = undefined;
    mocks.dateFieldSelectValueLabel = undefined;
    mocks.feedbackSelectOnValueChange = undefined;
    mocks.feedbackSelectValueLabel = undefined;
    mocks.feedbackSelectOptions = [];
    mocks.closerSelectOnValueChange = undefined;
    mocks.closerSelectValueLabel = undefined;
    mocks.closerSelectOptions = [];
    mocks.responseSelectOnValueChange = undefined;
    mocks.responseSelectValueLabel = undefined;
    mocks.responseSelectOptions = [];
    mocks.useQuery.mockReturnValue({ data: [], isLoading: false });
  });

  it("does not enable a leads query while the session is pending", () => {
    mocks.useSession.mockReturnValue({ data: undefined, isPending: true });

    render(<LeadsPage />);

    expect(mocks.useQuery).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ enabled: false })
    );
    expect(mocks.useQuery).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ enabled: false })
    );
  });

  it("adds horizontal breathing room around the assigned lead filters", () => {
    mocks.useSession.mockReturnValue({
      data: { user: { roleId: "role-caller" } },
      isPending: false,
    });

    const { container } = render(<LeadsPage />);

    expect(
      container.querySelector('[data-slot="assigned-lead-filters"]'),
    ).toHaveClass("px-4", "lg:px-6");
  });

  it("keeps assigned VSL leads out of Leads personales", () => {
    mocks.useSession.mockReturnValue({
      data: { user: { roleId: "role-caller" } },
      isPending: false,
    });
    const maestraLead = {
      id: "maestra-lead",
      type: "maestra",
      callerId: "caller-1",
      closerId: null,
      questions: [],
      createdAt: new Date(2026, 0, 15, 12),
      updatedAt: new Date(2026, 0, 15, 12),
    };
    const vslLead = {
      ...maestraLead,
      id: "vsl-lead",
      type: "vsl",
    };
    mocks.useQuery.mockReturnValue({
      data: [maestraLead, vslLead],
      isLoading: false,
    });

    render(<LeadsPage />);

    expect(mocks.dataTableData.at(-1)).toEqual([maestraLead]);
  });

  it("shows only assigned VSL leads in the VSL assigned section", () => {
    mocks.useSession.mockReturnValue({
      data: { user: { roleId: "role-admin" } },
      isPending: false,
    });
    const assignedVslLead = {
      id: "assigned-vsl",
      type: "vsl",
      callerId: "caller-1",
      closerId: null,
      questions: [],
      createdAt: new Date(2026, 0, 15, 12),
      updatedAt: new Date(2026, 0, 15, 12),
    };
    const availableVslLead = {
      ...assignedVslLead,
      id: "available-vsl",
      callerId: null,
    };
    mocks.useQuery.mockReturnValue({
      data: [assignedVslLead, availableVslLead],
      isLoading: false,
    });

    render(
      <AssignedLeadsTable
        type="vsl"
        title="Leads VSL asignados"
        description="Assigned VSL leads"
        assignedOnly
      />,
    );

    expect(mocks.dataTableData.at(-1)).toEqual([assignedVslLead]);
  });

  it("filters loaded leads locally when the selected date field changes", () => {
    mocks.useSession.mockReturnValue({
      data: { user: { roleId: "role-admin" } },
      isPending: false,
    });
    const createdAtMatch = {
      id: "created-at-match",
      type: "maestra",
      createdAt: new Date(2026, 0, 15, 12),
      updatedAt: new Date(2026, 1, 15, 12),
    };
    const updatedAtMatch = {
      id: "updated-at-match",
      type: "maestra",
      createdAt: new Date(2026, 1, 15, 12),
      updatedAt: new Date(2026, 0, 15, 12),
    };
    mocks.useQuery.mockReturnValue({
      data: [createdAtMatch, updatedAtMatch],
      isLoading: false,
    });

    render(<LeadsPage />);

    expect(mocks.dateFieldSelectValueLabel).toBe("Fecha de creación");

    expect(mocks.listAllQueryOptions).toHaveBeenCalledWith();
    expect(mocks.listByUserIdQueryOptions).toHaveBeenCalledWith();

    act(() => {
      mocks.dateRangePickerOnChange?.({
        from: "2026-01-01",
        to: "2026-01-31",
      });
    });

    expect(mocks.dataTableData.at(-1)).toEqual([createdAtMatch]);

    act(() => {
      mocks.dateFieldSelectOnValueChange?.("updatedAt");
    });

    expect(mocks.dataTableData.at(-1)).toEqual([updatedAtMatch]);
    expect(mocks.dateFieldSelectValueLabel).toBe("Fecha de actualización");
    expect(
      mocks.listAllQueryOptions.mock.calls.every((args) => args.length === 0)
    ).toBe(true);
    expect(
      mocks.listByUserIdQueryOptions.mock.calls.every((args) => args.length === 0)
    ).toBe(true);
  });

  it("filters loaded leads by closer independently from the date range", () => {
    mocks.useSession.mockReturnValue({
      data: { user: { roleId: "role-admin" } },
      isPending: false,
    });
    const closerAMatch = {
      id: "closer-a-match",
      type: "maestra",
      closerId: "closer-a",
      closer: { id: "closer-a", name: "Ana Closer" },
      createdAt: new Date(2026, 0, 15, 12),
      updatedAt: new Date(2026, 0, 15, 12),
    };
    const closerADuplicate = {
      id: "closer-a-duplicate",
      type: "maestra",
      closerId: "closer-a",
      closer: { id: "closer-a", name: "Ana Closer" },
      createdAt: new Date(2026, 0, 16, 12),
      updatedAt: new Date(2026, 0, 16, 12),
    };
    const closerBWithoutName = {
      id: "closer-b-without-name",
      type: "maestra",
      closerId: "closer-b",
      closer: { id: "closer-b" },
      createdAt: new Date(2026, 0, 19, 12),
      updatedAt: new Date(2026, 0, 19, 12),
    };
    const closerBMatch = {
      id: "closer-b-match",
      type: "maestra",
      closerId: "closer-b",
      closer: null,
      createdAt: new Date(2026, 0, 20, 12),
      updatedAt: new Date(2026, 0, 20, 12),
    };
    const unassignedLead = {
      id: "unassigned-lead",
      type: "maestra",
      closerId: null,
      createdAt: new Date(2026, 0, 25, 12),
      updatedAt: new Date(2026, 0, 25, 12),
    };
    mocks.useQuery.mockReturnValue({
      data: [
        closerAMatch,
        closerADuplicate,
        closerBWithoutName,
        closerBMatch,
        unassignedLead,
      ],
      isLoading: false,
    });

    render(<LeadsPage />);

    expect(mocks.dataTableData.at(-1)).toEqual([
      closerAMatch,
      closerADuplicate,
      closerBWithoutName,
      closerBMatch,
      unassignedLead,
    ]);
    expect(mocks.closerSelectOptions).toEqual([
      { value: "all", label: "Todos los closers" },
      { value: "closer-a", label: "Ana Closer" },
      { value: "closer-b", label: "Sin asignar" },
    ]);
    expect(mocks.closerSelectValueLabel).toBe("Todos los closers");
    expect(mocks.listAllQueryOptions).toHaveBeenCalledWith();
    expect(mocks.listByUserIdQueryOptions).toHaveBeenCalledWith();

    act(() => {
      mocks.closerSelectOnValueChange?.("closer-a");
    });

    expect(mocks.dataTableData.at(-1)).toEqual([closerAMatch, closerADuplicate]);
    expect(mocks.closerSelectValueLabel).toBe("Ana Closer");

    act(() => {
      mocks.closerSelectOnValueChange?.("closer-b");
    });

    expect(mocks.dataTableData.at(-1)).toEqual([closerBWithoutName, closerBMatch]);
    expect(mocks.closerSelectValueLabel).toBe("Sin asignar");

    act(() => {
      mocks.closerSelectOnValueChange?.("all");
    });

    expect(mocks.closerSelectValueLabel).toBe("Todos los closers");

    act(() => {
      mocks.dateRangePickerOnChange?.({
        from: "2026-01-01",
        to: "2026-01-16",
      });
    });

    expect(mocks.dataTableData.at(-1)).toEqual([closerAMatch, closerADuplicate]);
    expect(mocks.dataTableData.at(-1)).toEqual([closerAMatch, closerADuplicate]);
    expect(
      mocks.listAllQueryOptions.mock.calls.every((args) => args.length === 0)
    ).toBe(true);
    expect(
      mocks.listByUserIdQueryOptions.mock.calls.every((args) => args.length === 0)
    ).toBe(true);
  });

  it("clears an unavailable closer selection before it can reactivate", () => {
    mocks.useSession.mockReturnValue({
      data: { user: { roleId: "role-admin" } },
      isPending: false,
    });
    const closerALead = {
      id: "closer-a-lead",
      type: "maestra",
      closerId: "closer-a",
      createdAt: new Date(2026, 0, 15, 12),
      updatedAt: new Date(2026, 0, 15, 12),
    };
    const closerBLead = {
      id: "closer-b-lead",
      type: "maestra",
      closerId: "closer-b",
      createdAt: new Date(2026, 0, 20, 12),
      updatedAt: new Date(2026, 0, 20, 12),
    };
    let loadedLeads = [closerALead, closerBLead];
    mocks.useQuery.mockImplementation(() => ({
      data: loadedLeads,
      isLoading: false,
    }));

    const { rerender } = render(<LeadsPage />);

    act(() => {
      mocks.closerSelectOnValueChange?.("closer-a");
    });

    expect(mocks.dataTableData.at(-1)).toEqual([closerALead]);

    loadedLeads = [closerBLead];
    rerender(<LeadsPage />);

    expect(mocks.dataTableData.at(-1)).toEqual([closerBLead]);

    loadedLeads = [closerALead, closerBLead];
    rerender(<LeadsPage />);

    expect(mocks.dataTableData.at(-1)).toEqual([closerALead, closerBLead]);
  });

  it("filters loaded leads by caller response independently and restores the other filters", () => {
    mocks.useSession.mockReturnValue({
      data: { user: { roleId: "role-admin" } },
      isPending: false,
    });
    const callerYes = {
      id: "caller-yes",
      type: "maestra",
      closerId: "closer-a",
      closer: { id: "closer-a", name: "Ana Closer" },
      createdAt: new Date(2026, 0, 15, 12),
      updatedAt: new Date(2026, 0, 15, 12),
      questions: [
        { questionKey: "isContacted", answer: "Si", authorRole: "caller" },
      ],
    };
    const callerNo = {
      id: "caller-no",
      type: "maestra",
      closerId: "closer-a",
      closer: { id: "closer-a", name: "Ana Closer" },
      createdAt: new Date(2026, 0, 20, 12),
      updatedAt: new Date(2026, 0, 20, 12),
      questions: [
        { questionKey: "isContacted", answer: "No", authorRole: "caller" },
      ],
    };
    const noCallerResponse = {
      id: "no-caller-response",
      type: "maestra",
      closerId: "closer-b",
      closer: { id: "closer-b", name: "Bruno Closer" },
      createdAt: new Date(2026, 0, 25, 12),
      updatedAt: new Date(2026, 0, 25, 12),
      questions: [
        { questionKey: "isContacted", answer: "Si", authorRole: "closer" },
      ],
    };
    mocks.useQuery.mockReturnValue({
      data: [callerYes, callerNo, noCallerResponse],
      isLoading: false,
    });

    render(<LeadsPage />);

    expect(mocks.responseSelectOptions).toEqual([
      { value: "all", label: "Todas las respuestas" },
      { value: "Si", label: "Si" },
      { value: "No", label: "No" },
      { value: "Sin asignar", label: "Sin asignar" },
    ]);
    expect(mocks.responseSelectValueLabel).toBe("Todas las respuestas");
    expect(mocks.dataTableData.at(-1)).toEqual([
      callerYes,
      callerNo,
      noCallerResponse,
    ]);

    act(() => {
      mocks.responseSelectOnValueChange?.("Si");
    });

    expect(mocks.dataTableData.at(-1)).toEqual([callerYes]);
    expect(mocks.responseSelectValueLabel).toBe("Si");

    act(() => {
      mocks.responseSelectOnValueChange?.("No");
    });

    expect(mocks.dataTableData.at(-1)).toEqual([callerNo]);
    expect(mocks.responseSelectValueLabel).toBe("No");

    act(() => {
      mocks.responseSelectOnValueChange?.("Sin asignar");
    });

    expect(mocks.dataTableData.at(-1)).toEqual([noCallerResponse]);
    expect(mocks.responseSelectValueLabel).toBe("Sin asignar");

    act(() => {
      mocks.closerSelectOnValueChange?.("closer-a");
    });
    act(() => {
      mocks.responseSelectOnValueChange?.("all");
    });

    expect(mocks.dataTableData.at(-1)).toEqual([callerYes, callerNo]);
    expect(mocks.responseSelectValueLabel).toBe("Todas las respuestas");
  });

  it("combines Tipo de feedback with response while keeping both filters independent", () => {
    const lead = (id: string, response: "Si" | "No", outcome?: "Agenda" | "No encaja") => ({
      id,
      type: "maestra",
      callerId: "caller-a",
      closerId: null,
      caller: { id: "caller-a", name: "Caller A" },
      closer: null,
      createdAt: new Date(2026, 0, 15),
      updatedAt: new Date(2026, 0, 15),
      questions: [
        { questionKey: "isContacted", answer: response, authorRole: "caller" },
        ...(outcome ? [{ questionKey: "callerOutcome", answer: outcome, authorRole: "caller" }] : []),
      ],
    });
    const agendaYes = lead("agenda-yes", "Si", "Agenda");
    const notFitYes = lead("not-fit-yes", "Si", "No encaja");
    const agendaNo = lead("agenda-no", "No", "Agenda");
    mocks.useQuery.mockReturnValue({ data: [agendaYes, notFitYes, agendaNo], isLoading: false });

    render(<LeadsPage />);
    expect(mocks.feedbackSelectOptions).toContainEqual({ value: "none", label: "Sin feedback" });

    act(() => mocks.feedbackSelectOnValueChange?.("appointment"));
    expect(mocks.dataTableData.at(-1)).toEqual([agendaYes, agendaNo]);

    act(() => mocks.responseSelectOnValueChange?.("Si"));
    expect(mocks.dataTableData.at(-1)).toEqual([agendaYes]);

    act(() => mocks.feedbackSelectOnValueChange?.("all"));
    expect(mocks.dataTableData.at(-1)).toEqual([agendaYes, notFitYes]);
  });
});
