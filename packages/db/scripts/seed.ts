import "./load-env";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createDb } from "@crm-fran/db";
import { user } from "@crm-fran/db/schema/auth";
import { leads } from "@crm-fran/db/schema/leads";

import { buildLeadCsvImport } from "../src/import/lead-csv-import";

const db = createDb();
const args = process.argv.slice(2);

function argumentValue(name: string) {
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function batches<T>(values: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function seed() {
  const fileArgument = argumentValue("--file") ?? process.env.LEADS_CSV_PATH;
  if (!fileArgument) {
    throw new Error("Indica el CSV con --file <ruta> o LEADS_CSV_PATH");
  }

  const dryRun = args.includes("--dry-run");
  const replace = args.includes("--replace");
  const filePath = resolve(fileArgument);
  const csv = await readFile(filePath, "utf8");
  const users = await db.select({ id: user.id, name: user.name }).from(user);
  const plan = buildLeadCsvImport({ csv, users, createId: () => crypto.randomUUID() });

  console.log("CSV validado:", plan.summary);
  if (dryRun) {
    console.log("Simulación completada: no se escribieron registros");
    process.exit(0);
  }

  await db.transaction(async (transaction) => {
    const [existingLead] = await transaction.select({ id: leads.id }).from(leads).limit(1);
    if (existingLead && !replace) {
      throw new Error("La tabla leads ya contiene registros; usa --replace solo si quieres sustituirlos");
    }
    if (replace) await transaction.delete(leads);

    for (const batch of batches(plan.leads, 250)) {
      await transaction.insert(leads).values(batch);
    }
  });

  const persisted = await db.select({ id: leads.id }).from(leads);
  if (persisted.length !== plan.leads.length) {
    throw new Error(`Reconciliación fallida: esperados ${plan.leads.length}, guardados ${persisted.length}`);
  }

  console.log(`Importación completada y reconciliada: ${persisted.length} leads`);
  process.exit(0);
}

seed().catch((error: unknown) => {
  console.error("Importación fallida:", error instanceof Error ? error.message : error);
  process.exit(1);
});
