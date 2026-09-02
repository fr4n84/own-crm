"use client";

import { Crown, Trophy } from "lucide-react";
import { useState } from "react";

import { Badge } from "@crm-fran/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";
import { Empty } from "@crm-fran/ui/components/empty";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@crm-fran/ui/components/table";
import { ToggleGroup, ToggleGroupItem } from "@crm-fran/ui/components/toggle-group";
import { Can } from "@crm-fran/ui/permissions/can";

import { RankingSettingsDialog } from "./ranking-settings-dialog";
import { useRankings, type RankingPeriod } from "./use-rankings";

const PERIOD_LABELS: Record<RankingPeriod, string> = {
  week: "Semanal",
  fortnight: "Quincenal",
  month: "Mensual",
};

const METRIC_LABELS: Record<string, string> = {
  caller_lead_taken: "Caller que más leads coge",
  caller_appointment: "Caller que más leads agenda",
  caller_show: "Caller con más shows",
  closer_sale: "Closer con más cierres",
  closer_follow_up_show: "Closer que convierte seguimientos en show",
};

const MEDALS = ["🥇", "🥈", "🥉"];

export function RankingsView() {
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const rankings = useRankings(period);

  if (rankings.isLoading) return <Skeleton className="h-[48rem] w-full" />;
  if (rankings.isError || !rankings.data) return <p>Error al cargar rankings.</p>;

  const data = rankings.data;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Periodo competitivo</CardTitle>
            <CardDescription>
              La quincena representa los últimos 15 días. Los datos se actualizan automáticamente.
            </CardDescription>
          </div>
          <Can permission="settings:write">
            <RankingSettingsDialog settings={data.settings} />
          </Can>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            value={[period]}
            variant="outline"
            onValueChange={(values) => {
              const selected = values[0] as RankingPeriod | undefined;
              if (selected) setPeriod(selected);
            }}
          >
            {(Object.keys(PERIOD_LABELS) as RankingPeriod[]).map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {PERIOD_LABELS[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown data-icon="inline-start" />
            Líder actual de la liga
          </CardTitle>
          <CardDescription>Clasificación {PERIOD_LABELS[period].toLowerCase()} según los puntos configurados.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.currentLeader ? (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold">{data.currentLeader.name}</span>
                <span className="text-muted-foreground">Va ganando en este momento</span>
              </div>
              <Badge className="text-base">{data.currentLeader.points} puntos</Badge>
            </div>
          ) : (
            <Empty heading="Todavía no hay actividad en este periodo" />
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        {data.categoryPodiums.map((podium) => (
          <Card key={podium.metric}>
            <CardHeader>
              <CardTitle>{METRIC_LABELS[podium.metric]}</CardTitle>
              <CardDescription>Podio por volumen de resultados reales.</CardDescription>
            </CardHeader>
            <CardContent>
              {podium.entries.length === 0 ? (
                <Empty heading="Sin resultados todavía" />
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {podium.entries.map((entry, index) => (
                    <div key={entry.userId} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 text-center shadow-sm">
                      <span className="text-3xl" aria-label={`Posición ${index + 1}`}>{MEDALS[index]}</span>
                      <strong>{entry.name}</strong>
                      <Badge variant="secondary">{entry.value}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Clasificación general</CardTitle>
          <CardDescription>Suma ponderada de todas las métricas del periodo.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {data.standings.length === 0 ? (
            <Empty heading="No hay clasificación todavía" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Posición</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="text-right">Puntos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.standings.map((standing) => (
                  <TableRow key={standing.userId}>
                    <TableCell><Badge variant={standing.position === 1 ? "default" : "outline"}>#{standing.position}</Badge></TableCell>
                    <TableCell className="font-medium">{standing.name}</TableCell>
                    <TableCell className="text-right font-mono">{standing.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy data-icon="inline-start" />Ganadores mensuales</CardTitle>
            <CardDescription>Resultado congelado al cerrar cada mes.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.history.length === 0 ? <Empty heading="Aún no hay meses cerrados" /> : data.history.map((winner) => (
              <div key={`${winner.month}-${winner.userId}`} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span><strong>{winner.name}</strong> · {winner.month}</span>
                <Badge>{winner.points} puntos</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Palmarés</CardTitle>
            <CardDescription>Cuántas ligas mensuales ha ganado cada usuario.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.championshipWins.length === 0 ? <Empty heading="Sin campeones todavía" /> : data.championshipWins.map((winner) => (
              <div key={winner.userId} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <strong>{winner.name}</strong>
                <Badge variant="secondary">{winner.count} {winner.count === 1 ? "liga" : "ligas"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
