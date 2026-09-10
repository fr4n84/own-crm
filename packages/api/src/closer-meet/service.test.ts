import { describe, expect, it, vi } from "vitest";

import { CloserMeetAccessError, createCloserMeetService } from "./service";

const meeting = {
  calendarEventId: "event-1",
  calendarEventUrl: "https://calendar.google.com/event?eid=event-1",
  meetingCode: "abc-defg-hij",
  meetingUri: "https://meet.google.com/abc-defg-hij",
};

function setup(overrides?: { closerId?: string; saveError?: Error }) {
  const repository = {
    findById: vi.fn().mockResolvedValue(null),
    listByLead: vi.fn().mockResolvedValue([{ id: "operation-1", ...meeting }]),
    getLeadContext: vi.fn().mockResolvedValue({
      leadId: "lead-1",
      closerId: overrides?.closerId ?? "closer-1",
      closerEmail: "closer@example.com",
      contactEmail: "contact@example.com",
    }),
    saveScheduled: overrides?.saveError
      ? vi.fn().mockRejectedValue(overrides.saveError)
      : vi.fn().mockResolvedValue({ id: "operation-1", ...meeting }),
  };
  const workspace = {
    createCloserMeeting: vi.fn().mockResolvedValue(meeting),
    deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
  };
  return { repository, workspace, service: createCloserMeetService({ repository, workspace }) };
}

describe("Closer Meet service", () => {
  it("allows the assigned Closer and persists only provider metadata", async () => {
    const { repository, workspace, service } = setup();

    await expect(service.create({
      operationId: "operation-1",
      actorId: "closer-1",
      isAdmin: false,
      leadId: "lead-1",
      startsAt: new Date("2026-09-10T08:00:00.000Z"),
      durationMinutes: 45,
    })).resolves.toMatchObject(meeting);

    expect(workspace.createCloserMeeting).toHaveBeenCalledWith(expect.objectContaining({
      leadId: "lead-1",
      closerId: "closer-1",
      requestId: "operation-1",
    }));
    expect(repository.saveScheduled).toHaveBeenCalledWith(expect.objectContaining({
      id: "operation-1",
      createdById: "closer-1",
      status: "scheduled",
    }));
    expect(repository.saveScheduled.mock.calls[0]?.[0]).not.toHaveProperty("video");
    expect(repository.saveScheduled.mock.calls[0]?.[0]).not.toHaveProperty("transcript");
    expect(repository.saveScheduled.mock.calls[0]?.[0]).not.toHaveProperty("retentionDays");
  });

  it("denies a Closer assigned to a different lead before calling Google", async () => {
    const { workspace, service } = setup({ closerId: "closer-2" });

    await expect(service.create({
      operationId: "operation-1",
      actorId: "closer-1",
      isAdmin: false,
      leadId: "lead-1",
      startsAt: new Date("2026-09-10T08:00:00.000Z"),
      durationMinutes: 45,
    })).rejects.toBeInstanceOf(CloserMeetAccessError);
    expect(workspace.createCloserMeeting).not.toHaveBeenCalled();
  });

  it("returns an existing idempotent operation without creating a duplicate", async () => {
    const { repository, workspace, service } = setup();
    repository.findById.mockResolvedValue({ id: "operation-1", leadId: "lead-1", createdById: "closer-1", ...meeting });

    await expect(service.create({
      operationId: "operation-1",
      actorId: "closer-1",
      isAdmin: false,
      leadId: "lead-1",
      startsAt: new Date("2026-09-10T08:00:00.000Z"),
      durationMinutes: 45,
    })).resolves.toMatchObject(meeting);
    expect(workspace.createCloserMeeting).not.toHaveBeenCalled();
  });

  it("compensates an orphaned Calendar event when persistence fails", async () => {
    const databaseError = new Error("database unavailable");
    const { workspace, service } = setup({ saveError: databaseError });

    await expect(service.create({
      operationId: "operation-1",
      actorId: "closer-1",
      isAdmin: false,
      leadId: "lead-1",
      startsAt: new Date("2026-09-10T08:00:00.000Z"),
      durationMinutes: 45,
    })).rejects.toBe(databaseError);
    expect(workspace.deleteCalendarEvent).toHaveBeenCalledWith("event-1");
  });
});

