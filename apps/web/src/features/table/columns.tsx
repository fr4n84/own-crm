"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crm-fran/ui/components/select";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@crm-fran/ui/components/badge";
import type { Lead } from "../leads/assign-lead-drawer";
import { getLeadPoolProgress } from "../leads/lead-pool";
import { getCallerResponseStatus } from "../leads/response-status";
import { getCanonicalCallerFeedback } from "../leads/caller-feedback";

export function createLeadColumns(
  renderAction: (lead: Lead) => React.ReactNode,
  options: {
    variant?: "assigned" | "available";
    showRecoveryProgress?: boolean;
    readOnly?: boolean;
  } = {},
): ColumnDef<any>[] {
  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "name",
      header: "Nombre",
    },
    {
      accessorKey: "email",
      header: "Correo",
    },
    {
      accessorKey: "phone",
      header: "Teléfono",
    },
    {
      accessorKey: "state",
      header: "Estado",
      cell: ({ row }) => <Badge variant="outline">{row.original.state}</Badge>,
    },
    {
      accessorKey: "response",
      header: "Respuesta",
      cell: ({ row }) => getCallerResponseStatus(row.original.questions),
    },
    {
      accessorKey: "feedback",
      header: "Feedback",
      cell: ({ row }) => {
        const feedback = getCanonicalCallerFeedback(row.original.questions);
        return <Badge variant={feedback.value ? "secondary" : "outline"}>{feedback.label}</Badge>;
      },
    },
    {
      accessorKey: "callerId",
      header: "Caller",
      cell: ({ row }) => row.original.caller?.name ?? "Sin asignar",
    },
    {
      accessorKey: "closerId",
      header: "Closer",
      cell: ({ row }) => row.original.closer?.name ?? "Sin asignar",
    },
    {
      accessorKey: "createdAt",
      header: "Creado en",
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
    },
    {
      accessorKey: "updatedAt",
      header: "Actualizado en",
      cell: ({ row }) => new Date(row.original.updatedAt).toLocaleDateString(),
    },
    {
      id: "updatedAtTime",
      header: "Hora de actualización",
      cell: ({ row }) =>
        new Date(row.original.updatedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => renderAction(row.original),
    },
  ];

  if (options.showRecoveryProgress) {
    columns.splice(8, 0, {
      accessorKey: "noContactImpactCount",
      header: "Proceso",
      cell: ({ row }) => getLeadPoolProgress(row.original.noContactImpactCount),
    });
  }

  if (options.readOnly) {
    const actionsIndex = columns.findIndex((column) => column.id === "actions");
    if (actionsIndex >= 0) columns.splice(actionsIndex, 1);
  }

  if (options.variant !== "available") return columns;

  const assignedOnlyHeaders = new Set([
    "Respuesta",
    "Feedback",
    "Caller",
    "Closer",
  ]);

  return columns.filter(
    (column) =>
      typeof column.header !== "string" ||
      !assignedOnlyHeaders.has(column.header),
  );
}
