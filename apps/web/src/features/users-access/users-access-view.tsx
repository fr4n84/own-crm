"use client";
import { PasswordResetCode } from "./password-reset-code";

import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InfoIcon, SearchIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";

import { Badge } from "@crm-fran/ui/components/badge";
import { Button } from "@crm-fran/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm-fran/ui/components/card";
import { Empty } from "@crm-fran/ui/components/empty";
import { Checkbox } from "@crm-fran/ui/components/checkbox";
import { Input } from "@crm-fran/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@crm-fran/ui/components/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@crm-fran/ui/components/select";
import { Skeleton } from "@crm-fran/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@crm-fran/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@crm-fran/ui/components/tabs";
import { usePermissionState } from "@crm-fran/ui/permissions";
import {
  canAccessNavigationItem,
  canViewConfiguredNavigationItem,
  navigationModulesForPermissions,
  PRIMARY_NAVIGATION_ITEMS,
} from "@crm-fran/ui/lib/navigation-policy";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

type AccessStatus = "pending" | "active" | "disabled";
type StatusFilter = "all" | AccessStatus;

const COMMERCIAL_ROLES = [
  { value: "role-caller", label: "Caller" },
  { value: "role-closer", label: "Closer" },
  { value: "role-caller-closer", label: "Híbrido" },
] as const;

export function CommercialRoleEditor({ userId, name, roleId }: { userId: string; name: string; roleId: string }) {
  const [confirmedRoleId, setConfirmedRoleId] = useState(roleId);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const currentRole = COMMERCIAL_ROLES.find((role) => role.value === confirmedRoleId);
  const [selected, setSelected] = useState(roleId);
  const queryClient = useQueryClient();
  const update = useMutation(trpc.users.updateCommercialRole.mutationOptions({
    onSuccess: async (updated) => {
      // The write is committed even when refreshing the directory fails.
      setConfirmedRoleId(updated.roleId);
      setRefreshFailed(false);
      toast.success("Rol actualizado");
      try {
        await queryClient.invalidateQueries({ queryKey: trpc.users.accessDirectory.queryKey() }, { throwOnError: true });
      } catch {
        setRefreshFailed(true);
        toast.error("El rol está guardado, pero no se pudo actualizar el directorio. Recarga la página para ver los permisos actuales.");
      }
    },
    onError: (error) => toast.error(error.message),
  }));
  if (!currentRole) return null;
  const nextRole = COMMERCIAL_ROLES.find((role) => role.value === selected);
  return <div className="mt-2 flex flex-wrap items-center gap-2">
    <Select value={selected} onValueChange={(value) => value && setSelected(value)} disabled={update.isPending} items={[...COMMERCIAL_ROLES]}>
      <SelectTrigger aria-label={`Rol de ${name}`}><SelectValue /></SelectTrigger>
      <SelectContent>{COMMERCIAL_ROLES.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}</SelectContent>
    </Select>
    <Button size="sm" disabled={!nextRole || selected === confirmedRoleId || update.isPending} onClick={() => {
      if (!nextRole || !window.confirm(`¿Cambiar el rol de ${name} a ${nextRole.label}?`)) return;
      update.mutate({ userId, expectedRoleId: currentRole.value, roleId: nextRole.value });
    }}>{update.isPending ? "Guardando…" : "Guardar rol"}</Button>
    {refreshFailed && <p role="status" className="text-xs text-muted-foreground">Rol guardado. Recarga la página para actualizar los permisos y el directorio.</p>}
  </div>;
}

