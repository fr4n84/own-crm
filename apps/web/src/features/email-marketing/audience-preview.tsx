"use client";

import { EyeIcon } from "lucide-react";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@crm-fran/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@crm-fran/ui/components/table";

export type AudiencePreviewItem = {
  id: string;
  decision: "included" | "excluded";
  reason: string;
  contact: { name: string; email: string; phone: string } | null;
  detail: {
    source: string | null;
    campaign: string | null;
    utmContent: string | null;
    theme: string | null;
    confirmedFeedback: string[];
  } | null;
};

const reasonLabels: Record<string, string> = {
  eligible: "Elegible ahora",
  missing_normalized_email: "Sin correo válido",
  no_active_consent: "Sin consentimiento activo",
  suppressed: "Suprimido",
  duplicate_normalized_email: "Correo duplicado",
  revoked: "Consentimiento revocado",
  missing_current_authority: "Sin autoridad vigente",
};

function DetailValue({ value }: { value: string | null | undefined }) {
  return <dd className="text-sm text-foreground">{value?.trim() || "Sin dato confirmado"}</dd>;
}

function AudienceDetail({ item }: { item: AudiencePreviewItem }) {
  const name = item.contact?.name ?? "Contacto anonimizado";
  return <Dialog>
    <DialogTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={"Ver detalle de " + name} />}>
      <EyeIcon aria-hidden="true" />
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Detalle de {name}</DialogTitle>
        <DialogDescription>Información comercial mínima. No se incluye en el CSV.</DialogDescription>
      </DialogHeader>
      <dl className="grid gap-3">
        <div><dt className="font-medium">Origen</dt><DetailValue value={item.detail?.source} /></div>
        <div><dt className="font-medium">Campaña</dt><DetailValue value={item.detail?.campaign} /></div>
        <div><dt className="font-medium">UTM</dt><DetailValue value={item.detail?.utmContent} /></div>
        <div><dt className="font-medium">Temática</dt><DetailValue value={item.detail?.theme} /></div>
        <div>
          <dt className="font-medium">Motivaciones confirmadas</dt>
          <DetailValue value={item.detail?.confirmedFeedback.join(", ")} />
        </div>
      </dl>
    </DialogContent>
  </Dialog>;
}

export function AudiencePreviewTable({ items }: { items: readonly AudiencePreviewItem[] }) {
  return <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Nombre</TableHead>
        <TableHead>Correo</TableHead>
        <TableHead>Teléfono</TableHead>
        <TableHead>Estado</TableHead>
        <TableHead><span className="sr-only">Detalle</span></TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {items.map((item) => <TableRow key={item.id}>
        <TableCell className="font-medium">{item.contact?.name ?? "Contacto anonimizado"}</TableCell>
        <TableCell>{item.contact?.email || "—"}</TableCell>
        <TableCell>{item.contact?.phone || "—"}</TableCell>
        <TableCell>
          <Badge variant={item.decision === "included" ? "secondary" : "outline"}>
            {reasonLabels[item.reason] ?? "Excluido"}
          </Badge>
        </TableCell>
        <TableCell><AudienceDetail item={item} /></TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
