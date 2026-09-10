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
      meta: { mobileHidden: true },
      header: "Caller",
      cell: ({ row }) => row.original.caller?.name ?? "Sin asignar",
    },
    {
      accessorKey: "closer",
      meta: { mobileHidden: true },
      header: "Closer",
      cell: ({ row }) => row.original.closer?.name ?? "Sin asignar",
    },
    {
      accessorKey: "scheduledDate",
      meta: { mobileHidden: true },
      header: "Fecha",
    },
    {
      accessorKey: "scheduledTime",
      meta: { mobileHidden: true },
      header: "Hora",
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => renderActions(row.original),
    },
  ];
}
