import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function hasValidBearerCredential(
  authorization: string | null,
  configuredSecret: string,
) {
  const provided = authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!provided) return false;
  return timingSafeEqual(digest(provided), digest(configuredSecret));
}
