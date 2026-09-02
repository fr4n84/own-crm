"use client";

import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { InfoIcon } from "lucide-react";

import { Button } from "@crm-fran/ui/components/button";
import { Badge } from "@crm-fran/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@crm-fran/ui/components/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@crm-fran/ui/components/dialog";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@crm-fran/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crm-fran/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@crm-fran/ui/components/table";

type QualityLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  source: string | null;
  campaign: string | null;
};

type QualityMetrics = {
  assigned: number;
  contactedRate: number;
  appointmentRate: number;
  showRate: number;
  saleRate: number;
  averageFirstContactMinutes: number | null;
};

type Breakdown = QualityMetrics & { value: string };

type CallerQualityRow = QualityMetrics & {
  callerId: string;
  callerName: string;
  adjustedIndex: number;
  rank?: number;
  breakdowns: {
    profiles: Breakdown[];
    sources: Breakdown[];
    campaigns: Breakdown[];
  };
  leads: QualityLead[];
};

type TrendRow = QualityMetrics & {
  key: string;
  label: string;
  callerId: string;
  callerName: string;
};

type SpeedBucket = QualityMetrics & {
  key: string;
  label: string;
};

type SpeedGroup = {
  value: string;
  label: string;
  total: number;
  buckets: SpeedBucket[];
};

type SpeedDimension = "overall" | "callers" | "profiles" | "sources" | "campaigns";

type AttemptBucket = QualityMetrics & {
  key: string;
  label: string;
};

type AttemptSummary = {
  total: number;
  averageAttempts: number;
  averageAttemptIntervalMinutes: number | null;
  notContactedBelowThree: number;
  notContactedBelowThreeRate: number;
  buckets: AttemptBucket[];
};

type AttemptGroup = AttemptSummary & {
  value: string;
  label: string;
};

export type CallerQualityData = {
  minimumSampleSize: number;
  methodology: string;
  ranked: CallerQualityRow[];
  insufficientSample: CallerQualityRow[];
  weekly: TrendRow[];
  monthly: TrendRow[];
  speedAnalysis: {
    overall: SpeedBucket[];
    callers: SpeedGroup[];
    profiles: SpeedGroup[];
    sources: SpeedGroup[];
    campaigns: SpeedGroup[];
  };
  attemptAnalysis: {
    overall: AttemptSummary;
    callers: AttemptGroup[];
    profiles: AttemptGroup[];
    sources: AttemptGroup[];
    campaigns: AttemptGroup[];
  };
};

const trendConfig = {
  appointmentRate: { label: "Agenda", color: "var(--chart-1)" },
  showRate: { label: "Asistencia", color: "var(--chart-2)" },
  saleRate: { label: "Venta", color: "var(--chart-3)" },
} satisfies ChartConfig;

const attemptConfig = {
  contactedRate: { label: "Contacto", color: "var(--chart-4)" },
  ...trendConfig,
} satisfies ChartConfig;

