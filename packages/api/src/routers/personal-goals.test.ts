import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, inArray } from "@crm-fran/db";
import {
  PERSONAL_GOAL_METRIC,
  personalGoals,
  roles,
  user,
} from "@crm-fran/db/schema/index";

import type { Permission } from "@crm-fran/db/schema/auth";
import type { Context } from "../context";
import { appRouter } from "./index";

describe("personal goals router", () => {
  const userIds: string[] = [];

  beforeAll(async () => {
    await db
      .insert(roles)
      .values([
        { id: "role-caller", name: "Caller", permissions: ["leads:*"] },
        { id: "role-closer", name: "Closer", permissions: ["leads:*"] },
        { id: "role-admin", name: "Admin", permissions: ["*"] },
      ])
      .onConflictDoNothing();
  });

  afterEach(async () => {
    if (userIds.length === 0) return;
    await db.delete(personalGoals).where(inArray(personalGoals.userId, userIds));
    await db.delete(user).where(inArray(user.id, userIds));
    userIds.length = 0;
  });

  async function insertUser(roleId: string) {
    const id = crypto.randomUUID();
    userIds.push(id);
    await db.insert(user).values({
      id,
      name: "Goal User",
      email: `${id}@test.com`,
      roleId,
    });
    return id;
  }

  function createCaller(userId: string, roleId: string, permissions: Permission[]) {
    const ctx = {
      session: {
        user: {
          id: userId,
          roleId,
          name: "Goal User",
          email: `${userId}@test.com`,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      role: { id: roleId, name: roleId, permissions },
      permissions,
    } as Context;
    return appRouter.createCaller(ctx);
  }

  const goalInput = {
    metric: PERSONAL_GOAL_METRIC.CONTACTED,
    targetValue: 20,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  } as const;

  it("lets users manage only their own goals", async () => {
    const ownerId = await insertUser("role-caller");
    const otherId = await insertUser("role-caller");
    const owner = createCaller(ownerId, "role-caller", ["leads:*"]);
    const other = createCaller(otherId, "role-caller", ["leads:*"]);

    const created = await owner.personalGoals.create(goalInput);
    await expect(owner.personalGoals.list()).resolves.toEqual([
      expect.objectContaining({ id: created.id, progress: 0 }),
    ]);
    await expect(other.personalGoals.list({ userId: ownerId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      other.personalGoals.update({ id: created.id, goal: { ...goalInput, targetValue: 30 } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(other.personalGoals.delete({ id: created.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await expect(
      owner.personalGoals.update({ id: created.id, goal: { ...goalInput, targetValue: 30 } }),
    ).resolves.toMatchObject({ id: created.id, targetValue: 30 });
    await expect(owner.personalGoals.delete({ id: created.id })).resolves.toEqual({
      id: created.id,
    });
  });

  it("lets admins consult another user's goals without mutating them", async () => {
    const ownerId = await insertUser("role-caller");
    const adminId = await insertUser("role-admin");
    const owner = createCaller(ownerId, "role-caller", ["leads:*"]);
    const admin = createCaller(adminId, "role-admin", ["*"]);
    const created = await owner.personalGoals.create(goalInput);

    await expect(admin.personalGoals.list({ userId: ownerId })).resolves.toEqual([
      expect.objectContaining({ id: created.id }),
    ]);
    await expect(admin.personalGoals.delete({ id: created.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("restricts closer goals to Shows", async () => {
    const closerId = await insertUser("role-closer");
    const closer = createCaller(closerId, "role-closer", ["leads:*"]);

    await expect(closer.personalGoals.create(goalInput)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      closer.personalGoals.create({ ...goalInput, metric: PERSONAL_GOAL_METRIC.SHOWS }),
    ).resolves.toMatchObject({ metric: PERSONAL_GOAL_METRIC.SHOWS });
  });
});
