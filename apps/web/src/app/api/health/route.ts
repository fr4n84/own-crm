import { createHealthResponse } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return createHealthResponse(request);
}
