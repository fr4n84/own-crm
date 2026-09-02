import { transcribeMarketingAsset } from "@crm-fran/api/marketing-attribution/runtime";
import { createContext } from "@crm-fran/api/context";
import { hasPermission } from "@crm-fran/api/permissions";
import type { NextRequest } from "next/server";

import {
  deleteMarketingAsset,
  storeMarketingAsset,
} from "@/lib/marketing-asset-storage";

const MAX_ASSET_BYTES = 100 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_ASSET_BYTES + 1024 * 1024;
const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
]);

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    value !== null &&
    typeof value !== "string" &&
    typeof value.size === "number" &&
    typeof value.type === "string"
  );
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return errorResponse("Content-Length is required", 411);
  }
  if (contentLength > MAX_REQUEST_BYTES) {
    return errorResponse("Asset is too large", 413);
  }

  const context = await createContext(request);
  if (!context.session) return errorResponse("Authentication required", 401);
  if (!hasPermission(context.permissions, ["*"])) {
    return errorResponse("Permission denied", 403);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Invalid form data", 400);
  }
  const asset = formData.get("asset");
  const shouldTranscribe = formData.get("transcribe") === "true";
  if (!isUploadedFile(asset)) return errorResponse("Asset is required", 400);
  if (asset.size <= 0 || asset.size > MAX_ASSET_BYTES) {
    return errorResponse("Invalid asset size", 413);
  }
  const mimeType = asset.type.split(";", 1)[0]?.trim().toLowerCase();
  if (!mimeType || !ALLOWED_TYPES.has(mimeType)) {
    return errorResponse("Unsupported asset format", 415);
  }
  if (
    shouldTranscribe &&
    (!/^(audio|video)\//.test(mimeType) || asset.size > MAX_TRANSCRIPTION_BYTES)
  ) {
    return errorResponse("Asset cannot be transcribed automatically", 400);
  }

  const stored = await storeMarketingAsset(asset);
  try {
    const transcript = shouldTranscribe
      ? await transcribeMarketingAsset(asset)
      : null;
    return Response.json({ ...stored, transcript });
  } catch {
    await deleteMarketingAsset(stored.storageKey);
    return errorResponse("Could not transcribe the asset", 502);
  }
}
