import { db, desc, eq } from "@crm-fran/db";
import { suggestions, user } from "@crm-fran/db/schema/index";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "../index";
import { suggestionAuthorId, suggestionInput } from "../suggestions/domain";

export const suggestionsRouter = router({
  create: protectedProcedure.input(suggestionInput).mutation(async ({ ctx, input }) => {
    const authorUserId = suggestionAuthorId({ anonymous: input.anonymous, userId: ctx.session.user.id });
    const [created] = await db.insert(suggestions).values({
      id: crypto.randomUUID(),
      body: input.body,
      isAnonymous: input.anonymous,
      authorUserId,
    }).returning({ id: suggestions.id, createdAt: suggestions.createdAt });
    return created;
  }),
  list: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.permissions?.includes("*")) throw new TRPCError({ code: "FORBIDDEN" });
    return db.select({
      id: suggestions.id,
      body: suggestions.body,
      isAnonymous: suggestions.isAnonymous,
      createdAt: suggestions.createdAt,
      author: { id: user.id, name: user.name, email: user.email },
    }).from(suggestions).leftJoin(user, eq(suggestions.authorUserId, user.id)).orderBy(desc(suggestions.createdAt));
  }),
});
