type LeadQuestion = {
  questionKey: string;
  answer: string;
  authorRole: string;
};

export type CallerResponseStatus = "Si" | "No" | "Sin asignar";

export function getCallerResponseStatus(
  questions: LeadQuestion[] | undefined,
): CallerResponseStatus {
  for (let index = (questions?.length ?? 0) - 1; index >= 0; index -= 1) {
    const question = questions?.[index];

    if (
      question?.authorRole === "caller" &&
      question.questionKey === "isContacted"
    ) {
      return question.answer === "Si" || question.answer === "No"
        ? question.answer
        : "Sin asignar";
    }
  }

  return "Sin asignar";
}
