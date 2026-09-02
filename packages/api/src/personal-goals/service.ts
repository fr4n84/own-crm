import { TRPCError } from "@trpc/server";
import { and, db, desc, eq } from "@crm-fran/db";
import {
  leadActivityEvents,
  personalGoals,
  type PersonalGoalMetric,
} from "@crm-fran/db/schema/index";

import { calculateGoalProgress, getGoalStatus } from "./progress";

export type PersonalGoalInput = {
  metric: PersonalGoalMetric;
  targetValue: number;
  startDate: string;
  endDate: string;
};

async function withProgress(
  goals: Array<typeof personalGoals.$inferSelect>,
) {
  if (goals.length === 0) return [];

  const events = await db
    .select({
      leadId: leadActivityEvents.leadId,
      actorId: leadActivityEvents.actorId,
      kind: leadActivityEvents.kind,
      metadata: leadActivityEvents.metadata,
      occurredAt: leadActivityEvents.occurredAt,
    })
    .from(leadActivityEvents);

  return goals.map((goal) => {
    const progress = calculateGoalProgress({
      events,
      userId: goal.userId,
      metric: goal.metric,
      startDate: goal.startDate,
      endDate: goal.endDate,
    });
    return {
      ...goal,
      progress,
      progressPercentage: Math.min(100, Math.round((progress / goal.targetValue) * 100)),
      status: getGoalStatus(goal.startDate, goal.endDate),
    };
  });
}

export async function listPersonalGoals(userId: string) {
  const goals = await db
    .select()
    .from(personalGoals)
    .where(eq(personalGoals.userId, userId))
    .orderBy(desc(personalGoals.startDate), desc(personalGoals.createdAt));
  return withProgress(goals);
}

export async function createPersonalGoal(
  userId: string,
  input: PersonalGoalInput,
) {
  const [goal] = await db
    .insert(personalGoals)
    .values({ id: crypto.randomUUID(), userId, ...input })
    .returning();
  if (!goal) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  return goal;
}

export async function updatePersonalGoal(
  userId: string,
  id: string,
  input: PersonalGoalInput,
) {
  const [goal] = await db
    .update(personalGoals)
    .set(input)
    .where(and(eq(personalGoals.id, id), eq(personalGoals.userId, userId)))
    .returning();
  if (!goal) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Objetivo no encontrado" });
  }
  return goal;
}

export async function deletePersonalGoal(userId: string, id: string) {
  const [goal] = await db
    .delete(personalGoals)
    .where(and(eq(personalGoals.id, id), eq(personalGoals.userId, userId)))
    .returning({ id: personalGoals.id });
  if (!goal) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Objetivo no encontrado" });
  }
  return goal;
}
