import { createContext } from "@crm-fran/api/context";
import { hasPermission } from "@crm-fran/api/permissions";
import type { NextRequest } from "next/server";

import { storeCloserContract } from "@/lib/closer-contract-storage";

const MAX_CONTRACT_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_CONTRACT_BYTES + 512 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return value !== null && typeof value !== "string" && typeof value.size === "number";
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return errorResponse("Content-Length is required", 411);
  }
  if (contentLength > MAX_REQUEST_BYTES) return errorResponse("Contract is too large", 413);
  const context = await createContext(request);
  if (!context.session) return errorResponse("Authentication required", 401);
  if (!hasPermission(context.permissions, ["sales:write"])) {
    return errorResponse("Permission denied", 403);
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Invalid form data", 400);
  }
  const contract = formData.get("contract");
  if (!isUploadedFile(contract)) return errorResponse("Contract is required", 400);
  const mimeType = contract.type.split(";", 1)[0]?.trim().toLowerCase();
  if (!mimeType || !ALLOWED_TYPES.has(mimeType)) {
    return errorResponse("Unsupported contract format", 415);
  }
  if (contract.size <= 0 || contract.size > MAX_CONTRACT_BYTES) {
    return errorResponse("Invalid contract size", 413);
  }
  return Response.json(await storeCloserContract(contract));
}
