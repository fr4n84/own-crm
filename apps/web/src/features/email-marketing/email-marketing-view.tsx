"use client";

import { useState, type FormEvent } from "react";
import { MOTIVATION_ANGLES, type MotivationAngle } from "@crm-fran/api/call-feedback";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, DownloadIcon, MailIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crm-fran/ui/components/dialog";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";
import { Textarea } from "@crm-fran/ui/components/textarea";
import { usePermissionState } from "@crm-fran/ui/permissions";

import { trpc } from "@/utils/trpc";
import { EmailMarketingAccessBoundary, EmailMarketingDeliveryStatus } from "./access-boundary";
import { AudiencePreviewTable } from "./audience-preview";
import { EmailMarketingCopyReview } from "./copy-review";

const EMPTY_SNAPSHOT_ID = "00000000-0000-4000-8000-000000000000";

type SegmentGroup = {
  sources?: string[];
  campaigns?: string[];
  utmContents?: string[];
  themes?: string[];
  confirmedFeedback?: MotivationAngle[];
};

function LoadingState() {
  return <div className="flex flex-col gap-4" aria-label="Cargando Email Marketing"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>;
}

function values(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function safeMotivation(value: string): MotivationAngle | "any" {
  return MOTIVATION_ANGLES.some((angle) => angle.value === value) ? value as MotivationAngle : "any";
}

function EmailMarketingAdminContent() {
  const queryClient = useQueryClient();
  const campaigns = useQuery(trpc.emailMarketing.listCampaigns.queryOptions());
  const summary = useQuery(trpc.emailMarketing.permissionSummary.queryOptions());
  const deliveryCapability = useQuery(trpc.emailMarketing.deliveryCapability.queryOptions());

  const [campaignName, setCampaignName] = useState("");
  const [auditAction, setAuditAction] = useState("grant");
  const [auditEmail, setAuditEmail] = useState("");
  const [auditEvidence, setAuditEvidence] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [segmentSource, setSegmentSource] = useState("");
  const [segmentCampaign, setSegmentCampaign] = useState("");
  const [segmentUtm, setSegmentUtm] = useState("");
  const [segmentTheme, setSegmentTheme] = useState("");
  const [segmentFeedback, setSegmentFeedback] = useState<MotivationAngle | "any">("any");
  const [segmentCombine, setSegmentCombine] = useState<"union" | "intersection" | "exclusion">("intersection");
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [exportPurpose, setExportPurpose] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  const fallbackSnapshotId = campaigns.data?.find((campaign) => campaign.latestAudience)?.latestAudience?.id ?? "";
  const activeSnapshotId = selectedSnapshotId || fallbackSnapshotId;
  const activeCursor = cursorHistory.at(-1);
  const preview = useQuery({
    ...trpc.emailMarketing.listAudienceMembers.queryOptions({
      snapshotId: activeSnapshotId || EMPTY_SNAPSHOT_ID,
      limit: 25,
      ...(activeCursor ? { cursor: activeCursor } : {}),
    }),
    enabled: Boolean(activeSnapshotId),
  });

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: trpc.emailMarketing.listCampaigns.queryKey() }),
    queryClient.invalidateQueries({ queryKey: trpc.emailMarketing.permissionSummary.queryKey() }),
  ]);
  const createCampaign = useMutation(trpc.emailMarketing.createCampaign.mutationOptions({
    onSuccess: async (created) => { setCampaignName(""); setCampaignId(created.id); toast.success("Campaña borrador creada"); await refresh(); },
    onError: (error) => toast.error(error.message),
  }));
  const recordConsent = useMutation(trpc.emailMarketing.recordConsent.mutationOptions({ onSuccess: async () => { toast.success("Consentimiento registrado"); await refresh(); }, onError: (error) => toast.error(error.message) }));
  const revokeConsent = useMutation(trpc.emailMarketing.revokeConsent.mutationOptions({ onSuccess: async () => { toast.success("Consentimiento revocado"); await refresh(); }, onError: (error) => toast.error(error.message) }));
  const suppress = useMutation(trpc.emailMarketing.suppress.mutationOptions({ onSuccess: async () => { toast.success("Correo suprimido"); await refresh(); }, onError: (error) => toast.error(error.message) }));
  const buildAudience = useMutation(trpc.emailMarketing.buildAudience.mutationOptions({
    onSuccess: async (snapshot) => {
      setSelectedSnapshotId(snapshot.id);
      setCursorHistory([]);
      toast.success("Nueva audiencia congelada");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  }));
  const addCopy = useMutation(trpc.emailMarketing.addCopyVersion.mutationOptions({
    onSuccess: async () => { setSubject(""); setPreviewText(""); setBodyText(""); toast.success("Versión guardada como borrador"); await refresh(); },
    onError: (error) => toast.error(error.message),
  }));
  const generateCopy = useMutation(trpc.emailMarketing.generateCopyDraft.mutationOptions({
    onSuccess: async () => { toast.success("Borrador IA preparado para revisión humana"); await refresh(); },
    onError: (error) => toast.error(error.message),
  }));
  const approveCopy = useMutation(trpc.emailMarketing.approveCopyVersion.mutationOptions({ onSuccess: async () => { toast.success("Copy aprobado por una persona"); await refresh(); }, onError: (error) => toast.error(error.message) }));
  const exportAudience = useMutation(trpc.emailMarketing.exportAudience.mutationOptions({
    onSuccess: (result) => {
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "audiencia-email-" + new Date().toISOString().slice(0, 10) + ".csv";
      link.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
      toast.success("CSV descargado y exportación auditada");
    },
    onError: (error) => toast.error(error.message),
  }));

  if (campaigns.isPending || summary.isPending || deliveryCapability.isPending) return <LoadingState />;
  if (campaigns.isError || summary.isError || deliveryCapability.isError || !campaigns.data || !summary.data || !deliveryCapability.data) return <Empty heading="No se pudo cargar Email Marketing" description="Recarga la página. Ninguna campaña se enviará desde este módulo." />;

  const campaignItems = campaigns.data.map((campaign) => ({ label: campaign.name, value: campaign.id }));
  const snapshotItems = campaigns.data.flatMap((campaign) => campaign.latestAudience ? [{
    value: campaign.latestAudience.id,
    label: campaign.name + " · audiencia v" + campaign.latestAudience.version,
  }] : []);
  const busyAudit = recordConsent.isPending || revokeConsent.isPending || suppress.isPending;

  function submitAudit(event: FormEvent) {
    event.preventDefault();
    const common = { email: auditEmail, source: "admin_record", evidence: auditEvidence, occurredAt: new Date() };
    if (auditAction === "grant") recordConsent.mutate(common);
    else if (auditAction === "revoke") revokeConsent.mutate(common);
    else suppress.mutate({ ...common, reason: "Suppressed by an administrator" });
  }

  function freezeAudience() {
    if (!campaignId) return;
    const groups: SegmentGroup[] = [];
    if (values(segmentSource).length) groups.push({ sources: values(segmentSource) });
    if (values(segmentCampaign).length) groups.push({ campaigns: values(segmentCampaign) });
    if (values(segmentUtm).length) groups.push({ utmContents: values(segmentUtm) });
    if (values(segmentTheme).length) groups.push({ themes: values(segmentTheme) });
    if (segmentFeedback !== "any") groups.push({ confirmedFeedback: [segmentFeedback] });
    buildAudience.mutate({
      campaignId,
      ...(groups.length ? { criteria: { combine: segmentCombine, groups } } : {}),
    });
  }

  function confirmExport() {
    if (!activeSnapshotId || !exportPurpose.trim()) return;
    exportAudience.mutate({
      snapshotId: activeSnapshotId,
      purpose: exportPurpose.trim(),
      operationId: crypto.randomUUID(),
    });
  }

  return <main className="dashboard-arc-theme flex min-h-full min-w-0 flex-col gap-4 bg-background p-4 text-foreground sm:p-6">
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2"><MailIcon aria-hidden="true" /><h1 className="text-3xl font-bold tracking-tight">Email Marketing</h1><Badge variant="outline">Sin envíos</Badge></div>
      <p className="max-w-3xl text-sm text-muted-foreground">Segmenta campañas, prepara copys y descarga audiencias para uso posterior. Este módulo no conecta plataformas ni puede enviar correos.</p>
    </header>

    <EmailMarketingDeliveryStatus capability={deliveryCapability.data} />

    <Tabs defaultValue="audiences">
      <TabsList aria-label="Secciones de Email Marketing" className="h-auto w-fit max-w-full flex-nowrap gap-1 rounded-lg border bg-muted/40 p-1">
        <TabsTrigger value="audiences">Audiencias</TabsTrigger>
        <TabsTrigger value="consent">Consentimiento</TabsTrigger>
        <TabsTrigger value="copy">Copy</TabsTrigger>
        <TabsTrigger value="export">Exportación</TabsTrigger>
      </TabsList>

      <TabsContent value="audiences" className="flex flex-col gap-4">
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Nueva campaña</CardTitle><CardDescription>Crea el contenedor de trabajo. No existe ninguna acción de envío.</CardDescription></CardHeader>
            <CardContent><form id="email-marketing-campaign" onSubmit={(event) => { event.preventDefault(); createCampaign.mutate({ name: campaignName }); }}><FieldGroup><Field><FieldLabel htmlFor="campaign-name">Nombre interno</FieldLabel><Input id="campaign-name" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} required maxLength={160} /></Field></FieldGroup></form></CardContent>
            <CardFooter><Button type="submit" form="email-marketing-campaign" disabled={createCampaign.isPending}>{createCampaign.isPending ? "Creando…" : "Crear borrador"}</Button></CardFooter>
          </Card>
          <Card>
            <CardHeader><CardTitle>Congelar audiencia</CardTitle><CardDescription>Los filtros se mantienen separados y se combinan con la regla elegida. Consentimiento y supresión se aplican siempre.</CardDescription></CardHeader>
            <CardContent><FieldGroup>
              <Field><FieldLabel htmlFor="audience-campaign">Campaña de trabajo</FieldLabel><Select value={campaignId} onValueChange={(value) => value && setCampaignId(value)} items={campaignItems}><SelectTrigger id="audience-campaign"><SelectValue placeholder="Selecciona una campaña" /></SelectTrigger><SelectContent><SelectGroup>{campaigns.data.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
              <Field><FieldLabel htmlFor="segment-combine">Cómo combinar filtros</FieldLabel><Select value={segmentCombine} onValueChange={(value) => value && setSegmentCombine(value as typeof segmentCombine)} items={[{ value: "intersection", label: "Debe cumplir todos" }, { value: "union", label: "Puede cumplir cualquiera" }, { value: "exclusion", label: "Excluir coincidencias" }]}><SelectTrigger id="segment-combine"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="intersection">Debe cumplir todos</SelectItem><SelectItem value="union">Puede cumplir cualquiera</SelectItem><SelectItem value="exclusion">Excluir coincidencias</SelectItem></SelectGroup></SelectContent></Select></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="segment-source">Origen</FieldLabel><Input id="segment-source" value={segmentSource} onChange={(event) => setSegmentSource(event.target.value)} maxLength={300} placeholder="Meta, Webinar" /></Field>
                <Field><FieldLabel htmlFor="segment-campaign">Campaña de origen</FieldLabel><Input id="segment-campaign" value={segmentCampaign} onChange={(event) => setSegmentCampaign(event.target.value)} maxLength={300} /></Field>
                <Field><FieldLabel htmlFor="segment-utm">UTM content</FieldLabel><Input id="segment-utm" value={segmentUtm} onChange={(event) => setSegmentUtm(event.target.value)} maxLength={300} /></Field>
                <Field><FieldLabel htmlFor="segment-theme">Temática</FieldLabel><Input id="segment-theme" value={segmentTheme} onChange={(event) => setSegmentTheme(event.target.value)} maxLength={300} /></Field>
              </div>
              <Field><FieldLabel htmlFor="segment-feedback">Motivación comercial confirmada</FieldLabel><Select value={segmentFeedback} onValueChange={(value) => setSegmentFeedback(safeMotivation(value ?? "any"))} items={[{ value: "any", label: "Cualquiera" }, ...MOTIVATION_ANGLES]}><SelectTrigger id="segment-feedback"><SelectValue placeholder="Cualquier motivación" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="any">Cualquiera</SelectItem>{MOTIVATION_ANGLES.map((angle) => <SelectItem key={angle.value} value={angle.value}>{angle.label}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldDescription>Solo usa la taxonomía confirmada; nunca transcripciones ni coaching privado.</FieldDescription></Field>
            </FieldGroup></CardContent>
            <CardFooter><Button type="button" disabled={!campaignId || buildAudience.isPending} onClick={freezeAudience}><ShieldCheckIcon data-icon="inline-start" />{buildAudience.isPending ? "Preparando…" : "Congelar audiencia"}</Button></CardFooter>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Previsualización paginada</CardTitle><CardDescription>Nombre, correo y teléfono se consultan desde el contacto actual; no se duplican en el snapshot. El ojo muestra información adicional que nunca entra en el CSV.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field><FieldLabel htmlFor="preview-snapshot">Audiencia</FieldLabel><Select value={activeSnapshotId} onValueChange={(value) => { setSelectedSnapshotId(value ?? ""); setCursorHistory([]); }} items={snapshotItems}><SelectTrigger id="preview-snapshot"><SelectValue placeholder="Selecciona una audiencia" /></SelectTrigger><SelectContent><SelectGroup>{snapshotItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            {!activeSnapshotId ? <Empty heading="Todavía no hay audiencia" description="Congela una audiencia para previsualizar sus contactos y exclusiones." /> : preview.isPending ? <LoadingState /> : preview.isError || !preview.data ? <Empty heading="No se pudo cargar la audiencia" description="Vuelve a intentarlo. No se ha exportado nada." /> : preview.data.items.length === 0 ? <Empty heading="Página vacía" description="No hay contactos en esta página." /> : <AudiencePreviewTable items={preview.data.items} />}
          </CardContent>
          {activeSnapshotId && preview.data ? <CardFooter className="justify-between">
            <Button type="button" variant="outline" disabled={cursorHistory.length === 0 || preview.isFetching} onClick={() => setCursorHistory((current) => current.slice(0, -1))}>Anterior</Button>
            <Button type="button" variant="outline" disabled={!preview.data.nextCursor || preview.isFetching} onClick={() => preview.data.nextCursor && setCursorHistory((current) => [...current, preview.data.nextCursor!])}>Siguiente</Button>
          </CardFooter> : null}
        </Card>
      </TabsContent>

      <TabsContent value="consent" className="flex flex-col gap-4">
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Estado de permisos">
          <Card size="sm"><CardHeader><CardTitle>Consentimiento activo</CardTitle><CardDescription>Autoridad explícita registrada</CardDescription></CardHeader><CardContent className="text-2xl font-semibold">{summary.data.granted}</CardContent></Card>
          <Card size="sm"><CardHeader><CardTitle>Consentimiento revocado</CardTitle><CardDescription>No puede entrar en audiencia</CardDescription></CardHeader><CardContent className="text-2xl font-semibold">{summary.data.revoked}</CardContent></Card>
          <Card size="sm"><CardHeader><CardTitle>Supresiones activas</CardTitle><CardDescription>Siempre prevalecen</CardDescription></CardHeader><CardContent className="text-2xl font-semibold">{summary.data.suppressed}</CardContent></Card>
        </section>
        <Card>
          <CardHeader><CardTitle>Registrar autoridad del contacto</CardTitle><CardDescription>Tener correo o ser lead NUNCA implica consentimiento. Cada cambio conserva actor, fuente, evidencia y fecha.</CardDescription></CardHeader>
          <CardContent><form id="email-marketing-audit" onSubmit={submitAudit}><FieldGroup>
            <Field><FieldLabel htmlFor="marketing-action">Acción</FieldLabel><Select value={auditAction} onValueChange={(value) => value && setAuditAction(value)} items={[{ value: "grant", label: "Registrar consentimiento" }, { value: "revoke", label: "Revocar consentimiento" }, { value: "suppress", label: "Suprimir correo" }]}><SelectTrigger id="marketing-action"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="grant">Registrar consentimiento</SelectItem><SelectItem value="revoke">Revocar consentimiento</SelectItem><SelectItem value="suppress">Suprimir correo</SelectItem></SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="marketing-email">Correo</FieldLabel><Input id="marketing-email" type="email" value={auditEmail} onChange={(event) => setAuditEmail(event.target.value)} required /></Field>
            <Field><FieldLabel htmlFor="marketing-evidence">Evidencia</FieldLabel><Textarea id="marketing-evidence" value={auditEvidence} onChange={(event) => setAuditEvidence(event.target.value)} required maxLength={2000} /><FieldDescription>Describe la prueba verificable. No incluyas secretos ni datos innecesarios.</FieldDescription></Field>
          </FieldGroup></form></CardContent>
          <CardFooter><Button type="submit" form="email-marketing-audit" disabled={busyAudit}>{busyAudit ? "Guardando…" : "Registrar con auditoría"}</Button></CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="copy" className="flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>Nueva versión manual</CardTitle><CardDescription>Se guarda como borrador. Una persona deberá revisar y aprobar esa versión exacta.</CardDescription></CardHeader>
          <CardContent><form id="email-marketing-copy" onSubmit={(event) => { event.preventDefault(); addCopy.mutate({ campaignId, subject, previewText: previewText || undefined, bodyText }); }}><FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field><FieldLabel htmlFor="copy-campaign">Campaña</FieldLabel><Select value={campaignId} onValueChange={(value) => value && setCampaignId(value)} items={campaignItems}><SelectTrigger id="copy-campaign"><SelectValue placeholder="Selecciona una campaña" /></SelectTrigger><SelectContent><SelectGroup>{campaigns.data.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="copy-subject">Asunto</FieldLabel><Input id="copy-subject" value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={250} /></Field>
            <Field className="md:col-span-2"><FieldLabel htmlFor="copy-preview">Previsualización opcional</FieldLabel><Input id="copy-preview" value={previewText} onChange={(event) => setPreviewText(event.target.value)} maxLength={500} /></Field>
            <Field className="md:col-span-2"><FieldLabel htmlFor="copy-body">Contenido</FieldLabel><Textarea id="copy-body" value={bodyText} onChange={(event) => setBodyText(event.target.value)} required maxLength={100000} /></Field>
          </FieldGroup></form></CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button type="submit" form="email-marketing-copy" disabled={!campaignId || addCopy.isPending}>{addCopy.isPending ? "Guardando…" : "Guardar versión pendiente"}</Button>
            <Button type="button" variant="outline" disabled={!campaignId || generateCopy.isPending} onClick={() => campaignId && generateCopy.mutate({ campaignId })}><SparklesIcon data-icon="inline-start" />{generateCopy.isPending ? "Preparando…" : "Crear borrador con IA"}</Button>
          </CardFooter>
        </Card>
        <p className="text-sm text-muted-foreground">La IA recibe solo nombre de campaña y recuentos agregados de motivaciones confirmadas, usa store:false y nunca aprueba, exporta ni envía. Un borrador IA exige que otra persona lo apruebe.</p>
        {campaigns.data.length === 0 ? <Empty heading="No hay campañas" description="Crea una campaña para preparar su copy." /> : <div className="grid items-start gap-3 xl:grid-cols-2">{campaigns.data.map((campaign) => <Card key={campaign.id} size="sm">
          <CardHeader><CardTitle>{campaign.name}</CardTitle><CardDescription>Preparada solo significa audiencia elegible y copy aprobado; NO significa enviada.</CardDescription></CardHeader>
          <CardContent>{campaign.contentVersions.length === 0 ? <p className="text-sm text-muted-foreground">Sin versiones de copy.</p> : <ul className="flex flex-col gap-2">{campaign.contentVersions.map((version) => <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><EmailMarketingCopyReview version={version} />{version.status === "draft" ? <Button size="sm" variant="outline" disabled={approveCopy.isPending} onClick={() => { if (window.confirm("¿Aprobar la versión " + version.version + " de " + campaign.name + "? Revisa su contenido antes de continuar.")) approveCopy.mutate({ campaignId: campaign.id, contentVersionId: version.id }); }}><CheckIcon data-icon="inline-start" />Aprobar copy</Button> : null}</li>)}</ul>}</CardContent>
        </Card>)}</div>}
      </TabsContent>

      <TabsContent value="export" className="flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>Descargar audiencia elegible</CardTitle><CardDescription>El CRM revalida consentimiento y supresión en el momento de la exportación. El CSV contiene únicamente nombre, correo y teléfono.</CardDescription></CardHeader>
          <CardContent><FieldGroup>
            <Field><FieldLabel htmlFor="export-snapshot">Audiencia congelada</FieldLabel><Select value={activeSnapshotId} onValueChange={(value) => { setSelectedSnapshotId(value ?? ""); setCursorHistory([]); }} items={snapshotItems}><SelectTrigger id="export-snapshot"><SelectValue placeholder="Selecciona una audiencia" /></SelectTrigger><SelectContent><SelectGroup>{snapshotItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="export-purpose">Finalidad</FieldLabel><Textarea id="export-purpose" value={exportPurpose} onChange={(event) => setExportPurpose(event.target.value)} required maxLength={500} /><FieldDescription>Explica para qué se utilizará esta descarga sin incluir datos personales. Se auditan actor, fecha, hash y conteos, nunca el cuerpo del CSV.</FieldDescription></Field>
          </FieldGroup></CardContent>
          <CardFooter><Button type="button" disabled={!activeSnapshotId || !exportPurpose.trim()} onClick={() => setExportOpen(true)}><DownloadIcon data-icon="inline-start" />Revisar descarga</Button></CardFooter>
        </Card>
        <p className="text-sm text-muted-foreground">No se conecta ninguna plataforma externa y no existe envío desde el CRM.</p>
        <Dialog open={exportOpen} onOpenChange={setExportOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Confirmar descarga local</DialogTitle><DialogDescription>Se revalidará la audiencia ahora. Los contactos revocados o suprimidos quedarán fuera incluso si estaban incluidos al congelarla.</DialogDescription></DialogHeader>
            <div className="rounded-lg border p-3 text-sm"><p><strong>Columnas:</strong> nombre, correo y teléfono.</p><p><strong>Finalidad:</strong> {exportPurpose}</p></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExportOpen(false)}>Cancelar</Button>
              <Button type="button" disabled={exportAudience.isPending} onClick={confirmExport}>{exportAudience.isPending ? "Revalidando…" : "Confirmar y descargar CSV"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TabsContent>
    </Tabs>
  </main>;
}

export function EmailMarketingView() {
  const permissionState = usePermissionState();
  if (permissionState.isLoading || !permissionState.isLoaded) return <main className="dashboard-arc-theme bg-background p-4 sm:p-6"><LoadingState /></main>;
  return <EmailMarketingAccessBoundary permissions={permissionState.permissions}><EmailMarketingAdminContent /></EmailMarketingAccessBoundary>;
}
