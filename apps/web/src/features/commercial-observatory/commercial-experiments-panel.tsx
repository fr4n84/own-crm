"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InfoIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@crm-fran/ui/components/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@crm-fran/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";
import { Textarea } from "@crm-fran/ui/components/textarea";

import { trpc } from "@/utils/trpc";

type InterventionType = "assignment_routing" | "speed_priority" | "follow_up_cadence" | "next_best_action";
type PrimaryMetric = "contacted" | "appointment" | "show" | "sale";

type DraftForm = {
  name: string;
  hypothesis: string;
  interventionType: InterventionType;
  primaryMetric: PrimaryMetric;
  profiles: string;
  sources: string;
  campaigns: string;
  types: string;
  instructions: string;
  allocationPercent: string;
  minimumSamplePerArm: string;
  maturationDays: string;
  guardrailTolerancePp: string;
};

const INTERVENTION_LABELS: Record<InterventionType, string> = {
  assignment_routing: "Enrutamiento de asignación",
  speed_priority: "Prioridad de velocidad",
  follow_up_cadence: "Cadencia de seguimiento",
  next_best_action: "Próxima mejor acción",
};

const PRIMARY_METRIC_LABELS: Record<PrimaryMetric, string> = {
  contacted: "Contactado",
  appointment: "Agenda",
  show: "Show",
  sale: "Venta",
};

const initialForm: DraftForm = {
  name: "",
  hypothesis: "",
  interventionType: "assignment_routing",
  primaryMetric: "sale",
  profiles: "",
  sources: "",
  campaigns: "",
  types: "",
  instructions: "",
  allocationPercent: "50",
  minimumSamplePerArm: "30",
  maturationDays: "14",
  guardrailTolerancePp: "5",
};

const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const percentage = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;

