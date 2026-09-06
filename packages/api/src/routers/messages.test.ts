import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";

const persistence = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type State = { messages: Row[]; updatedAt: Date };
  const initialTime = new Date("2026-08-01T00:00:00Z");
  const state: State = { messages: [], updatedAt: initialTime };
  const failure = new Error("Conversation update failed");
  const controls = { failUpdate: false };
  const writes = (target: State) => ({
    insert: vi.fn(() => ({
      values: (row: Row) => ({ returning: async () => {
        target.messages.push(row);
        return [row];
      } }),
    })),
    update: vi.fn(() => ({
      set: ({ updatedAt }: { updatedAt: Date }) => ({ where: async () => {
        if (controls.failUpdate) throw failure;
        target.updatedAt = updatedAt;
      } }),
    })),
  });
  const direct = writes(state);
  const selectRows = vi.fn();
  // A transactional double tests router ownership of writes, not PostgreSQL rollback.
  const transaction = vi.fn(async <T>(run: (tx: ReturnType<typeof writes>) => Promise<T>) => {
    const pending = { messages: [...state.messages], updatedAt: state.updatedAt };
    const result = await run(writes(pending));
    Object.assign(state, pending);
    return result;
  });
  return { state, initialTime, failure, controls, direct, transaction, selectRows };
});

vi.mock("@crm-fran/db", () => ({
  db: {
    ...persistence.direct,
    transaction: persistence.transaction,
    select: () => ({ from: () => ({ where: () => ({ limit: persistence.selectRows }) }) }),
  },
  alias: (table: unknown) => table,
  and: vi.fn(), asc: vi.fn(), desc: vi.fn(), eq: vi.fn(), inArray: vi.fn(), or: vi.fn(),
}));
vi.mock("../alerts/services/index", () => ({ processRecurringAlerts: vi.fn() }));
vi.mock("../leads/services/index", () => ({ isCloserOf: vi.fn(), hasCloserSession: vi.fn() }));

import { messagesRouter } from "./messages";

const now = new Date("2026-09-04T10:00:00Z");
const context: Context = {
  session: {
    session: { id: "session", token: "test-token", userId: "sender", expiresAt: now, createdAt: now, updatedAt: now },
    user: { id: "sender", name: "Sender", email: "sender@example.com", emailVerified: true, accessStatus: "active", createdAt: now, updatedAt: now, roleId: "role-caller", leadActive: "", scoring: 0 },
  },
  role: null,
  permissions: [],
};
const caller = messagesRouter.createCaller(context);
const conversationId = "conversation";
const cases = [
  { name: "message", send: () => caller.sendMessage({ conversationId, body: " Hello " }), expected: { kind: "message", body: "Hello" } },
  { name: "task", send: () => caller.sendTask({ conversationId, title: " Follow up ", description: " Details ", assigneeId: "recipient", dueAt: "2026-09-05T10:00:00Z" }), expected: { kind: "task", body: "Details", taskTitle: "Follow up", taskAssigneeId: "recipient", taskDueAt: new Date("2026-09-05T10:00:00Z") } },
];

describe("message creation atomicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    persistence.state.messages = [];
    persistence.state.updatedAt = persistence.initialTime;
    persistence.controls.failUpdate = false;
    persistence.selectRows.mockResolvedValue([{ id: conversationId, participantOneId: "sender", participantTwoId: "recipient" }]);
  });
  afterEach(() => vi.useRealTimers());

  for (const scenario of cases) {
    it(`does not persist a ${scenario.name} when conversation update fails`, async () => {
      persistence.controls.failUpdate = true;
      await expect(scenario.send()).rejects.toMatchObject({ cause: persistence.failure });
      expect(persistence.state.messages).toEqual([]);
      expect(persistence.state.updatedAt).toEqual(persistence.initialTime);
      expect(persistence.transaction).toHaveBeenCalledTimes(1);
      expect(persistence.direct.insert).not.toHaveBeenCalled();
      expect(persistence.direct.update).not.toHaveBeenCalled();
    });

    it(`returns the saved ${scenario.name} and commits its conversation timestamp`, async () => {
      const result = await scenario.send();
      expect(result).toMatchObject({ id: expect.any(String), conversationId, senderId: "sender", ...scenario.expected });
      expect(persistence.state.messages).toEqual([result]);
      expect(persistence.state.updatedAt).toEqual(now);
      expect(persistence.transaction).toHaveBeenCalledTimes(1);
      expect(persistence.direct.insert).not.toHaveBeenCalled();
      expect(persistence.direct.update).not.toHaveBeenCalled();
    });

    it(`rejects a ${scenario.name} when no conversation belongs to the actor`, async () => {
      persistence.selectRows.mockResolvedValue([]);
      await expect(scenario.send()).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(persistence.state.messages).toEqual([]);
      expect(persistence.transaction).not.toHaveBeenCalled();
      expect(persistence.direct.insert).not.toHaveBeenCalled();
      expect(persistence.direct.update).not.toHaveBeenCalled();
    });
  }

  it("rejects a task assignee outside the conversation before writing", async () => {
    await expect(caller.sendTask({ conversationId, title: "Follow up", assigneeId: "outsider" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(persistence.state.messages).toEqual([]);
    expect(persistence.transaction).not.toHaveBeenCalled();
    expect(persistence.direct.insert).not.toHaveBeenCalled();
    expect(persistence.direct.update).not.toHaveBeenCalled();
  });

  it("preserves optional task defaults and permits assigning the sender", async () => {
    const result = await caller.sendTask({ conversationId, title: "Follow up", assigneeId: "sender" });
    expect(result).toMatchObject({ body: "", taskDueAt: null, taskAssigneeId: "sender" });
    expect(persistence.state.messages).toEqual([result]);
  });
});
