import type { ColumnDef } from "@tanstack/react-table";

import type { AgendaLead } from "./agenda-utils";

export function createAgendaColumns(
  renderActions: (lead: AgendaLead) => React.ReactNode,
): ColumnDef<AgendaLead>[] {
  return [
    {
      accessorKey: "name",
      header: "Lead",
    },
    {
      accessorKey: "phone",
      header: "Teléfono",
      cell: ({ row }) => row.original.phone ?? "Sin teléfono",
    },
    {
      accessorKey: "caller",
      header: "Caller",
      cell: ({ row }) => row.original.caller?.name ?? "Sin asignar",
    },
    {
      accessorKey: "feedback",
      header: "Feedback del caller",
      cell: ({ row }) => row.original.feedback ?? "Sin feedback",
    },
    {
      accessorKey: "closer",
      header: "Closer",
      cell: ({ row }) => row.original.closer?.name ?? "Sin asignar",
    },
    {
      accessorKey: "closerOutcome",
      header: "Feedback closer",
      cell: ({ row }) => row.original.closerOutcome ?? "Sin feedback",
    },
    {
      accessorKey: "scheduledDate",
      header: "Fecha",
    },
    {
      accessorKey: "scheduledTime",
      header: "Hora",
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => renderActions(row.original),
    },
  ];
}
