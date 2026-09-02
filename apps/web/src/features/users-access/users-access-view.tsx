"use client";

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
  navigationModulesForPermissions,
  PRIMARY_NAVIGATION_ITEMS,
} from "@crm-fran/ui/lib/navigation-policy";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

type StatusFilter = "all" | "verified" | "pending";

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
            Resume el rol guardado y sus permisos efectivos. Los módulos se calculan con la misma política que usa el menú lateral. Ocultar un módulo no revoca permisos y mostrarlo nunca concede acceso: la visibilidad efectiva es la selección guardada combinada con los permisos reales. La API sigue siendo la autoridad y valida cada operación en el servidor.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function StatusBadge({ status }: { status: "verified" | "pending" }) {
  return <Badge variant={status === "verified" ? "secondary" : "outline"}>{status === "verified" ? "Verificado" : "Pendiente"}</Badge>;
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
    roles.filter((role) => canAccessNavigationItem(module, role.effectivePermissions)).map((role) => role.id),
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

function VisibilityEditor({
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
      await queryClient.invalidateQueries({ queryKey: trpc.users.navigationVisibility.queryKey() });
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
    if (!window.confirm("¿Guardar quién puede ver cada módulo en el menú? Los permisos de la API no cambiarán.")) return;
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
    return <main className="dashboard-arc-theme bg-background p-4 sm:p-6"><Empty heading="No se pudo cargar usuarios y accesos" description="Vuelve a intentarlo. Ningún permiso se ha modificado." /></main>;
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
            <Select value={status} onValueChange={(value) => value && setStatus(value as StatusFilter)} items={[{ label: "Todos", value: "all" }, { label: "Verificado", value: "verified" }, { label: "Pendiente", value: "pending" }]}>
              <SelectTrigger id="access-status" className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="all">Todos</SelectItem><SelectItem value="verified">Verificado</SelectItem><SelectItem value="pending">Pendiente</SelectItem></SelectGroup></SelectContent>
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
                  {users.map((person) => <Card key={person.id} size="sm"><CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><CardTitle className="break-words">{person.name}</CardTitle><CardDescription className="break-all">{person.email}</CardDescription></div><StatusBadge status={person.status} /></div></CardHeader><CardContent className="flex flex-col gap-3"><div className="flex flex-wrap gap-1">{person.roles.map((role) => <Badge key={role.id} variant="secondary">{role.name}</Badge>)}</div><PermissionBadges permissions={person.effectivePermissions} /></CardContent></Card>)}
                </div>
                <div className="hidden overflow-x-auto lg:block">
                  <Table><TableHeader><TableRow><TableHead>Usuario</TableHead><TableHead>Estado</TableHead><TableHead>Rol</TableHead><TableHead>Permisos efectivos</TableHead></TableRow></TableHeader><TableBody>{users.map((person) => <TableRow key={person.id}><TableCell><div className="flex min-w-48 flex-col"><span className="font-medium">{person.name}</span><span className="text-xs text-muted-foreground">{person.email}</span></div></TableCell><TableCell><StatusBadge status={person.status} /></TableCell><TableCell>{person.roles.map((role) => <Badge key={role.id} variant="secondary">{role.name}</Badge>)}</TableCell><TableCell><PermissionBadges permissions={person.effectivePermissions} /></TableCell></TableRow>)}</TableBody></Table>
                </div>
              </>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          {roles.length === 0 ? <Empty heading="No hay roles configurados" description="No existe una política de acceso que mostrar." /> : <div className="flex flex-col gap-4"><VisibilityEditor key={visibility.data.version} roles={roles} version={visibility.data.version} configured={visibility.data.configured} roleIdsByModule={visibility.data.roleIdsByModule} /><div className="grid gap-3 xl:grid-cols-2">{roles.map((role) => {
            const modules = navigationModulesForPermissions(role.effectivePermissions);
            return <Card key={role.id}><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="flex items-center gap-2"><ShieldCheckIcon aria-hidden="true" />{role.name}</CardTitle><Badge variant="secondary">{role.userCount} {role.userCount === 1 ? "usuario" : "usuarios"}</Badge></div><CardDescription>{role.id}</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><section className="flex min-w-0 flex-col gap-2"><h2 className="text-sm font-semibold">Permisos efectivos</h2><PermissionBadges permissions={role.effectivePermissions} /></section><section className="flex min-w-0 flex-col gap-2"><h2 className="text-sm font-semibold">Módulos visibles</h2><div className="flex flex-wrap gap-1">{modules.map((module) => <Badge key={module.id} variant="outline">{module.title}</Badge>)}</div></section><section className="flex min-w-0 flex-col gap-2 sm:col-span-2"><h2 className="text-sm font-semibold">Usuarios con este rol</h2>{role.users.length === 0 ? <p className="text-xs text-muted-foreground">Ningún usuario asignado.</p> : <ul className="grid gap-2 sm:grid-cols-2">{role.users.map((person) => <li key={person.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border p-3"><span className="min-w-0"><span className="block break-words text-sm font-medium">{person.name}</span><span className="block break-all text-xs text-muted-foreground">{person.email}</span></span><StatusBadge status={person.status} /></li>)}</ul>}</section></CardContent></Card>;
          })}</div></div>}
        </TabsContent>
      </Tabs>
    </main>
  );
}
