import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@crm-fran/ui/components/card";

type OperationalCounters = {
  activeAlerts: number;
  leadsAtRisk: number;
  highPriority: number;
  futureCalls: number;
};

const COUNTERS: Array<{
  key: keyof OperationalCounters;
  label: string;
}> = [
  { key: "activeAlerts", label: "Alertas activas" },
  { key: "leadsAtRisk", label: "Leads en riesgo" },
  { key: "highPriority", label: "Prioridad alta" },
  { key: "futureCalls", label: "Llamar futuro" },
];

export function AlertOperationalCounters({
  counters,
}: {
  counters: OperationalCounters;
}) {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {COUNTERS.map(({ key, label }) => (
        <Card key={key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {counters[key]}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
