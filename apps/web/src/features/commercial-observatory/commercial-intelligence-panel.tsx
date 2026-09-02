"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InfoIcon } from "lucide-react";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Empty } from "@crm-fran/ui/components/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@crm-fran/ui/components/field";
import { Input } from "@crm-fran/ui/components/input";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@crm-fran/ui/components/popover";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@crm-fran/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";
import { Textarea } from "@crm-fran/ui/components/textarea";
import { usePermissionState } from "@crm-fran/ui/permissions";

import { commercialUiLabel } from "@/lib/commercial-ui-labels";
import { trpc } from "@/utils/trpc";

function initialRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function emptyRow(columns: number, heading: string, description: string) {
  return <TableRow><TableCell colSpan={columns}><Empty heading={heading} description={description} /></TableCell></TableRow>;
}

const INTELLIGENCE_DETAILS = [
  {
    title: "1. Qué hace esta sección",
    description: "Convierte las asignaciones, feedbacks, agendas, alertas y resultados del CRM en tres análisis: a quién convendría asignar cada lead, qué recomendaciones están asociadas con mejores resultados posteriores y dónde se pierden oportunidades operativas.",
  },
  {
    title: "2. Asignación simulada",
    description: "Compara callers y closers según resultados observados en leads similares, carga actual, tamaño de muestra y afinidad con perfil, fuente, campaña, tipo de lead y franja horaria. Para callers también incorpora la velocidad de contacto cuando existe. Es solo una simulación: nunca cambia el caller, el closer ni las reglas reales de reparto.",
  },
  {
    title: "3. Muestras pequeñas y fallback",
    description: "Los resultados se ajustan hacia una referencia de 30 casos para que una persona con una o dos ventas no aparezca artificialmente como la mejor. Cuando no existe ninguna observación del segmento exacto, el cálculo amplía progresivamente la comparación hasta utilizar una referencia más general y muestra el nivel de fallback aplicado.",
  },
  {
    title: "4. Aprendizaje en modo sombra",
    description: "Cada recomendación se cuenta una sola vez, agrupando sus estados mostrada, completada u omitida. Después se observan únicamente contactos, agendas, shows y ventas posteriores dentro del periodo. Los ajustes sugeridos no modifican la puntuación de producción: sirven para comprobar qué cambios podrían merecer una prueba futura.",
  },
  {
    title: "5. Control de fugas",
    description: "Busca señales concretas: asignaciones que continúan sin contacto, recomendaciones que quedaron sin trabajar, no-shows confirmados, seguimientos realmente vencidos, sobrecarga o desequilibrio del equipo y diferencias entre la asignación actual y la simulada. No crea seguimientos ni fechas que no existan en el CRM.",
  },
  {
    title: "6. Valor económico",
    description: "Las oportunidades y conversiones estimadas pueden convertirse en una cifra económica únicamente cuando introduces un valor de referencia por venta. Sin ese dato, el sistema muestra volumen e impacto estimado, pero no inventa ingresos.",
  },
  {
    title: "7. Atribución y privacidad",
    description: "Los resultados se atribuyen al caller o closer responsable durante cada intervalo de asignación, no necesariamente al propietario actual del lead. Los administradores globales pueden comparar al equipo; los usuarios normales solo reciben información dentro de su ámbito autorizado.",
  },
  {
    title: "8. Cómo interpretar los resultados",
    description: "Los datos muestran asociaciones observadas, no demuestran causalidad. Una puntuación alta no garantiza una venta y una fuga estimada no equivale a dinero perdido confirmado. La calidad aumenta a medida que entran más asignaciones y resultados reales; hasta entonces deben revisarse la muestra, el fallback y las razones mostradas.",
  },
] as const;

