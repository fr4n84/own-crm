"use client";

import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveIcon,
  BotIcon,
  InfoIcon,
  LinkIcon,
  MegaphoneIcon,
  RefreshCwIcon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";

import type { AppRouter } from "@crm-fran/api/routers/index";
import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import { Checkbox } from "@crm-fran/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crm-fran/ui/components/dialog";
import { Empty } from "@crm-fran/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@crm-fran/ui/components/popover";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@crm-fran/ui/components/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@crm-fran/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";
import { Textarea } from "@crm-fran/ui/components/textarea";

import { trpc } from "@/utils/trpc";

type Overview = inferRouterOutputs<AppRouter>["marketingAttribution"]["overview"];
type Mapping = Overview["mappings"][number];
type UnmappedCode = Overview["unmappedCodes"][number];
type MarketingAnalysis = inferRouterOutputs<AppRouter>["marketingAttribution"]["analyzeTranscript"];
type UploadedMedia = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
};
type CreativeFormat = "video" | "image" | "audio" | "text" | "other";

type MappingForm = {
  ruleLineageKey?: string;
  creativeLineageKey?: string;
  leadSource: string;
  utmContent: string;
  validFrom: string;
  validTo: string;
  campaignSource: string;
  campaignName: string;
  campaignExternalId: string;
  creativeName: string;
  creativeFormat: CreativeFormat;
  transcript: string;
  angleName: string;
  angleDescription: string;
  hook: string;
  promise: string;
  cta: string;
  targetProfile: string;
  objections: string;
  awarenessStage: string;
  reprocessExisting: boolean;
};

const emptyForm: MappingForm = {
  leadSource: "",
  utmContent: "",
  validFrom: "",
  validTo: "",
  campaignSource: "",
  campaignName: "",
  campaignExternalId: "",
  creativeName: "",
  creativeFormat: "video",
  transcript: "",
  angleName: "",
  angleDescription: "",
  hook: "",
  promise: "",
  cta: "",
  targetProfile: "",
  objections: "",
  awarenessStage: "",
  reprocessExisting: false,
};

function Info({ label, title, children }: { label: string; title: string; children: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label={label} />}
      >
        <InfoIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="dashboard-arc-theme" align="start">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{children}</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(date);
}

