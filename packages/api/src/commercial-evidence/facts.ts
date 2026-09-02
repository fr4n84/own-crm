import { FEEDBACK_PROFILES, MOTIVATION_ANGLES, OBJECTION_TYPES } from "../call-feedback";

export type ConfirmedFacts = {
  primaryProfile: { kind: "value"; value: string } | { kind: "missing" } | { kind: "legacy"; key: string; value: string };
  subProfile: { kind: "value"; value: string } | { kind: "missing" } | { kind: "legacy"; key: string; value: string };
  motivations: string[];
  objections: string[];
};

type Question = { questionKey: string; answer: string };
const profiles = new Set<string>(FEEDBACK_PROFILES.map((item) => item.value));
const motivations = new Set<string>(MOTIVATION_ANGLES.map((item) => item.value));
const objections = new Set<string>(OBJECTION_TYPES.map((item) => item.value));

function categorical(questions: readonly Question[], key: string, legacyKey: string) {
  const current = questions.find((item) => item.questionKey === key)?.answer;
  if (current && profiles.has(current)) return { kind: "value" as const, value: current };
  const legacy = questions.find((item) => item.questionKey === legacyKey)?.answer;
  return legacy ? { kind: "legacy" as const, key: legacyKey, value: legacy } : { kind: "missing" as const };
}

function multi(questions: readonly Question[], key: string, allowed: Set<string>) {
  const answer = questions.find((item) => item.questionKey === key)?.answer;
  if (!answer) return [];
  try { const parsed: unknown = JSON.parse(answer); return Array.isArray(parsed) ? [...new Set(parsed.filter((item): item is string => typeof item === "string" && allowed.has(item)))].sort() : []; } catch { return []; }
}

export function parseConfirmedFacts(questions: readonly Question[]): ConfirmedFacts {
  return {
    primaryProfile: categorical(questions, "primaryProfile", "profile"),
    subProfile: categorical(questions, "subProfile", "subprofile"),
    motivations: multi(questions, "motivationAngles", motivations),
    objections: multi(questions, "objectionTypes", objections),
  };
}

export function confirmedFactValue(fact: ConfirmedFacts["primaryProfile"]): string | null {
  return fact.kind === "value" ? fact.value : fact.kind === "legacy" ? `legacy:${fact.key}:${fact.value}` : null;
}

export function confirmedProfileValue(facts: ConfirmedFacts): string | null {
  return confirmedFactValue(facts.primaryProfile) ?? confirmedFactValue(facts.subProfile);
}
