import { describe, expect, it } from "vitest";
import { createTranscriptCipher } from "./transcript-crypto";

const context = {
  sessionId: "session-1",
  transcriptResourceName: "conferenceRecords/record-1/transcripts/transcript-1",
};

describe("Closer Meet transcript encryption", () => {
  const key = Buffer.alloc(32, 7).toString("base64");

  it("uses a fresh nonce and authenticated AES-256-GCM ciphertext", () => {
    const cipher = createTranscriptCipher({ base64Key: key, keyId: "meet-v1" });
    const first = cipher.encrypt("sensitive transcript", context);
    const second = cipher.encrypt("sensitive transcript", context);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.nonce).not.toBe(second.nonce);
    expect(JSON.stringify(first)).not.toContain("sensitive transcript");
    expect(cipher.decrypt(first, context)).toBe("sensitive transcript");
  });

  it("rejects invalid keys, tampering, and row/resource substitution", () => {
    expect(() => createTranscriptCipher({ base64Key: Buffer.alloc(31).toString("base64"), keyId: "meet-v1" })).toThrow();
    const cipher = createTranscriptCipher({ base64Key: key, keyId: "meet-v1" });
    const encrypted = cipher.encrypt("sensitive transcript", context);
    expect(() => cipher.decrypt({ ...encrypted, ciphertext: Buffer.from("tampered").toString("base64") }, context)).toThrow("Transcript authentication failed");
    expect(() => cipher.decrypt(encrypted, { ...context, sessionId: "session-2" })).toThrow("Transcript authentication failed");
    expect(() => cipher.decrypt(encrypted, { ...context, transcriptResourceName: "conferenceRecords/record-1/transcripts/transcript-2" })).toThrow("Transcript authentication failed");
  });
});
