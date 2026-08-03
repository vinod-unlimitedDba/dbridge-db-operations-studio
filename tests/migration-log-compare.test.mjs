import test from "node:test";
import assert from "node:assert/strict";
import { compareMigrationLogs, migrationLogEngines } from "../portable/migration-log-compare.mjs";

test("compares Oracle Data Pump table rows, objects, and errors", () => {
  const result = compareMigrationLogs({
    engine: "oracle",
    exportLog: `. . exported "HR"."EMPLOYEES" 17.31 KB 107 rows
. . exported "HR"."DEPARTMENTS" 6 KB 27 rows
Job "SYSTEM"."SYS_EXPORT_SCHEMA_01" successfully completed`,
    importLog: `. . imported "HR"."EMPLOYEES" 17.31 KB 100 rows
Processing object type SCHEMA_EXPORT/TABLE/TABLE
ORA-39082: Object type PROCEDURE:"HR"."P1" created with compilation warnings
Job "SYSTEM"."SYS_IMPORT_SCHEMA_01" completed with 1 error(s)`,
  });
  assert.equal(result.engine, "oracle");
  assert.equal(result.summary.rowMismatches, 1);
  assert.equal(result.summary.missingObjects, 1);
  assert.equal(result.summary.targetErrors, 0, "ORA-39082 is a compilation warning");
  assert.ok(result.objectDiffs.some((item) => item.name === "HR.EMPLOYEES" && item.status === "row-mismatch"));
  assert.ok(result.objectDiffs.some((item) => item.name === "HR.DEPARTMENTS" && item.status === "missing"));
  assert.match(result.verificationScript, /HR\.EMPLOYEES.*COUNT\(\*\)/i);
});

test("does not claim PostgreSQL row parity when pg_restore lacks row counts", () => {
  const result = compareMigrationLogs({
    engine: "postgres",
    exportLog: `pg_dump: dumping contents of table "public.orders"
pg_dump: dumping contents of table "public.customers"`,
    importLog: `pg_restore: creating TABLE "public.orders"
pg_restore: processing data for table "public.orders"
pg_restore: error: could not execute query: ERROR: relation missing`,
  });
  assert.equal(result.summary.targetErrors > 0, true);
  assert.ok(result.objectDiffs.some((item) => item.name === "public.customers" && item.status === "missing"));
  assert.ok(result.objectDiffs.some((item) => item.name === "public.orders" && item.status === "matched-unverified-rows"), JSON.stringify(result.objectDiffs));
  assert.match(result.findings.map((item) => item.title).join(" "), /database verification/i);
});

test("compares MongoDB document counts and ignores timestamps in the redline", () => {
  const result = compareMigrationLogs({
    engine: "auto",
    exportLog: `2026-01-01T10:00:00Z done dumping shop.orders (21 documents)
2026-01-01T10:00:01Z done dumping shop.customers (10 documents)`,
    importLog: `2026-01-01T11:00:00Z finished restoring shop.orders (20 documents, 0 failures)
2026-01-01T11:00:01Z finished restoring shop.customers (10 documents, 0 failures)
2026-01-01T11:00:02Z 30 document(s) restored successfully. 0 document(s) failed to restore.`,
    ignoreTimestamps: true,
  });
  assert.equal(result.engine, "mongodb");
  assert.equal(result.summary.rowMismatches, 1);
  assert.equal(result.summary.missingObjects, 0);
  assert.equal(result.target.completed, true);
  assert.equal(result.summary.targetErrors, 0);
  assert.ok(result.redline.some((item) => item.type !== "same"));
});

test("marks silent MySQL imports unverified rather than missing", () => {
  const result = compareMigrationLogs({
    engine: "mysql",
    exportLog: `-- Table structure for table \`orders\`
-- Dumping data for table \`orders\`
-- Dump completed on 2026-08-01 10:00:00`,
    importLog: `mysql: [Warning] Using a password on the command line interface can be insecure.`,
  });
  assert.equal(result.summary.missingObjects, 0);
  assert.equal(result.summary.unverified, 1);
  assert.equal(result.objectDiffs[0].status, "unverified");
});

test("enforces formats, paired logs, and safe size limits", () => {
  assert.equal(Object.keys(migrationLogEngines).length, 7);
  assert.throws(() => compareMigrationLogs({ engine: "oracle", exportLog: "", importLog: "x" }), /Paste both/);
  assert.throws(() => compareMigrationLogs({ engine: "db2", exportLog: "x", importLog: "y" }), /supported/);
  assert.throws(() => compareMigrationLogs({ engine: "oracle", exportLog: "x".repeat(3_500_001), importLog: "y" }), /3\.5 MB/);
});