function dateInputValue(value: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function splitObjections(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function PerformanceTable({ rows }: { rows: Overview["performance"]["campaigns"] }) {
  if (rows.length === 0) {
    return <Empty heading="Sin rendimiento atribuible" description="Relaciona códigos UTM para activar esta comparación." />;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Elemento</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Agendas</TableHead>
            <TableHead className="text-right">Conversión agenda</TableHead>
            <TableHead className="text-right">Ventas</TableHead>
            <TableHead className="text-right">Conversión venta</TableHead>
            <TableHead className="text-right">No-show</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.label}</TableCell>
              <TableCell className="text-right tabular-nums">{row.leads}</TableCell>
              <TableCell className="text-right tabular-nums">{row.appointments}</TableCell>
              <TableCell className="text-right tabular-nums">{row.appointmentRate}%</TableCell>
              <TableCell className="text-right tabular-nums">{row.sales}</TableCell>
              <TableCell className="text-right tabular-nums">{row.saleRate}%</TableCell>
              <TableCell className="text-right tabular-nums">{row.noShows}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function MarketingLibraryPanel() {
  const queryClient = useQueryClient();
  const overview = useQuery(trpc.marketingAttribution.overview.queryOptions());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<MappingForm>(emptyForm);
  const [asset, setAsset] = useState<File | null>(null);
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<MarketingAnalysis | undefined>();
  const [isUploading, setIsUploading] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.marketingAttribution.overview.queryKey(),
    });
  };
  const saveMapping = useMutation(
    trpc.marketingAttribution.saveMapping.mutationOptions({
      onSuccess: async (result) => {
        toast.success(`Relación guardada: ${result.processed} leads procesados`);
        setDialogOpen(false);
        setForm(emptyForm);
        setAsset(null);
        setUploadedMedia(null);
        setAiAnalysis(undefined);
        await invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const analyzeTranscript = useMutation(
    trpc.marketingAttribution.analyzeTranscript.mutationOptions({
      onSuccess: (analysis) => {
        setAiAnalysis(analysis);
        setForm((current) => ({
          ...current,
          angleName: analysis.angleSuggestion ?? current.angleName,
          hook: analysis.hook ?? current.hook,
          promise: analysis.promise ?? current.promise,
          cta: analysis.cta ?? current.cta,
          targetProfile: analysis.targetProfile ?? current.targetProfile,
          objections: analysis.objections.join(", "),
          awarenessStage: analysis.awarenessStage ?? current.awarenessStage,
        }));
        toast.success("Sugerencias preparadas para tu revisión");
      },
      onError: () => toast.error("No se pudo analizar la transcripción"),
    }),
  );
  const archiveMapping = useMutation(
    trpc.marketingAttribution.archiveMapping.mutationOptions({
      onSuccess: async () => {
        toast.success("Relación archivada");
        await invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const resolvePending = useMutation(
    trpc.marketingAttribution.resolvePending.mutationOptions({
      onSuccess: async (result) => {
        toast.success(`${result.processed} leads pendientes relacionados`);
        await invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const update = <Key extends keyof MappingForm>(key: Key, value: MappingForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openNew = (code?: UnmappedCode) => {
    setForm({
      ...emptyForm,
      leadSource: code?.source ?? "",
      utmContent: code?.utmContent ?? "",
      campaignSource: code?.source ?? "",
    });
    setAsset(null);
    setUploadedMedia(null);
    setAiAnalysis(undefined);
    setDialogOpen(true);
  };

  const openEdit = (mapping: Mapping) => {
    setForm({
      ...emptyForm,
      ruleLineageKey: mapping.lineageKey,
      creativeLineageKey: mapping.creative.lineageKey,
      leadSource: mapping.leadSource ?? "",
      utmContent: mapping.utmContent,
      validFrom: dateInputValue(mapping.validFrom),
      validTo: dateInputValue(mapping.validTo),
      campaignSource: mapping.campaign.source,
      campaignName: mapping.campaign.name,
      campaignExternalId: mapping.campaign.externalId ?? "",
      creativeName: mapping.creative.name,
      creativeFormat: mapping.creative.format,
      transcript: mapping.creative.transcript ?? "",
      angleName: mapping.angle?.name ?? "",
      angleDescription: mapping.angle?.description ?? "",
      hook: mapping.creative.hook ?? "",
      promise: mapping.creative.promise ?? "",
      cta: mapping.creative.cta ?? "",
      targetProfile: mapping.creative.targetProfile ?? "",
      objections: mapping.creative.objections.join(", "),
      awarenessStage: mapping.creative.awarenessStage ?? "",
    });
    setAsset(null);
    setUploadedMedia(
      mapping.creative.assetStorageKey &&
        mapping.creative.assetFileName &&
        mapping.creative.assetMimeType &&
        mapping.creative.assetSizeBytes &&
        mapping.creative.assetChecksum
        ? {
            storageKey: mapping.creative.assetStorageKey,
            fileName: mapping.creative.assetFileName,
            mimeType: mapping.creative.assetMimeType,
            sizeBytes: mapping.creative.assetSizeBytes,
            checksum: mapping.creative.assetChecksum,
          }
        : null,
    );
    setAiAnalysis(
      Object.keys(mapping.creative.aiAnalysis).length > 0
        ? {
            angleSuggestion: mapping.creative.aiAnalysis.angleSuggestion ?? null,
            hook: mapping.creative.aiAnalysis.hook ?? null,
            promise: mapping.creative.aiAnalysis.promise ?? null,
            cta: mapping.creative.aiAnalysis.cta ?? null,
            targetProfile: mapping.creative.aiAnalysis.targetProfile ?? null,
            objections: mapping.creative.aiAnalysis.objections ?? [],
            awarenessStage: mapping.creative.aiAnalysis.awarenessStage ?? null,
            confidence: mapping.creative.aiAnalysis.confidence ?? 0,
            model: mapping.creative.aiAnalysis.model ?? "",
            analyzedAt: mapping.creative.aiAnalysis.analyzedAt ?? new Date().toISOString(),
          }
        : undefined,
    );
    setDialogOpen(true);
  };

  const uploadAsset = async () => {
    if (!asset) return;
    setIsUploading(true);
    try {
      const payload = new FormData();
      payload.append("asset", asset);
      payload.append(
        "transcribe",
        String(/^(audio|video)\//.test(asset.type) && asset.size <= 25 * 1024 * 1024),
      );
      const response = await fetch("/api/marketing-assets", {
        method: "POST",
        body: payload,
        credentials: "include",
      });
      const result = (await response.json()) as UploadedMedia & {
        transcript?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "No se pudo subir el anuncio");
      setUploadedMedia(result);
      if (result.transcript) update("transcript", result.transcript);
      toast.success(result.transcript ? "Anuncio subido y transcrito" : "Anuncio subido");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir el anuncio");
    } finally {
      setIsUploading(false);
    }
  };

  const submit = () => {
    saveMapping.mutate({
      ruleLineageKey: form.ruleLineageKey,
      creativeLineageKey: form.creativeLineageKey,
      leadSource: form.leadSource || null,
      utmContent: form.utmContent,
      validFrom: form.validFrom || null,
      validTo: form.validTo || null,
      campaignSource: form.campaignSource,
      campaignName: form.campaignName,
      campaignExternalId: form.campaignExternalId || null,
      creativeName: form.creativeName,
      creativeFormat: form.creativeFormat,
      media: uploadedMedia,
      transcript: form.transcript || null,
      angleName: form.angleName || null,
      angleDescription: form.angleDescription || null,
      hook: form.hook || null,
      promise: form.promise || null,
      cta: form.cta || null,
      targetProfile: form.targetProfile || null,
      objections: splitObjections(form.objections),
      awarenessStage: form.awarenessStage || null,
      aiAnalysis,
      reprocessExisting: form.reprocessExisting,
    });
  };

  if (overview.isPending) {
    return <section className="grid gap-4 md:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-72 md:col-span-2" /></section>;
  }
  if (overview.isError || !overview.data) {
    return <Empty heading="No se pudo cargar la biblioteca publicitaria" description="Comprueba tus permisos y la conexión con la base de datos." />;
  }

  const data = overview.data;
  const activeMappings = data.mappings.filter((mapping) => mapping.status === "published");

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <h2 className="text-xl font-semibold">Biblioteca publicitaria</h2>
            <Info
              label="Información sobre la biblioteca publicitaria"
              title="Del código UTM al resultado comercial"
            >
              Cada relación une el origen y utm_content del lead con una campaña, una versión exacta del anuncio y su ángulo. Las versiones anteriores permanecen disponibles para no alterar el historial. La IA solo propone campos a partir de la transcripción: una persona revisa y confirma antes de guardar.
            </Info>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Sube anuncios, revisa su transcripción y convierte códigos opacos en información útil para Observatorio, Inteligencia, Rentabilidad y Playbooks.
          </p>
        </div>
        <Button onClick={() => openNew()}>
          <LinkIcon data-icon="inline-start" />
          Nueva relación
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card size="sm">
          <CardHeader><CardTitle>Cobertura UTM</CardTitle><CardDescription>Leads con código ya interpretado.</CardDescription></CardHeader>
          <CardContent>
            <Progress value={data.coverage.coveragePercent}>
              <ProgressLabel>{data.coverage.attributedLeads} de {data.coverage.leadsWithUtm}</ProgressLabel>
              <ProgressValue />
            </Progress>
          </CardContent>
        </Card>
        <Card size="sm"><CardHeader><CardTitle>Códigos pendientes</CardTitle><CardDescription>Combinaciones distintas sin relación.</CardDescription></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{data.unmappedCodes.length}</CardContent></Card>
        <Card size="sm"><CardHeader><CardTitle>Leads pendientes</CardTitle><CardDescription>Con UTM pero sin anuncio identificado.</CardDescription></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{data.coverage.unmappedLeads}</CardContent></Card>
        <Card size="sm"><CardHeader><CardTitle>Relaciones activas</CardTitle><CardDescription>Reglas publicadas y disponibles.</CardDescription></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{activeMappings.length}</CardContent></Card>
      </div>

      <Tabs defaultValue="pending" className="gap-3">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="pending">Códigos pendientes</TabsTrigger>
          <TabsTrigger value="mappings">Relaciones activas</TabsTrigger>
          <TabsTrigger value="performance">Rendimiento</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Códigos pendientes</CardTitle>
              <CardDescription>Prioriza los códigos con más leads. La fuente vacía representa importaciones antiguas sin source.</CardDescription>
              <CardAction>
                <Button variant="outline" size="sm" disabled={resolvePending.isPending} onClick={() => resolvePending.mutate()}>
                  <RefreshCwIcon data-icon="inline-start" />
                  Procesar reglas existentes
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {data.unmappedCodes.length === 0 ? (
                <Empty heading="Todos los códigos están relacionados" description="Los nuevos leads se resolverán automáticamente al entrar." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>utm_content</TableHead><TableHead>Origen del lead</TableHead><TableHead className="text-right">Leads</TableHead><TableHead>Actividad observada</TableHead><TableHead className="text-right">Acción</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.unmappedCodes.map((code) => (
                        <TableRow key={`${code.source ?? ""}:${code.utmContent}`}>
                          <TableCell className="font-mono text-xs">{code.utmContent}</TableCell>
                          <TableCell>{code.source || <Badge variant="outline">Sin fuente</Badge>}</TableCell>
                          <TableCell className="text-right tabular-nums">{code.leadCount}</TableCell>
                          <TableCell>{formatDate(code.firstSeenAt)} – {formatDate(code.lastSeenAt)}</TableCell>
                          <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => openNew(code)}>Relacionar</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mappings">
          <Card size="sm">
            <CardHeader><CardTitle>Relaciones activas</CardTitle><CardDescription>Cada edición crea nuevas versiones de la regla y del anuncio.</CardDescription></CardHeader>
            <CardContent>
              {data.mappings.length === 0 ? (
                <Empty heading="Todavía no hay relaciones" description="Relaciona el primer código UTM con su anuncio." />
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {data.mappings.map((mapping) => (
                    <Card key={mapping.id} size="sm">
                      <CardHeader>
                        <CardTitle>{mapping.creative.name}</CardTitle>
                        <CardDescription>{mapping.campaign.source} · {mapping.campaign.name} · v{mapping.version}</CardDescription>
                        <CardAction><Badge variant={mapping.status === "published" ? "secondary" : "outline"}>{mapping.status === "published" ? "Activa" : "Archivada"}</Badge></CardAction>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        {mapping.creative.assetUrl && mapping.creative.assetMimeType?.startsWith("image/") && <img src={mapping.creative.assetUrl} alt={mapping.creative.name} className="max-h-52 w-full rounded-md object-contain" />}
                        {mapping.creative.assetUrl && mapping.creative.assetMimeType?.startsWith("video/") && <video src={mapping.creative.assetUrl} controls preload="metadata" className="max-h-52 w-full rounded-md" />}
                        {mapping.creative.assetUrl && mapping.creative.assetMimeType?.startsWith("audio/") && <audio src={mapping.creative.assetUrl} controls preload="metadata" className="w-full" />}
                        <div className="flex flex-wrap gap-2"><Badge variant="outline">{mapping.utmContent}</Badge><Badge variant="outline">{mapping.leadSource || "Sin fuente en lead"}</Badge>{mapping.angle && <Badge variant="secondary">{mapping.angle.name}</Badge>}</div>
                        <p className="text-sm text-muted-foreground">{mapping.attributedLeadCount} leads vinculados · {mapping.creative.targetProfile || "Perfil sin especificar"}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(mapping)}>Editar con nueva versión</Button>
                          {mapping.status === "published" && <Button variant="ghost" size="sm" disabled={archiveMapping.isPending} onClick={() => archiveMapping.mutate({ lineageKey: mapping.lineageKey })}><ArchiveIcon data-icon="inline-start" />Archivar</Button>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <Card size="sm">
            <CardHeader><CardTitle>Rendimiento</CardTitle><CardDescription>Lectura descriptiva por leads actualmente relacionados; no implica causalidad.</CardDescription></CardHeader>
            <CardContent>
              <Tabs defaultValue="campaigns" className="gap-3">
                <TabsList><TabsTrigger value="campaigns">Campañas</TabsTrigger><TabsTrigger value="creatives">Anuncios</TabsTrigger><TabsTrigger value="angles">Ángulos</TabsTrigger></TabsList>
                <TabsContent value="campaigns"><PerformanceTable rows={data.performance.campaigns} /></TabsContent>
                <TabsContent value="creatives"><PerformanceTable rows={data.performance.creatives} /></TabsContent>
                <TabsContent value="angles"><PerformanceTable rows={data.performance.angles} /></TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="dashboard-arc-theme sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{form.ruleLineageKey ? "Nueva versión de la relación" : "Relacionar código y anuncio"}</DialogTitle>
            <DialogDescription>Los datos propuestos por IA son editables. Guardar confirma humanamente la campaña, el anuncio y el ángulo.</DialogDescription>
          </DialogHeader>

          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field><FieldLabel htmlFor="marketing-utm">utm_content</FieldLabel><Input id="marketing-utm" value={form.utmContent} onChange={(event) => update("utmContent", event.target.value)} /><FieldDescription>Código exacto recibido por el lead.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="marketing-lead-source">Origen guardado en el lead</FieldLabel><Input id="marketing-lead-source" value={form.leadSource} onChange={(event) => update("leadSource", event.target.value)} placeholder="Vacío para importados sin source" /><FieldDescription>Una regla sin origen funciona como fallback; las reglas exactas tienen prioridad.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="marketing-source">Plataforma o fuente</FieldLabel><Input id="marketing-source" value={form.campaignSource} onChange={(event) => update("campaignSource", event.target.value)} placeholder="Meta Ads" /></Field>
            <Field><FieldLabel htmlFor="marketing-campaign">Campaña</FieldLabel><Input id="marketing-campaign" value={form.campaignName} onChange={(event) => update("campaignName", event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="marketing-campaign-id">ID externo de campaña</FieldLabel><Input id="marketing-campaign-id" value={form.campaignExternalId} onChange={(event) => update("campaignExternalId", event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="marketing-creative">Nombre del anuncio</FieldLabel><Input id="marketing-creative" value={form.creativeName} onChange={(event) => update("creativeName", event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="marketing-format">Formato</FieldLabel><Select value={form.creativeFormat} onValueChange={(value) => update("creativeFormat", (value ?? "other") as CreativeFormat)}><SelectTrigger id="marketing-format"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="video">Vídeo</SelectItem><SelectItem value="image">Imagen</SelectItem><SelectItem value="audio">Audio</SelectItem><SelectItem value="text">Texto</SelectItem><SelectItem value="other">Otro</SelectItem></SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="marketing-angle">Ángulo</FieldLabel><Input id="marketing-angle" value={form.angleName} onChange={(event) => update("angleName", event.target.value)} /><FieldDescription>Puede escribirse manualmente o aceptar la sugerencia de IA.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="marketing-valid-from">Válido desde</FieldLabel><Input id="marketing-valid-from" type="date" value={form.validFrom} onChange={(event) => update("validFrom", event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="marketing-valid-to">Válido hasta</FieldLabel><Input id="marketing-valid-to" type="date" value={form.validTo} onChange={(event) => update("validTo", event.target.value)} /></Field>
          </FieldGroup>

          <Card size="sm">
            <CardHeader><CardTitle>Material del anuncio</CardTitle><CardDescription>El archivo se almacena fuera de PostgreSQL. Audio y vídeo de hasta 25 MB pueden transcribirse automáticamente.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <FieldGroup className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <Field><FieldLabel htmlFor="marketing-asset">Archivo</FieldLabel><Input id="marketing-asset" type="file" accept="image/*,video/*,audio/*" onChange={(event) => setAsset(event.target.files?.[0] ?? null)} /></Field>
                <Button type="button" variant="outline" disabled={!asset || isUploading} onClick={uploadAsset}><UploadIcon data-icon="inline-start" />{isUploading ? "Subiendo…" : "Subir anuncio"}</Button>
              </FieldGroup>
              {uploadedMedia && <p className="text-sm text-muted-foreground">Archivo preparado: {uploadedMedia.fileName} · {(uploadedMedia.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>}
              <Field><FieldLabel htmlFor="marketing-transcript">Transcripción</FieldLabel><Textarea id="marketing-transcript" rows={8} value={form.transcript} onChange={(event) => update("transcript", event.target.value)} placeholder="Pega aquí la transcripción si no se genera automáticamente." /></Field>
              <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" disabled={form.transcript.trim().length < 40 || analyzeTranscript.isPending} onClick={() => analyzeTranscript.mutate({ transcript: form.transcript })}><BotIcon data-icon="inline-start" />{analyzeTranscript.isPending ? "Analizando…" : "Proponer campos con IA"}</Button>{aiAnalysis && <Badge variant="secondary">Sugerencia revisable · confianza {Math.round((aiAnalysis.confidence ?? 0) * 100)}%</Badge>}</div>
            </CardContent>
          </Card>

          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field><FieldLabel htmlFor="marketing-hook">Hook</FieldLabel><Textarea id="marketing-hook" rows={3} value={form.hook} onChange={(event) => update("hook", event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="marketing-promise">Promesa principal</FieldLabel><Textarea id="marketing-promise" rows={3} value={form.promise} onChange={(event) => update("promise", event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="marketing-cta">Llamada a la acción</FieldLabel><Input id="marketing-cta" value={form.cta} onChange={(event) => update("cta", event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="marketing-profile">Perfil objetivo</FieldLabel><Input id="marketing-profile" value={form.targetProfile} onChange={(event) => update("targetProfile", event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="marketing-objections">Objeciones tratadas</FieldLabel><Input id="marketing-objections" value={form.objections} onChange={(event) => update("objections", event.target.value)} placeholder="Separadas por comas" /></Field>
            <Field><FieldLabel htmlFor="marketing-awareness">Nivel de consciencia</FieldLabel><Input id="marketing-awareness" value={form.awarenessStage} onChange={(event) => update("awarenessStage", event.target.value)} /></Field>
            <Field className="md:col-span-2"><FieldLabel htmlFor="marketing-angle-description">Descripción del ángulo</FieldLabel><Textarea id="marketing-angle-description" rows={3} value={form.angleDescription} onChange={(event) => update("angleDescription", event.target.value)} /></Field>
            <label className="flex min-h-11 items-start gap-3 md:col-span-2"><Checkbox checked={form.reprocessExisting} onCheckedChange={(checked) => update("reprocessExisting", checked)} /><span className="flex flex-col gap-1"><span className="font-medium">Reprocesar leads ya relacionados</span><span className="text-xs text-muted-foreground">Déjalo desactivado para preservar su versión histórica. Actívalo únicamente cuando estés corrigiendo una relación anterior.</span></span></label>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button disabled={!form.utmContent || !form.campaignSource || !form.campaignName || !form.creativeName || saveMapping.isPending} onClick={submit}><MegaphoneIcon data-icon="inline-start" />{saveMapping.isPending ? "Guardando…" : "Confirmar y procesar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
