type FeedbackDetail = {
  source: string | null;
  campaign: string | null;
  profile: string | null;
  angles: readonly string[];
  outcome: string | null;
};

export type FeedbackDrilldownFilter =
  | { kind: "source" | "campaign" | "profile" | "angle" | "reaction"; value: string }
  | { kind: "missing"; value: "profile" | "source" | "campaign" | "outcome" };

const outcomeByReaction: Record<string, string> = {
  appointment: "Agenda",
  future_call: "Llamar a futuro",
  not_interested: "No interesado",
  not_fit: "No encaja",
};

export function filterFeedbackDetails<T extends FeedbackDetail>(
  feedbacks: readonly T[],
  filter: FeedbackDrilldownFilter,
) {
  return feedbacks.filter((feedback) => {
    if (filter.kind === "source") return feedback.source === filter.value;
    if (filter.kind === "campaign") return feedback.campaign === filter.value;
    if (filter.kind === "profile") return feedback.profile === filter.value;
    if (filter.kind === "angle") return feedback.angles.includes(filter.value);
    if (filter.kind === "reaction") {
      return feedback.outcome === outcomeByReaction[filter.value];
    }
    if (filter.value === "profile") return !feedback.profile;
    if (filter.value === "source") return !feedback.source;
    if (filter.value === "campaign") return !feedback.campaign;
    return !feedback.outcome || !outcomeByReaction[Object.keys(outcomeByReaction).find(
      (key) => outcomeByReaction[key] === feedback.outcome,
    ) ?? ""];
  });
}
