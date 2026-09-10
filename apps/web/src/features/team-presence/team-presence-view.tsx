import { UsersIcon } from "lucide-react";

import type { TeamPresenceCategory, TeamPresenceDto } from "@crm-fran/api/team-presence/domain";

import { Avatar, AvatarFallback } from "@crm-fran/ui/components/avatar";
import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Empty } from "@crm-fran/ui/components/empty";
import { Skeleton } from "@crm-fran/ui/components/skeleton";

export const TEAM_PRESENCE_POLL_INTERVAL_MS = 60_000;

const CATEGORY_LABELS: Record<TeamPresenceCategory, string> = { crm: "CRM", sales: "Ventas", coaching: "Coaching", administration: "Administración" };
const STATUS_LABELS: Record<TeamPresenceDto["status"], string> = { online: "Online", away: "Ausente", offline: "Offline" };
const LAST_ACTIVE_LABELS: Record<TeamPresenceDto["lastActiveBucket"], string> = { now: "Ahora", recently: "Recientemente", earlier: "Hace un tiempo", never: "Sin actividad reciente" };

export function mapPathToPresenceCategory(pathname: string): TeamPresenceCategory {
  if (pathname.startsWith("/estadisticas-personales")) return "coaching";
  if (pathname.startsWith("/users") || pathname.startsWith("/usuarios") || pathname.startsWith("/email-marketing") || pathname.startsWith("/settings")) return "administration";
  if (pathname.startsWith("/leads") || pathname.startsWith("/ventas") || pathname.startsWith("/agendas") || pathname.startsWith("/calendar") || pathname.startsWith("/whatsapp")) return "sales";
  return "crm";
}

export function shouldSendHeartbeat(visibility: DocumentVisibilityState) {
  return visibility === "visible";
}

export function shouldAttemptHeartbeat(input: {
  visibility: DocumentVisibilityState;
  nowMs: number;
  lastAttemptAtMs: number | null;
}) {
  if (!shouldSendHeartbeat(input.visibility)) return false;
  return input.lastAttemptAtMs === null || input.nowMs - input.lastAttemptAtMs >= TEAM_PRESENCE_POLL_INTERVAL_MS;
}

function initials(name: string) {
  return name.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("es") ?? "").join("");
}

export function TeamPresenceTrigger({ onlineCount }: { onlineCount: number }) {
  return <Button variant="ghost" size="sm" aria-label="Ver presencia del equipo"><UsersIcon data-icon="inline-start" /><span className="hidden sm:inline">{onlineCount} online</span><span className="sm:hidden">{onlineCount}</span></Button>;
}

function PresenceMemberList({ members }: { members: readonly TeamPresenceDto[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => (
        <li key={member.userId} className="flex items-center gap-2 p-2">
          <Avatar size="sm"><AvatarFallback>{initials(member.displayName)}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{member.displayName}</p>
            <p className="truncate text-muted-foreground">{member.category ? CATEGORY_LABELS[member.category] : "Sin categoría"} · {LAST_ACTIVE_LABELS[member.lastActiveBucket]}</p>
            {member.roleName ? <p className="truncate text-muted-foreground">{member.roleName}</p> : null}
          </div>
          <Badge variant={member.status === "online" ? "default" : member.status === "away" ? "secondary" : "outline"}>{STATUS_LABELS[member.status]}</Badge>
        </li>
      ))}
    </ul>
  );
}

export function TeamPresenceContent({ state, members }: { state: "loading" | "error" | "ready"; members: TeamPresenceDto[] }) {
  if (state === "loading") return <div className="flex flex-col gap-2" role="status" aria-label="Cargando presencia del equipo"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>;
  if (state === "error") return <p role="status" className="text-muted-foreground">Presencia no disponible. Puedes seguir trabajando con normalidad.</p>;
  if (members.length === 0) return <Empty className="py-4" heading="No hay miembros activos" description="No hay estados disponibles para mostrar." />;

  const activeMembers = members.filter((member) => member.status === "online");
  const recentMembers = members.filter((member) => member.status !== "online");

  return (
    <div className="flex max-h-80 flex-col gap-4 overflow-y-auto" role="region" aria-label="Estado aproximado del equipo">
      <section aria-label="Activos">
        <h3 className="px-2 pb-1 text-sm font-semibold">Activos</h3>
        {activeMembers.length > 0
          ? <PresenceMemberList members={activeMembers} />
          : <p className="px-2 text-sm text-muted-foreground">Nadie está activo ahora.</p>}
      </section>
      <section aria-label="Actividad reciente">
        <h3 className="px-2 pb-1 text-sm font-semibold">Actividad reciente</h3>
        {recentMembers.length > 0
          ? <PresenceMemberList members={recentMembers} />
          : <p className="px-2 text-sm text-muted-foreground">No hay actividad reciente.</p>}
      </section>
    </div>
  );
}
