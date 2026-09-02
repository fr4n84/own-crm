import { createContext } from "@crm-fran/api/context";
import { hasPermission } from "@crm-fran/api/permissions";
import type { NextRequest } from "next/server";

import { readMarketingAsset } from "@/lib/marketing-asset-storage";

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ storageKey: string }> },
) {
  const authContext = await createContext(request);
  if (!authContext.session) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!hasPermission(authContext.permissions, ["leads:read"])) {
    return Response.json({ error: "Permission denied" }, { status: 403 });
  }
  const { storageKey } = await context.params;
  try {
    const bytes = await readMarketingAsset(storageKey);
    const extension = storageKey.split(".").pop()?.toLowerCase() ?? "";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
        "cache-control": "private, max-age=3600",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }
}
