export type LeadDuplicateReason = "exact_email" | "exact_phone" | "similar_name";

export type NormalizedLeadIdentity = {
  name: string;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
};

export function configuredLeadPhoneCountry(value = process.env.LEAD_PHONE_COUNTRY): "ES" {
  if (value === undefined || value === "" || value === "ES") return "ES";
  throw new Error(`Unsupported LEAD_PHONE_COUNTRY: ${value}`);
}

export function normalizeLeadEmail(value: string | null | undefined) {
  const original = value?.trim() || null;
  return {
    original,
    normalized: original ? original.normalize("NFKC").toLocaleLowerCase("en-US") : null,
  };
}

export function normalizeLeadPhone(value: string, country: "ES" = "ES") {
  const original = value.trim();
  if (country !== "ES") throw new Error(`Unsupported lead phone country: ${country}`);
  const hasInternationalPrefix = original.startsWith("+") || original.startsWith("00");
  const digits = original.replace(/\D/g, "");
  let normalized: string | null = null;
  if (hasInternationalPrefix && digits.length >= 8 && digits.length <= 15) {
    normalized = `+${digits.startsWith("00") ? digits.slice(2) : digits}`;
  } else if (digits.length === 9) {
    normalized = `+34${digits}`;
  } else if (digits.length === 11 && digits.startsWith("34")) {
    normalized = `+${digits}`;
  }
  return { original, normalized };
}

function comparableName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

export function leadNameSimilarity(left: string, right: string) {
  const a = comparableName(left);
  const b = comparableName(right);
  if (!a || !b) return 0;
  return Math.round((1 - levenshtein(a, b) / Math.max(a.length, b.length)) * 100);
}

export function findDuplicateSignals(
  incoming: NormalizedLeadIdentity,
  existing: NormalizedLeadIdentity,
) {
  const reasons: LeadDuplicateReason[] = [];
  if (incoming.normalizedEmail && incoming.normalizedEmail === existing.normalizedEmail) {
    reasons.push("exact_email");
  }
  if (incoming.normalizedPhone && incoming.normalizedPhone === existing.normalizedPhone) {
    reasons.push("exact_phone");
  }
  const nameSimilarity = leadNameSimilarity(incoming.name, existing.name);
  if (nameSimilarity >= 80) reasons.push("similar_name");
  return {
    reasons,
    nameSimilarity,
    level: reasons.some((reason) => reason.startsWith("exact_"))
      ? ("review" as const)
      : ("warning" as const),
  };
}
