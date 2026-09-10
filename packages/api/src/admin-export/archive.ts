export type ExportCell = string | number | boolean | Date | null | undefined | Record<string, unknown> | unknown[];

function cellValue(value: ExportCell) {
  if (value === null || value === undefined) return "";
  const plain = value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe = /^[\s]*[=+\-@]/.test(plain) ? `'${plain}` : plain;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function rowsToCsv(columns: readonly string[], rows: readonly Record<string, ExportCell>[]) {
  return [columns.map(cellValue).join(","), ...rows.map((row) => columns.map((column) => cellValue(row[column])).join(","))].join("\r\n") + "\r\n";
}

const crcTable = Array.from({ length: 256 }, (_, seed) => {
  let value = seed;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(value: number) { return [value & 0xff, (value >>> 8) & 0xff]; }
function u32(value: number) { return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]; }

export function createStoredZip(files: readonly { name: string; content: string | Uint8Array }[]) {
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;
  for (const file of files) {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(file.name)) throw new Error("Unsafe ZIP entry name");
    const name = encoder.encode(file.name);
    const content = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const crc = crc32(content);
    const localHeader = [0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(33), ...u32(crc), ...u32(content.length), ...u32(content.length), ...u16(name.length), ...u16(0), ...name];
    local.push(...localHeader, ...content);
    central.push(0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(33), ...u32(crc), ...u32(content.length), ...u32(content.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name);
    offset += localHeader.length + content.length;
  }
  const end = [0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(central.length), ...u32(local.length), ...u16(0)];
  return Uint8Array.from([...local, ...central, ...end]);
}

export function safeExportFileName(asOf: string) {
  return `crm-export-${asOf.replace(/\.\d{3}Z$/, "Z").replace(/[-:.]/g, "")}.zip`;
}
