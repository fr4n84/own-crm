import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import {
  madridLocalScheduleSchema,
  parseMadridLocalDateTime,
} from "../closer-meet/madrid-date-time";
import { closerMeetRepository } from "../closer-meet/repository";
import { createCloserMeetRecordingSyncRuntime } from "../closer-meet/recording-sync-runtime";
import {
  CloserMeetAccessError,
  CloserMeetNotFoundError,
  createCloserMeetService,
} from "../closer-meet/service";
import {
  createGoogleWorkspaceClientFromEnv,
} from "../google-workspace/runtime";
import { createCloserMeetTranscriptRuntime } from "../closer-meet/transcript-runtime";
import { TranscriptAccessError } from "../closer-meet/transcript-service";
import { protectedProcedure, router } from "../index";
import { permittedProcedure } from "../trpc/trpc";

export const createCloserMeetInput = z.object({
  operationId: z.uuid(),
  leadId: z.string().min(1),
  durationMinutes: z.number().int().min(15).max(480).refine(
    (minutes) => minutes % 15 === 0,
    "Meeting duration must use 15-minute intervals",
  ),
}).and(madridLocalScheduleSchema);

function createService() {
  const workspace = createGoogleWorkspaceClientFromEnv();
  if (!workspace) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Google Workspace integration is not configured",
    });
  }
  return createCloserMeetService({ repository: closerMeetRepository, workspace });
}

export const closerMeetRouter = router({
  list: permittedProcedure(["sales:read"])
    .input(z.object({ leadId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        return await createService().list({
          ...input,
          actorId: ctx.session.user.id,
          isAdmin: ctx.permissions.includes("*"),
        });
      } catch (error) {
        if (error instanceof CloserMeetAccessError) {
          throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        }
        if (error instanceof CloserMeetNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        throw error;
      }
    }),

  create: permittedProcedure(["sales:write"])
    .input(createCloserMeetInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await createService().create({
          operationId: input.operationId,
          leadId: input.leadId,
          startsAt: parseMadridLocalDateTime(
            input.scheduledDate,
            input.scheduledTime,
          ),
          durationMinutes: input.durationMinutes,
          actorId: ctx.session.user.id,
          isAdmin: ctx.permissions.includes("*"),
        });
      } catch (error) {
        if (error instanceof CloserMeetAccessError) {
          throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        }
        if (error instanceof CloserMeetNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        throw error;
      }
    }),

  readTranscript: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const runtime = createCloserMeetTranscriptRuntime();
      if (!runtime) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Transcript encryption is not configured" });
      try {
        return await runtime.read({ ...input, actorId: ctx.session.user.id, permissions: ctx.permissions });
      } catch (error) {
        if (error instanceof TranscriptAccessError) throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        throw error;
      }
    }),

  analyzeTranscripts: protectedProcedure
    .input(z.object({ leadId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const runtime = createCloserMeetTranscriptRuntime();
      if (!runtime) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Transcript analysis is not configured" });
      try {
        return await runtime.analyzeLead({ ...input, actorId: ctx.session.user.id, permissions: ctx.permissions });
      } catch (error) {
        if (error instanceof TranscriptAccessError) throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        throw error;
      }
    }),
  runRecordingSync: permittedProcedure(["*"])
    .mutation(async () => {
      const syncRuntime = createCloserMeetRecordingSyncRuntime();
      if (!syncRuntime) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google Workspace recording sync is not configured",
        });
      }
      return syncRuntime.run(new Date());
    }),
});


