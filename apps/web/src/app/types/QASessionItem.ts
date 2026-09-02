export interface QASessionItem {
  question: string;
  answer: string;
  authorRole: "caller" | "closer";
  authorId: string | null;
  questionKey?: string;
}
