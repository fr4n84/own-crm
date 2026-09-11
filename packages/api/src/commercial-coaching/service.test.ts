import { describe, expect, it } from "vitest";
import { canGenerateCoaching, canReadCoaching, canReviewCoaching } from "./service";

describe("commercial coaching access", () => {
  it("keeps analysis private to its agent unless Admin or an explicit coach is authorized", () => {
    expect(canReadCoaching({ actorId: "agent", targetUserId: "agent", permissions: ["leads:read"] })).toBe(true);
    expect(canReadCoaching({ actorId: "other", targetUserId: "agent", permissions: ["leads:read"] })).toBe(false);
    expect(canReadCoaching({ actorId: "coach", targetUserId: "agent", permissions: ["coaching:read"] })).toBe(true);
    expect(canReadCoaching({ actorId: "admin", targetUserId: "agent", permissions: ["*"] })).toBe(true);
  });

  it("requires self, Admin, or explicit review authority to confirm a draft", () => {
    expect(canReviewCoaching({ actorId: "agent", targetUserId: "agent", permissions: [] })).toBe(true);
    expect(canReviewCoaching({ actorId: "coach", targetUserId: "agent", permissions: ["coaching:review"] })).toBe(true);
    expect(canReviewCoaching({ actorId: "viewer", targetUserId: "agent", permissions: ["coaching:read"] })).toBe(false);
  });

  it("allows Meet coaching generation only for the analyzed Closer or Admin", () => {
    expect(canGenerateCoaching({ actorId: "agent", targetUserId: "agent", permissions: [] })).toBe(true);
    expect(canGenerateCoaching({ actorId: "admin", targetUserId: "agent", permissions: ["*"] })).toBe(true);
    expect(canGenerateCoaching({ actorId: "coach", targetUserId: "agent", permissions: ["coaching:read", "coaching:review"] })).toBe(false);
  });
});