import { browserMigrations } from "@/web/db/migrations";
import { describe, expect, it } from "vitest";

const expectedTags = [
  "0000_initial",
  "0001_seed_categories",
  "0002_categories_soft_delete",
  "0003_transactions_reconciled",
  "0004_settings",
  "0005_transfers",
  "0006_scheduled_days_in_advance",
  "0007_payees",
  "0008_credit_card_fields",
  "0009_envelope_budgeting",
  "0010_early_orphan",
  "0011_scheduled_transfer_account",
  "0012_accounts_pending_reconcile",
  "0013_chilly_dorian_gray",
];

describe("browser migration manifest", () => {
  it("bundles every migration in journal order", () => {
    expect(browserMigrations.map((migration) => migration.tag)).toEqual(
      expectedTags,
    );
  });

  it("preserves non-empty SQL and any Drizzle breakpoints", () => {
    expect(browserMigrations.every((migration) => migration.sql.trim())).toBe(
      true,
    );
    expect(
      browserMigrations
        .filter((migration) =>
          migration.sql.includes("--> statement-breakpoint"),
        )
        .every((migration) =>
          migration.sql
            .split("--> statement-breakpoint")
            .every((statement) => statement.trim()),
        ),
    ).toBe(true);
    expect(
      browserMigrations.every((migration) => migration.folderMillis > 0),
    ).toBe(true);
  });
});
