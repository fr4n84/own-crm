import { and, db, eq, sql } from "@crm-fran/db";
import {
  roles,
  session,
  user,
  userAccessAudit,
  USER_ACCESS_AUDIT_ACTION,
  USER_ACCESS_STATUS,
  type UserAccessStatus,
} from "@crm-fran/db/schema/auth";
import { TRPCError } from "@trpc/server";

import { normalizePermissions } from "../../permissions";

export type UserAccessAction = "approve" | "disable" | "reactivate";

const transitions: Record<UserAccessAction, { from: UserAccessStatus; to: UserAccessStatus; audit: string }> = {
  approve: { from: USER_ACCESS_STATUS.PENDING, to: USER_ACCESS_STATUS.ACTIVE, audit: USER_ACCESS_AUDIT_ACTION.APPROVED },
  disable: { from: USER_ACCESS_STATUS.ACTIVE, to: USER_ACCESS_STATUS.DISABLED, audit: USER_ACCESS_AUDIT_ACTION.DISABLED },
  reactivate: { from: USER_ACCESS_STATUS.DISABLED, to: USER_ACCESS_STATUS.ACTIVE, audit: USER_ACCESS_AUDIT_ACTION.REACTIVATED },
};

export async function updateUserAccessStatus(input: {
  actorId: string;
  targetUserId: string;
  action: UserAccessAction;
  expectedStatus: UserAccessStatus;
  expectedVersion: number;
  reason?: string;
}) {
  const transition = transitions[input.action];
  if (input.expectedStatus !== transition.from) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "La acción no corresponde al estado actual esperado" });
  }

  return db.transaction(async (transaction) => {
    // One lock serializes quorum decisions even when two administrators target
    // different accounts at the same time.
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext('crm:user-access-admin-quorum'))`);

    const [actor] = await transaction
      .select({ id: user.id, permissions: roles.permissions })
      .from(user)
      .innerJoin(roles, eq(user.roleId, roles.id))
      .where(and(eq(user.id, input.actorId), eq(user.accessStatus, USER_ACCESS_STATUS.ACTIVE)))
      .limit(1);
    if (!actor || !normalizePermissions(actor.permissions).includes("*")) {
      throw new TRPCError({ code: "FORBIDDEN", message: "La administración global activa es obligatoria" });
    }

    const [target] = await transaction
      .select({ id: user.id, roleId: user.roleId, accessStatus: user.accessStatus, statusVersion: user.statusVersion })
      .from(user)
      .where(eq(user.id, input.targetUserId))
      .for("update")
      .limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "El usuario no existe" });
    if (target.accessStatus !== input.expectedStatus || target.statusVersion !== input.expectedVersion) {
      throw new TRPCError({ code: "CONFLICT", message: "El estado del usuario cambió. Actualiza la lista e inténtalo de nuevo." });
    }
    if (input.action === "disable" && target.id === input.actorId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No puedes eliminar tu propio acceso" });
    }

    const [targetRole] = await transaction.select({ permissions: roles.permissions }).from(roles).where(eq(roles.id, target.roleId)).limit(1);
    if (input.action === "disable" && normalizePermissions(targetRole?.permissions).includes("*")) {
      const activeAdministrators = await transaction
        .select({ id: user.id, permissions: roles.permissions })
        .from(user)
        .innerJoin(roles, eq(user.roleId, roles.id))
        .where(eq(user.accessStatus, USER_ACCESS_STATUS.ACTIVE));
      if (activeAdministrators.filter((candidate) => normalizePermissions(candidate.permissions).includes("*")).length <= 1) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Debe quedar al menos un administrador global activo" });
      }
    }

    const nextVersion = input.expectedVersion + 1;
    const changedAt = new Date();
    const [updated] = await transaction
      .update(user)
      .set({
        accessStatus: transition.to,
        statusVersion: nextVersion,
        accessStatusChangedAt: changedAt,
        accessStatusChangedById: input.actorId,
      })
      .where(and(
        eq(user.id, input.targetUserId),
        eq(user.accessStatus, input.expectedStatus),
        eq(user.statusVersion, input.expectedVersion),
      ))
      .returning({ id: user.id, accessStatus: user.accessStatus, statusVersion: user.statusVersion });
    if (!updated) throw new TRPCError({ code: "CONFLICT", message: "El estado del usuario cambió. Actualiza la lista e inténtalo de nuevo." });

    if (transition.to === USER_ACCESS_STATUS.DISABLED) {
      await transaction.delete(session).where(eq(session.userId, input.targetUserId));
    }
    await transaction.insert(userAccessAudit).values({
      id: crypto.randomUUID(),
      targetUserId: input.targetUserId,
      actorUserId: input.actorId,
      action: transition.audit,
      previousStatus: transition.from,
      nextStatus: transition.to,
      statusVersion: nextVersion,
      reason: input.reason?.trim() || null,
      occurredAt: changedAt,
    });
    return updated;
  });
}
