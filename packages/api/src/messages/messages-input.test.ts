import { describe, expect, it } from "vitest";

import {
  orderParticipantIds,
  sendMessageInputSchema,
  sendTaskInputSchema,
} from "./messages-input";

describe("messages input", () => {
  it("orders participant ids so each pair has one conversation", () => {
    expect(orderParticipantIds("user-z", "user-a")).toEqual([
      "user-a",
      "user-z",
    ]);
  });

  it("rejects empty chat messages", () => {
    expect(() =>
      sendMessageInputSchema.parse({ conversationId: "c1", body: "   " }),
    ).toThrow();
  });

  it("accepts tasks with an assignee and optional due date", () => {
    const task = sendTaskInputSchema.parse({
      conversationId: "c1",
      title: "Revisar lead",
      description: "Confirmar el feedback",
      assigneeId: "user-2",
      dueAt: "2026-08-20T10:00:00.000Z",
    });

    expect(task.assigneeId).toBe("user-2");
  });
});
