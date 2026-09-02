import { describe, expect, it } from "vitest";

import { MESSAGE_KIND, conversations, messages } from "./messages";

describe("messages schema", () => {
  it("defines message and task kinds", () => {
    expect(MESSAGE_KIND.MESSAGE).toBe("message");
    expect(MESSAGE_KIND.TASK).toBe("task");
  });

  it("stores independent read positions for both conversation participants", () => {
    expect(conversations.participantOneReadAt).toBeDefined();
    expect(conversations.participantTwoReadAt).toBeDefined();
  });

  it("stores task completion metadata", () => {
    expect(messages.taskCompletedAt).toBeDefined();
    expect(messages.taskCompletedById).toBeDefined();
  });
});
