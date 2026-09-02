import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const EXTENSIONS_BY_MIME = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/quicktime", ".mov"],
  ["audio/mpeg", ".mp3"],
  ["audio/mp4", ".m4a"],
  ["audio/ogg", ".ogg"],
  ["audio/wav", ".wav"],
  ["audio/x-wav", ".wav"],
] as const);

const STORAGE_KEY = /^[0-9a-f-]{36}\.(?:jpg|png|webp|gif|mp4|webm|mov|mp3|m4a|ogg|wav)$/;

function storageDirectory() {
  return join(process.cwd(), ".data", "marketing-assets");
}

function safePath(storageKey: string) {
  if (!STORAGE_KEY.test(storageKey)) throw new Error("Invalid marketing asset key");
  return join(process.cwd(), ".data", "marketing-assets", storageKey);
}

export async function storeMarketingAsset(file: File) {
  const mimeType = file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const extension = EXTENSIONS_BY_MIME.get(mimeType as never);
  if (!extension) throw new Error("Unsupported marketing asset type");
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

export async function readMarketingAsset(storageKey: string) {
  return readFile(safePath(storageKey));
}

export async function deleteMarketingAsset(storageKey: string) {
  await rm(safePath(storageKey), { force: true });
}
