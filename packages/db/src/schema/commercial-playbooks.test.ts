import { readFileSync } from "node:fs";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  COMMERCIAL_PLAYBOOK_PROPOSAL_SOURCE,
  COMMERCIAL_PLAYBOOK_PROPOSAL_STATUS,
  commercialPlaybookProposalVersions,
} from "./commercial-playbooks";
import { commercialLibraryVersions } from "./commercial-library";

describe("commercial playbook schema", () => {
  it("stores immutable proposal lineage, frozen evidence and human decisions", () => {
    expect(Object.values(COMMERCIAL_PLAYBOOK_PROPOSAL_STATUS)).toEqual(["draft", "approved", "rejected"]);
    expect(Object.values(COMMERCIAL_PLAYBOOK_PROPOSAL_SOURCE)).toEqual(["observational_gap", "approved_experiment"]);
    expect(commercialPlaybookProposalVersions.lineageKey).toBeDefined();
    expect(commercialPlaybookProposalVersions.version).toBeDefined();
    expect(commercialPlaybookProposalVersions.baseLibraryVersionId).toBeDefined();
    expect(commercialPlaybookProposalVersions.targeting).toBeDefined();
    expect(commercialPlaybookProposalVersions.evidenceSnapshot).toBeDefined();
    expect(commercialPlaybookProposalVersions.publishedLibraryVersionId).toBeDefined();
    expect(commercialPlaybookProposalVersions.decisionReason).toBeDefined();
  });

  it("declares lineage uniqueness, checks and lookup indexes", () => {
    const config = getTableConfig(commercialPlaybookProposalVersions);
    expect(config.indexes.find((index) => index.config.name === "commercial_playbook_proposals_lineage_version_uidx")?.config.unique).toBe(true);
    expect(config.indexes.map((index) => index.config.name)).toEqual(expect.arrayContaining([
      "commercial_playbook_proposals_status_source_idx",
      "commercial_playbook_proposals_library_idx",
    ]));
    expect(config.checks.map((check) => check.name)).toEqual(expect.arrayContaining([
      "commercial_playbook_proposals_status_check",
      "commercial_playbook_proposals_source_check",
      "commercial_playbook_proposals_version_check",
      "commercial_playbook_proposals_decision_check",
      "commercial_playbook_proposals_experiment_source_check",
    ]));
  });

  it("extends library lineage for learned publication and rollback without mutation", () => {
    expect(commercialLibraryVersions.parentVersionId).toBeDefined();
    expect(commercialLibraryVersions.changeKind).toBeDefined();
    expect(commercialLibraryVersions.changeReason).toBeDefined();
    expect(commercialLibraryVersions.restoredFromVersionId).toBeDefined();
  });

  it("generates real append-only triggers and constraints in migration 0029", () => {
    const migration = readFileSync(new URL("../migrations/0029_commercial_playbook_proposals.sql", import.meta.url), "utf8");
    expect(migration).toContain("commercial_playbook_proposal_versions_append_only");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
    expect(migration).toContain("commercial_playbook_proposals_decision_check");
    expect(migration).toContain("commercial_library_change_kind_check");
    expect(migration).toContain("commercial_playbook_proposal_versions_published_library_version_id_commercial_library_versions_id_fk");
    expect(migration).toContain("commercial_library_versions_restored_from_version_id_commercial_library_versions_id_fk");
    expect(migration).toContain("validate_commercial_library_version_append");
    expect(migration).toContain("commercial_library_versions_validate_append");
    expect(migration).toContain("restored_version >= parent_version");
  });

  it("temporarily drops only the 0028 library trigger for parent backfill and recreates it immediately", () => {
    const migration = readFileSync(new URL("../migrations/0029_commercial_playbook_proposals.sql", import.meta.url), "utf8");
    const statements = migration.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
    const drop = statements.findIndex((statement) => statement.startsWith('DROP TRIGGER "commercial_library_versions_append_only"'));
    const backfill = statements[drop + 1] ?? "";
    const recreate = statements[drop + 2] ?? "";

    expect(drop).toBeGreaterThan(-1);
    expect(backfill).toMatch(/^UPDATE "commercial_library_versions" AS child/);
    expect(recreate).toMatch(/^CREATE TRIGGER commercial_library_versions_append_only/);
    expect(recreate).toContain("BEFORE UPDATE OR DELETE");
    expect(recreate).toContain("prevent_commercial_library_version_mutation()");
    expect(migration).not.toContain("DROP FUNCTION prevent_commercial_library_version_mutation");
  });

  it("keeps journal and generated snapshot metadata coherent", () => {
    const journal = JSON.parse(readFileSync(new URL("../migrations/meta/_journal.json", import.meta.url), "utf8")) as { entries: { idx: number; tag: string }[] };
    const snapshot = JSON.parse(readFileSync(new URL("../migrations/meta/0029_snapshot.json", import.meta.url), "utf8")) as {
      tables: Record<string, { columns: Record<string, unknown>; foreignKeys: Record<string, unknown>; checkConstraints: Record<string, unknown> }>;
    };
    const proposal = snapshot.tables["public.commercial_playbook_proposal_versions"];
    const library = snapshot.tables["public.commercial_library_versions"];

    expect(journal.entries.find((entry) => entry.idx === 29)).toMatchObject({ idx: 29, tag: "0029_commercial_playbook_proposals" });
    expect(proposal?.columns).toHaveProperty("evidence_snapshot");
    expect(proposal?.foreignKeys).toHaveProperty("commercial_playbook_proposal_versions_published_library_version_id_commercial_library_versions_id_fk");
    expect(proposal?.checkConstraints).toHaveProperty("commercial_playbook_proposals_decision_check");
    expect(library?.columns).toHaveProperty("restored_from_version_id");
    expect(library?.foreignKeys).toHaveProperty("commercial_library_versions_restored_from_version_id_commercial_library_versions_id_fk");
    expect(library?.checkConstraints).toHaveProperty("commercial_library_rollback_source_check");
  });
});