function Information() {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-xs" className="size-11" aria-label="Información sobre usuarios y accesos" />}
      >
        <InfoIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-w-sm">
        <PopoverHeader>
          <PopoverTitle>Cómo interpretar esta vista</PopoverTitle>
          <PopoverDescription>
            Resume el rol guardado y sus permisos efectivos. Los módulos se calculan con la misma política que usa el menú lateral. La selección del Observatorio comercial controla también su acceso en el servidor; no amplía las funciones administrativas. Caller y Closer empiezan sin acceso salvo una selección explícita guardada. El resto de módulos conserva sus permisos de API: esta matriz cambia su visibilidad.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function StatusBadge({ status }: { status: AccessStatus }) {
  const labels = { pending: "Pendiente", active: "Activo", disabled: "Desactivado" } as const;
  return <Badge variant={status === "active" ? "secondary" : "outline"}>{labels[status]}</Badge>;
}

export function AccessStatusEditor({ userId, name, status, version }: { userId: string; name: string; status: AccessStatus; version: number }) {
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState({ status, version });
  const update = useMutation(trpc.users.updateAccessStatus.mutationOptions({
    onSuccess: async (result) => {
      setConfirmed({ status: result.accessStatus, version: result.statusVersion });
      toast.success(result.accessStatus === "active" ? "Acceso activado" : "Acceso desactivado; sus sesiones se han cerrado");
      try {
        await queryClient.invalidateQueries({ queryKey: trpc.users.accessDirectory.queryKey() }, { throwOnError: true });
      } catch {
        toast.error("El acceso está guardado, pero no se pudo actualizar la lista. Recarga la página.");
      }
    },
    onError: (error) => toast.error(error.message),
  }));
  const action = confirmed.status === "pending" ? "approve" : confirmed.status === "disabled" ? "reactivate" : "disable";
  const label = action === "approve" ? "Aprobar" : action === "reactivate" ? "Reactivar" : "Eliminar acceso";
  function submit() {
    const explanation = action === "disable"
      ? `¿Eliminar el acceso de ${name}? Se cerrarán sus sesiones, pero su historial se conservará.`
      : `¿${label} la cuenta de ${name}?`;
    if (!window.confirm(explanation)) return;
    update.mutate({
      userId,
      action,
      expectedStatus: confirmed.status,
      expectedVersion: confirmed.version,
      ...(action === "disable" ? { reason: "Acceso eliminado desde Usuarios y accesos" } : {}),
    });
  }
  return <div className="mt-2 flex flex-col items-start gap-1">
    <Button size="sm" variant={action === "disable" ? "destructive" : "outline"} disabled={update.isPending} onClick={submit}>{update.isPending ? "Guardando…" : label}</Button>
    {action === "disable" && <span className="text-xs text-muted-foreground">Conserva ventas, leads, mensajes y auditoría.</span>}
  </div>;
}

function PermissionBadges({ permissions }: { permissions: readonly string[] }) {
  if (permissions.length === 0) return <span className="text-xs text-muted-foreground">Sin permisos</span>;
  return <div className="flex flex-wrap gap-1">{permissions.map((permission) => <Badge key={permission} variant={permission === "*" ? "default" : "outline"}>{permission === "*" ? "Administración global" : permission}</Badge>)}</div>;
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4" aria-label="Cargando usuarios y accesos">
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

type AccessRole = {
  id: string;
  name: string;
  effectivePermissions: readonly string[];
};

function defaultRoleIdsByModule(roles: readonly AccessRole[]) {
  return Object.fromEntries(PRIMARY_NAVIGATION_ITEMS.map((module) => [
    module.id,
    roles.filter((role) => canViewConfiguredNavigationItem(module, role.id, role.effectivePermissions)).map((role) => role.id),
  ]));
}

function normalizedRoleIdsByModule(
  roles: readonly AccessRole[],
  configured: boolean,
  value: Partial<Record<(typeof PRIMARY_NAVIGATION_ITEMS)[number]["id"], readonly string[]>>,
) {
  const defaults = defaultRoleIdsByModule(roles);
  if (!configured) return defaults;
  return Object.fromEntries(PRIMARY_NAVIGATION_ITEMS.map((module) => [module.id, [...(value[module.id] ?? defaults[module.id] ?? [])]]));
}

export function VisibilityEditor({
  roles,
  version,
  configured,
  roleIdsByModule,
}: {
  roles: readonly AccessRole[];
  version: number;
  configured: boolean;
  roleIdsByModule: Partial<Record<(typeof PRIMARY_NAVIGATION_ITEMS)[number]["id"], readonly string[]>>;
}) {
  const queryClient = useQueryClient();
  const initial = normalizedRoleIdsByModule(roles, configured, roleIdsByModule);
  const [draft, setDraft] = useState<Record<string, string[]>>(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const save = useMutation(trpc.users.updateNavigationVisibility.mutationOptions({
    onSuccess: async () => {
      toast.success("Visibilidad del menú guardada");
      await Promise.all([queryClient.invalidateQueries({ queryKey: trpc.users.navigationVisibility.queryKey() }),queryClient.invalidateQueries({queryKey:trpc.auth.getMyAccess.queryKey()})]);
    },
    onError: (error) => toast.error(error.message),
  }));

  function toggle(moduleId: string, roleId: string, checked: boolean) {
    setDraft((current) => {
      const roleIds = new Set(current[moduleId] ?? []);
      if (checked) roleIds.add(roleId); else roleIds.delete(roleId);
      return { ...current, [moduleId]: [...roleIds].sort() };
    });
  }

  function persist() {
    if (!window.confirm("¿Guardar quién puede ver cada módulo en el menú? En Observatorio comercial también se concederá o revocará acceso; los demás permisos no cambiarán.")) return;
    save.mutate({
      expectedVersion: version,
      entries: PRIMARY_NAVIGATION_ITEMS.map((module) => ({ moduleId: module.id, roleIds: draft[module.id] ?? [] })),
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-1">
          <CardTitle>Visibilidad del menú por rol</CardTitle>
          <Information />
        </div>
        <CardDescription>Marca qué roles ven cada módulo. Una casilla deshabilitada indica que ese rol no posee el permiso real necesario.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 xl:grid-cols-2">
          {PRIMARY_NAVIGATION_ITEMS.map((module) => (
            <section key={module.id} className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
              <div className="min-w-0"><h2 className="break-words text-sm font-semibold">{module.title}</h2><p className="break-all text-xs text-muted-foreground">{module.url}</p></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {roles.map((role) => {
                  const hasRealAccess = canAccessNavigationItem(module, role.effectivePermissions);
                  const isRecoveryRole = module.id === "users-access" && role.effectivePermissions.includes("*");
                  const checked = isRecoveryRole || (draft[module.id] ?? []).includes(role.id);
                  return <label key={role.id} className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-xs"><Checkbox checked={checked} disabled={!hasRealAccess || isRecoveryRole || save.isPending} onCheckedChange={(next) => toggle(module.id, role.id, next)} aria-label={`${module.title}: ${role.name}`} /><span className="min-w-0 break-words">{role.name}</span></label>;
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={persist} disabled={!dirty || save.isPending}>Guardar cambios</Button>
          <Button variant="outline" onClick={() => setDraft(initial)} disabled={!dirty || save.isPending}>Cancelar</Button>
          <span className="self-center text-xs text-muted-foreground">Versión {version}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function UsersAccessView() {
  const permissionState = usePermissionState();
  const [search, setSearch] = useState("");
  const [roleId, setRoleId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const deferredSearch = useDeferredValue(search.trim());
  const isAdmin = permissionState.permissions.includes("*");
  const input = {
    ...(deferredSearch ? { search: deferredSearch } : {}),
    ...(roleId !== "all" ? { roleId } : {}),
    ...(status !== "all" ? { status } : {}),
  };
  const directory = useQuery({
    ...trpc.users.accessDirectory.queryOptions(input),
    enabled: permissionState.isLoaded && isAdmin,
  });
  const visibility = useQuery({
    ...trpc.users.navigationVisibility.queryOptions(),
    enabled: permissionState.isLoaded && isAdmin,
    retry: false,
  });

  if (permissionState.isLoading || !permissionState.isLoaded) {
    return <main className="dashboard-arc-theme bg-background p-4 sm:p-6"><LoadingState /></main>;
  }
  if (!isAdmin) {
    return <main className="dashboard-arc-theme bg-background p-4 sm:p-6"><Empty heading="Acceso restringido" description="Esta vista requiere administración global." /></main>;
  }
  if (directory.isPending || visibility.isPending) {
    return <main className="dashboard-arc-theme bg-background p-4 sm:p-6"><LoadingState /></main>;
  }
  if (directory.isError || visibility.isError || !directory.data || !visibility.data) {
    return <main className="dashboard-arc-theme bg-background p-4 sm:p-6"><Empty heading="No se pudo cargar usuarios y accesos" description="Recarga la página para consultar los permisos actuales. Los cambios ya confirmados siguen guardados." /></main>;
  }

  const { users, roles } = directory.data;

  return (
    <main className="dashboard-arc-theme flex min-h-full min-w-0 flex-col gap-4 bg-background p-4 text-foreground sm:p-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Usuarios y accesos</h1>
          <Information />
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">Consulta quién forma parte del CRM, qué rol tiene y qué áreas puede utilizar.</p>
      </header>

      <Card size="sm">
        <CardHeader className="pb-2">
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Busca por nombre o correo y combina el resultado con rol y estado.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_220px_180px]">
          <label className="flex flex-col gap-1 text-xs font-medium" htmlFor="access-search">
            Buscar
            <span className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="access-search" className="h-11 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o correo" />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium" htmlFor="access-role">
            Rol
            <Select value={roleId} onValueChange={(value) => value && setRoleId(value)} items={[{ label: "Todos los roles", value: "all" }, ...roles.map((role) => ({ label: role.name, value: role.id }))]}>
              <SelectTrigger id="access-role" className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="all">Todos los roles</SelectItem>{roles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium" htmlFor="access-status">
            Estado
            <Select value={status} onValueChange={(value) => value && setStatus(value as StatusFilter)} items={[{ label: "Todos", value: "all" }, { label: "Pendiente", value: "pending" }, { label: "Activo", value: "active" }, { label: "Desactivado", value: "disabled" }]}>
              <SelectTrigger id="access-status" className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="all">Todos</SelectItem><SelectItem value="pending">Pendiente</SelectItem><SelectItem value="active">Activo</SelectItem><SelectItem value="disabled">Desactivado</SelectItem></SelectGroup></SelectContent>
            </Select>
          </label>
        </CardContent>
      </Card>

      <Tabs defaultValue="users">
        <TabsList className="flex h-12! min-h-12! w-fit max-w-full gap-1 rounded-lg border bg-muted/40 p-1">
          <TabsTrigger value="users" className="h-10! min-h-10! px-4 data-active:bg-accent after:hidden">Usuarios</TabsTrigger>
          <TabsTrigger value="roles" className="h-10! min-h-10! px-4 data-active:bg-accent after:hidden">Roles y accesos</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><UsersIcon aria-hidden="true" />Usuarios <Badge variant="secondary">{users.length}</Badge></CardTitle><CardDescription>Solo se muestran los datos de identidad necesarios para reconocer cada perfil.</CardDescription></CardHeader>
            <CardContent>
              {users.length === 0 ? <Empty heading="No hay usuarios para estos filtros" description="Prueba otra búsqueda, rol o estado." /> : <>
                <div className="grid gap-3 lg:hidden">
                  {users.map((person) => <Card key={person.id} size="sm"><CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><CardTitle className="break-words">{person.name}</CardTitle><CardDescription className="break-all">{person.email}</CardDescription></div><StatusBadge status={person.status} /></div></CardHeader><CardContent className="flex flex-col gap-3"><div className="flex flex-wrap gap-1">{person.roles.map((role) => <Badge key={role.id} variant="secondary">{role.name}</Badge>)}</div><AccessStatusEditor key={`${person.id}:${person.statusVersion}`} userId={person.id} name={person.name} status={person.status} version={person.statusVersion} /><PasswordResetCode userId={person.id} name={person.name} /><CommercialRoleEditor key={person.roles[0]?.id} userId={person.id} name={person.name} roleId={person.roles[0]?.id ?? ""} /><PermissionBadges permissions={person.effectivePermissions} /></CardContent></Card>)}
                </div>
                <div className="hidden overflow-x-auto lg:block">
                  <Table><TableHeader><TableRow><TableHead>Usuario</TableHead><TableHead>Estado y acceso</TableHead><TableHead>Rol</TableHead><TableHead>Permisos efectivos</TableHead></TableRow></TableHeader><TableBody>{users.map((person) => <TableRow key={person.id}><TableCell><div className="flex min-w-48 flex-col"><span className="font-medium">{person.name}</span><span className="text-xs text-muted-foreground">{person.email}</span></div></TableCell><TableCell><StatusBadge status={person.status} /><AccessStatusEditor key={`${person.id}:${person.statusVersion}`} userId={person.id} name={person.name} status={person.status} version={person.statusVersion} /></TableCell><TableCell>{person.roles.map((role) => <Badge key={role.id} variant="secondary">{role.name}</Badge>)}<PasswordResetCode userId={person.id} name={person.name} /><CommercialRoleEditor key={person.roles[0]?.id} userId={person.id} name={person.name} roleId={person.roles[0]?.id ?? ""} /></TableCell><TableCell><PermissionBadges permissions={person.effectivePermissions} /></TableCell></TableRow>)}</TableBody></Table>
                </div>
              </>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          {roles.length === 0 ? <Empty heading="No hay roles configurados" description="No existe una política de acceso que mostrar." /> : <div className="flex flex-col gap-4"><VisibilityEditor key={visibility.data.version} roles={roles} version={visibility.data.version} configured={visibility.data.configured} roleIdsByModule={visibility.data.roleIdsByModule} /><div className="grid gap-3 xl:grid-cols-2">{roles.map((role) => {
            const modules = navigationModulesForPermissions(role.effectivePermissions).filter(module=>canViewConfiguredNavigationItem(module,role.id,role.effectivePermissions,visibility.data.configured?{roleIdsByModule:visibility.data.roleIdsByModule}:undefined));
            return <Card key={role.id}><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="flex items-center gap-2"><ShieldCheckIcon aria-hidden="true" />{role.name}</CardTitle><Badge variant="secondary">{role.userCount} {role.userCount === 1 ? "usuario" : "usuarios"}</Badge></div><CardDescription>{role.id}</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><section className="flex min-w-0 flex-col gap-2"><h2 className="text-sm font-semibold">Permisos efectivos</h2><PermissionBadges permissions={role.effectivePermissions} /></section><section className="flex min-w-0 flex-col gap-2"><h2 className="text-sm font-semibold">Módulos visibles</h2><div className="flex flex-wrap gap-1">{modules.map((module) => <Badge key={module.id} variant="outline">{module.title}</Badge>)}</div></section><section className="flex min-w-0 flex-col gap-2 sm:col-span-2"><h2 className="text-sm font-semibold">Usuarios con este rol</h2>{role.users.length === 0 ? <p className="text-xs text-muted-foreground">Ningún usuario asignado.</p> : <ul className="grid gap-2 sm:grid-cols-2">{role.users.map((person) => <li key={person.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border p-3"><span className="min-w-0"><span className="block break-words text-sm font-medium">{person.name}</span><span className="block break-all text-xs text-muted-foreground">{person.email}</span></span><StatusBadge status={person.status} /></li>)}</ul>}</section></CardContent></Card>;
          })}</div></div>}
        </TabsContent>
      </Tabs>
    </main>
  );
}
