import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const EXTENSIONS_BY_MIME = new Map([
  ["application/pdf", ".pdf"],
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
] as const);

const STORAGE_KEY = /^[0-9a-f-]{36}\.(?:pdf|doc|docx|jpg|png|webp)$/;

function storageDirectory() {
  return join(process.cwd(), ".data", "closer-contracts");
}

function safePath(storageKey: string) {
  if (!STORAGE_KEY.test(storageKey)) throw new Error("Invalid contract key");
  return join(storageDirectory(), storageKey);
}

export async function storeCloserContract(file: File) {
  const mimeType = file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const extension = EXTENSIONS_BY_MIME.get(mimeType as never);
  if (!extension) throw new Error("Unsupported contract type");
  const bytes = Buffer.from(await file.arrayBuffer());
  const storageKey = `${randomUUID()}${extension}`;
  await mkdir(storageDirectory(), { recursive: true });
  await writeFile(safePath(storageKey), bytes, { flag: "wx" });
  return {
    storageKey,
    fileName: file.name,
    mimeType,
    sizeBytes: bytes.byteLength,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function readCloserContract(storageKey: string) {
  return readFile(safePath(storageKey));
}

export function deleteCloserContract(storageKey: string) {
  return rm(safePath(storageKey), { force: true });
}