function Info({ label, title, children, accessibleTarget = false }: { label: string; title: string; children: string; accessibleTarget?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-xs" className={accessibleTarget ? "size-11" : undefined} aria-label={label} />}>
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

function EmptyTab({ heading, description }: { heading: string; description: string }) {
  return <Card size="sm"><CardContent><Empty heading={heading} description={description} /></CardContent></Card>;
}

export function CommercialExperimentsPanel() {
  const client = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const list = useQuery(trpc.commercialExperiments.list.queryOptions());
  const invalidate = () => { void client.invalidateQueries({ queryKey: trpc.commercialExperiments.list.queryKey() }); };
  const create = useMutation(trpc.commercialExperiments.create.mutationOptions({
    onSuccess: () => { toast.success("Borrador creado"); setForm(initialForm); invalidate(); },
    onError: () => toast.error("No se pudo crear el borrador"),
  }));

  if (list.isPending) return <section className="flex flex-col gap-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-64 w-full" /></section>;
  if (list.isError) return <section><Empty heading="No se pudieron cargar los experimentos" description="Necesitas permisos de administración global para consultar esta sección." /></section>;

  const experiments = list.data ?? [];
  const createDraft = () => create.mutate({
    name: form.name,
    hypothesis: form.hypothesis,
    interventionType: form.interventionType,
    primaryMetric: form.primaryMetric,
    eligibility: { profiles: split(form.profiles), sources: split(form.sources), campaigns: split(form.campaigns), types: split(form.types) as ("maestra" | "vsl")[] },
    treatmentConfig: {},
    treatmentInstructions: { instrucciones: form.instructions },
    allocationPercent: Number(form.allocationPercent),
    minimumSamplePerArm: Number(form.minimumSamplePerArm),
    maturationDays: Number(form.maturationDays),
    guardrailTolerancePp: Number(form.guardrailTolerancePp),
  });

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <h2 className="text-xl font-semibold">Experimentos comerciales</h2>
          <Info label="Información sobre experimentos comerciales" title="Decisiones controladas">La aleatorización compara cohortes de control y tratamiento. Este módulo solo registra evidencia y decisiones; nunca cambia leads, alertas ni reglas de producción.</Info>
        </div>
        <p className="text-sm text-muted-foreground">Prueba intervenciones de forma controlada antes de proponer una regla. Toda intervención operativa sigue siendo manual.</p>
      </header>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Nuevo borrador</CardTitle>
          <CardDescription>La configuración queda congelada al activar el experimento. Las instrucciones solo aparecen para la cohorte de tratamiento.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <FieldGroup className="grid gap-3 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="experiment-name">Nombre</FieldLabel>
              <Input id="experiment-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="intervention-type">Tipo de intervención</FieldLabel>
              <Select id="intervention-type" value={form.interventionType} onValueChange={(value) => setForm({ ...form, interventionType: value as DraftForm["interventionType"] })}>
                <SelectTrigger className="w-full"><SelectValue>{INTERVENTION_LABELS[form.interventionType]}</SelectValue></SelectTrigger>
                <SelectContent className="dashboard-arc-theme"><SelectGroup><SelectLabel>Operación</SelectLabel>{Object.entries(INTERVENTION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="hypothesis">Hipótesis</FieldLabel>
              <Textarea id="hypothesis" value={form.hypothesis} onChange={(event) => setForm({ ...form, hypothesis: event.target.value })} />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="treatment-instructions">Instrucciones para tratamiento</FieldLabel>
              <Textarea id="treatment-instructions" value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} />
            </Field>
          </FieldGroup>

          <div className="grid gap-3 md:grid-cols-2">
            <Card role="region" aria-labelledby="experiment-metrics-title" size="sm">
              <CardHeader><CardTitle id="experiment-metrics-title">Métricas</CardTitle></CardHeader>
              <CardContent>
                <FieldGroup className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="primary-metric">Métrica principal</FieldLabel>
                    <Select id="primary-metric" value={form.primaryMetric} onValueChange={(value) => setForm({ ...form, primaryMetric: value as DraftForm["primaryMetric"] })}>
                      <SelectTrigger className="w-full"><SelectValue>{PRIMARY_METRIC_LABELS[form.primaryMetric]}</SelectValue></SelectTrigger>
                      <SelectContent className="dashboard-arc-theme"><SelectGroup><SelectLabel>Embudo</SelectLabel>{Object.entries(PRIMARY_METRIC_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="allocation">Asignación a tratamiento (%)</FieldLabel>
                    <Input id="allocation" type="number" min="0" max="100" value={form.allocationPercent} onChange={(event) => setForm({ ...form, allocationPercent: event.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sample">Mínimo por brazo</FieldLabel>
                    <Input id="sample" type="number" min="1" value={form.minimumSamplePerArm} onChange={(event) => setForm({ ...form, minimumSamplePerArm: event.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="maturation">Días de maduración</FieldLabel>
                    <Input id="maturation" type="number" min="0" value={form.maturationDays} onChange={(event) => setForm({ ...form, maturationDays: event.target.value })} />
                  </Field>
                  <Field className="sm:col-span-2">
                    <div className="flex min-h-11 items-center gap-1">
                      <FieldLabel htmlFor="guardrail">Tolerancia de guardrail (pp)</FieldLabel>
                      <Info label="Información sobre la tolerancia" title="Tolerancia del guardrail" accessibleTarget>La tolerancia indica cuántos puntos porcentuales puede quedar la tasa de la métrica principal del tratamiento por debajo de la del control antes de superar el umbral de posible daño. No cambia qué leads se asignan a cada brazo ni cómo se comparan las cohortes; solo ajusta ese guardrail al analizar asignaciones maduras.</Info>
                    </div>
                    <Input id="guardrail" type="number" min="0" value={form.guardrailTolerancePp} onChange={(event) => setForm({ ...form, guardrailTolerancePp: event.target.value })} />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Card role="region" aria-labelledby="experiment-optional-title" size="sm">
              <CardHeader><CardTitle id="experiment-optional-title">Opcional</CardTitle><CardDescription>Acota la cohorte solo cuando necesites segmentarla.</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-3">
                <FieldGroup className="grid gap-3 sm:grid-cols-2">
                  <Field><FieldLabel htmlFor="eligibility-profile">Perfiles elegibles (opcional)</FieldLabel><Input id="eligibility-profile" placeholder="Perfil A, Perfil B" value={form.profiles} onChange={(event) => setForm({ ...form, profiles: event.target.value })} /></Field>
                  <Field><FieldLabel htmlFor="eligibility-source">Fuentes elegibles (opcional)</FieldLabel><Input id="eligibility-source" placeholder="Meta, Google" value={form.sources} onChange={(event) => setForm({ ...form, sources: event.target.value })} /></Field>
                  <Field><FieldLabel htmlFor="eligibility-campaign">Campañas elegibles (opcional)</FieldLabel><Input id="eligibility-campaign" placeholder="Campaña 1, Campaña 2" value={form.campaigns} onChange={(event) => setForm({ ...form, campaigns: event.target.value })} /></Field>
                  <Field><FieldLabel htmlFor="eligibility-type">Tipos elegibles (opcional)</FieldLabel><Input id="eligibility-type" placeholder="maestra, vsl" value={form.types} onChange={(event) => setForm({ ...form, types: event.target.value })} /></Field>
                </FieldGroup>
                <FieldDescription>Los filtros presentes se aplican conjuntamente; deja un campo vacío para no filtrarlo.</FieldDescription>
              </CardContent>
            </Card>
          </div>
          <Button className="self-start" onClick={createDraft} disabled={create.isPending}>Crear borrador</Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="draft">
        <TabsList aria-label="Estado de los experimentos" className="h-auto w-fit max-w-full flex-nowrap justify-start gap-1 rounded-lg border bg-muted/40 p-1"><TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="draft">Borradores</TabsTrigger><TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="active">Activos</TabsTrigger><TabsTrigger className="h-11! min-h-11! flex-none rounded-md px-3 py-2 text-sm data-active:bg-background" value="results">Resultados</TabsTrigger></TabsList>
        <TabsContent value="draft" className="flex flex-col gap-3">{experiments.filter((item) => item.status === "draft").length === 0 ? <EmptyTab heading="Sin borradores" description="Crea una hipótesis controlada para empezar." /> : experiments.filter((item) => item.status === "draft").map((item) => <ExperimentCard key={item.id} experiment={item} onChange={invalidate} />)}</TabsContent>
        <TabsContent value="active" className="flex flex-col gap-3">{experiments.filter((item) => item.status === "active" || item.status === "stopped").length === 0 ? <EmptyTab heading="Sin experimentos activos" description="Los experimentos activados aparecerán aquí." /> : experiments.filter((item) => item.status === "active" || item.status === "stopped").map((item) => <ExperimentCard key={item.id} experiment={item} onChange={invalidate} />)}</TabsContent>
        <TabsContent value="results" className="flex flex-col gap-3">{experiments.filter((item) => item.status === "completed").length === 0 ? <EmptyTab heading="Sin resultados cerrados" description="Completa un experimento para registrar una decisión humana." /> : experiments.filter((item) => item.status === "completed").map((item) => <ExperimentCard key={item.id} experiment={item} onChange={invalidate} />)}</TabsContent>
      </Tabs>
    </section>
  );
}

function ExperimentCard({ experiment, onChange }: { experiment: { id: string; name: string; hypothesis: string; status: "draft" | "active" | "stopped" | "completed"; interventionType: string; primaryMetric: string }; onChange: () => void }) {
  const client = useQueryClient();
  const detail = useQuery(trpc.commercialExperiments.detail.queryOptions({ experimentId: experiment.id }));
  const refresh = () => { onChange(); void client.invalidateQueries({ queryKey: trpc.commercialExperiments.detail.queryKey({ experimentId: experiment.id }) }); };
  const activate = useMutation(trpc.commercialExperiments.activate.mutationOptions({ onSuccess: (value) => { toast.success(`Activado: ${value.enrollment.inserted} nuevos, ${value.enrollment.existing} existentes, ${value.enrollment.conflicts} conflictos`); refresh(); } }));
  const enroll = useMutation(trpc.commercialExperiments.enrollNew.mutationOptions({ onSuccess: (value) => { toast.success(`Cohorte actualizada: ${value.inserted} nuevos, ${value.existing} existentes, ${value.conflicts} conflictos`); refresh(); } }));
  const stop = useMutation(trpc.commercialExperiments.stop.mutationOptions({ onSuccess: refresh }));
  const complete = useMutation(trpc.commercialExperiments.complete.mutationOptions({ onSuccess: refresh }));
  const decision = useMutation(trpc.commercialExperiments.recordFinalDecision.mutationOptions({ onSuccess: refresh }));
  const apply = useMutation(trpc.commercialExperiments.markTreatmentApplied.mutationOptions({ onSuccess: refresh }));
  const data = detail.data;
  const interventionLabel = INTERVENTION_LABELS[experiment.interventionType as InterventionType] ?? experiment.interventionType;
  const metricLabel = PRIMARY_METRIC_LABELS[experiment.primaryMetric as PrimaryMetric] ?? experiment.primaryMetric;

  return (
    <Card size="sm">
      <CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle>{experiment.name}</CardTitle><Badge variant="outline">{experiment.status}</Badge></div><CardDescription>{experiment.hypothesis} · {interventionLabel} · Métrica: {metricLabel}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {experiment.status === "draft" ? <Button className="self-start" onClick={() => activate.mutate({ experimentId: experiment.id })} disabled={activate.isPending}>Activar y aleatorizar</Button> : null}
        {data ? <>
          <div className="flex flex-wrap gap-1.5"><Badge variant="secondary">Control: {data.results.arms.control.sampleSize}</Badge><Badge variant="secondary">Tratamiento: {data.results.arms.treatment.sampleSize}</Badge><Badge variant="outline">Uplift absoluto: {data.results.primary.absolutePpUplift.toFixed(1)} pp</Badge><Badge variant="outline">Uplift relativo: {data.results.primary.relativeUplift === null ? "No calculable" : percentage(data.results.primary.relativeUplift)}</Badge><Badge variant="outline">IC 95%: {data.results.primary.confidenceInterval95.lowerPp?.toFixed(1) ?? "—"} a {data.results.primary.confidenceInterval95.upperPp?.toFixed(1) ?? "—"} pp</Badge><Badge variant={data.results.guardrail.isHarm ? "destructive" : "outline"}>Guardrail: {data.results.guardrail.isHarm ? "posible daño" : "sin alerta"}</Badge><Badge variant="outline">Cumplimiento: {percentage(data.results.compliance.rate)}</Badge><Badge variant="outline">Evidencia: {data.results.state}</Badge></div>
          {experiment.status === "active" || experiment.status === "stopped" ? <div className="flex flex-wrap gap-2">{experiment.status === "active" ? <><Button variant="outline" onClick={() => enroll.mutate({ experimentId: experiment.id })}>Incorporar nuevos</Button><Button variant="outline" onClick={() => stop.mutate({ experimentId: experiment.id })}>Detener</Button></> : null}<Button onClick={() => complete.mutate({ experimentId: experiment.id })}>Completar</Button></div> : null}
          {experiment.status === "completed" ? <div className="flex flex-col gap-2"><p className="text-sm text-muted-foreground">Aprobar solo registra una decisión; nunca cambia reglas de producción.</p><div className="flex flex-wrap gap-2"><Button onClick={() => decision.mutate({ experimentId: experiment.id, decision: "approved", notes: "Aprobada tras revisión humana" })}>Aprobar regla</Button><Button variant="outline" onClick={() => decision.mutate({ experimentId: experiment.id, decision: "rejected", notes: "Rechazada tras revisión humana" })}>Rechazar</Button><Button variant="outline" onClick={() => decision.mutate({ experimentId: experiment.id, decision: "inconclusive", notes: "Evidencia inconclusa" })}>Inconcluso</Button></div>{data.finalDecision ? <p className="text-sm text-muted-foreground">Decisión: {data.finalDecision} · {data.finalDecisionNotes ?? "Sin notas"}</p> : null}</div> : null}
          <div role="region" aria-label="Asignaciones" className="max-h-64 overflow-auto rounded-md border">
            <Table className="min-w-3xl">
              <TableHeader className="sticky top-0 bg-card"><TableRow><TableHead className="h-8">Lead</TableHead><TableHead className="h-8">Contexto congelado</TableHead><TableHead className="h-8">Brazo</TableHead><TableHead className="h-8">Maduración</TableHead><TableHead className="h-8">Tratamiento</TableHead></TableRow></TableHeader>
              <TableBody>{data.assignments.length === 0 ? <TableRow><TableCell colSpan={5}><Empty className="py-4" heading="Sin cohortes" description="La aleatorización registrará cohortes al activar." /></TableCell></TableRow> : data.assignments.map((assignment) => <TableRow className="h-9" key={assignment.id}><TableCell className="px-2 py-1">{assignment.leadId}</TableCell><TableCell className="px-2 py-1">{String(assignment.frozenContext.profile ?? "Sin perfil")} · {String(assignment.frozenContext.source ?? "Sin fuente")}</TableCell><TableCell className="px-2 py-1"><Badge variant="outline">{assignment.arm}</Badge></TableCell><TableCell className="px-2 py-1">{assignment.isMature ? "Maduro" : "Pendiente"}</TableCell><TableCell className="px-2 py-1">{assignment.arm === "treatment" ? <div className="flex items-center gap-2"><span>{String(assignment.treatmentInstructions?.instrucciones ?? "Sin instrucciones")}</span>{experiment.status === "active" && !assignment.treatmentAppliedAt ? <Button variant="outline" size="xs" onClick={() => apply.mutate({ assignmentId: assignment.id })}>Marcar aplicada</Button> : assignment.treatmentAppliedAt ? <Badge variant="secondary">Aplicada</Badge> : <span className="text-muted-foreground">Tratamiento cerrado</span>}</div> : <span className="text-muted-foreground">Control: sin instrucciones</span>}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </> : <Skeleton className="h-28 w-full" />}
      </CardContent>
    </Card>
  );
}
