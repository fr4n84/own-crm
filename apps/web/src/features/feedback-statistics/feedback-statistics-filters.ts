export type FeedbackCallerSelection = { id: string; name: string };

export function selectFeedbackCaller(
  callers: readonly FeedbackCallerSelection[],
  callerId: string,
): FeedbackCallerSelection {
  if (callerId === "all") {
    return { id: "all", name: "Todos los callers" };
  }

  return (
    callers.find((caller) => caller.id === callerId) ?? {
      id: "all",
      name: "Todos los callers",
    }
  );
}
