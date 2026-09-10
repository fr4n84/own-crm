import { buildAdminDataExport } from "@crm-fran/api/admin-export/service";
import { createContext } from "@crm-fran/api/context";
import { hasPermission } from "@crm-fran/api/permissions";
import type { NextRequest } from "next/server";

const calendarDay = /^\d{4}-\d{2}-\d{2}$/;
function validDay(value: string) {
  if (!calendarDay.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export async function GET(request: NextRequest) {
  const context = await createContext(request);
  if (!context.session) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(context.permissions, ["*"])) return Response.json({ error: "Permission denied" }, { status: 403 });
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  const currency = request.nextUrl.searchParams.get("currency") ?? "EUR";
  const includePii = request.nextUrl.searchParams.get("includePii") === "true";
  if (!validDay(from) || !validDay(to) || from > to) return Response.json({ error: "Invalid Madrid date range" }, { status: 400 });
  if ((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000 > 366) return Response.json({ error: "Export range cannot exceed 366 days" }, { status: 400 });
  if (!/^[A-Z]{3}$/.test(currency) || !Intl.supportedValuesOf("currency").includes(currency)) return Response.json({ error: "Invalid ISO currency" }, { status: 400 });
  const exported = await buildAdminDataExport({
    authority: { actorId: context.session.user.id, permissions: context.permissions },
    from,
    to,
    currency,
    includePii,
  });
  const body = exported.bytes.buffer.slice(exported.bytes.byteOffset, exported.bytes.byteOffset + exported.bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${exported.fileName}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
