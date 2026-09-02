import { describe, expect, it } from "vitest";
import { createLeadColumns } from "./columns";

type LeadRow = {
  caller?: { id: string; name: string | null } | null;
  closer?: { id: string; name: string | null } | null;
  questions?: Array<{
    questionKey: string;
    answer: string;
    authorRole: "caller" | "closer";
  }>;
  response?: string;
  updatedAt?: Date | string;
};

function getColumn(header: string) {
  const column = createLeadColumns(() => null).find(
    (column) => column.header === header,
  );

  if (!column || typeof column.cell !== "function") {
    throw new Error(`Column ${header} does not expose a cell renderer`);
  }

  return { column, cell: column.cell };
}

function renderCell(header: string, row: LeadRow) {
  return getColumn(header).cell({ row: { original: row } } as never);
}

function getAccessorKey(column: ReturnType<typeof createLeadColumns>[number] | undefined) {
  return column && "accessorKey" in column ? column.accessorKey : undefined;
}

describe("Lead user columns", () => {
  it("omits assignment and feedback columns from available lead queues", () => {
    const headers = createLeadColumns(() => null, {
      variant: "available",
    }).map((column) => column.header);

    expect(headers).not.toContain("Respuesta");
    expect(headers).not.toContain("Feedback");
    expect(headers).not.toContain("Caller");
    expect(headers).not.toContain("Closer");
    expect(headers).toContain("Acciones");
  });

  it("renders caller and closer names for assigned users", () => {
    const row = {
      caller: { id: "caller-1", name: "Ana Caller" },
      closer: { id: "closer-1", name: "Bruno Closer" },
    };

    expect(renderCell("Caller", row)).toBe("Ana Caller");
    expect(renderCell("Closer", row)).toBe("Bruno Closer");
  });

  it("renders Sin asignar for missing relations or names", () => {
    expect(
      renderCell("Caller", { caller: null, closer: { id: "closer-1", name: null } }),
    ).toBe("Sin asignar");
    expect(
      renderCell("Closer", { caller: undefined, closer: undefined }),
    ).toBe("Sin asignar");
  });

  it("uses name-based headers instead of ID headers", () => {
    const columns = createLeadColumns(() => null);
    const headers = columns.map((column) => column.header);

    expect(headers).toContain("Caller");
    expect(headers).toContain("Closer");
    expect(headers).not.toContain("Caller ID");
    expect(headers).not.toContain("Closer ID");
  });

  it("renders the update time and keeps the update date column", () => {
    const updatedAt = new Date("2026-08-08T14:05:00.000Z");
    const row = { updatedAt };
    const columns = createLeadColumns(() => null);
    const headers = columns.map((column) => column.header);
    const dateColumn = columns.find(
      (column) => column.header === "Actualizado en",
    );
    const timeColumn = columns.find(
      (column) => column.header === "Hora de actualización",
    );

    expect(headers).toContain("Actualizado en");
    expect(getAccessorKey(dateColumn)).toBe("updatedAt");
    expect(timeColumn?.id).toBe("updatedAtTime");
    expect(getAccessorKey(timeColumn)).toBeUndefined();
    expect(renderCell("Hora de actualización", row)).toBe(
      updatedAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  });
});

describe("Lead response status column", () => {
  it("renders Si from a caller isContacted answer", () => {
    const row = {
      response: "No",
      questions: [
        { questionKey: "isContacted", answer: "Si", authorRole: "caller" as const },
      ],
    };

    expect(renderCell("Respuesta", row)).toBe("Si");
  });

  it("renders No from a caller isContacted answer", () => {
    const row = {
      response: "Si",
      questions: [
        { questionKey: "isContacted", answer: "No", authorRole: "caller" as const },
      ],
    };

    expect(renderCell("Respuesta", row)).toBe("No");
  });

  it("renders Sin asignar when there is no caller response", () => {
    expect(renderCell("Respuesta", { questions: [] })).toBe("Sin asignar");
  });

  it("ignores closer-only isContacted responses", () => {
    const row = {
      questions: [
        { questionKey: "isContacted", answer: "Si", authorRole: "closer" as const },
      ],
    };

    expect(renderCell("Respuesta", row)).toBe("Sin asignar");
  });

  it("uses the latest matching caller isContacted answer", () => {
    const row = {
      questions: [
        { questionKey: "isContacted", answer: "Si", authorRole: "caller" as const },
        { questionKey: "isDecisionMaker", answer: "No", authorRole: "caller" as const },
        { questionKey: "isContacted", answer: "No", authorRole: "caller" as const },
      ],
    };

    expect(renderCell("Respuesta", row)).toBe("No");
  });

  it("renders Sin asignar for an unknown caller answer", () => {
    const row = {
      questions: [
        { questionKey: "isContacted", answer: "Maybe", authorRole: "caller" as const },
      ],
    };

    expect(renderCell("Respuesta", row)).toBe("Sin asignar");
  });
});