function formatContactTime(minutes: number | null) {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours} h` : `${hours} h ${remainingMinutes} min`;
}

export function CallerQualitySection({
  data,
  profileLabels,
}: {
  data: CallerQualityData;
  profileLabels: Record<string, string>;
}) {
  const [selectedCallerId, setSelectedCallerId] = useState("");
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");
  const [speedDimension, setSpeedDimension] = useState<SpeedDimension>("overall");
  const [speedGroupValue, setSpeedGroupValue] = useState("");
  const [attemptDimension, setAttemptDimension] = useState<SpeedDimension>("overall");
  const [attemptGroupValue, setAttemptGroupValue] = useState("");
  const [drilldown, setDrilldown] = useState<{
    title: string;
    leads: QualityLead[];
  } | null>(null);
  const callers = [...data.ranked, ...data.insufficientSample];
  const activeCaller = callers.find(({ callerId }) => callerId === selectedCallerId) ?? callers[0];
  const trends = (period === "weekly" ? data.weekly : data.monthly).filter(
    ({ callerId }) => callerId === activeCaller?.callerId,
  );
  const speedGroups = speedDimension === "overall" ? [] : data.speedAnalysis[speedDimension];
  const activeSpeedGroup = speedGroups.find(({ value }) => value === speedGroupValue) ?? speedGroups[0];
  const speedRows = speedDimension === "overall"
    ? data.speedAnalysis.overall
    : activeSpeedGroup?.buckets ?? [];
  const attemptGroups = attemptDimension === "overall" ? [] : data.attemptAnalysis[attemptDimension];
  const activeAttemptGroup = attemptGroups.find(({ value }) => value === attemptGroupValue) ?? attemptGroups[0];
  const attemptSummary = attemptDimension === "overall"
    ? data.attemptAnalysis.overall
    : activeAttemptGroup;
  const attemptRows = attemptSummary?.buckets ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-1.5">
            <CardTitle>Ranking ajustado de callers</CardTitle>
            <RankingMethodology minimumSampleSize={data.minimumSampleSize} />
          </div>
          <CardDescription>{data.methodology}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Posición</TableHead>
                <TableHead>Caller</TableHead>
                <TableHead>Índice ajustado</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Contactados</TableHead>
                <TableHead>Agenda</TableHead>
                <TableHead>Asistencia</TableHead>
                <TableHead>Venta</TableHead>
                <TableHead>Primer contacto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.ranked.map((caller) => (
                <TableRow key={caller.callerId}>
                  <TableCell className="font-semibold">#{caller.rank}</TableCell>
                  <TableCell className="font-medium">{caller.callerName}</TableCell>
                  <TableCell><Badge variant={caller.adjustedIndex >= 100 ? "default" : "secondary"}>{caller.adjustedIndex}</Badge></TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => setDrilldown({ title: `Leads de ${caller.callerName}`, leads: caller.leads })}>{caller.assigned}</Button></TableCell>
                  <TableCell>{caller.contactedRate}%</TableCell>
                  <TableCell>{caller.appointmentRate}%</TableCell>
                  <TableCell>{caller.showRate}%</TableCell>
                  <TableCell>{caller.saleRate}%</TableCell>
                  <TableCell>{formatContactTime(caller.averageFirstContactMinutes)}</TableCell>
                </TableRow>
              ))}
              {data.ranked.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Ningún caller alcanza todavía la muestra mínima de {data.minimumSampleSize} leads.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          {data.insufficientSample.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Sin ordenar por muestra insuficiente: {data.insufficientSample.map((caller) => `${caller.callerName} (${caller.assigned})`).join(", ")}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Intentos necesarios para contactar</CardTitle>
            <CardDescription className="mt-1">
              Relaciona los intentos registrados antes del primer contacto válido con el resultado posterior del lead.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={attemptDimension}
              onValueChange={(value) => setAttemptDimension((value ?? "overall") as SpeedDimension)}
            >
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="overall">General</SelectItem>
                  <SelectItem value="callers">Caller</SelectItem>
                  <SelectItem value="profiles">Perfil</SelectItem>
                  <SelectItem value="sources">Origen</SelectItem>
                  <SelectItem value="campaigns">Campaña</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {activeAttemptGroup && (
              <Select
                value={activeAttemptGroup.value}
                onValueChange={(value) => setAttemptGroupValue(value ?? "")}
              >
                <SelectTrigger className="w-52">
                  <SelectValue>
                    {attemptDimension === "profiles"
                      ? profileLabels[activeAttemptGroup.value] ?? activeAttemptGroup.label
                      : activeAttemptGroup.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {attemptGroups.map((group) => (
                      <SelectItem key={group.value} value={group.value}>
                        {attemptDimension === "profiles"
                          ? profileLabels[group.value] ?? group.label
                          : group.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Media: {attemptSummary?.averageAttempts ?? 0} intentos</Badge>
            <Badge variant="secondary">
              Cadencia media: {formatContactTime(attemptSummary?.averageAttemptIntervalMinutes ?? null)}
            </Badge>
            <Badge variant="secondary">
              Sin contacto con menos de 3 intentos: {attemptSummary?.notContactedBelowThree ?? 0} ({attemptSummary?.notContactedBelowThreeRate ?? 0}%)
            </Badge>
          </div>
          <ChartContainer config={attemptConfig} className="h-72 w-full">
            <BarChart accessibilityLayer data={attemptRows} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="contactedRate" fill="var(--color-contactedRate)" radius={4} />
              <Bar dataKey="appointmentRate" fill="var(--color-appointmentRate)" radius={4} />
              <Bar dataKey="showRate" fill="var(--color-showRate)" radius={4} />
              <Bar dataKey="saleRate" fill="var(--color-saleRate)" radius={4} />
            </BarChart>
          </ChartContainer>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Intentos registrados</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Contactados</TableHead>
                  <TableHead>Agenda</TableHead>
                  <TableHead>Asistencia</TableHead>
                  <TableHead>Venta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attemptRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell>{row.assigned}</TableCell>
                    <TableCell>{row.contactedRate}%</TableCell>
                    <TableCell>{row.appointmentRate}%</TableCell>
                    <TableCell>{row.showRate}%</TableCell>
                    <TableCell>{row.saleRate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Impacto de la velocidad de contacto</CardTitle>
            <CardDescription className="mt-1">
              Conversión observada según el tiempo desde la asignación hasta el primer contacto válido. Muestra asociación, no causalidad.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={speedDimension}
              onValueChange={(value) => setSpeedDimension((value ?? "overall") as SpeedDimension)}
            >
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="overall">General</SelectItem>
                  <SelectItem value="callers">Caller</SelectItem>
                  <SelectItem value="profiles">Perfil</SelectItem>
                  <SelectItem value="sources">Origen</SelectItem>
                  <SelectItem value="campaigns">Campaña</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {activeSpeedGroup && (
              <Select
                value={activeSpeedGroup.value}
                onValueChange={(value) => setSpeedGroupValue(value ?? "")}
              >
                <SelectTrigger className="w-52">
                  <SelectValue>
                    {speedDimension === "profiles"
                      ? profileLabels[activeSpeedGroup.value] ?? activeSpeedGroup.label
                      : activeSpeedGroup.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {speedGroups.map((group) => (
                      <SelectItem key={group.value} value={group.value}>
                        {speedDimension === "profiles"
                          ? profileLabels[group.value] ?? group.label
                          : group.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ChartContainer config={trendConfig} className="h-72 w-full">
            <BarChart accessibilityLayer data={speedRows} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="appointmentRate" fill="var(--color-appointmentRate)" radius={4} />
              <Bar dataKey="showRate" fill="var(--color-showRate)" radius={4} />
              <Bar dataKey="saleRate" fill="var(--color-saleRate)" radius={4} />
            </BarChart>
          </ChartContainer>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tiempo hasta contacto</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Contactados</TableHead>
                  <TableHead>Agenda</TableHead>
                  <TableHead>Asistencia</TableHead>
                  <TableHead>Venta</TableHead>
                  <TableHead>Media real</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {speedRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell>{row.assigned}</TableCell>
                    <TableCell>{row.contactedRate}%</TableCell>
                    <TableCell>{row.appointmentRate}%</TableCell>
                    <TableCell>{row.showRate}%</TableCell>
                    <TableCell>{row.saleRate}%</TableCell>
                    <TableCell>{formatContactTime(row.averageFirstContactMinutes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {activeCaller && (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <BreakdownCard title="Resultados por perfil" rows={activeCaller.breakdowns.profiles} labels={profileLabels} />
            <BreakdownCard title="Resultados por origen" rows={activeCaller.breakdowns.sources} />
            <BreakdownCard title="Resultados por campaña" rows={activeCaller.breakdowns.campaigns} />
          </div>

          <Card>
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Evolución de conversión</CardTitle>
                <CardDescription className="mt-1">Agenda, asistencia y venta para el caller seleccionado.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={activeCaller.callerId} onValueChange={(value) => setSelectedCallerId(value ?? "")}>
                  <SelectTrigger className="w-48"><SelectValue>{activeCaller.callerName}</SelectValue></SelectTrigger>
                  <SelectContent><SelectGroup>{callers.map((caller) => <SelectItem key={caller.callerId} value={caller.callerId}>{caller.callerName}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                <Button variant={period === "weekly" ? "default" : "outline"} onClick={() => setPeriod("weekly")}>Semanal</Button>
                <Button variant={period === "monthly" ? "default" : "outline"} onClick={() => setPeriod("monthly")}>Mensual</Button>
              </div>
            </CardHeader>
            <CardContent>
              {trends.length === 0 ? (
                <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">Sin datos para este intervalo.</div>
              ) : (
                <ChartContainer config={trendConfig} className="h-72 w-full">
                  <LineChart accessibilityLayer data={trends} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line dataKey="appointmentRate" type="monotone" stroke="var(--color-appointmentRate)" strokeWidth={2} dot={false} />
                    <Line dataKey="showRate" type="monotone" stroke="var(--color-showRate)" strokeWidth={2} dot={false} />
                    <Line dataKey="saleRate" type="monotone" stroke="var(--color-saleRate)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={Boolean(drilldown)} onOpenChange={(open) => { if (!open) setDrilldown(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{drilldown?.title ?? "Leads del caller"}</DialogTitle>
            <DialogDescription>{drilldown?.leads.length ?? 0} leads incluidos en el cálculo.</DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Lead</TableHead><TableHead>Email</TableHead><TableHead>Teléfono</TableHead><TableHead>Origen</TableHead><TableHead>Campaña</TableHead></TableRow></TableHeader>
            <TableBody>
              {drilldown?.leads.map((lead) => <TableRow key={lead.id}><TableCell className="font-medium">{lead.name}</TableCell><TableCell>{lead.email}</TableCell><TableCell>{lead.phone}</TableCell><TableCell>{lead.source ?? "—"}</TableCell><TableCell>{lead.campaign ?? "—"}</TableCell></TableRow>)}
              {drilldown?.leads.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No hay leads en este segmento.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RankingMethodology({ minimumSampleSize }: { minimumSampleSize: number }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="rounded-full"
            aria-label="Información sobre el cálculo del ranking"
          />
        }
      >
        <InfoIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[75vh] w-[min(92vw,44rem)] overflow-y-auto p-5">
        <PopoverHeader>
          <PopoverTitle>Cómo se calculan el ranking y las conversiones</PopoverTitle>
          <PopoverDescription>
            El ranking mide resultados observables del CRM. No analiza el discurso, el tono ni la técnica comercial de la llamada.
          </PopoverDescription>
        </PopoverHeader>
        <div className="grid gap-5 pt-2 sm:grid-cols-2">
          <MethodologyStep title="1. Cohorte y responsabilidad">
            Cada unidad evaluada es una asignación real de un lead a un caller dentro del intervalo seleccionado. La responsabilidad comienza en el evento de asignación y termina cuando el lead se reasigna a otro caller. Un mismo lead reasignado puede representar dos oportunidades distintas, cada una atribuida a su responsable y a su intervalo.
          </MethodologyStep>
          <MethodologyStep title="2. Qué significa cada conversión">
            Contactado exige al menos un feedback del caller cuyo resultado no sea «Lead no contactado». Agenda exige contacto y un evento de cita creada o reprogramada. Asistencia exige agenda y un feedback posterior del closer que demuestre que la conversación ocurrió. Venta exige asistencia y un resultado «Venta» del closer.
          </MethodologyStep>
          <MethodologyStep title="3. Denominador de los porcentajes">
            Contacto, agenda, asistencia y venta se dividen siempre entre todas las asignaciones del caller, no entre la etapa anterior. Por ejemplo, 8 agendas entre 20 asignaciones equivalen a un 40%, aunque solo 15 leads hayan sido contactados.
          </MethodologyStep>
          <MethodologyStep title="4. Puntuación de resultado por lead">
            Un lead sin agenda aporta 0 puntos; una agenda sin asistencia, 0,25; una asistencia sin venta, 0,55; y una venta, 1 punto. Es acumulativo: agenda pesa 25%, asistencia añade 30% y venta añade 45%. Contactar y la velocidad se muestran, pero no suman puntos al índice ajustado.
          </MethodologyStep>
          <MethodologyStep title="5. Ajuste por dificultad de los leads">
            Cada asignación se compara con el resultado medio de otras asignaciones con la misma combinación de perfil, origen y campaña. Si esa combinación tiene menos de cinco casos, se utiliza la media global para evitar conclusiones extremas con muestras pequeñas.
          </MethodologyStep>
          <MethodologyStep title="6. Fórmula del índice ajustado">
            El índice es <strong>100 + (resultado real medio − resultado esperado medio) × 100</strong>. Un 100 significa rendimiento igual al esperado para esa mezcla de leads; 112 significa 12 puntos por encima; 91 significa 9 puntos por debajo. El valor se limita entre 0 y 200 y se redondea a una decimal.
          </MethodologyStep>
          <MethodologyStep title="7. Entrada al ranking y desempate">
            Solo se ordenan callers con al menos {minimumSampleSize} asignaciones en el intervalo. Quienes no alcanzan la muestra aparecen como «muestra insuficiente». El orden usa primero el índice ajustado y, si empatan, el porcentaje de venta.
          </MethodologyStep>
          <MethodologyStep title="8. Velocidad y evolución temporal">
            El primer contacto es el tiempo entre la asignación y el primer feedback que no sea «Lead no contactado». El análisis separa menos de 15 minutos, de 15 a menos de 60, de 1 a menos de 3 horas, de 3 a menos de 24 horas, 24 horas o más y sin contacto. Compara conversiones observadas; no demuestra que la velocidad sea su causa. Las gráficas temporales agrupan por fecha de asignación y muestran porcentajes brutos.
          </MethodologyStep>
          <MethodologyStep title="9. Datos usados y límites">
            El perfil procede de la última clasificación válida registrada durante la asignación. Origen y campaña proceden del valor actual del lead. Los pesos 25/30/45 y los umbrales 5/10 son una calibración inicial: deberán revisarse cuando exista suficiente información real del negocio.
          </MethodologyStep>
          <MethodologyStep title="10. Intentos y cadencia">
            Cada feedback del caller cuenta como un intento. Para un lead contactado se cuentan los intentos hasta incluir el primer resultado distinto de «Lead no contactado»; los posteriores ya no forman parte de la captación. Para uno todavía no contactado se cuentan todos los intentos fallidos registrados. «Sin contacto con menos de 3 intentos» describe el registro disponible, no demuestra que el caller haya abandonado el lead.
          </MethodologyStep>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MethodologyStep({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </section>
  );
}

function BreakdownCard({
  title,
  rows,
  labels,
}: {
  title: string;
  rows: readonly Breakdown[];
  labels?: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Segmento</TableHead><TableHead>Leads</TableHead><TableHead>Agenda</TableHead><TableHead>Show</TableHead><TableHead>Venta</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((row) => <TableRow key={row.value}><TableCell className="font-medium">{labels?.[row.value] ?? row.value}</TableCell><TableCell>{row.assigned}</TableCell><TableCell>{row.appointmentRate}%</TableCell><TableCell>{row.showRate}%</TableCell><TableCell>{row.saleRate}%</TableCell></TableRow>)}
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin datos.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
