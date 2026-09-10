export class CloserMeetAccessError extends Error {
  constructor() {
    super("You cannot manage meetings for this lead");
    this.name = "CloserMeetAccessError";
  }
}

export class CloserMeetNotFoundError extends Error {
  constructor() {
    super("Lead or assigned Closer not found");
    this.name = "CloserMeetNotFoundError";
  }
}

type LeadMeetingContext = {
  leadId: string;
  closerId: string;
  closerEmail: string;
  contactEmail: string | null;
};

type MeetingMetadata = {
  calendarEventId: string;
  calendarEventUrl: string;
  meetingCode: string;
  meetingUri: string;
};

type ExistingMeeting = MeetingMetadata & {
  id: string;
  leadId: string;
  createdById: string;
};

type ScheduledMeeting = ExistingMeeting & {
  closerId: string;
  status: "scheduled";
  scheduledStart: Date;
  scheduledEnd: Date;
};

type CloserMeetRepository = {
  findById(id: string): Promise<ExistingMeeting | null>;
  getLeadContext(leadId: string): Promise<LeadMeetingContext | null>;
  listByLead(leadId: string): Promise<Array<{
    id: string;
    status: string;
    calendarEventUrl: string | null;
    meetingUri: string | null;
    scheduledStart: Date;
    scheduledEnd: Date;
    driveExportUri: string | null;
    hasTranscript: boolean;
  }>>;
  saveScheduled(meeting: ScheduledMeeting): Promise<ExistingMeeting>;
};

type WorkspaceMeetClient = {
  createCloserMeeting(input: {
    leadId: string;
    closerId: string;
    closerEmail: string;
    contactEmail: string | null;
    startsAt: Date;
    durationMinutes: number;
    requestId: string;
  }): Promise<MeetingMetadata>;
  deleteCalendarEvent(calendarEventId: string): Promise<void>;
};

export function createCloserMeetService(input: {
  repository: CloserMeetRepository;
  workspace: WorkspaceMeetClient;
}) {
  async function requireLeadAccess(command: { actorId: string; isAdmin: boolean; leadId: string }) {
    const context = await input.repository.getLeadContext(command.leadId);
    if (!context) throw new CloserMeetNotFoundError();
    if (!command.isAdmin && context.closerId !== command.actorId) {
      throw new CloserMeetAccessError();
    }
    return context;
  }

  return {
    async list(command: { actorId: string; isAdmin: boolean; leadId: string }) {
      await requireLeadAccess(command);
      return input.repository.listByLead(command.leadId);
    },

    async create(command: {
      operationId: string;
      actorId: string;
      isAdmin: boolean;
      leadId: string;
      startsAt: Date;
      durationMinutes: number;
    }) {
      const existing = await input.repository.findById(command.operationId);
      if (existing) {
        if (
          existing.leadId !== command.leadId
          || (!command.isAdmin && existing.createdById !== command.actorId)
        ) {
          throw new CloserMeetAccessError();
        }
        return existing;
      }

      const context = await requireLeadAccess(command);
      const meeting = await input.workspace.createCloserMeeting({
        leadId: context.leadId,
        closerId: context.closerId,
        closerEmail: context.closerEmail,
        contactEmail: context.contactEmail,
        startsAt: command.startsAt,
        durationMinutes: command.durationMinutes,
        requestId: command.operationId,
      });

      try {
        return await input.repository.saveScheduled({
          id: command.operationId,
          leadId: context.leadId,
          closerId: context.closerId,
          createdById: command.actorId,
          status: "scheduled",
          ...meeting,
          scheduledStart: command.startsAt,
          scheduledEnd: new Date(command.startsAt.getTime() + command.durationMinutes * 60_000),
        });
      } catch (error) {
        try {
          await input.workspace.deleteCalendarEvent(meeting.calendarEventId);
        } catch {
          // Preserve the persistence error; orphan cleanup can be retried operationally.
        }
        throw error;
      }
    },
  };
}


