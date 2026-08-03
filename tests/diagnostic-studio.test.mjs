import test from "node:test";
import assert from "node:assert/strict";
import { diagnosticPlaybooks, diagnosticStudioCatalog, resolveDiagnosticPlaybook, buildDiagnosticIncidentReport } from "../portable/diagnostic-studio.mjs";
import { oracleBottleneckCatalog } from "../portable/oracle-bottleneck.mjs";
import { postgresBottleneckCatalog } from "../portable/postgres-bottleneck.mjs";
import { mongodbBottleneckCatalog } from "../portable/mongodb-bottleneck.mjs";
import { relationalBottleneckCatalogs } from "../portable/relational-bottleneck.mjs";

test("publishes eight incident playbooks for all six diagnostic engines", () => {
  const catalog = diagnosticStudioCatalog();
  assert.equal(diagnosticPlaybooks.length, 8);
  assert.equal(Object.keys(catalog.engines).length, 6);
  assert.equal(catalog.playbooks.length, 8);
  assert.match(catalog.safety, /does not kill sessions/i);
  for (const playbook of catalog.playbooks) {
    assert.deepEqual(Object.keys(playbook.engineCounts).sort(), ["mariadb", "mongodb", "mysql", "oracle", "postgres", "sqlserver"]);
    assert.ok(Object.values(playbook.engineCounts).every((count) => count >= 4));
  }
});

test("resolves only real engine-native checks in catalog order", () => {
  const sources = {
    oracle: oracleBottleneckCatalog,
    postgres: postgresBottleneckCatalog,
    mongodb: mongodbBottleneckCatalog,
    mysql: relationalBottleneckCatalogs.mysql,
    mariadb: relationalBottleneckCatalogs.mariadb,
    sqlserver: relationalBottleneckCatalogs.sqlserver,
  };
  for (const [engine, source] of Object.entries(sources)) {
    const { playbook, selected } = resolveDiagnosticPlaybook(engine, "slow-sql", source);
    assert.equal(playbook.id, "slow-sql");
    assert.equal(selected[0].id, "environment");
    assert.ok(selected.length >= 7);
    assert.ok(selected.every((item) => source.some((definition) => definition.id === item.id)));
  }
});

test("builds a prioritized incident report with coverage, gaps, phases, and safe actions", () => {
  const results = [
    { id: "environment", label: "Environment", phase: "CONTEXT", ok: true, skipped: false, rows: [{}] },
    { id: "activity", label: "Activity", phase: "WORKLOAD", ok: true, skipped: false, rows: [{}] },
    { id: "blockers", label: "Blockers", phase: "LOCKS", ok: false, skipped: false, rows: [], error: "permission denied" },
    { id: "longTransactions", label: "Long transactions", phase: "TRANSACTIONS", ok: false, skipped: true, rows: [], error: "view unavailable" },
  ];
  const analysis = { findings: [{ severity: "HIGH", title: "Blocking chain detected", evidence: "One waiter", verify: "Confirm transaction age", action: "Coordinate with the owner" }] };
  const report = buildDiagnosticIncidentReport({ engine: "postgres", playbookId: "blocking", results, analysis, identifier: "-123" });
  assert.equal(report.incident.priority, "P2");
  assert.equal(report.incident.coverage, 50);
  assert.equal(report.incident.failed, 1);
  assert.equal(report.incident.skipped, 1);
  assert.equal(report.incident.evidenceGaps.length, 2);
  assert.equal(report.incident.actionPlan[0].title, "Blocking chain detected");
  assert.match(report.incident.actionPlan.at(-1).title, /evidence gaps/i);
  assert.equal(report.results.length, 4);
  assert.match(report.officialReference, /postgresql\.org/);
});

test("rejects unsupported engines and playbooks", () => {
  assert.throws(() => resolveDiagnosticPlaybook("db2", "slow-sql", []), /supports Oracle/i);
  assert.throws(() => resolveDiagnosticPlaybook("postgres", "unknown", postgresBottleneckCatalog), /supported SQL diagnostic playbook/i);
  assert.throws(() => buildDiagnosticIncidentReport({ engine: "postgres", playbookId: "unknown", results: [], analysis: {} }), /supported SQL diagnostic playbook/i);
});