const REFERENCE_VALUE_DETAILS = [
  { title: "Qué debes introducir", description: "Un valor medio de referencia por venta. Debe ser una cifra no negativa y solo representa una hipótesis económica para el periodo analizado." },
  { title: "Qué modifica", description: "Convierte las conversiones potencialmente perdidas en un importe estimado. No cambia los rankings, las asignaciones simuladas ni el aprendizaje de las recomendaciones." },
  { title: "Qué ocurre si lo dejas vacío", description: "La sección de fugas continúa mostrando oportunidades y conversiones estimadas, pero los ingresos permanecen como «Sin valor de referencia». El CRM no inventa un ticket medio." },
] as const;

const ASSIGNMENT_DETAILS = [
  { title: "Objetivo", description: "Estimar qué caller y closer encajan mejor con cada lead autorizado sin modificar su asignación real." },
  { title: "Datos comparados", description: "Resultados en asignaciones anteriores, perfil explícito, fuente, campaña, tipo de lead, franja horaria, carga y tamaño de muestra. La velocidad de contacto se utiliza únicamente para callers." },
  { title: "Puntuación y evidencia", description: "La tabla separa conversión, velocidad, capacidad, confianza y afinidad. Las razones indican qué señales favorecieron o limitaron cada candidato." },
  { title: "Muestras y fallback", description: "El resultado se ajusta hacia una referencia de 30 casos. Cuando un segmento no tiene observaciones, se amplía progresivamente hasta encontrar evidencia más general." },
  { title: "Límite operativo", description: "La recomendación es informativa. No reasigna el lead, no reserva capacidad y no sustituye la decisión del responsable." },
] as const;

const LEARNING_DETAILS = [
  { title: "Unidad de análisis", description: "Cada recomendación se agrupa por actor, lead y clave para contar una sola ocurrencia aunque tenga eventos de mostrada y completada." },
  { title: "Resultados posteriores", description: "Solo se atribuyen contactos, agendas, shows y ventas ocurridos después de mostrar la recomendación y dentro del periodo analizado." },
  { title: "Segmentación", description: "Los resultados se separan por tipo de acción, perfil, fuente, campaña y caller cuando existe información suficiente." },
  { title: "Ajuste sugerido", description: "Compara el resultado comercial observado con su referencia y propone puntos en modo sombra. No altera la puntuación de Próxima mejor acción." },
  { title: "Interpretación", description: "La comparación es observacional: sirve para detectar patrones y diseñar pruebas, pero no demuestra que completar la recomendación haya causado la venta." },
] as const;

const LEAKAGE_DETAILS = [
  { title: "Sin contacto", description: "Asignaciones que permanecen sin un contacto válido durante el intervalo que les corresponde." },
  { title: "Recomendaciones sin trabajar", description: "Recomendaciones mostradas que, transcurrido el plazo definido, no terminaron completadas ni omitidas." },
  { title: "No-show", description: "Citas ya vencidas sin un show posterior registrado; una cita futura no se considera fuga." },
  { title: "Seguimiento vencido", description: "Solo utiliza alertas reales de llamada futura o seguimiento que siguen activas y cuya fecha ya pasó. No fabrica compromisos a partir de una cita." },
  { title: "Carga y asignación", description: "Señala sobrecarga, desequilibrio del equipo y diferencias entre el responsable actual y la recomendación simulada." },
  { title: "Impacto económico", description: "Las conversiones perdidas son estimaciones basadas en resultados válidos del periodo. El importe solo aparece si has introducido un valor por venta." },
] as const;

