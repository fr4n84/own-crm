import { createContext } from "@crm-fran/api/context";
import { hasPermission } from "@crm-fran/api/permissions";
import type { NextRequest } from "next/server";

import { readCloserContract } from "@/lib/closer-contract-storage";

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ storageKey: string }> },
) {
  const authContext = await createContext(request);
  if (!authContext.session) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(authContext.permissions, ["sales:read"])) {
    return Response.json({ error: "Permission denied" }, { status: 403 });
  }
  const { storageKey } = await context.params;
  try {
    const bytes = await readCloserContract(storageKey);
    const extension = storageKey.split(".").pop()?.toLowerCase() ?? "";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
        "content-disposition": "inline",
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Contract not found" }, { status: 404 });
  }
}
