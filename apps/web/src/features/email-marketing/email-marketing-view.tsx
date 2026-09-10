"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, MailIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Textarea } from "@crm-fran/ui/components/textarea";
import { usePermissionState } from "@crm-fran/ui/permissions";

import { trpc } from "@/utils/trpc";
import { EmailMarketingAccessBoundary, EmailMarketingDeliveryStatus } from "./access-boundary";
import { EmailMarketingCopyReview } from "./copy-review";

function LoadingState() {
  return <div className="flex flex-col gap-4" aria-label="Cargando Email Marketing"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>;
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
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [bodyText, setBodyText] = useState("");

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: trpc.emailMarketing.listCampaigns.queryKey() }),
    queryClient.invalidateQueries({ queryKey: trpc.emailMarketing.permissionSummary.queryKey() }),
  ]);
  const createCampaign = useMutation(trpc.emailMarketing.createCampaign.mutationOptions({
    onSuccess: async () => { setCampaignName(""); toast.success("Campaña borrador creada"); await refresh(); },
    onError: (error) => toast.error(error.message),
  }));
  const recordConsent = useMutation(trpc.emailMarketing.recordConsent.mutationOptions({ onSuccess: async () => { toast.success("Consentimiento registrado"); await refresh(); }, onError: (error) => toast.error(error.message) }));
  const revokeConsent = useMutation(trpc.emailMarketing.revokeConsent.mutationOptions({ onSuccess: async () => { toast.success("Consentimiento revocado"); await refresh(); }, onError: (error) => toast.error(error.message) }));
  const suppress = useMutation(trpc.emailMarketing.suppress.mutationOptions({ onSuccess: async () => { toast.success("Correo suprimido"); await refresh(); }, onError: (error) => toast.error(error.message) }));
  const buildAudience = useMutation(trpc.emailMarketing.buildAudience.mutationOptions({ onSuccess: async () => { toast.success("Nueva audiencia congelada"); await refresh(); }, onError: (error) => toast.error(error.message) }));
  const addCopy = useMutation(trpc.emailMarketing.addCopyVersion.mutationOptions({
    onSuccess: async () => { setSubject(""); setPreviewText(""); setBodyText(""); toast.success("Versión guardada como borrador"); await refresh(); },
    onError: (error) => toast.error(error.message),
  }));
  const approveCopy = useMutation(trpc.emailMarketing.approveCopyVersion.mutationOptions({ onSuccess: async () => { toast.success("Copy aprobado por una persona"); await refresh(); }, onError: (error) => toast.error(error.message) }));

  if (campaigns.isPending || summary.isPending || deliveryCapability.isPending) return <LoadingState />;
  if (campaigns.isError || summary.isError || deliveryCapability.isError || !campaigns.data || !summary.data || !deliveryCapability.data) return <Empty heading="No se pudo cargar Email Marketing" description="Recarga la página. Ninguna campaña se enviará desde este módulo." />;

  const campaignItems = campaigns.data.map((campaign) => ({ label: campaign.name, value: campaign.id }));
  const busyAudit = recordConsent.isPending || revokeConsent.isPending || suppress.isPending;

  function submitAudit(event: FormEvent) {
    event.preventDefault();
    const common = { email: auditEmail, source: "admin_record", evidence: auditEvidence, occurredAt: new Date() };
    if (auditAction === "grant") recordConsent.mutate(common);
    else if (auditAction === "revoke") revokeConsent.mutate(common);
    else suppress.mutate({ ...common, reason: "Suppressed by an administrator" });
  }

  return <main className="dashboard-arc-theme flex min-h-full min-w-0 flex-col gap-4 bg-background p-4 text-foreground sm:p-6">
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2"><MailIcon aria-hidden="true" /><h1 className="text-3xl font-bold tracking-tight">Email Marketing</h1><Badge variant="outline">Sin envíos</Badge></div>
      <p className="max-w-3xl text-sm text-muted-foreground">Prepara consentimiento, audiencias congeladas y versiones de copy. Este bloque no conecta proveedores ni puede enviar correos.</p>
    </header>

    <EmailMarketingDeliveryStatus capability={deliveryCapability.data} />

    <section className="grid gap-3 sm:grid-cols-3" aria-label="Estado de permisos">
      <Card size="sm"><CardHeader><CardTitle>Consentimiento activo</CardTitle><CardDescription>Autoridad explícita registrada</CardDescription></CardHeader><CardContent className="text-2xl font-semibold">{summary.data.granted}</CardContent></Card>
      <Card size="sm"><CardHeader><CardTitle>Consentimiento revocado</CardTitle><CardDescription>No puede entrar en audiencia</CardDescription></CardHeader><CardContent className="text-2xl font-semibold">{summary.data.revoked}</CardContent></Card>
      <Card size="sm"><CardHeader><CardTitle>Supresiones activas</CardTitle><CardDescription>Siempre prevalecen</CardDescription></CardHeader><CardContent className="text-2xl font-semibold">{summary.data.suppressed}</CardContent></Card>
    </section>

    <div className="grid items-start gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Registrar autoridad del contacto</CardTitle><CardDescription>Tener correo o ser lead NUNCA implica consentimiento. Cada cambio conserva actor, fuente, evidencia y fecha.</CardDescription></CardHeader>
        <CardContent><form id="email-marketing-audit" onSubmit={submitAudit}><FieldGroup>
          <Field><FieldLabel htmlFor="marketing-action">Acción</FieldLabel><Select value={auditAction} onValueChange={(value) => value && setAuditAction(value)} items={[{ value: "grant", label: "Registrar consentimiento" }, { value: "revoke", label: "Revocar consentimiento" }, { value: "suppress", label: "Suprimir correo" }]}><SelectTrigger id="marketing-action"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="grant">Registrar consentimiento</SelectItem><SelectItem value="revoke">Revocar consentimiento</SelectItem><SelectItem value="suppress">Suprimir correo</SelectItem></SelectGroup></SelectContent></Select></Field>
          <Field><FieldLabel htmlFor="marketing-email">Correo</FieldLabel><Input id="marketing-email" type="email" value={auditEmail} onChange={(event) => setAuditEmail(event.target.value)} required /></Field>
          <Field><FieldLabel htmlFor="marketing-evidence">Evidencia</FieldLabel><Textarea id="marketing-evidence" value={auditEvidence} onChange={(event) => setAuditEvidence(event.target.value)} required maxLength={2000} /><FieldDescription>Describe la prueba verificable. No incluyas secretos ni datos innecesarios.</FieldDescription></Field>
        </FieldGroup></form></CardContent>
        <CardFooter><Button type="submit" form="email-marketing-audit" disabled={busyAudit}>{busyAudit ? "Guardando…" : "Registrar con auditoría"}</Button></CardFooter>
      </Card>

      <Card>
        <CardHeader><CardTitle>Nueva campaña</CardTitle><CardDescription>Solo crea un borrador. No existe acción de envío.</CardDescription></CardHeader>
        <CardContent><form id="email-marketing-campaign" onSubmit={(event) => { event.preventDefault(); createCampaign.mutate({ name: campaignName }); }}><FieldGroup><Field><FieldLabel htmlFor="campaign-name">Nombre interno</FieldLabel><Input id="campaign-name" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} required maxLength={160} /></Field></FieldGroup></form></CardContent>
        <CardFooter><Button type="submit" form="email-marketing-campaign" disabled={createCampaign.isPending}>{createCampaign.isPending ? "Creando…" : "Crear borrador"}</Button></CardFooter>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader><CardTitle>Nueva versión de copy</CardTitle><CardDescription>Se guarda como no aprobada. Una persona deberá revisar y aprobar esa versión exacta.</CardDescription></CardHeader>
        <CardContent><form id="email-marketing-copy" onSubmit={(event) => { event.preventDefault(); addCopy.mutate({ campaignId, subject, previewText: previewText || undefined, bodyText }); }}><FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field><FieldLabel htmlFor="copy-campaign">Campaña</FieldLabel><Select value={campaignId} onValueChange={(value) => value && setCampaignId(value)} items={campaignItems}><SelectTrigger id="copy-campaign"><SelectValue placeholder="Selecciona una campaña" /></SelectTrigger><SelectContent><SelectGroup>{campaigns.data.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <Field><FieldLabel htmlFor="copy-subject">Asunto</FieldLabel><Input id="copy-subject" value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={250} /></Field>
          <Field className="md:col-span-2"><FieldLabel htmlFor="copy-preview">Previsualización opcional</FieldLabel><Input id="copy-preview" value={previewText} onChange={(event) => setPreviewText(event.target.value)} maxLength={500} /></Field>
          <Field className="md:col-span-2"><FieldLabel htmlFor="copy-body">Contenido</FieldLabel><Textarea id="copy-body" value={bodyText} onChange={(event) => setBodyText(event.target.value)} required maxLength={100000} /></Field>
        </FieldGroup></form></CardContent>
        <CardFooter><Button type="submit" form="email-marketing-copy" disabled={!campaignId || addCopy.isPending}>{addCopy.isPending ? "Guardando…" : "Guardar versión pendiente"}</Button></CardFooter>
      </Card>
    </div>

    <section className="flex flex-col gap-3" aria-labelledby="campaigns-heading">
      <div><h2 id="campaigns-heading" className="text-xl font-semibold">Campañas</h2><p className="text-sm text-muted-foreground">Cada audiencia es un snapshot nuevo e inmutable; las exclusiones conservan su motivo.</p></div>
      {campaigns.data.length === 0 ? <Empty heading="No hay campañas" description="Crea el primer borrador para preparar una audiencia y su copy." /> : <div className="grid items-start gap-3 xl:grid-cols-2">{campaigns.data.map((campaign) => <Card key={campaign.id} size="sm">
        <CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle>{campaign.name}</CardTitle><Badge variant={campaign.status === "ready" ? "secondary" : "outline"}>{campaign.status === "ready" ? "Preparada" : "Borrador"}</Badge></div><CardDescription>Preparada solo significa audiencia elegible y copy aprobado; NO significa enviada.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2"><Badge variant="outline">Audiencia v{campaign.latestAudience?.version ?? 0}</Badge><Badge variant="outline">{campaign.latestAudience?.includedCount ?? 0} incluidos</Badge><Badge variant="outline">{campaign.latestAudience ? campaign.latestAudience.candidateCount - campaign.latestAudience.includedCount : 0} excluidos</Badge></div>
          {campaign.contentVersions.length === 0 ? <p className="text-sm text-muted-foreground">Sin versiones de copy.</p> : <ul className="flex flex-col gap-2">{campaign.contentVersions.map((version) => <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><EmailMarketingCopyReview version={version} />{version.status === "draft" ? <Button size="sm" variant="outline" disabled={approveCopy.isPending} onClick={() => { if (window.confirm(`¿Aprobar la versión ${version.version} de ${campaign.name}? Revisa su contenido antes de continuar.`)) approveCopy.mutate({ campaignId: campaign.id, contentVersionId: version.id }); }}><CheckIcon data-icon="inline-start" />Aprobar copy</Button> : null}</li>)}</ul>}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2"><Button variant="outline" disabled={buildAudience.isPending} onClick={() => buildAudience.mutate({ campaignId: campaign.id })}><ShieldCheckIcon data-icon="inline-start" />Congelar audiencia nueva</Button></CardFooter>
      </Card>)}</div>}
    </section>
  </main>;
}

export function EmailMarketingView() {
  const permissionState = usePermissionState();
  if (permissionState.isLoading || !permissionState.isLoaded) return <main className="dashboard-arc-theme bg-background p-4 sm:p-6"><LoadingState /></main>;
  return <EmailMarketingAccessBoundary permissions={permissionState.permissions}><EmailMarketingAdminContent /></EmailMarketingAccessBoundary>;
}


