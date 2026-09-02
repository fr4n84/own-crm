import {
  CallFeedbackAccessError,
  CallFeedbackLeadNotFoundError,
} from "@crm-fran/api/call-feedback";
import { processProductionCallRecording } from "@crm-fran/api/call-feedback-runtime";
import { createContext } from "@crm-fran/api/context";
import { hasPermission } from "@crm-fran/api/permissions";
import type { NextRequest } from "next/server";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_BYTES = 21 * 1024 * 1024;
const MIN_DURATION_MS = 1_000;
const MAX_DURATION_MS = 120 * 60_000;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
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
    return errorResponse("Recording is too large", 413);
  }

  const context = await createContext(request);
  if (!context.session) {
    return errorResponse("Authentication required", 401);
  }
  if (!hasPermission(context.permissions, ["leads:write"])) {
    return errorResponse("Permission denied", 403);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Invalid form data", 400);
  }
  const audio = formData.get("audio");
  const leadId = formData.get("leadId");
  const durationValue = formData.get("durationMs");
  const durationMs =
    typeof durationValue === "string" ? Number(durationValue) : Number.NaN;

  if (!isUploadedFile(audio) || typeof leadId !== "string" || !leadId) {
    return errorResponse("Audio and leadId are required", 400);
  }
  if (audio.size <= 0 || audio.size > MAX_AUDIO_BYTES) {
    return errorResponse("Invalid recording size", 413);
  }
  const audioType = audio.type.split(";", 1)[0]?.trim().toLowerCase();
  if (!audioType || !ALLOWED_AUDIO_TYPES.has(audioType)) {
    return errorResponse("Unsupported recording format", 415);
  }
  if (
    !Number.isInteger(durationMs) ||
    durationMs < MIN_DURATION_MS ||
    durationMs > MAX_DURATION_MS
  ) {
    return errorResponse("Invalid recording duration", 400);
  }

  try {
    const result = await processProductionCallRecording({
      audio,
      durationMs,
      leadId,
      userId: context.session.user.id,
      permissions: context.permissions,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof CallFeedbackLeadNotFoundError) {
      return errorResponse("Lead not found", 404);
    }
    if (error instanceof CallFeedbackAccessError) {
      return errorResponse("Permission denied", 403);
    }
    return errorResponse("Could not process the recording", 502);
  }
}