function InformationPopover({
  ariaLabel,
  title,
  description,
  details,
}: {
  ariaLabel: string;
  title: string;
  description: string;
  details: readonly { title: string; description: string }[];
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-11"
            aria-label={ariaLabel}
          />
        }
      >
        <InfoIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[75vh] w-[min(92vw,48rem)] overflow-y-auto p-5">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{description}</PopoverDescription>
        </PopoverHeader>
        <div className="grid gap-5 pt-2 sm:grid-cols-2">
          {details.map((detail) => (
            <section key={detail.title} className="flex flex-col gap-2">
              <h3 className="font-medium">{detail.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{detail.description}</p>
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CommercialIntelligenceInfo() {
  return <InformationPopover ariaLabel="Información detallada sobre Inteligencia" title="Cómo funciona Inteligencia" description="Metodología, límites y forma correcta de interpretar sus tres análisis." details={INTELLIGENCE_DETAILS} />;
}

export function CommercialIntelligencePanel() {
  const [range] = useState(initialRange);
  const [referenceSaleValue, setReferenceSaleValue] = useState("");
  const [libraryTitle, setLibraryTitle] = useState("");
  const [libraryContent, setLibraryContent] = useState("");
  const queryClient = useQueryClient();
  const { permissions } = usePermissionState();
  const isAdmin = permissions.includes("*");
  const parsedReferenceSaleValue = referenceSaleValue === "" ? undefined : Number(referenceSaleValue);
  const query = useQuery(trpc.commercialIntelligence.overview.queryOptions({ ...range, ...(Number.isFinite(parsedReferenceSaleValue) ? { referenceSaleValue: parsedReferenceSaleValue } : {}) }));
  const objectionQuery = useQuery(trpc.commercialIntelligence.objections.queryOptions(range));
  const libraryQuery = useQuery(trpc.commercialIntelligence.library.queryOptions(undefined));
  const invalidateLibrary = async () => queryClient.invalidateQueries(trpc.commercialIntelligence.library.queryFilter());
  const createLibrary = useMutation(trpc.commercialIntelligence.createLibraryDraft.mutationOptions({ onSuccess: async () => { setLibraryTitle(""); setLibraryContent(""); await invalidateLibrary(); } }));
  const publishLibrary = useMutation(trpc.commercialIntelligence.publishLibraryVersion.mutationOptions({ onSuccess: invalidateLibrary }));
  const archiveLibrary = useMutation(trpc.commercialIntelligence.archiveLibraryVersion.mutationOptions({ onSuccess: invalidateLibrary }));

  if (query.isPending) return <div className="flex flex-col gap-4 p-6"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (query.isError) return <p className="p-6 text-sm text-destructive">No se pudo cargar Inteligencia.</p>;
  if (!query.data) return <section className="p-4"><Empty heading="Sin datos disponibles" description="Prueba con otro periodo." /></section>;
  const value = query.data;
  const leakage = value.leakage.filter((item) => item.count > 0);

  return <section className="flex min-w-0 flex-col gap-4">
    <header className="flex flex-col gap-1"><div className="flex items-center gap-1"><h2 className="text-2xl font-semibold">Inteligencia</h2><CommercialIntelligenceInfo /></div><p className="text-sm text-muted-foreground">Solo simulación: no cambia asignaciones ni reglas de producción.</p></header>
    <Card size="sm" className="w-fit max-w-full"><CardHeader className="pb-2"><div className="flex items-center gap-1"><CardTitle>Valor de referencia</CardTitle><InformationPopover ariaLabel="Información sobre el valor de referencia" title="Cómo se utiliza el valor de referencia" description="Convierte el impacto operativo en una estimación económica sin modificar los cálculos comerciales." details={REFERENCE_VALUE_DETAILS} /></div><CardDescription>Opcional. Solo convierte oportunidades estimadas en ingresos.</CardDescription></CardHeader><CardContent className="p-3 pt-0"><FieldGroup><Field className="w-full sm:w-56"><FieldLabel htmlFor="reference-sale-value">Valor por venta</FieldLabel><Input className="h-11" id="reference-sale-value" type="number" min="0" value={referenceSaleValue} onChange={(event) => setReferenceSaleValue(event.target.value)} /><FieldDescription>Sin valor no se inventan ingresos.</FieldDescription></Field></FieldGroup></CardContent></Card>
    <Tabs defaultValue="asignacion"><TabsList className="flex h-auto w-fit max-w-full flex-nowrap gap-1 rounded-lg border bg-muted/40 p-1"><TabsTrigger className="h-11! min-h-11! data-active:bg-background" value="asignacion">Asignación simulada</TabsTrigger><TabsTrigger className="h-11! min-h-11! data-active:bg-background" value="aprendizaje">Aprendizaje</TabsTrigger><TabsTrigger className="h-11! min-h-11! data-active:bg-background" value="fugas">Fugas</TabsTrigger><TabsTrigger className="h-11! min-h-11! data-active:bg-background" value="objeciones">Objeciones y motivaciones</TabsTrigger><TabsTrigger className="h-11! min-h-11! data-active:bg-background" value="biblioteca">Biblioteca comercial inteligente</TabsTrigger></TabsList>
      <TabsContent value="asignacion"><Card><CardHeader><div className="flex items-center gap-1"><CardTitle>Recomendaciones transparentes</CardTitle><InformationPopover ariaLabel="Información sobre la asignación simulada" title="Cómo se calcula la asignación simulada" description="Factores, evidencia y límites de las recomendaciones de caller y closer." details={ASSIGNMENT_DETAILS} /></div><CardDescription>Rendimiento por segmento, muestra ajustada a 30 casos, velocidad y carga. Ninguna recomendación escribe una asignación.</CardDescription></CardHeader><CardContent className="max-h-96 overflow-auto"><Table><TableHeader><TableRow><TableHead>Lead</TableHead><TableHead>Caller recomendado</TableHead><TableHead>Closer recomendado</TableHead><TableHead>Evidencia</TableHead></TableRow></TableHeader><TableBody>{value.assignments.length === 0 ? emptyRow(4, "Sin leads para simular", "No hay leads autorizados en este periodo.") : value.assignments.map((item) => <TableRow key={item.leadId}><TableCell>{item.leadName}</TableCell><TableCell>{item.caller ? <div className="flex flex-col gap-1"><span>{item.caller.name}</span><span className="text-xs text-muted-foreground">{item.caller.score} pts · {item.caller.sampleSize} casos · {item.caller.fallbackLevel}</span><span className="text-xs text-muted-foreground">Conv. {item.caller.factorScores.conversion} · Vel. {item.caller.factorScores.speed ?? "—"} · Carga {item.caller.factorScores.capacity} · Conf. {item.caller.factorScores.confidence} · Afinidad {item.caller.factorScores.relevance}</span></div> : "Sin candidato"}</TableCell><TableCell>{item.closer ? <div className="flex flex-col gap-1"><span>{item.closer.name}</span><span className="text-xs text-muted-foreground">{item.closer.score} pts · {item.closer.sampleSize} casos · {item.closer.fallbackLevel}</span><span className="text-xs text-muted-foreground">Conv. {item.closer.factorScores.conversion} · Carga {item.closer.factorScores.capacity} · Conf. {item.closer.factorScores.confidence} · Afinidad {item.closer.factorScores.relevance}</span></div> : "Sin candidato"}</TableCell><TableCell><div className="flex flex-col gap-1 text-xs text-muted-foreground">{item.reasons.map((reason, reasonIndex) => <span key={`${item.leadId}:${reasonIndex}:${reason}`}>{reason}</span>)}</div></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
      <TabsContent value="aprendizaje"><Card><CardHeader><div className="flex items-center gap-1"><CardTitle>Ajustes en modo sombra</CardTitle><InformationPopover ariaLabel="Información sobre el aprendizaje en modo sombra" title="Cómo aprende de las recomendaciones" description="Atribución temporal, segmentación y límites de los ajustes sugeridos." details={LEARNING_DETAILS} /></div><CardDescription>Compara resultados posteriores por acción, segmento y caller. Es observacional: no implica causalidad ni cambia producción.</CardDescription></CardHeader><CardContent className="max-h-96 overflow-auto"><Table><TableHeader><TableRow><TableHead>Acción y segmento</TableHead><TableHead>Muestra</TableHead><TableHead>Estados</TableHead><TableHead>Resultados posteriores</TableHead><TableHead>Ajuste</TableHead></TableRow></TableHeader><TableBody>{value.learning.length === 0 ? emptyRow(5, "Sin ocurrencias para aprender", "Aparecerán resultados al registrar recomendaciones en este periodo.") : value.learning.map((item) => <TableRow key={`${item.actionType}-${item.profile}-${item.source}-${item.campaign}-${item.callerId}`}><TableCell><div className="flex flex-col gap-1"><span>{item.actionType}</span><span className="text-xs text-muted-foreground">{item.profile ?? "Sin perfil"} · {item.source ?? "Sin fuente"} · {item.campaign ?? "Sin campaña"}</span></div></TableCell><TableCell>{item.sampleSize}</TableCell><TableCell>{item.shown} mostradas · {item.completed} completadas · {item.skipped} omitidas</TableCell><TableCell>{item.contactedRate}% contacto · {item.appointmentRate}% agenda · {item.showRate}% show · {item.saleRate}% venta</TableCell><TableCell><Badge variant="outline">{item.suggestedScoreAdjustment} pts · sombra</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
      <TabsContent value="fugas"><Card><CardHeader><div className="flex items-center gap-1"><CardTitle>Control de fugas</CardTitle><InformationPopover ariaLabel="Información sobre el control de fugas" title="Cómo se detectan y estiman las fugas" description="Definiciones operativas, atribución y cálculo económico del impacto." details={LEAKAGE_DETAILS} /></div><CardDescription>Identifica oportunidades operativas con estimaciones temporales. Los ingresos solo aparecen si indicaste un valor de referencia.</CardDescription></CardHeader><CardContent className="max-h-96 overflow-auto"><Table><TableHeader><TableRow><TableHead>Fuga</TableHead><TableHead>Oportunidades</TableHead><TableHead>Conversiones estimadas</TableHead><TableHead>Ingresos estimados</TableHead></TableRow></TableHeader><TableBody>{leakage.length === 0 ? emptyRow(4, "Sin fugas detectadas", "No hay señales operativas en el periodo autorizado.") : leakage.map((item) => <TableRow key={item.key}><TableCell>{item.label}</TableCell><TableCell>{item.count}</TableCell><TableCell>{item.estimatedMissedConversions}</TableCell><TableCell>{item.estimatedRevenue === null ? "Sin valor de referencia" : item.estimatedRevenue}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
      <TabsContent value="objeciones"><Card><CardHeader><div className="flex items-center gap-1"><CardTitle>Objeciones y motivaciones confirmadas</CardTitle><InformationPopover ariaLabel="Información sobre objeciones y motivaciones" title="Cómo se construye este análisis" description="Solo utiliza selecciones guardadas por una persona en feedbacks inmutables." details={[{ title: "Atribución histórica", description: "Reconstruye la atribución que existía al guardar el feedback, no la atribución actual." }, { title: "Privacidad", description: "Nunca devuelve transcripciones, información extra ni respuestas libres." }, { title: "Interpretación", description: "Los resultados posteriores son observacionales y no prueban causalidad." }]} /></div><CardDescription>Taxonomías humanas, atribución histórica y resultados posteriores.</CardDescription></CardHeader><CardContent className="max-h-96 overflow-auto">{objectionQuery.isPending ? <Skeleton className="h-40 w-full" /> : objectionQuery.isError ? <p className="text-sm text-destructive">No se pudo cargar el análisis.</p> : <Table><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>Atribución al guardar</TableHead><TableHead>Leads</TableHead><TableHead>Ventas</TableHead></TableRow></TableHeader><TableBody>{[...(objectionQuery.data?.objections ?? []).map((row) => ({ ...row, group: "Objeción" })), ...(objectionQuery.data?.motivations ?? []).map((row) => ({ ...row, group: "Motivación" }))].length === 0 ? emptyRow(5, "Sin feedback confirmado", "Aparecerá al guardar objeciones o motivaciones válidas.") : [...(objectionQuery.data?.objections ?? []).map((row) => ({ ...row, group: "Objeción" })), ...(objectionQuery.data?.motivations ?? []).map((row) => ({ ...row, group: "Motivación" }))].map((row) => <TableRow key={`${row.group}-${row.value}-${row.source}-${row.campaign}-${row.ad}`}><TableCell>{row.group}</TableCell><TableCell>{row.label}</TableCell><TableCell>{row.source ?? "Sin fuente"} · {row.campaign ?? "Sin campaña"} · {row.ad ?? "Sin anuncio"}</TableCell><TableCell>{row.leads}</TableCell><TableCell>{row.sales}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></TabsContent>
      <TabsContent value="biblioteca"><div className="flex flex-col gap-4">{isAdmin && <Card><CardHeader><CardTitle>Nueva versión para aprobación</CardTitle><CardDescription>Guardar o publicar añade una versión; nunca modifica el historial.</CardDescription></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor="library-title">Título</FieldLabel><Input id="library-title" value={libraryTitle} onChange={(event) => setLibraryTitle(event.target.value)} /></Field><Field><FieldLabel htmlFor="library-content">Contenido</FieldLabel><Textarea id="library-content" value={libraryContent} onChange={(event) => setLibraryContent(event.target.value)} /></Field><div className="flex gap-2"><Button disabled={!libraryTitle || !libraryContent || createLibrary.isPending} onClick={() => createLibrary.mutate({ lineageKey: crypto.randomUUID(), type: "objection_response", title: libraryTitle, content: libraryContent, targeting: {}, evidence: {} })}>Guardar borrador</Button></div>{createLibrary.isError && <p className="text-sm text-destructive">No se pudo guardar la versión.</p>}</FieldGroup></CardContent></Card>}<Card><CardHeader><div className="flex items-center gap-1"><CardTitle>Biblioteca comercial versionada</CardTitle><InformationPopover ariaLabel="Información sobre la biblioteca comercial" title="Cómo funciona la biblioteca" description="Contenido aprobado manualmente, versionado y de solo lectura para callers." details={[{ title: "Versiones", description: "Cada acción crea una versión con actor, estado y fecha." }, { title: "Privacidad", description: "Los callers solo ven contenido publicado; las evidencias privadas requieren administración." }, { title: "Experimentos", description: "Un experimento completado y aprobado se muestra como respaldado por experimento, nunca como evidencia causal." }]} /></div><CardDescription>Sin publicación automática ni acciones operativas.</CardDescription></CardHeader><CardContent>{libraryQuery.isPending ? <Skeleton className="h-40 w-full" /> : libraryQuery.isError ? <p className="text-sm text-destructive">No se pudo cargar la biblioteca.</p> : !libraryQuery.data?.length ? <Empty heading="Biblioteca vacía" description="Todavía no hay contenido disponible." /> : <div className="flex flex-col gap-3">{libraryQuery.data.map((item) => <Card key={item.id}><CardHeader><CardTitle>{item.title}</CardTitle><CardDescription>v{item.version} · {commercialUiLabel(item.status)} · {commercialUiLabel(item.evidence.evidenceLabel ?? "observational")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><p className="whitespace-pre-wrap text-sm">{item.content}</p>{isAdmin && <div className="flex flex-wrap gap-2">{item.status === "draft" && <Button variant="outline" disabled={publishLibrary.isPending} onClick={() => publishLibrary.mutate({ lineageKey: item.lineageKey })}>Publicar con aprobación humana</Button>}{item.status === "published" && <Button variant="outline" disabled={archiveLibrary.isPending} onClick={() => archiveLibrary.mutate({ lineageKey: item.lineageKey })}>Archivar con nueva versión</Button>}</div>}</CardContent></Card>)}</div>}</CardContent></Card></div></TabsContent>
    </Tabs>
  </section>;
}


