import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "aes-256-gcm-v1";
const AAD_VERSION = "closer-meet-transcript-aad-v1";
const NONCE_BYTES = 12;

export type TranscriptEncryptionContext = {
  sessionId: string;
  transcriptResourceName: string;
};

export type EncryptedTranscript = {
  encryptionVersion: typeof VERSION;
  keyId: string;
  nonce: string;
  ciphertext: string;
  authTag: string;
};

function decodeBase64Key(value: string) {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) throw new Error("Transcript encryption key must be canonical base64 encoding of exactly 32 bytes");
  return key;
}

function associatedData(context: TranscriptEncryptionContext) {
  if (context.sessionId.length < 1 || context.sessionId.length > 256) throw new Error("Invalid transcript session identifier");
  if (!/^conferenceRecords\/[^/]+\/transcripts\/[^/]+$/.test(context.transcriptResourceName)) throw new Error("Invalid transcript resource name");
  const session = Buffer.from(context.sessionId, "utf8");
  const resource = Buffer.from(context.transcriptResourceName, "utf8");
  return Buffer.concat([
    Buffer.from(`${AAD_VERSION}\0${session.length}:`, "utf8"),
    session,
    Buffer.from(`${resource.length}:`, "utf8"),
    resource,
  ]);
}

export function createTranscriptCipher(input: { base64Key: string; keyId: string }) {
  const key = decodeBase64Key(input.base64Key);
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(input.keyId)) throw new Error("Invalid transcript encryption key identifier");
  return {
    encrypt(plaintext: string, context: TranscriptEncryptionContext): EncryptedTranscript {
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, nonce);
      cipher.setAAD(associatedData(context));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return { encryptionVersion: VERSION, keyId: input.keyId, nonce: nonce.toString("base64"), ciphertext: ciphertext.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
    },
    decrypt(encrypted: EncryptedTranscript, context: TranscriptEncryptionContext) {
      if (encrypted.encryptionVersion !== VERSION || encrypted.keyId !== input.keyId) throw new Error("Unsupported transcript encryption key or version");
      try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(encrypted.nonce, "base64"));
        decipher.setAAD(associatedData(context));
        decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
        return Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, "base64")), decipher.final()]).toString("utf8");
      } catch {
        throw new Error("Transcript authentication failed");
      }
    },
  };
}
