import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, db, eq } from "@crm-fran/db";
import { account, roles, session, user, verification } from "@crm-fran/db/schema/auth";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

export const passwordRecoveryInput = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  newPassword: z.string().min(8).max(128),
});
export class PasswordRecoveryError extends Error {}
const identifier = (userId: string) => "admin-password-recovery:" + userId;
const invalidCode = () => new PasswordRecoveryError("Código inválido o caducado");
export function resetCodeDigest(code: string) { return createHash("sha256").update(code).digest("hex"); }

// Separate namespace: never depend on Better Auth's private reset-token format.
// 256-bit codes make guessing impractical without account-wide lockouts that enable DoS.
export async function issuePasswordResetCode(actorId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [actor] = await tx.select({ permissions: roles.permissions }).from(user)
      .innerJoin(roles, eq(user.roleId, roles.id)).where(eq(user.id, actorId)).limit(1);
    if (!Array.isArray(actor?.permissions) || !actor.permissions.includes("*")) {
      throw new PasswordRecoveryError("Se requiere administración para generar un código");
    }
    // Issue, reissue and redemption all lock the same user, including absent codes.
    const [target] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
    if (!target) throw new PasswordRecoveryError("El usuario no está disponible");
    const [credential] = await tx.select({ id: account.id }).from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential"))).limit(1);
    if (!credential) throw new PasswordRecoveryError("El usuario no tiene acceso con contraseña");
    const code = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await tx.delete(verification).where(eq(verification.identifier, identifier(userId)));
    await tx.insert(verification).values({ id: randomUUID(), identifier: identifier(userId), value: resetCodeDigest(code), expiresAt });
    return { code, expiresAt };
  });
}

export async function redeemPasswordResetCode(input: z.input<typeof passwordRecoveryInput>) {
  const parsed = passwordRecoveryInput.safeParse(input);
  if (!parsed.success) throw invalidCode();
  const { email, code, newPassword } = parsed.data;
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).for("update");
    if (!target) throw invalidCode();
    const [stored] = await tx.select({ id: verification.id, value: verification.value, expiresAt: verification.expiresAt })
      .from(verification).where(eq(verification.identifier, identifier(target.id))).limit(1);
    const digest = resetCodeDigest(code);
    if (!stored || stored.expiresAt.getTime() <= Date.now() || stored.value.length !== digest.length
      || !timingSafeEqual(Buffer.from(stored.value), Buffer.from(digest))) throw invalidCode();
    // No expensive password hash until the account-bound, unexpired code is proven.
    const password = await hashPassword(newPassword);
    const updated = await tx.update(account).set({ password, updatedAt: new Date() })
      .where(and(eq(account.userId, target.id), eq(account.providerId, "credential"))).returning({ id: account.id });
    if (updated.length !== 1) throw invalidCode();
    await tx.delete(verification).where(eq(verification.identifier, identifier(target.id)));
    await tx.delete(session).where(eq(session.userId, target.id));
    return { status: true as const };
  });
}
