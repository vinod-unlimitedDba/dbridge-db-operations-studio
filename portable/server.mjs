import { createServer } from "node:http";
import { readFile, stat, open, mkdir, writeFile, unlink } from "node:fs/promises";
import { watch } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { oracleSqlIdCheckCatalog, oracleSqlIdCheckSql, analyzeOracleSqlIdCheck } from "./oracle-sql-id.mjs";
import { oracleBottleneckCatalog, analyzeOracleBottlenecks } from "./oracle-bottleneck.mjs";
import { postgresBottleneckCatalog, analyzePostgresBottlenecks } from "./postgres-bottleneck.mjs";
import { mongodbBottleneckCatalog, analyzeMongoBottlenecks } from "./mongodb-bottleneck.mjs";
import { relationalBottleneckCatalogs, analyzeRelationalBottlenecks } from "./relational-bottleneck.mjs";
import { runtimeTraceCatalog, validateRuntimeTraceInput, runtimeTraceSql, analyzeRuntimeTrace } from "./runtime-trace.mjs";
import { compareMigrationLogs, migrationLogEngines } from "./migration-log-compare.mjs";
import { diagnosticStudioCatalog, resolveDiagnosticPlaybook, buildDiagnosticIncidentReport } from "./diagnostic-studio.mjs";
import { SSH_TERMINAL_LIMITS, normalizeSshHost, preflightSshTarget, forgetSshHostTrust, openSshSession, attachSshStream, writeToSshSession, resizeSshSession, closeSshSession, listSshSessions, openSshLocalForward, closeSshForward, listSshForwards, listSftpDirectory, readSftpFile, closeAllSshSessions } from "./ssh-terminal.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(ROOT, "app");
const HOST = "127.0.0.1";
const DEFAULT_PORT = Number(process.env.DBRIDGE_PORT || 17864);
const SESSION_TOKEN = randomBytes(24).toString("hex");
const OPERATIONS_STUDIO_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
const MAX_BODY = 8 * 1024 * 1024;
const MAX_OUTPUT = 2 * 1024 * 1024;
const MAX_TAIL = 128 * 1024;
const USER_DATA_ROOT = process.env.DBRIDGE_DATA_DIR ? resolve(process.env.DBRIDGE_DATA_DIR) : join(process.env.LOCALAPPDATA || process.env.APPDATA || ROOT, "DBridge Portable");
const EDITOR_FILE = join(USER_DATA_ROOT, "editor-session.json");
const VERSION_BASELINE_FILE = join(USER_DATA_ROOT, "devops-version-baseline.json");
const INVESTIGATION_FILE = join(USER_DATA_ROOT, "investigation-workspace.json");
const CONTAINER_AUDIT_FILE = join(USER_DATA_ROOT, "container-change-audit.json");
const TKPROF_ROOT = join(USER_DATA_ROOT, "tkprof");
const sqlAdapterCatalog = {
  oracle: { name: "Oracle", client: "sqlplus", driver: "oracledb", port: 1521, tier: "Bundled direct driver + diagnostics", family: "database", auth: "Host credentials" },
  postgres: { name: "PostgreSQL", client: "psql", driver: "pg", port: 5432, tier: "Bundled direct driver + diagnostics", family: "database", auth: "Host credentials" },
  mongodb: { name: "MongoDB", client: "", driver: "mongodb", port: 27017, tier: "Bundled direct driver", family: "nosql", auth: "Host credentials" },
  mysql: { name: "MySQL", client: "mysql", driver: "mysql2", port: 3306, tier: "Bundled direct driver + diagnostics", family: "database", auth: "Host credentials" },
  sqlserver: { name: "SQL Server", client: "sqlcmd", driver: "tedious", port: 1433, tier: "Bundled direct driver + diagnostics", family: "database", auth: "Host credentials" },
  mariadb: { name: "MariaDB", client: "mysql", driver: "mysql2", port: 3306, tier: "Bundled direct driver", family: "database", auth: "Host credentials" },
  redshift: { name: "Amazon Redshift", client: "psql", driver: "pg", port: 5439, tier: "Bundled direct driver", family: "warehouse", auth: "Host credentials" },
  synapse: { name: "Azure Synapse", client: "sqlcmd", driver: "tedious", port: 1433, tier: "Bundled direct driver", family: "warehouse", auth: "Host credentials" },
  snowflake: { name: "Snowflake", client: "snowsql", port: 443, tier: "SQL + validation", family: "warehouse", auth: "Account credentials" },
  bigquery: { name: "Google BigQuery", client: "bq", port: 443, tier: "SQL + validation", family: "warehouse", auth: "Active gcloud context" },
  databricks: { name: "Databricks SQL", client: "databricks", port: 443, tier: "SQL + validation", family: "warehouse", auth: "CLI profile + warehouse" },
  db2: { name: "IBM Db2", client: "db2", port: 50000, tier: "SQL + validation", family: "database", auth: "Catalog alias credentials" },
  hana: { name: "SAP HANA", client: "hdbsql", port: 30015, tier: "SQL + validation", family: "warehouse", auth: "Secure user-store key" },
  clickhouse: { name: "ClickHouse", client: "clickhouse-client", port: 9000, tier: "SQL + validation", family: "warehouse", auth: "Host credentials" },
  teradata: { name: "Teradata", client: "bteq", port: 1025, tier: "SQL + validation", family: "warehouse", auth: "Host credentials" },
};
const EDITOR_ENGINES = new Set(Object.keys(sqlAdapterCatalog));
const defaultInvestigationRules = [
  { id: "avg_elapsed_ms", name: "Average elapsed time", metric: "avg_elapsed_ms", warning: 250, high: 1000, unit: "ms / execution" },
  { id: "logical_reads_per_execution", name: "Logical reads", metric: "logical_reads_per_execution", warning: 25000, high: 100000, unit: "reads / execution" },
  { id: "physical_reads_per_execution", name: "Physical reads", metric: "physical_reads_per_execution", warning: 2500, high: 10000, unit: "reads / execution" },
  { id: "examined_ratio", name: "Examined-to-returned ratio", metric: "examined_ratio", warning: 25, high: 100, unit: "ratio" },
  { id: "plan_versions", name: "Plan or cursor versions", metric: "plan_versions", warning: 5, high: 20, unit: "versions" },
  { id: "long_runtime_seconds", name: "Active operation runtime", metric: "long_runtime_seconds", warning: 30, high: 300, unit: "seconds" },
];

async function readEditorSession() {
  try {
    const parsed = JSON.parse(await readFile(EDITOR_FILE, "utf8"));
    return parsed && Array.isArray(parsed.tabs) ? validateEditorSession(parsed) : { tabs: [], activeId: "", settings: {} };
  } catch (error) {
    if (error?.code === "ENOENT") return { tabs: [], activeId: "", settings: {} };
    throw new Error("The local editor session could not be read");
  }
}

function validateEditorSession(input) {
  const tabs = Array.isArray(input.tabs) ? input.tabs : [];
  if (tabs.length > 20) throw new Error("The editor session is limited to 20 tabs");
  let totalCharacters = 0;
  const cleanTabs = tabs.map((tab, index) => {
    const id = String(tab.id || "");
    const name = String(tab.name || `Query ${index + 1}`).trim();
    const engine = String(tab.engine || "oracle").toLowerCase();
    const content = String(tab.content || "");
    if (!/^tab-[A-Za-z0-9-]{6,64}$/.test(id)) throw new Error("The editor session contains an invalid tab identifier");
    if (!name || name.length > 100 || /[\r\n\0]/.test(name)) throw new Error("Editor tab names must be between 1 and 100 characters");
    if (!EDITOR_ENGINES.has(engine)) throw new Error("The editor session contains an unsupported database engine");
    if (content.length > 50000 || /\0/.test(content)) throw new Error("Each editor tab is limited to 50,000 characters");
    totalCharacters += content.length;
    return { id, name, engine, content, dirty: tab.dirty === true, cursor: Math.min(Math.max(Number(tab.cursor || 0), 0), content.length) };
  });
  if (totalCharacters > 200000) throw new Error("The combined editor session is limited to 200,000 characters");
  const activeId = cleanTabs.some((tab) => tab.id === input.activeId) ? String(input.activeId) : cleanTabs[0]?.id || "";
  const fontSize = Math.min(Math.max(Number(input.settings?.fontSize || 11), 9), 20);
  const autocompleteScope = ["all", "sql", "ops", "off"].includes(input.settings?.autocompleteScope) ? input.settings.autocompleteScope : "all";
  return { tabs: cleanTabs, activeId, settings: { wordWrap: input.settings?.wordWrap === true, fontSize, autocompleteScope } };
}

async function writeEditorSession(session) {
  await mkdir(USER_DATA_ROOT, { recursive: true });
  await writeFile(EDITOR_FILE, JSON.stringify({ version: 1, ...session }, null, 2), "utf8");
}

async function readContainerAuditRecords() {
  try {
    const parsed = JSON.parse(await readFile(CONTAINER_AUDIT_FILE, "utf8"));
    return Array.isArray(parsed.records) ? parsed.records.filter((record) => record && /^container-audit-[a-f0-9]{16}$/.test(record.id)).slice(0, 100) : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw new Error("The local container change audit could not be read");
  }
}

async function appendContainerAuditRecord(input) {
  const clean = (value, max) => String(value || "").replace(/[\r\n\0]+/g, " ").trim().slice(0, max);
  const record = { id: `container-audit-${randomBytes(8).toString("hex")}`, occurredAt: new Date().toISOString(), platform: input.platform === "kubernetes" ? "kubernetes" : "docker", action: clean(input.action, 40), target: clean(input.target, 253), namespace: clean(input.namespace, 63), context: clean(input.context, 255), changeReference: clean(input.changeReference, 100), status: ["success", "failed", "blocked"].includes(input.status) ? input.status : "failed", durationMs: Math.min(Math.max(Number(input.durationMs || 0), 0), 600000), displayCommand: clean(input.displayCommand, 1000), detail: clean(input.detail, 500) };
  const records = await readContainerAuditRecords(); records.unshift(record); await mkdir(USER_DATA_ROOT, { recursive: true }); await writeFile(CONTAINER_AUDIT_FILE, JSON.stringify({ version: 1, records: records.slice(0, 100) }, null, 2), "utf8"); return record;
}

function defaultInvestigationStore() {
  return { version: 3, baselines: [], rules: defaultInvestigationRules.map((rule) => ({ ...rule })), events: [], recordings: [], devopsSnapshots: [], runbooks: [], autofillProfiles: [] };
}

async function readInvestigationStore() {
  try {
    const parsed = JSON.parse(await readFile(INVESTIGATION_FILE, "utf8"));
    if (!parsed || !Array.isArray(parsed.baselines) || !Array.isArray(parsed.rules) || !Array.isArray(parsed.events)) throw new Error("invalid store");
    return { ...defaultInvestigationStore(), ...parsed, recordings: Array.isArray(parsed.recordings) ? parsed.recordings : [], devopsSnapshots: Array.isArray(parsed.devopsSnapshots) ? parsed.devopsSnapshots : [], runbooks: Array.isArray(parsed.runbooks) ? parsed.runbooks : [], autofillProfiles: Array.isArray(parsed.autofillProfiles) ? parsed.autofillProfiles : [] };
  } catch (error) {
    if (error?.code === "ENOENT") return defaultInvestigationStore();
    throw new Error("The local investigation workspace could not be read");
  }
}

async function writeInvestigationStore(store) {
  await mkdir(USER_DATA_ROOT, { recursive: true });
  await writeFile(INVESTIGATION_FILE, JSON.stringify({ ...store, version: 3 }, null, 2), "utf8");
}

function validateInvestigationBaseline(input) {
  const name = String(input.name || "").trim();
  const engine = String(input.engine || "").toLowerCase();
  const identifier = String(input.identifier || "").trim();
  const plan = input.plan && typeof input.plan === "object" ? input.plan : {};
  if (!name || name.length > 100 || /[\r\n\0]/.test(name)) throw new Error("Baseline name must be between 1 and 100 characters");
  if (!EDITOR_ENGINES.has(engine)) throw new Error("Select a supported database adapter");
  if (identifier.length > 100 || /[\r\n\0]/.test(identifier)) throw new Error("Enter a valid statement identifier");
  const operators = Array.isArray(plan.operators) ? plan.operators.slice(0, 200).map((node, index) => ({ id: index + 1, depth: Math.min(Math.max(Number(node.depth || 0), 0), 30), operation: String(node.operation || "Operator").slice(0, 160), object: String(node.object || "").slice(0, 160), cost: Number(node.cost || 0), estimatedRows: Number(node.estimatedRows || 0), actualRows: Number(node.actualRows || 0), timeMs: Number(node.timeMs || 0), status: ["critical", "high", "medium", "normal"].includes(node.status) ? node.status : "normal" })) : [];
  if (!operators.length) throw new Error("Analyze a plan before saving a baseline");
  return { id: `baseline-${randomBytes(8).toString("hex")}`, name, engine, identifier, capturedAt: new Date().toISOString(), plan: { score: Math.min(Math.max(Number(plan.score || 0), 0), 100), totalCost: Number(plan.totalCost || 0), estimatedRows: Number(plan.estimatedRows || 0), actualRows: Number(plan.actualRows || 0), warnings: Math.min(Math.max(Number(plan.warnings || 0), 0), 1000), fingerprint: String(plan.fingerprint || "").slice(0, 200), operators } };
}

function validateInvestigationEvent(input) {
  const allowedTypes = new Set(["database", "deployment", "kubernetes", "container", "log", "trace", "git", "note"]);
  const type = String(input.type || "note").toLowerCase();
  const title = String(input.title || "").trim();
  const details = String(input.details || "").trim();
  const occurredAt = new Date(input.occurredAt || Date.now());
  if (!allowedTypes.has(type)) throw new Error("Select a supported incident event type");
  if (!title || title.length > 160 || /[\r\n\0]/.test(title)) throw new Error("Event title must be between 1 and 160 characters");
  if (details.length > 4000 || /\0/.test(details)) throw new Error("Event details are limited to 4,000 characters");
  if (Number.isNaN(occurredAt.getTime())) throw new Error("Enter a valid incident timestamp");
  return { id: `event-${randomBytes(8).toString("hex")}`, type, title, details, occurredAt: occurredAt.toISOString(), createdAt: new Date().toISOString() };
}

function validateInvestigationRules(input) {
  if (!Array.isArray(input.rules) || input.rules.length !== defaultInvestigationRules.length) throw new Error("The tuning rule set is incomplete");
  return defaultInvestigationRules.map((definition) => {
    const candidate = input.rules.find((rule) => rule?.id === definition.id);
    const warning = Number(candidate?.warning);
    const high = Number(candidate?.high);
    if (!Number.isFinite(warning) || !Number.isFinite(high) || warning < 0 || high <= warning || high > 1000000000000) throw new Error(`${definition.name} thresholds are invalid`);
    return { ...definition, warning, high };
  });
}

function validatePerformanceRecording(input) {
  const name = String(input.name || "").trim();
  const engine = String(input.engine || "").toLowerCase();
  const samples = Array.isArray(input.samples) ? input.samples : [];
  if (!name || name.length > 100 || /[\r\n\0]/.test(name)) throw new Error("Recording name must be between 1 and 100 characters");
  if (!["oracle", "postgres", "mongodb", "mysql", "mariadb", "sqlserver"].includes(engine)) throw new Error("Flight recording supports the six full-diagnostics engines");
  if (!samples.length || samples.length > 720) throw new Error("A recording must contain between 1 and 720 samples");
  const allowedMetrics = ["active_sessions", "waiting_sessions", "executions", "avg_elapsed_ms", "logical_reads", "physical_reads", "throughput", "errors"];
  const cleanSamples = samples.map((sample) => ({ collectedAt: new Date(sample.collectedAt || Date.now()).toISOString(), metrics: Object.fromEntries(allowedMetrics.map((key) => [key, Number(sample.metrics?.[key]) || 0])) }));
  return { id: `recording-${randomBytes(8).toString("hex")}`, name, engine, startedAt: cleanSamples[0].collectedAt, endedAt: cleanSamples.at(-1).collectedAt, capturedAt: new Date().toISOString(), samples: cleanSamples };
}

function validateDevopsSnapshot(input) {
  const allowedTypes = new Set(["pipeline", "configuration", "kafka"]);
  const type = String(input.type || "").toLowerCase();
  const name = String(input.name || "").trim();
  const data = String(input.data || "");
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  if (!allowedTypes.has(type)) throw new Error("Select a supported DevOps snapshot type");
  if (!name || name.length > 120 || /[\r\n\0]/.test(name)) throw new Error("Snapshot name must be between 1 and 120 characters");
  if (!data || data.length > 500000 || /\0/.test(data)) throw new Error("Snapshot data must be between 1 byte and 500,000 characters");
  return { id: `snapshot-${randomBytes(8).toString("hex")}`, type, name, data, metadata: Object.fromEntries(Object.entries(metadata).slice(0, 30).map(([key, value]) => [String(key).slice(0, 80), String(value).slice(0, 500)])), capturedAt: new Date().toISOString() };
}

function validateDevopsRunbook(input) {
  const name = String(input.name || "").trim();
  const tool = String(input.tool || "");
  const actions = Array.isArray(input.actions) ? input.actions.map(String) : [];
  if (!name || name.length > 100 || /[\r\n\0]/.test(name)) throw new Error("Runbook name must be between 1 and 100 characters");
  if (!toolDefinitions[tool] || !actions.length || actions.length > 20 || actions.some((action) => !toolDefinitions[tool].actions[action])) throw new Error("Runbooks may contain only approved actions for one supported tool");
  return { id: `runbook-${randomBytes(8).toString("hex")}`, name, tool, actions: [...new Set(actions)], createdAt: new Date().toISOString() };
}

function validateAutofillProfile(input) {
  const name = String(input.name || "").trim(); const kind = String(input.kind || "").toLowerCase(); const source = input.data && typeof input.data === "object" ? input.data : {};
  if (!name || name.length > 100 || /[\r\n\0]/.test(name)) throw new Error("Autofill profile name must be between 1 and 100 characters");
  if (!["database", "devops", "log", "goldengate"].includes(kind)) throw new Error("Select a supported autofill profile type");
  const text = (key, max = 512) => { const value = String(source[key] || "").trim(); if (value.length > max || /[\r\n\0]/.test(value)) throw new Error(`Autofill field ${key} is invalid`); return value; };
  let data;
  if (kind === "database") {
    const engine = text("engine", 40); const host = text("host", 255); const port = text("port", 5); const database = text("database", 255); const username = text("username", 255);
    if (!EDITOR_ENGINES.has(engine)) throw new Error("Select a supported database engine for this profile");
    if (host && !/^[A-Za-z0-9_.-]{1,255}$/.test(host)) throw new Error("Enter a valid database profile host");
    if (port && (!/^\d{1,5}$/.test(port) || Number(port) > 65535)) throw new Error("Enter a valid database profile port");
    if (database && !/^[A-Za-z0-9_.:$@/-]{1,255}$/.test(database)) throw new Error("Enter a valid database or service identifier");
    if (username && !/^[A-Za-z0-9_.@+\\-]{1,255}$/.test(username)) throw new Error("Enter a valid database profile username");
    data = { engine, host, port, database, username };
  } else if (kind === "devops") {
    const tool = text("tool", 40); if (!toolDefinitions[tool]) throw new Error("Select a supported DevOps tool for this profile"); data = { tool, target: text("target"), secondary: text("secondary"), scope: text("scope"), cwd: text("cwd", 1024) };
  } else if (kind === "log") {
    const host = text("host", 255); const user = text("user", 128); const port = text("port", 5); const serverOs = text("serverOs", 20) === "windows" ? "windows" : "linux";
    if (host && !/^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/.test(host)) throw new Error("Enter a valid log-server hostname");
    if (user && !/^[A-Za-z0-9._@-]{1,128}$/.test(user)) throw new Error("Enter a valid log-server username");
    if (port && (!/^\d{1,5}$/.test(port) || Number(port) > 65535)) throw new Error("Enter a valid log-server port");
    data = { source: text("source", 80), host, user, port: port || "22", serverOs, path: text("path", 1024) };
  } else {
    const architecture = text("architecture", 20) === "classic" ? "classic" : "microservices"; const endpoint = text("endpoint"); const credential = text("credential", 128); const deployment = text("deployment", 128); const host = text("host", 255); const user = text("user", 128); const port = text("port", 5) || "22"; const home = text("home", 512); const group = text("group", 128);
    if (architecture === "microservices") { validateGoldenGateEndpoint(endpoint); if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(credential)) throw new Error("Enter an approved GoldenGate wallet alias"); }
    else { if (!/^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/.test(host) || !/^[A-Za-z0-9._@-]{1,128}$/.test(user) || !/^\/[A-Za-z0-9_./-]{1,511}$/.test(home) || home.includes("..")) throw new Error("Enter valid Classic GoldenGate SSH profile fields"); }
    data = { architecture, endpoint, credential, deployment, host, user, port, home, group };
  }
  return { id: `autofill-${randomBytes(8).toString("hex")}`, name, kind, data, createdAt: new Date().toISOString() };
}

const toolDefinitions = {
  github: { command: "gh", versionArgs: ["--version"], actions: { status: true, repositories: true, pullRequests: true, workflows: true, issues: true, releases: true } },
  kubernetes: { command: "kubectl", versionArgs: ["version", "--client"], actions: { cluster: true, namespaces: true, nodes: true, pods: true, deployments: true, services: true, events: true, topPods: true, topNodes: true, describe: true } },
  docker: { command: "docker", versionArgs: ["--version"], actions: { info: true, containers: true, images: true, networks: true, volumes: true, diskUsage: true, stats: true, logs: true, inspect: true, processes: true } },
  kafka: { command: "kafka-topics.bat", versionArgs: ["--version"], actions: { topics: true, describeTopic: true, groups: true, describeGroup: true } },
  terraform: { command: "terraform", versionArgs: ["version"], actions: { version: true, providers: true, validate: true, outputs: true, state: true, workspace: true } },
  helm: { command: "helm", versionArgs: ["version", "--short"], actions: { releases: true, repositories: true, charts: true, status: true, history: true, values: true } },
  git: { command: "git", versionArgs: ["--version"], actions: { version: true, status: true, branches: true, remotes: true, commits: true, diff: true } },
  aws: { command: "aws", versionArgs: ["--version"], actions: { identity: true, regions: true, eksClusters: true, ecsClusters: true } },
  azure: { command: "az", versionArgs: ["version"], actions: { account: true, subscriptions: true, resourceGroups: true, aksClusters: true } },
  gcloud: { command: "gcloud", versionArgs: ["version"], actions: { account: true, project: true, config: true, clusters: true, sqlInstances: true } },
  databricks: { command: "databricks", versionArgs: ["version"], actions: { profiles: true, clusters: true, jobs: true, warehouses: true } },
  snowflake: { command: "snowsql", versionArgs: ["-v"], actions: { version: true, context: true, recentQueries: true, warehouses: true } },
  ssh: { command: "ssh", versionArgs: ["-V"], actions: { version: true, configuration: true, connectivity: true } },
  ansible: { command: "ansible", versionArgs: ["--version"], actions: { version: true, config: true, inventory: true, graph: true } },
  podman: { command: "podman", versionArgs: ["--version"], actions: { info: true, containers: true, images: true, networks: true, volumes: true, diskUsage: true, stats: true, logs: true, inspect: true, processes: true } },
  argocd: { command: "argocd", versionArgs: ["version", "--client", "--short"], actions: { version: true, applications: true, clusters: true, repositories: true, projects: true } },
  vault: { command: "vault", versionArgs: ["version"], actions: { status: true, secrets: true, auth: true, policies: true } },
  tofu: { command: "tofu", versionArgs: ["version"], actions: { version: true, providers: true, validate: true, outputs: true, state: true, workspace: true } },
  nomad: { command: "nomad", versionArgs: ["version"], actions: { status: true, nodes: true, jobs: true, servers: true, allocations: true } },
  goldengate: { command: "adminclient", versionArgs: ["-v"], actions: { version: true, overview: true, lag: true, messages: true, extract: true, replicat: true, checkpoints: true, versions: true } },
};

const telemetryAdapters = {
  snowflake: { command: "snowsql", args: () => ["-q", "select start_time, query_id, user_name, warehouse_name, execution_status, error_code, error_message, total_elapsed_time from table(information_schema.query_history(dateadd('minute',-10,current_timestamp()),current_timestamp(),result_limit=>100)) order by start_time desc", "-o", "output_format=csv", "-o", "friendly=false", "-o", "header=true"] },
  bigquery: { command: "gcloud", args: () => ["logging", "read", "resource.type=bigquery_resource", "--freshness=10m", "--limit=100", "--format=json"] },
  redshift: { command: "aws", target: true, args: (target) => ["logs", "tail", target, "--since", "10m", "--format", "short"] },
  synapse: { command: "az", target: true, args: (target) => ["monitor", "activity-log", "list", "--resource-id", target, "--offset", "1h", "--output", "json"] },
  databricks: { command: "databricks", target: true, args: (target) => ["clusters", "events", "--cluster-id", target, "--limit", "100", "--output", "json"] },
  fabric: { command: "az", target: true, args: (target) => ["monitor", "activity-log", "list", "--resource-id", target, "--offset", "1h", "--output", "json"] },
  athena: { command: "aws", args: () => ["athena", "list-query-executions", "--max-results", "50", "--output", "json"] },
  cloudsql: { command: "gcloud", args: () => ["logging", "read", "resource.type=cloudsql_database", "--freshness=10m", "--limit=100", "--format=json"] },
  rds: { command: "aws", target: true, args: (target) => ["logs", "tail", target, "--since", "10m", "--format", "short"] },
  aurora: { command: "aws", target: true, args: (target) => ["logs", "tail", target, "--since", "10m", "--format", "short"] },
  alloydb: { command: "gcloud", args: () => ["logging", "read", "resource.type=alloydb_database", "--freshness=10m", "--limit=100", "--format=json"] },
};

const mimeTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".ico": "image/x-icon" };
const securityHeaders = {
  "Cache-Control": "no-store",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-DNS-Prefetch-Control": "off",
  "X-Frame-Options": "DENY",
};

function json(res, statusCode, value) {
  const studioOrigin = res.getHeader("Access-Control-Allow-Origin");
  const corsHeaders = studioOrigin ? { "Access-Control-Allow-Origin": studioOrigin, "Access-Control-Allow-Headers": "Content-Type, X-DBridge-Token", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "600", "Cross-Origin-Resource-Policy": "cross-origin", Vary: "Origin" } : {};
  res.writeHead(statusCode, { ...securityHeaders, ...corsHeaders, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function hasLocalHostHeader(req, port) {
  const host = String(req.headers.host || "").toLowerCase();
  return host === `${HOST}:${port}` || host === `localhost:${port}`;
}

function isOperationsStudioOrigin(req) {
  return OPERATIONS_STUDIO_ORIGINS.has(String(req.headers.origin || ""));
}

function applyOperationsStudioCors(req, res) {
  const origin = String(req.headers.origin || "");
  if (OPERATIONS_STUDIO_ORIGINS.has(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
}

function isTrusted(req, port) {
  const origin = String(req.headers.origin || "");
  const sameOrigin = !origin || origin === `http://${HOST}:${port}` || origin === `http://localhost:${port}`;
  if (!sameOrigin && !isOperationsStudioOrigin(req)) return false;
  return req.headers["x-dbridge-token"] === SESSION_TOKEN;
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function run(command, args, options = {}) {
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs || 30000), 1000), 60000);
  return new Promise((resolveRun, rejectRun) => {
    if (process.platform === "win32" && /\.(?:bat|cmd)$/i.test(command)) {
      args = ["/d", "/s", "/c", command, ...args];
      command = process.env.ComSpec || "cmd.exe";
    }
    const child = spawn(command, args, { cwd: options.cwd || ROOT, env: { ...process.env, ...(options.env || {}) }, windowsHide: true, shell: false });
    const stdout = [];
    const stderr = [];
    let size = 0;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const collect = (target) => (chunk) => { if (size < MAX_OUTPUT) target.push(chunk); size += chunk.length; };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", (error) => { clearTimeout(timer); rejectRun(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code, timedOut, truncated: size > MAX_OUTPUT, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
    if (options.stdin) child.stdin.end(options.stdin); else child.stdin.end();
  });
}

const directDriverModuleCache = new Map();

function normalizeDatabaseConnection(input) {
  const engine = String(input.engine || "").toLowerCase();
  const adapter = sqlAdapterCatalog[engine];
  if (!adapter) throw new Error(`Unsupported SQL engine: ${engine}`);
  const source = input.connection || {};
  const host = String(source.host || "localhost").trim();
  const port = String(source.port || adapter.port || "").trim();
  const database = String(source.database || "").trim();
  const username = String(source.username || "").trim();
  const password = String(source.password || "");
  const authMode = source.authMode === "context" ? "context" : "password";
  const tlsMode = ["require", "disable"].includes(source.tlsMode) ? source.tlsMode : "prefer";
  if (host && !/^[A-Za-z0-9_.-]{1,255}$/.test(host)) throw new Error("Enter a valid database host, account, or profile target");
  if (port && (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)) throw new Error("Enter a valid database port");
  if (database && !/^[A-Za-z0-9_.:$@/-]{1,255}$/.test(database)) throw new Error("Enter a valid database, service, project, or warehouse identifier");
  if (username && !/^[A-Za-z0-9_.@+\\-]{1,255}$/.test(username)) throw new Error("Enter a valid database username, profile, or secure key");
  if (/[\r\n\0]/.test(password) || password.length > 1000) throw new Error("The password contains unsupported characters");
  return { engine, adapter, host, port, database, username, password, authMode, tlsMode };
}

async function directDriverModule(engine) {
  const adapter = sqlAdapterCatalog[engine];
  if (!adapter?.driver) return null;
  if (!directDriverModuleCache.has(adapter.driver)) directDriverModuleCache.set(adapter.driver, import(adapter.driver).catch(() => null));
  return directDriverModuleCache.get(adapter.driver);
}

async function directDriverAvailable(engine) {
  return Boolean(await directDriverModule(engine));
}

function directAuthenticationSupported(connection) {
  if (connection.authMode !== "context") return true;
  return ["mongodb", "postgres", "redshift"].includes(connection.engine);
}

async function shouldUseDirectDriver(input) {
  const connection = normalizeDatabaseConnection(input);
  return directAuthenticationSupported(connection) && await directDriverAvailable(connection.engine);
}

function directJsonReplacer(_key, value) {
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  return value;
}

function directResult(rows, command, rowCount = null) {
  const source = Array.isArray(rows) ? rows : rows == null ? [] : [rows];
  let visible = source.slice(0, 1000);
  let stdout = JSON.stringify(visible, directJsonReplacer, 2);
  while (Buffer.byteLength(stdout) > MAX_OUTPUT && visible.length > 1) {
    visible = visible.slice(0, Math.max(1, Math.floor(visible.length / 2)));
    stdout = JSON.stringify(visible, directJsonReplacer, 2);
  }
  if (Buffer.byteLength(stdout) > MAX_OUTPUT) stdout = JSON.stringify([{ message: "The first result row exceeded the portable output limit. Use a narrower projection." }]);
  return { code: 0, timedOut: false, truncated: source.length > visible.length, stdout, stderr: "", command, rowCount: rowCount ?? source.length, rows: source };
}

function safeMongoLiteral(text, fallback = {}) {
  const source = String(text || "").trim();
  if (!source) return fallback;
  if (source.length > 65536 || /[`;]|(?:__proto__|prototype|constructor)/i.test(source)) throw new Error("MongoDB filter contains unsupported syntax");
  const quoted = source
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, value) => JSON.stringify(value.replace(/\\'/g, "'")))
    .replace(/([{,]\s*)([$A-Za-z_][$A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
  const parsed = JSON.parse(quoted);
  const inspect = (value, depth = 0) => {
    if (depth > 20) throw new Error("MongoDB filter nesting is too deep");
    if (Array.isArray(value)) return value.forEach((item) => inspect(item, depth + 1));
    if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("MongoDB filter contains a blocked key");
      inspect(item, depth + 1);
    });
  };
  inspect(parsed);
  return parsed;
}

function splitMongoArguments(text) {
  const parts = []; let start = 0; let depth = 0; let quote = ""; let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
    } else if (["'", '"'].includes(char)) quote = char;
    else if ("[{(".includes(char)) depth += 1;
    else if ("]})".includes(char)) depth -= 1;
    else if (char === "," && depth === 0) { parts.push(text.slice(start, index).trim()); start = index + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

function readMongoCall(text, method) {
  const prefix = `${method}(`;
  if (!text.startsWith(prefix)) return null;
  let depth = 1; let quote = ""; let escaped = false;
  for (let index = prefix.length; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
    } else if (["'", '"'].includes(char)) quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")" && --depth === 0) return { args: text.slice(prefix.length, index), tail: text.slice(index + 1) };
  }
  throw new Error(`MongoDB ${method} expression is incomplete`);
}

function unwrapMongoExpression(sql) {
  let text = String(sql || "").trim().replace(/;\s*$/, "");
  if (/^JSON\.stringify\s*\(/i.test(text)) {
    text = text.replace(/^JSON\.stringify\s*\(/i, "");
    if (/,\s*null\s*,\s*2\s*\)\s*$/i.test(text)) text = text.replace(/,\s*null\s*,\s*2\s*\)\s*$/i, "");
    else text = text.replace(/\)\s*$/, "");
  }
  return text.trim();
}

function mongoCollectionTarget(text) {
  const getCollection = text.match(/^db\.getCollection\(("(?:\\.|[^"])*"|'(?:\\.|[^'])*')\)\./);
  if (getCollection) return { name: safeMongoLiteral(getCollection[1], ""), remainder: text.slice(getCollection[0].length) };
  const dotted = text.match(/^db\.([A-Za-z0-9_$-]+)\./);
  if (dotted) return { name: dotted[1], remainder: text.slice(dotted[0].length) };
  return null;
}

async function collectMongoBottleneckEvidence(input, focus = {}) {
  const connection = normalizeDatabaseConnection({ ...input, engine: "mongodb" });
  const module = await directDriverModule("mongodb");
  if (!module?.MongoClient) throw new Error("The bundled MongoDB driver is unavailable");
  const auth = connection.authMode === "password" && connection.username ? `${encodeURIComponent(connection.username)}:${encodeURIComponent(connection.password)}@` : "";
  const uri = `mongodb://${auth}${connection.host}:${connection.port}/${connection.database || "admin"}`;
  const timeout = Math.min(Math.max(Number(input.timeoutMs || 30000), 5000), 60000);
  const options = { appName: "DBridge-Portable-Monitor", serverSelectionTimeoutMS: timeout, connectTimeoutMS: timeout, socketTimeoutMS: timeout, maxPoolSize: 2 };
  if (connection.tlsMode === "require") options.tls = true;
  if (connection.tlsMode === "disable") options.tls = false;
  const client = new module.MongoClient(uri, options);
  const results = [];
  let statusPromise;
  const database = () => client.db(connection.database || "admin");
  const admin = () => database().admin();
  const serverStatus = () => {
    statusPromise ||= admin().command({ serverStatus: 1 }, { maxTimeMS: timeout });
    return statusPromise;
  };
  const runDefinition = async (definition) => {
    const db = database();
    const adminDb = client.db("admin");
    if (definition.id === "environment") {
      const [build, hello, status] = await Promise.all([
        admin().command({ buildInfo: 1 }, { maxTimeMS: timeout }),
        admin().command({ hello: 1 }, { maxTimeMS: timeout }),
        serverStatus(),
      ]);
      return [{
        version: build.version,
        versionArray: build.versionArray,
        gitVersion: build.gitVersion,
        role: hello.msg === "isdbgrid" ? "mongos" : hello.setName ? "replica-set member" : "standalone",
        setName: hello.setName,
        isWritablePrimary: hello.isWritablePrimary,
        secondary: hello.secondary,
        hosts: hello.hosts,
        storageEngine: status.storageEngine,
        host: status.host,
        uptime: status.uptime,
        process: status.process,
      }];
    }
    if (definition.id === "server") {
      const status = await serverStatus();
      return [{
        uptime: status.uptime,
        opcounters: status.opcounters,
        opLatencies: status.opLatencies,
        network: status.network,
        metrics: { document: status.metrics?.document, operation: status.metrics?.operation, queryExecutor: status.metrics?.queryExecutor },
        asserts: status.asserts,
        extraInfo: status.extra_info,
      }];
    }
    if (definition.id === "currentOps") {
      const operationId = String(focus.operationId || "").trim();
      const filter = operationId
        ? { $or: [{ opid: operationId }, { opid: /^\d+$/.test(operationId) ? Number(operationId) : operationId }, { "command.comment": operationId }, { appName: operationId }] }
        : { active: true };
      try {
        return await adminDb.aggregate([
          { $currentOp: { allUsers: true, idleConnections: false, idleSessions: true, localOps: true } },
          { $match: filter },
          { $sort: { secs_running: -1 } },
          { $limit: 100 },
        ], { maxTimeMS: timeout }).toArray();
      } catch (error) {
        const legacy = await admin().command({ currentOp: 1, active: true }, { maxTimeMS: timeout });
        const rows = Array.isArray(legacy.inprog) ? legacy.inprog : [];
        if (!operationId) return rows.slice(0, 100);
        return rows.filter((item) => String(item.opid) === operationId || String(item.command?.comment || item.appName || "") === operationId).slice(0, 100);
      }
    }
    if (definition.id === "locks") {
      const status = await serverStatus();
      return [{ locks: status.locks, globalLock: status.globalLock }];
    }
    if (definition.id === "connections") return [(await serverStatus()).connections || {}];
    if (definition.id === "admissions") {
      const status = await serverStatus();
      return [{ globalLock: status.globalLock, queues: status.queues, concurrentTransactions: status.wiredTiger?.concurrentTransactions }];
    }
    if (definition.id === "wiredTiger") return [(await serverStatus()).wiredTiger?.cache || {}];
    if (definition.id === "checkpoints") {
      const status = await serverStatus();
      return [{
        ...(status.wiredTiger?.transaction || {}),
        log: status.wiredTiger?.log,
        blockManager: status.wiredTiger?.["block-manager"],
        cacheDirtyBytes: status.wiredTiger?.cache?.["tracked dirty bytes in the cache"],
      }];
    }
    if (definition.id === "replication") return [await admin().command({ replSetGetStatus: 1 }, { maxTimeMS: timeout })];
    if (definition.id === "oplog") {
      const oplog = client.db("local").collection("oplog.rs");
      const [first, last, stats] = await Promise.all([
        oplog.find({}, { projection: { ts: 1, wall: 1 } }).sort({ $natural: 1 }).limit(1).next(),
        oplog.find({}, { projection: { ts: 1, wall: 1 } }).sort({ $natural: -1 }).limit(1).next(),
        client.db("local").command({ collStats: "oplog.rs", scale: 1024 * 1024 }, { maxTimeMS: timeout }),
      ]);
      const firstSeconds = Number(first?.ts?.getHighBits?.() ?? first?.ts?.high ?? 0);
      const lastSeconds = Number(last?.ts?.getHighBits?.() ?? last?.ts?.high ?? 0);
      return [{ firstWall: first?.wall, lastWall: last?.wall, timeDiffHours: Math.max(0, lastSeconds - firstSeconds) / 3600, sizeMB: stats.size, maxSizeMB: stats.maxSize, storageMB: stats.storageSize }];
    }
    if (definition.id === "transactions") {
      const status = await serverStatus();
      return [{ transactions: status.transactions, flowControl: status.flowControl }];
    }
    if (definition.id === "database") return [await db.command({ dbStats: 1, scale: 1024 * 1024 }, { maxTimeMS: timeout })];
    if (definition.id === "collections") {
      const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
        .filter((item) => item.name !== "system.profile").slice(0, 12);
      const rows = [];
      for (const item of collections) {
        try {
          const stats = await db.command({ collStats: item.name, scale: 1024 * 1024 }, { maxTimeMS: timeout });
          rows.push({ collection: item.name, count: stats.count, sizeMB: stats.size, storageMB: stats.storageSize, totalIndexMB: stats.totalIndexSize, avgObjSize: stats.avgObjSize, freeStorageMB: stats.freeStorageSize });
        } catch (error) {
          rows.push({ collection: item.name, unavailable: String(error?.message || error).slice(0, 300) });
        }
      }
      return rows.sort((a, b) => Number(b.storageMB || 0) - Number(a.storageMB || 0));
    }
    if (definition.id === "profiler") {
      const profileStatus = await db.command({ profile: -1 }, { maxTimeMS: timeout });
      const exists = await db.listCollections({ name: "system.profile" }, { nameOnly: true }).hasNext();
      const recent = exists
        ? await db.collection("system.profile").find({}, {
          projection: { ts: 1, op: 1, ns: 1, command: 1, millis: 1, cpuNanos: 1, planningTimeMicros: 1, docsExamined: 1, keysExamined: 1, nreturned: 1, planSummary: 1, execStats: 1, fromMultiPlanner: 1, replanReason: 1, numYield: 1, storage: 1, locks: 1, responseLength: 1 },
          maxTimeMS: timeout,
        }).sort({ ts: -1 }).limit(50).toArray()
        : [];
      return [{ profilingStatus: profileStatus, profileCollectionExists: exists }, ...recent];
    }
    if (definition.id === "queryStats") {
      return await adminDb.aggregate([{ $queryStats: {} }, { $sort: { "metrics.totalExecMicros.sum": -1 } }, { $limit: 50 }], { maxTimeMS: timeout }).toArray();
    }
    if (definition.id === "indexes") {
      return await db.collection(focus.collection).aggregate([{ $indexStats: {} }], { maxTimeMS: timeout }).toArray();
    }
    if (definition.id === "planCache") {
      return await db.collection(focus.collection).aggregate([{ $planCacheStats: {} }, { $limit: 100 }], { maxTimeMS: timeout }).toArray();
    }
    if (definition.id === "sharding") {
      const output = {};
      try { output.shards = await admin().command({ listShards: 1 }, { maxTimeMS: timeout }); } catch (error) { output.listShardsUnavailable = String(error?.message || error).slice(0, 300); }
      try { output.balancerStatus = await admin().command({ balancerStatus: 1 }, { maxTimeMS: timeout }); } catch (error) { output.balancerUnavailable = String(error?.message || error).slice(0, 300); }
      try { output.balancer = await client.db("config").collection("settings").findOne({ _id: "balancer" }, { maxTimeMS: timeout }); } catch {}
      output.shardCount = output.shards?.shards?.length || 0;
      return [output];
    }
    if (definition.id === "diagnosticLog") return [await admin().command({ getLog: "global" }, { maxTimeMS: timeout })];
    throw new Error("Unsupported MongoDB evidence check");
  };
  try {
    await client.connect();
    const requestedCheckIds = new Set(Array.isArray(focus.checkIds) ? focus.checkIds.map((value) => String(value)) : []);
    const definitions = requestedCheckIds.size ? mongodbBottleneckCatalog.filter((definition) => requestedCheckIds.has(definition.id)) : mongodbBottleneckCatalog;
    for (const definition of definitions) {
      if (definition.requiresCollection && !focus.collection) {
        results.push({ id: definition.id, label: definition.label, phase: definition.phase, guidance: definition.guidance, ok: false, skipped: true, durationMs: 0, rows: [], error: "Optional collection not supplied; server-wide checks continued" });
        continue;
      }
      const started = Date.now();
      try {
        const rows = await runDefinition(definition);
        results.push({ id: definition.id, label: definition.label, phase: definition.phase, guidance: definition.guidance, ok: true, skipped: false, durationMs: Date.now() - started, rowCount: Array.isArray(rows) ? rows.length : 1, rows: Array.isArray(rows) ? rows : [rows] });
      } catch (error) {
        results.push({ id: definition.id, label: definition.label, phase: definition.phase, guidance: definition.guidance, ok: false, skipped: false, durationMs: Date.now() - started, rows: [], error: String(error instanceof Error ? error.message : error).slice(0, 2000) });
      }
    }
    return results;
  } finally {
    await client.close().catch(() => {});
  }
}

async function collectMongoRuntimeTrace(input, identifier, collection = "") {
  const connection = normalizeDatabaseConnection({ ...input, engine: "mongodb" });
  const module = await directDriverModule("mongodb");
  if (!module?.MongoClient) throw new Error("The bundled MongoDB driver is unavailable");
  const auth = connection.authMode === "password" && connection.username ? `${encodeURIComponent(connection.username)}:${encodeURIComponent(connection.password)}@` : "";
  const uri = `mongodb://${auth}${connection.host}:${connection.port}/${connection.database || "admin"}`;
  const timeout = Math.min(Math.max(Number(input.timeoutMs || 30000), 5000), 60000);
  const options = { appName: "DBridge-Portable-Trace", serverSelectionTimeoutMS: timeout, connectTimeoutMS: timeout, socketTimeoutMS: timeout, maxPoolSize: 2 };
  if (connection.tlsMode === "require") options.tls = true;
  if (connection.tlsMode === "disable") options.tls = false;
  const client = new module.MongoClient(uri, options);
  const database = () => client.db(connection.database || "admin");
  const adminDatabase = () => client.db("admin");
  const admin = () => database().admin();
  const identifiers = /^\d+$/.test(identifier) ? [identifier, Number(identifier)] : [identifier];
  const match = { $or: [{ opid: { $in: identifiers } }, { "command.comment": identifier }, { appName: identifier }] };
  const definitions = runtimeTraceCatalog.mongodb.checks;
  const results = [];
  const capture = async (definition, operation) => {
    const started = Date.now();
    try {
      const rows = await operation();
      const list = Array.isArray(rows) ? rows.slice(0, 200) : [rows];
      results.push({ id: definition.id, label: definition.label, phase: definition.phase, importance: definition.importance, guidance: definition.guidance, ok: true, skipped: false, durationMs: Date.now() - started, rowCount: list.length, rows: list });
    } catch (error) {
      results.push({ id: definition.id, label: definition.label, phase: definition.phase, importance: definition.importance, guidance: definition.guidance, ok: false, skipped: false, durationMs: Date.now() - started, rows: [], error: String(error instanceof Error ? error.message : error).slice(0, 2000) });
    }
  };
  try {
    await client.connect();
    for (const definition of definitions) {
      if (definition.id === "current") {
        await capture(definition, async () => {
          try {
            return await adminDatabase().aggregate([
              { $currentOp: { allUsers: true, idleConnections: false, idleSessions: true, localOps: true } },
              { $match: match },
              { $sort: { secs_running: -1 } },
              { $limit: 100 },
            ], { maxTimeMS: timeout }).toArray();
          } catch {
            const current = await admin().command({ currentOp: 1, active: true }, { maxTimeMS: timeout });
            return (Array.isArray(current.inprog) ? current.inprog : []).filter((item) => identifiers.includes(item.opid) || String(item.command?.comment || item.appName || "") === identifier).slice(0, 100);
          }
        });
      } else if (definition.id === "profiler") {
        await capture(definition, async () => {
          const db = database();
          const status = await db.command({ profile: -1 }, { maxTimeMS: timeout });
          const exists = await db.listCollections({ name: "system.profile" }, { nameOnly: true }).hasNext();
          if (!exists) return [{ profilingStatus: status, profileCollectionExists: false }];
          const recent = await db.collection("system.profile").find(match, {
            projection: { ts: 1, op: 1, ns: 1, appName: 1, command: 1, opid: 1, millis: 1, cpuNanos: 1, planningTimeMicros: 1, docsExamined: 1, keysExamined: 1, nreturned: 1, planSummary: 1, execStats: 1, fromMultiPlanner: 1, replanReason: 1, numYield: 1, storage: 1, locks: 1, responseLength: 1 },
            maxTimeMS: timeout,
          }).sort({ ts: -1 }).limit(100).toArray();
          return [{ profilingStatus: status, profileCollectionExists: true }, ...recent];
        });
      } else if (definition.id === "queryStats") {
        await capture(definition, async () => {
          const rows = await adminDatabase().aggregate([{ $queryStats: {} }, { $sort: { "metrics.totalExecMicros.sum": -1 } }, { $limit: 200 }], { maxTimeMS: timeout }).toArray();
          const needle = identifier.toLowerCase();
          return rows.filter((row) => {
            try { return JSON.stringify(row).toLowerCase().includes(needle); } catch { return false; }
          }).slice(0, 100);
        });
      } else if (definition.id === "planCache") {
        if (!collection) {
          results.push({ id: definition.id, label: definition.label, phase: definition.phase, importance: definition.importance, guidance: definition.guidance, ok: false, skipped: true, durationMs: 0, rows: [], error: "Optional collection was not supplied; plan-cache inspection was skipped" });
        } else {
          await capture(definition, async () => {
            const rows = await database().collection(collection).aggregate([{ $planCacheStats: {} }, { $limit: 200 }], { maxTimeMS: timeout }).toArray();
            const needle = identifier.toLowerCase();
            return rows.filter((row) => {
              try { return JSON.stringify(row).toLowerCase().includes(needle); } catch { return false; }
            }).slice(0, 100);
          });
        }
      } else if (definition.id === "context") {
        await capture(definition, async () => {
          const [build, hello, profiler] = await Promise.all([
            admin().command({ buildInfo: 1 }, { maxTimeMS: timeout }),
            admin().command({ hello: 1 }, { maxTimeMS: timeout }),
            database().command({ profile: -1 }, { maxTimeMS: timeout }),
          ]);
          return [{ version: build.version, role: hello.msg === "isdbgrid" ? "mongos" : hello.setName ? "replica-set member" : "standalone", setName: hello.setName, isWritablePrimary: hello.isWritablePrimary, profiler }];
        });
      }
    }
    return results;
  } finally {
    await client.close().catch(() => {});
  }
}

async function executeDirectMongo(input, sql) {
  const connection = normalizeDatabaseConnection(input);
  const module = await directDriverModule("mongodb");
  if (!module?.MongoClient) throw new Error("The bundled MongoDB driver is unavailable");
  const auth = connection.authMode === "password" && connection.username ? `${encodeURIComponent(connection.username)}:${encodeURIComponent(connection.password)}@` : "";
  const uri = `mongodb://${auth}${connection.host}:${connection.port}/${connection.database || "admin"}`;
  const timeout = Math.min(Math.max(Number(input.timeoutMs || 30000), 5000), 60000);
  const options = { appName: "DBridge-Portable", serverSelectionTimeoutMS: timeout, connectTimeoutMS: timeout, maxPoolSize: 2 };
  if (connection.tlsMode === "require") options.tls = true;
  if (connection.tlsMode === "disable") options.tls = false;
  const client = new module.MongoClient(uri, options);
  try {
    await client.connect();
    const database = client.db(connection.database || "admin");
    const text = unwrapMongoExpression(sql);
    let result;
    if (/^db\.serverStatus\(\)$/i.test(text)) result = await database.admin().command({ serverStatus: 1 });
    else if (/^db\.serverStatus\(\)\.(?:connections|locks)$/i.test(text)) {
      const key = text.match(/\.(connections|locks)$/i)[1];
      result = (await database.admin().command({ serverStatus: 1 }))[key] || {};
    } else if (/^rs\.status\(\)$/i.test(text)) result = await database.admin().command({ replSetGetStatus: 1 });
    else if (/^db\.hostInfo\(\)$/i.test(text)) result = await database.admin().command({ hostInfo: 1 });
    else if (/^db\.getProfilingStatus\(\)$/i.test(text)) result = await database.command({ profile: -1 });
    else if (/^db\.currentOp\(/i.test(text)) {
      const call = readMongoCall(text.slice(3), "currentOp"); const filter = safeMongoLiteral(call.args, {});
      result = await database.admin().command({ currentOp: 1, ...filter });
    } else if (/^db\.stats\(/i.test(text)) {
      const call = readMongoCall(text.slice(3), "stats"); const scale = call.args && /^\d+(?:\s*\*\s*\d+)*$/.test(call.args) ? call.args.split("*").reduce((total, value) => total * Number(value.trim()), 1) : 1;
      result = await database.command({ dbStats: 1, scale });
    } else if (/^db\.getLog\(/i.test(text)) {
      const call = readMongoCall(text.slice(3), "getLog"); const name = safeMongoLiteral(call.args || '"global"', "global");
      result = await database.admin().command({ getLog: name });
    } else if (/^db\.adminCommand\(/i.test(text)) {
      const call = readMongoCall(text.slice(3), "adminCommand"); const command = safeMongoLiteral(call.args, {});
      const allowed = Object.keys(command).length === 1 && ["getLog", "ping", "listShards"].includes(Object.keys(command)[0]);
      if (!allowed) throw new Error("This MongoDB admin command is not available in direct read-only mode");
      result = await database.admin().command(command);
    } else if (/db\.getCollectionNames\(\).*totalIndexSize/i.test(text)) {
      const collections = (await database.listCollections({}, { nameOnly: true }).toArray()).slice(0, 100);
      result = await Promise.all(collections.map(async ({ name }) => {
        const stats = await database.command({ collStats: name, scale: 1024 * 1024 });
        return { collection: name, count: stats.count, sizeMB: stats.size, storageMB: stats.storageSize, totalIndexMB: stats.totalIndexSize, avgObjSize: stats.avgObjSize };
      }));
    } else if (/status:db\.getProfilingStatus\(\).*system\.profile/i.test(text)) {
      result = {
        status: await database.command({ profile: -1 }),
        recent: await database.collection("system.profile").find({}).sort({ ts: -1 }).limit(25).toArray(),
      };
    } else if (/storageEngine:s\.storageEngine.*wiredTiger/i.test(text)) {
      const status = await database.admin().command({ serverStatus: 1 });
      result = { storageEngine: status.storageEngine, wiredTigerCache: status.wiredTiger?.cache };
    } else if (/shards:db\.adminCommand\(\{listShards:1\}\).*balancer/i.test(text)) {
      result = {
        shards: await database.admin().command({ listShards: 1 }),
        balancer: await client.db("config").collection("settings").findOne({ _id: "balancer" }),
      };
    } else if (/active_sessions:active\.length.*avg_elapsed_ms/i.test(text)) {
      const status = await database.admin().command({ serverStatus: 1 });
      const current = await database.admin().command({ currentOp: 1, active: true });
      const active = Array.isArray(current.inprog) ? current.inprog : [];
      const counters = Object.values(status.opcounters || {}).reduce((total, value) => total + (Number(value) || 0), 0);
      const latencies = Object.values(status.opLatencies || {});
      const latencyOps = latencies.reduce((total, value) => total + (Number(value?.ops) || 0), 0);
      const latencyMicros = latencies.reduce((total, value) => total + (Number(value?.latency) || 0), 0);
      result = { active_sessions: active.length, waiting_sessions: active.filter((item) => item.waitingForLock === true).length, executions: counters, avg_elapsed_ms: latencyOps ? latencyMicros / latencyOps / 1000 : 0, logical_reads: 0, physical_reads: 0, throughput: counters, errors: Number(status.asserts?.regular || 0) + Number(status.asserts?.warning || 0) };
    } else if (/max_runtime_seconds.*collection_scans/i.test(text)) {
      const id = text.match(/const id=("(?:\\.|[^"])*")/)?.[1];
      const identifier = id ? JSON.parse(id) : "";
      const ids = /^\d+$/.test(identifier) ? [identifier, Number(identifier)] : [identifier];
      const current = await database.admin().command({ currentOp: 1, $or: [{ opid: { $in: ids } }, { "command.comment": identifier }] });
      const operations = Array.isArray(current.inprog) ? current.inprog : [];
      const sum = (key) => operations.reduce((total, item) => total + (Number(item[key]) || 0), 0);
      result = { matched: operations.length, executions: operations.length, elapsed_ms: operations.reduce((total, item) => total + (Number(item.microsecs_running) || Number(item.secs_running) * 1000000 || 0) / 1000, 0), rows_processed: sum("nreturned"), examined_rows: sum("docsExamined"), waiting_locks: operations.filter((item) => item.waitingForLock === true).length, collection_scans: operations.filter((item) => String(item.planSummary || "").toUpperCase().includes("COLLSCAN")).length, max_runtime_seconds: operations.reduce((maximum, item) => Math.max(maximum, Number(item.secs_running) || 0), 0) };
    } else {
      const target = mongoCollectionTarget(text);
      if (!target) throw new Error("Direct MongoDB mode supports approved db.collection read expressions only");
      const collection = database.collection(target.name);
      const method = ["findOne", "find", "aggregate", "countDocuments", "estimatedDocumentCount", "distinct", "stats"].find((name) => target.remainder.startsWith(`${name}(`));
      if (!method) throw new Error("This MongoDB method is not available in direct read-only mode");
      const call = readMongoCall(target.remainder, method);
      const args = splitMongoArguments(call.args);
      if (method === "findOne") result = await collection.findOne(safeMongoLiteral(args[0], {}), { projection: safeMongoLiteral(args[1], undefined), maxTimeMS: timeout });
      else if (method === "find") {
        let cursor = collection.find(safeMongoLiteral(args[0], {}), { projection: safeMongoLiteral(args[1], undefined), maxTimeMS: timeout });
        const limit = Math.min(Math.max(Number(call.tail.match(/\.limit\((\d+)\)/)?.[1] || 100), 1), 1000); cursor = cursor.limit(limit);
        const explain = call.tail.match(/\.explain\((['"])([^'"]+)\1\)/);
        result = explain ? await cursor.explain(explain[2]) : await cursor.toArray();
      } else if (method === "aggregate") {
        const pipeline = safeMongoLiteral(args[0], []); if (!Array.isArray(pipeline)) throw new Error("MongoDB aggregate requires a JSON pipeline array");
        result = await collection.aggregate([...pipeline, { $limit: 1000 }], { maxTimeMS: timeout }).toArray();
      } else if (method === "countDocuments") result = { count: await collection.countDocuments(safeMongoLiteral(args[0], {}), { maxTimeMS: timeout }) };
      else if (method === "estimatedDocumentCount") result = { count: await collection.estimatedDocumentCount({ maxTimeMS: timeout }) };
      else if (method === "distinct") result = await collection.distinct(safeMongoLiteral(args[0], ""), safeMongoLiteral(args[1], {}), { maxTimeMS: timeout });
      else result = await database.command({ collStats: target.name });
    }
    return directResult(result, "direct:mongodb");
  } finally {
    await client.close().catch(() => {});
  }
}

async function executeDirectPostgres(input, sql) {
  const connection = normalizeDatabaseConnection(input); const module = await directDriverModule(connection.engine);
  const Client = module?.Client || module?.default?.Client; if (!Client) throw new Error("The bundled PostgreSQL driver is unavailable");
  const ssl = connection.tlsMode === "require" || (connection.engine === "redshift" && connection.tlsMode !== "disable") ? { rejectUnauthorized: true } : connection.tlsMode === "disable" ? false : undefined;
  const client = new Client({ host: connection.host, port: Number(connection.port), database: connection.database, user: connection.username || undefined, password: connection.authMode === "password" ? connection.password : undefined, ssl, connectionTimeoutMillis: Math.min(Math.max(Number(input.timeoutMs || 30000), 5000), 60000), statement_timeout: Math.min(Math.max(Number(input.timeoutMs || 60000), 5000), 60000), application_name: "DBridge-Portable" });
  try { await client.connect(); const result = await client.query(sql); return directResult(result.rows, `direct:${connection.engine}`, result.rowCount); }
  finally { await client.end().catch(() => {}); }
}

async function executeDirectMysql(input, sql) {
  const connection = normalizeDatabaseConnection(input); const module = await directDriverModule(connection.engine);
  if (!module?.createConnection) throw new Error("The bundled MySQL/MariaDB driver is unavailable");
  const options = { host: connection.host, port: Number(connection.port), database: connection.database || undefined, user: connection.username || undefined, password: connection.password, connectTimeout: Math.min(Math.max(Number(input.timeoutMs || 30000), 5000), 60000), rowsAsArray: false, multipleStatements: false };
  if (connection.tlsMode === "require") options.ssl = { rejectUnauthorized: true, minVersion: "TLSv1.2" };
  if (connection.tlsMode === "disable") options.ssl = undefined;
  const client = await module.createConnection(options);
  try { const [rows] = await client.query(sql); return directResult(Array.isArray(rows) ? rows : rows, `direct:${connection.engine}`, rows?.affectedRows); }
  finally { await client.end().catch(() => {}); }
}

async function executeDirectOracle(input, sql) {
  const connection = normalizeDatabaseConnection(input); const module = await directDriverModule("oracle"); const oracle = module?.default || module;
  if (!oracle?.getConnection) throw new Error("The bundled Oracle Thin driver is unavailable");
  const connectString = `${connection.tlsMode === "require" ? "tcps://" : ""}${connection.host}:${connection.port}/${connection.database}`;
  const client = await oracle.getConnection({ user: connection.username, password: connection.password, connectString });
  try {
    const result = await client.execute(sql, [], { outFormat: oracle.OUT_FORMAT_OBJECT, maxRows: 1000, autoCommit: input.allowWrites === true });
    return directResult(result.rows || [{ rowsAffected: result.rowsAffected || 0 }], "direct:oracle", result.rowsAffected ?? result.rows?.length);
  } finally { await client.close().catch(() => {}); }
}

async function executeDirectSqlServer(input, sql) {
  const connection = normalizeDatabaseConnection(input); const module = await directDriverModule(connection.engine);
  if (!module?.Connection || !module?.Request) throw new Error("The bundled SQL Server driver is unavailable");
  const timeout = Math.min(Math.max(Number(input.timeoutMs || 30000), 5000), 60000);
  const client = new module.Connection({ server: connection.host, authentication: { type: "default", options: { userName: connection.username, password: connection.password } }, options: { port: Number(connection.port), database: connection.database || "master", encrypt: connection.engine === "synapse" || connection.tlsMode !== "disable", trustServerCertificate: false, connectTimeout: timeout, requestTimeout: timeout, rowCollectionOnRequestCompletion: false } });
  const rows = [];
  try {
    await new Promise((resolveConnect, rejectConnect) => client.connect((error) => error ? rejectConnect(error) : resolveConnect()));
    const rowCount = await new Promise((resolveRequest, rejectRequest) => {
      const request = new module.Request(sql, (error, count) => error ? rejectRequest(error) : resolveRequest(count));
      request.on("row", (columns) => rows.push(Object.fromEntries(columns.map((column) => [column.metadata.colName, column.value]))));
      client.execSql(request);
    });
    return directResult(rows.length ? rows : [{ rowsAffected: rowCount || 0 }], `direct:${connection.engine}`, rowCount);
  } finally { client.close(); }
}

async function executeDirectDatabase(input, sql) {
  const engine = String(input.engine || "").toLowerCase();
  if (engine === "mongodb") return executeDirectMongo(input, sql);
  if (["postgres", "redshift"].includes(engine)) return executeDirectPostgres(input, sql);
  if (["mysql", "mariadb"].includes(engine)) return executeDirectMysql(input, sql);
  if (engine === "oracle") return executeDirectOracle(input, sql);
  if (["sqlserver", "synapse"].includes(engine)) return executeDirectSqlServer(input, sql);
  throw new Error(`A bundled direct driver is not configured for ${engine}`);
}

async function executeDatabaseQuery(input, sql, timeoutMs = 45000) {
  if (await shouldUseDirectDriver(input)) {
    const result = await executeDirectDatabase({ ...input, timeoutMs }, sql);
    return { ...result, access: "direct" };
  }
  const connection = normalizeDatabaseConnection(input);
  if (!connection.adapter.client) throw new Error(`The bundled ${connection.adapter.driver} driver is unavailable. Re-extract the complete portable package.`);
  const found = await available(connection.adapter.client);
  if (!found.available) throw new Error(`${connection.adapter.client} was not found in PATH and this authentication mode cannot use the bundled direct driver.`);
  const spec = connectionCommand(input, sql);
  const result = await run(spec.command, spec.args, { stdin: spec.stdin, env: spec.env, timeoutMs });
  return { ...result, access: "client", command: spec.command };
}


function validateDiagnosticStudioIdentifier(engine, value) {
  const identifier = String(value || "").trim();
  if (!identifier) return "";
  if (engine === "oracle" && !/^[a-z0-9]{13}$/i.test(identifier)) throw new Error("Oracle SQL_ID must contain exactly 13 letters or digits");
  if (engine === "postgres" && !/^-?\d{1,20}$/.test(identifier)) throw new Error("PostgreSQL queryid must be a signed integer with at most 20 digits");
  if (["mysql", "mariadb"].includes(engine) && !/^[a-f0-9]{64}$/i.test(identifier)) throw new Error(`${engine === "mariadb" ? "MariaDB" : "MySQL"} statement digest must contain exactly 64 hexadecimal characters`);
  if (engine === "sqlserver" && !/^0x[a-f0-9]{16}$/i.test(identifier)) throw new Error("SQL Server query hash must use the 0x prefix followed by exactly 16 hexadecimal characters");
  if (engine === "mongodb" && (identifier.length > 128 || /[\r\n\0]/.test(identifier))) throw new Error("MongoDB operation/comment focus must be at most 128 characters");
  return engine === "oracle" ? identifier.toLowerCase() : identifier;
}

async function collectDiagnosticStudioEvidence(input, engine, playbookId, identifier, packScope) {
  const catalogs = {
    oracle: oracleBottleneckCatalog,
    postgres: postgresBottleneckCatalog,
    mongodb: mongodbBottleneckCatalog,
    mysql: relationalBottleneckCatalogs.mysql,
    mariadb: relationalBottleneckCatalogs.mariadb,
    sqlserver: relationalBottleneckCatalogs.sqlserver,
  };
  const { playbook, selected } = resolveDiagnosticPlaybook(engine, playbookId, catalogs[engine]);
  const selectedIds = selected.map((definition) => definition.id);
  if (engine === "mongodb") {
    const collection = String(input.collection || "").trim();
    if (collection && (collection.length > 255 || /[\r\n\0$]/.test(collection))) throw new Error("Enter a valid MongoDB collection name");
    const results = await collectMongoBottleneckEvidence(input, { operationId: identifier, collection, checkIds: selectedIds });
    return { playbook, results, analysis: analyzeMongoBottlenecks(results, { operationId: identifier, collection }) };
  }
  const timeoutMs = Math.min(Math.max(Number(input.timeoutMs || 30000), 5000), 60000);
  const results = [];
  let serverVersion = 0;
  const allowedOracleLicenses = packScope === "tuning" ? new Set(["core", "diagnostics", "tuning"]) : packScope === "diagnostics" ? new Set(["core", "diagnostics"]) : new Set(["core"]);
  for (const definition of selected) {
    const common = { id: definition.id, label: definition.label, phase: definition.phase, guidance: definition.guidance, license: definition.license };
    if (engine === "oracle" && !allowedOracleLicenses.has(definition.license || "core")) {
      results.push({ ...common, ok: false, skipped: true, durationMs: 0, rows: [], error: `${definition.license === "tuning" ? "Tuning" : "Diagnostics"} Pack scope was not selected` });
      continue;
    }
    const requiresIdentifier = definition.requiresSqlId || definition.requiresQueryId || definition.requiresIdentifier;
    if (requiresIdentifier && !identifier) {
      results.push({ ...common, ok: false, skipped: true, durationMs: 0, rows: [], error: "Optional statement identifier not supplied; incident-wide checks continued" });
      continue;
    }
    if (engine === "postgres" && definition.minVersion && (!serverVersion || serverVersion < definition.minVersion)) {
      results.push({ ...common, ok: false, skipped: true, durationMs: 0, rows: [], error: serverVersion ? `Requires PostgreSQL ${Math.floor(definition.minVersion / 10000)} or newer` : "Server version was unavailable; version-specific check skipped" });
      continue;
    }
    if (engine === "postgres" && definition.maxVersion && serverVersion && serverVersion > definition.maxVersion) {
      results.push({ ...common, ok: false, skipped: true, durationMs: 0, rows: [], error: `Used only through PostgreSQL ${Math.floor(definition.maxVersion / 10000)}` });
      continue;
    }
    const started = Date.now();
    try {
      let sql = definition.sql;
      if (definition.requiresSqlId) sql = sql.replaceAll("__SQL_ID__", identifier);
      if (definition.requiresQueryId) sql = sql.replaceAll("__QUERY_ID__", identifier);
      if (definition.requiresIdentifier) sql = sql.replaceAll("__IDENTIFIER__", identifier);
      const result = await executeDatabaseQuery({ ...input, engine }, sql, timeoutMs);
      const rows = Array.isArray(result.rows) ? result.rows.slice(0, 250) : [];
      const ok = result.code === 0;
      results.push({ ...common, ok, skipped: false, durationMs: Date.now() - started, rowCount: Number(result.rowCount ?? rows.length), rows, error: ok ? undefined : String(result.stderr || result.stdout || `${definition.label} evidence query failed`).slice(0, 2000) });
      if (engine === "postgres" && definition.id === "environment" && ok) serverVersion = Number(rows[0]?.server_version_num || 0);
    } catch (error) {
      results.push({ ...common, ok: false, skipped: false, durationMs: Date.now() - started, rows: [], error: String(error instanceof Error ? error.message : error).slice(0, 2000) });
    }
  }
  const analysis = engine === "oracle"
    ? analyzeOracleBottlenecks(results, identifier, packScope)
    : engine === "postgres"
      ? analyzePostgresBottlenecks(results, identifier)
      : analyzeRelationalBottlenecks(engine, results, identifier);
  return { playbook, results, analysis, serverVersion };
}

async function validateDirectDatabase(input) {
  const connection = normalizeDatabaseConnection(input);
  if (connection.engine === "mongodb") {
    const result = await executeDirectMongo(input, "db.serverStatus()");
    return { ...result, stdout: JSON.stringify([{ database: connection.database || "admin", driver: "mongodb", status: "connected" }], null, 2) };
  }
  return executeDirectDatabase(input, connectionValidationSql(connection.engine));
}

async function directDatabaseCatalog(input) {
  const connection = normalizeDatabaseConnection(input);
  if (connection.engine === "mongodb") {
    const module = await directDriverModule("mongodb");
    const auth = connection.authMode === "password" && connection.username ? `${encodeURIComponent(connection.username)}:${encodeURIComponent(connection.password)}@` : "";
    const client = new module.MongoClient(`mongodb://${auth}${connection.host}:${connection.port}/${connection.database || "admin"}`, { appName: "DBridge-Portable", serverSelectionTimeoutMS: 30000, connectTimeoutMS: 30000, maxPoolSize: 2, ...(connection.tlsMode === "require" ? { tls: true } : connection.tlsMode === "disable" ? { tls: false } : {}) });
    try {
      await client.connect();
      const collections = await client.db(connection.database || "admin").listCollections({}, { nameOnly: true }).toArray();
      return collections.slice(0, 1500).map((item) => ({ type: String(item.type || "COLLECTION").toUpperCase(), schema: connection.database || "admin", name: item.name }));
    } finally { await client.close().catch(() => {}); }
  }
  const result = await executeDirectDatabase(input, databaseCatalogSql(connection.engine));
  return parseDatabaseCatalog(connection.engine, result.rows.flatMap((row) => Object.values(row)).join("\n"));
}

function assertReadOnly(sql, allowWrites, engine) {
  if (allowWrites) return;
  const cleaned = String(sql || "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ").trim();
  if (engine === "mongodb") {
    const approved = /^(?:JSON\.stringify\s*\()?\s*db\.(?:getCollection\([^)]*\)|[A-Za-z0-9_$-]+)?\.?\s*(?:find|findOne|aggregate|countDocuments|estimatedDocumentCount|distinct|explain|currentOp|stats|serverStatus|hostInfo|getProfilingStatus|getLog)\b/i.test(cleaned);
    if (approved && !/[;`\0]/.test(cleaned) && !/\b(?:process|require|load|runProgram|runCommand|adminCommand|shutdown|eval|mapReduce)\b/i.test(cleaned)) return;
    throw new Error("Read-only mode accepts only a single approved MongoDB inspection expression.");
  }
  if (!/^(select|with|values|show|explain|describe|desc|set\s+transaction\s+read\s+only)\b/i.test(cleaned)) throw new Error("Read-only mode blocked this statement. Enable writes explicitly if authorized.");
  if (/\b(insert|update|delete|merge|drop|alter|truncate|create|grant|revoke|commit|rollback|execute|call)\b/i.test(cleaned)) throw new Error("Potentially mutating SQL is blocked in read-only mode.");
  if (/^\s*(?:host\b|spool\b|start\b|@{1,2}|\\(?:!|copy|include|o)\b|\\!|\.(?:os|run|compile|export|import|logon|logoff|quit|exit)\b|!(?!=)|source\b|system\b)/im.test(cleaned)) throw new Error("Database-client escape and meta commands are blocked in SQL Studio.");
}

function connectionCommand(input, sql) {
  const { engine, host, port, database, username, password, authMode } = normalizeDatabaseConnection(input);
  const contextAuth = authMode === "context";
  if (engine === "postgres") return { command: "psql", args: ["-X", "--csv", "-h", host, "-p", port, ...(!contextAuth && username ? ["-U", username] : []), "-d", database, "-c", sql], env: contextAuth ? {} : { PGPASSWORD: password } };
  if (engine === "oracle") {
    const target = contextAuth ? `/@//${host}:${port}/${database}` : `${username}/\"${password.replaceAll('"', '""')}\"@//${host}:${port}/${database}`;
    return { command: "sqlplus", args: ["-S", "/nolog"], stdin: `whenever sqlerror exit sql.sqlcode\nconnect ${target}\nset long 1000000 longchunksize 1000000 pagesize 50000 linesize 32767 feedback off verify off heading on echo off trimspool on\n${sql.replace(/;\s*$/, "")} ;\nexit\n` };
  }
  if (engine === "mongodb") throw new Error("MongoDB uses the bundled direct driver and does not invoke an external shell.");
  if (engine === "mysql") return { command: "mysql", args: ["--batch", "--raw", "-h", host, "-P", port, ...(!contextAuth && username ? ["-u", username] : []), database, "-e", sql], env: contextAuth ? {} : { MYSQL_PWD: password } };
  if (engine === "sqlserver") return { command: "sqlcmd", args: ["-S", `${host},${port}`, ...(contextAuth ? ["-E"] : ["-U", username]), "-d", database || "master", "-W", "-s", ",", "-Q", sql], env: contextAuth ? {} : { SQLCMDPASSWORD: password } };
  if (engine === "mariadb") return { command: "mysql", args: ["--batch", "--raw", "-h", host, "-P", port, ...(!contextAuth && username ? ["-u", username] : []), database, "-e", sql], env: contextAuth ? {} : { MYSQL_PWD: password } };
  if (engine === "redshift") return { command: "psql", args: ["-X", "--csv", "-h", host, "-p", port, ...(!contextAuth && username ? ["-U", username] : []), "-d", database, "-c", sql], env: contextAuth ? {} : { PGPASSWORD: password } };
  if (engine === "synapse") return { command: "sqlcmd", args: ["-S", `${host},${port}`, ...(contextAuth ? ["-E"] : ["-U", username]), "-d", database || "master", "-W", "-s", ",", "-Q", sql], env: contextAuth ? {} : { SQLCMDPASSWORD: password } };
  if (engine === "snowflake") return { command: "snowsql", args: ["-a", host, ...(!contextAuth && username ? ["-u", username] : []), "-d", database, "-q", sql, "-o", "friendly=false", "-o", "timing=false", "-o", "output_format=csv"], env: contextAuth ? {} : { SNOWSQL_PWD: password } };
  if (engine === "bigquery") return { command: "bq", args: ["query", "--use_legacy_sql=false", "--format=prettyjson", ...(database ? [`--project_id=${database}`] : []), sql] };
  if (engine === "databricks") {
    if (!database) throw new Error("Enter the Databricks SQL warehouse ID in Database / service");
    return { command: "databricks", args: [...(username ? ["--profile", username] : []), "api", "post", "/api/2.0/sql/statements", "--json", JSON.stringify({ warehouse_id: database, statement: sql, wait_timeout: "50s" })] };
  }
  if (engine === "db2") {
    if (!database) throw new Error("Enter the cataloged Db2 database alias");
    if (!contextAuth && /[;,]/.test(password)) throw new Error("Db2 portable mode does not accept comma or semicolon in the inline credential; use an existing authenticated CLP context instead");
    const connect = !contextAuth && username ? `connect to ${database} user ${username} using ${password};\n` : `connect to ${database};\n`;
    return { command: "db2", args: ["-tv"], stdin: `${connect}${sql.replace(/;\s*$/, "")};\nconnect reset;\n` };
  }
  if (engine === "hana") {
    if (!username) throw new Error("Enter the approved hdbuserstore key in Username / profile");
    return { command: "hdbsql", args: ["-U", username, "-j", sql] };
  }
  if (engine === "clickhouse") return { command: "clickhouse-client", args: ["--host", host, "--port", port, "--database", database || "default", ...(!contextAuth ? ["--user", username || "default"] : []), "--query", sql], env: contextAuth ? {} : { CLICKHOUSE_PASSWORD: password } };
  if (engine === "teradata") {
    if (contextAuth) throw new Error("Teradata portable mode requires database username and password authentication");
    if (!username || !host) throw new Error("Enter the Teradata host and username");
    if (/[;,]/.test(password)) throw new Error("Teradata portable mode does not accept comma or semicolon in the inline credential");
    return { command: "bteq", args: [], stdin: `.LOGON ${host}/${username},${password};\n${sql.replace(/;\s*$/, "")};\n.LOGOFF;\n.EXIT;\n` };
  }
  throw new Error(`Unsupported SQL engine: ${engine}`);
}

function connectionValidationSql(engine) {
  if (engine === "oracle") return "select sys_context('USERENV','DB_NAME') database_name, sys_context('USERENV','SESSION_USER') session_user, (select count(*) from v$session where rownum=1) diagnostic_view_access from dual";
  if (engine === "postgres") return "select current_database() database_name, current_user session_user, has_table_privilege(current_user,'pg_catalog.pg_stat_activity','select') activity_access, exists(select 1 from pg_extension where extname='pg_stat_statements') pg_stat_statements_installed";
  if (engine === "mongodb") return "JSON.stringify({ping:db.adminCommand({ping:1}),database:db.getName(),user:db.runCommand({connectionStatus:1}).authInfo}, null, 2)";
  if (engine === "mysql" || engine === "mariadb") return "select database() database_name, current_user() session_user, @@version version, (select count(*) from performance_schema.threads limit 1) performance_schema_access";
  if (engine === "sqlserver" || engine === "synapse") return "select db_name() database_name, suser_sname() session_user, serverproperty('ProductVersion') product_version, has_perms_by_name(null,null,'VIEW SERVER STATE') view_server_state";
  if (engine === "redshift") return "select current_database() database_name, current_user session_user, version() product_version";
  if (engine === "snowflake") return "select current_account() account_name, current_database() database_name, current_user() session_user, current_role() active_role, current_warehouse() warehouse_name";
  if (engine === "bigquery") return "select session_user() session_user, current_timestamp() checked_at";
  if (engine === "databricks") return "select current_catalog() catalog_name, current_schema() schema_name, current_user() session_user, current_timestamp() checked_at";
  if (engine === "db2") return "values (current server, current user, current timestamp)";
  if (engine === "hana") return "select current_database database_name, current_user session_user, current_schema schema_name from dummy";
  if (engine === "clickhouse") return "select currentDatabase() database_name, currentUser() session_user, version() product_version format JSON";
  if (engine === "teradata") return "select user as session_user, database as database_name, current_timestamp(0) as checked_at";
  throw new Error("Connection validation is not configured for this adapter");
}

function databaseCatalogSql(engine) {
  if (engine === "oracle") return "select 'DBRIDGE|' || object_type || '|' || owner || '|' || replace(object_name,'|','/') as dbridge_object from all_objects where object_type in ('TABLE','VIEW','MATERIALIZED VIEW') and owner not in ('SYS','SYSTEM','XDB','MDSYS','CTXSYS','ORDSYS') and rownum <= 1500 order by owner, object_type, object_name";
  if (engine === "postgres" || engine === "redshift") return "select 'DBRIDGE|' || upper(table_type) || '|' || table_schema || '|' || replace(table_name,'|','/') as dbridge_object from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by table_schema, table_type, table_name limit 1500";
  if (engine === "mongodb") return "JSON.stringify(db.getCollectionInfos({}, {nameOnly:true}).slice(0,1500).map(item => ({type:(item.type || 'COLLECTION').toUpperCase(), schema:db.getName(), name:item.name})), null, 2)";
  if (engine === "mysql" || engine === "mariadb") return "select concat('DBRIDGE|', upper(table_type), '|', table_schema, '|', replace(table_name,'|','/')) as dbridge_object from information_schema.tables where table_schema not in ('mysql','information_schema','performance_schema','sys') order by table_schema, table_type, table_name limit 1500";
  if (engine === "sqlserver" || engine === "synapse") return "select top (1500) concat('DBRIDGE|', case when o.type='U' then 'TABLE' when o.type='V' then 'VIEW' else o.type_desc end, '|', s.name, '|', replace(o.name,'|','/')) as dbridge_object from sys.objects o join sys.schemas s on s.schema_id=o.schema_id where o.type in ('U','V') and o.is_ms_shipped=0 order by s.name, o.type, o.name";
  if (engine === "snowflake") return "select 'DBRIDGE|' || upper(table_type) || '|' || table_schema || '|' || replace(table_name,'|','/') as dbridge_object from information_schema.tables where table_schema <> 'INFORMATION_SCHEMA' order by table_schema, table_type, table_name limit 1500";
  if (engine === "databricks") return "select concat('DBRIDGE|', upper(table_type), '|', table_schema, '|', replace(table_name,'|','/')) as dbridge_object from information_schema.tables where table_schema <> 'information_schema' order by table_schema, table_type, table_name limit 1500";
  if (engine === "db2") return "select 'DBRIDGE|' || case type when 'T' then 'TABLE' when 'V' then 'VIEW' else type end || '|' || tabschema || '|' || replace(tabname,'|','/') as dbridge_object from syscat.tables where tabschema not like 'SYS%' order by tabschema, type, tabname fetch first 1500 rows only";
  if (engine === "hana") return "select top 1500 'DBRIDGE|' || object_type || '|' || schema_name || '|' || replace(object_name,'|','/') as dbridge_object from (select 'TABLE' object_type, schema_name, table_name object_name from sys.tables union all select 'VIEW', schema_name, view_name from sys.views) order by schema_name, object_type, object_name";
  if (engine === "clickhouse") return "select concat('DBRIDGE|', upper(engine), '|', database, '|', replaceAll(name,'|','/')) as dbridge_object from system.tables where database not in ('system','information_schema','INFORMATION_SCHEMA') order by database, engine, name limit 1500";
  if (engine === "teradata") return "select top 1500 'DBRIDGE|' || case tablekind when 'T' then 'TABLE' when 'V' then 'VIEW' else tablekind end || '|' || trim(databasename) || '|' || oreplace(trim(tablename),'|','/') as dbridge_object from dbc.tablesv where databasename not in ('DBC','SYSLIB','SYSUDTLIB') order by databasename, tablekind, tablename";
  if (engine === "bigquery") throw new Error("BigQuery object browsing needs a dataset-qualified INFORMATION_SCHEMA location. Run a dataset catalog query in the editor for the required region.");
  throw new Error("Database object browsing is not configured for this adapter");
}

function parseDatabaseCatalog(engine, text) {
  if (engine === "bigquery") {
    try {
      const start = String(text || "").indexOf("[");
      const parsed = JSON.parse(String(text || "").slice(start));
      return parsed.slice(0, 1500).map((item) => ({ type: "DATASET", schema: String(item?.datasetReference?.projectId || "").slice(0, 255), name: String(item?.datasetReference?.datasetId || "").slice(0, 255) })).filter((item) => item.name && !/[\r\n\0]/.test(`${item.schema}${item.name}`));
    } catch { return []; }
  }
  if (engine === "mongodb") {
    try {
      const start = String(text || "").indexOf("[");
      const parsed = JSON.parse(String(text || "").slice(start));
      return parsed.slice(0, 1500).map((item) => ({ type: String(item.type || "COLLECTION").slice(0, 64), schema: String(item.schema || "").slice(0, 255), name: String(item.name || "").slice(0, 255) })).filter((item) => item.name && !/[\r\n\0]/.test(`${item.type}${item.schema}${item.name}`));
    } catch { return []; }
  }
  const objects = [];
  const seen = new Set();
  const pattern = /DBRIDGE\|([^|\r\n"]{1,64})\|([^|\r\n"]{0,255})\|([^|\r\n"]{1,255})/g;
  for (const match of String(text || "").matchAll(pattern)) {
    const item = { type: match[1].trim().toUpperCase(), schema: match[2].trim(), name: match[3].trim().replace(/"\s*$/, "") };
    const key = `${item.type}\u001f${item.schema}\u001f${item.name}`;
    if (!item.name || seen.has(key) || /[\r\n\0]/.test(key)) continue;
    seen.add(key); objects.push(item);
    if (objects.length >= 1500) break;
  }
  return objects;
}

function nativeLogQuery(engine, windowHours = 24) {
  const hours = Number(windowHours);
  if (![1, 6, 12, 24, 48, 72].includes(hours)) throw new Error("Log history window must be 1, 6, 12, 24, 48, or 72 hours");
  if (engine === "oracle") return `select to_char(originating_timestamp,'YYYY-MM-DD HH24:MI:SS.FF3 TZH:TZM') event_time, message_type, component_id, message_text from v$diag_alert_ext where originating_timestamp > systimestamp - numtodsinterval(${hours}, 'HOUR') order by originating_timestamp desc fetch first 2000 rows only`;
  if (engine === "postgres") return "select pg_read_file(pg_current_logfile(), greatest((pg_stat_file(pg_current_logfile())).size - 2097152, 0), 2097152) as database_log";
  if (engine === "mongodb") return "JSON.stringify(db.adminCommand({getLog:'global'}), null, 2)";
  if (engine === "mysql") return `select logged, thread_id, prio, error_code, subsystem, data from performance_schema.error_log where logged >= current_timestamp - interval ${hours} hour order by logged desc limit 2000`;
  if (engine === "sqlserver") return "exec sys.xp_readerrorlog 0, 1";
  throw new Error("Database-native collection is not configured for this engine. Use SSH server mode instead.");
}

function remoteTailSpec(input) {
  const host = String(input.host || "").trim();
  const user = String(input.user || "").trim();
  const port = String(input.port || "22").trim();
  const path = String(input.path || "");
  const serverOs = input.serverOs === "windows" ? "windows" : "linux";
  const identityFile = String(input.identityFile || "").trim();
  if (!/^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/.test(host)) throw new Error("Enter a valid SSH server hostname or IP address");
  if (!/^[A-Za-z0-9._@-]{1,128}$/.test(user)) throw new Error("Enter a valid SSH username");
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("SSH port must be between 1 and 65535");
  if (!path || path.length > 1024 || /[\r\n\0]/.test(path)) throw new Error("Enter a valid remote log path");
  const lines = Math.min(Math.max(Number(input.lines || 500), 50), 10000);
  const args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "StrictHostKeyChecking=yes", "-p", port];
  if (identityFile) args.push("-i", resolve(identityFile));
  args.push(`${user}@${host}`);
  if (serverOs === "windows") {
    const safePath = path.replaceAll("'", "''");
    const encodedCommand = Buffer.from(`Get-Content -LiteralPath '${safePath}' -Tail ${lines}`, "utf16le").toString("base64");
    args.push(`powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encodedCommand}`);
  } else {
    const safePath = path.replaceAll("'", `'\\''`);
    args.push(`tail -n ${lines} -- '${safePath}'`);
  }
  return { command: "ssh", args, host, user, port, path, serverOs };
}

function devopsValue(input, key, pattern, label, required = false, max = 255) {
  const value = String(input[key] || "").trim();
  if (required && !value) throw new Error(`${label} is required for this method`);
  if (value && (value.length > max || !pattern.test(value))) throw new Error(`Enter a valid ${label.toLowerCase()}`);
  return value;
}

function commandText(command, args) {
  return [command, ...args].map((part) => /\s/.test(part) ? `"${part.replaceAll('"', '\\"')}"` : part).join(" ");
}

function devopsCommand(input) {
  const toolId = String(input.tool || "");
  const action = String(input.action || "");
  const tool = toolDefinitions[toolId];
  if (!tool || !tool.actions[action]) throw new Error("Unsupported DevOps inspection method");
  const safeName = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,254}$/;
  const safeLoose = /^[A-Za-z0-9][A-Za-z0-9_.:@/+ -]{0,254}$/;
  let command = tool.command;
  let args = [];

  if (toolId === "goldengate") return goldenGateAdminClientSpec({ endpoint: input.target, credential: input.secondary, group: input.scope }, action);

  if (toolId === "github") {
    const repository = devopsValue(input, "target", /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "GitHub repository");
    const map = { status: ["auth", "status"], repositories: ["repo", "list", "--limit", "30"], pullRequests: ["pr", "list", "--limit", "30"], workflows: ["run", "list", "--limit", "30"], issues: ["issue", "list", "--limit", "30"], releases: ["release", "list", "--limit", "30"] };
    args = [...map[action]];
    if (repository && action !== "status" && action !== "repositories") args.push("--repo", repository);
  } else if (toolId === "kubernetes") {
    const context = devopsValue(input, "target", safeName, "Kubernetes context");
    const namespace = devopsValue(input, "secondary", /^[a-z0-9][a-z0-9.-]{0,62}$/, "Kubernetes namespace");
    const resource = devopsValue(input, "scope", safeName, "Kubernetes resource", action === "describe");
    const map = { cluster: ["cluster-info"], namespaces: ["get", "namespaces", "-o", "wide"], nodes: ["get", "nodes", "-o", "wide"], pods: ["get", "pods", "-o", "wide"], deployments: ["get", "deployments", "-o", "wide"], services: ["get", "services", "-o", "wide"], events: ["get", "events", "--sort-by=.lastTimestamp"], topPods: ["top", "pods"], topNodes: ["top", "nodes"], describe: ["describe", resource] };
    args = [...map[action]];
    if (context) args.push("--context", context);
    if (!["cluster", "namespaces", "nodes", "topNodes"].includes(action)) args.push(namespace ? "-n" : "-A", ...(namespace ? [namespace] : []));
  } else if (toolId === "docker") {
    const container = devopsValue(input, "target", safeName, "container or image", ["logs", "inspect", "processes"].includes(action));
    const map = { info: ["info"], containers: ["ps", "-a"], images: ["images"], networks: ["network", "ls"], volumes: ["volume", "ls"], diskUsage: ["system", "df"], stats: ["stats", "--no-stream"], logs: ["logs", "--tail", "300", container], inspect: ["inspect", container], processes: ["top", container] };
    args = [...map[action]];
  } else if (toolId === "kafka") {
    const endpoint = devopsValue(input, "target", /^[A-Za-z0-9_.-]+:\d{1,5}(?:,[A-Za-z0-9_.-]+:\d{1,5})*$/, "Kafka bootstrap server", true, 512);
    const topic = devopsValue(input, "secondary", safeName, "Kafka topic", action === "describeTopic");
    const group = devopsValue(input, "scope", safeName, "Kafka consumer group", action === "describeGroup");
    if (["topics", "describeTopic"].includes(action)) {
      args = ["--bootstrap-server", endpoint, action === "topics" ? "--list" : "--describe"];
      if (action === "describeTopic") args.push("--topic", topic);
    } else {
      command = "kafka-consumer-groups.bat";
      args = ["--bootstrap-server", endpoint, action === "groups" ? "--list" : "--describe"];
      if (action === "describeGroup") args.push("--group", group);
    }
  } else if (toolId === "terraform") {
    const map = { version: ["version"], providers: ["providers"], validate: ["validate", "-no-color"], outputs: ["output", "-no-color"], state: ["state", "list"], workspace: ["workspace", "show"] };
    args = [...map[action]];
  } else if (toolId === "helm") {
    const context = devopsValue(input, "target", safeName, "Kubernetes context");
    const namespace = devopsValue(input, "secondary", /^[a-z0-9][a-z0-9.-]{0,62}$/, "Kubernetes namespace");
    const release = devopsValue(input, "scope", safeName, "Helm release", ["status", "history", "values"].includes(action));
    const map = { releases: ["list", namespace ? "-n" : "-A", ...(namespace ? [namespace] : [])], repositories: ["repo", "list"], charts: ["search", "repo"], status: ["status", release], history: ["history", release], values: ["get", "values", release, "--all"] };
    args = [...map[action]];
    if (context && !["repositories", "charts"].includes(action)) args.push("--kube-context", context);
    if (namespace && ["status", "history", "values"].includes(action)) args.push("-n", namespace);
  } else if (toolId === "git") {
    const map = { version: ["--version"], status: ["status", "--short", "--branch"], branches: ["branch", "--all"], remotes: ["remote", "-v"], commits: ["log", "--oneline", "--decorate", "-n", "30"], diff: ["diff", "--stat"] };
    args = [...map[action]];
  } else if (toolId === "ssh") {
    const host = ["configuration", "connectivity"].includes(action) ? normalizeSshHost(input.target) : "";
    const map = { version: ["-V"], configuration: ["-G", host], connectivity: ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=yes", host, "exit"] };
    args = [...map[action]];
  } else if (toolId === "aws") {
    const profile = devopsValue(input, "target", /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/, "AWS profile");
    const region = devopsValue(input, "secondary", /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/, "AWS region");
    const prefix = [...(profile ? ["--profile", profile] : []), ...(region ? ["--region", region] : [])];
    const map = { identity: ["sts", "get-caller-identity", "--output", "json"], regions: ["ec2", "describe-regions", "--output", "table"], eksClusters: ["eks", "list-clusters", "--output", "table"], ecsClusters: ["ecs", "list-clusters", "--output", "table"] };
    args = [...prefix, ...map[action]];
  } else if (toolId === "azure") {
    const subscription = devopsValue(input, "target", safeLoose, "Azure subscription", false, 255);
    const map = { account: ["account", "show", "--output", "json"], subscriptions: ["account", "list", "--output", "table"], resourceGroups: ["group", "list", "--output", "table"], aksClusters: ["aks", "list", "--output", "table"] };
    args = [...map[action], ...(subscription && action !== "subscriptions" ? ["--subscription", subscription] : [])];
  } else if (toolId === "gcloud") {
    const project = devopsValue(input, "target", /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/, "Google Cloud project");
    const prefix = project ? ["--project", project] : [];
    const map = { account: ["auth", "list"], project: ["config", "get-value", "project"], config: ["config", "list"], clusters: ["container", "clusters", "list"], sqlInstances: ["sql", "instances", "list"] };
    args = [...prefix, ...map[action]];
  } else if (toolId === "databricks") {
    const profile = devopsValue(input, "target", /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/, "Databricks profile");
    const map = { profiles: ["auth", "profiles"], clusters: ["clusters", "list", "--output", "json"], jobs: ["jobs", "list", "--output", "json"], warehouses: ["warehouses", "list", "--output", "json"] };
    args = [...map[action], ...(profile && action !== "profiles" ? ["--profile", profile] : [])];
  } else if (toolId === "snowflake") {
    const connection = devopsValue(input, "target", /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/, "SnowSQL connection");
    const prefix = connection ? ["-c", connection] : [];
    const queries = { context: "select current_user(), current_account(), current_region(), current_warehouse()", recentQueries: "select start_time, query_id, user_name, warehouse_name, execution_status, total_elapsed_time, error_code from table(information_schema.query_history(dateadd('hour',-1,current_timestamp()),current_timestamp(),result_limit=>50)) order by start_time desc", warehouses: "show warehouses" };
    args = action === "version" ? ["-v"] : [...prefix, "-q", queries[action], "-o", "friendly=false"];
  } else if (toolId === "ansible") {
    const map = { version: ["--version"] };
    if (["inventory", "graph"].includes(action)) {
      command = "ansible-inventory";
      args = [action === "inventory" ? "--list" : "--graph"];
    } else if (action === "config") {
      command = "ansible-config";
      args = ["dump", "--only-changed"];
    } else args = [...map[action]];
  } else if (toolId === "podman") {
    const container = devopsValue(input, "target", safeName, "container or image", ["logs", "inspect", "processes"].includes(action));
    const map = { info: ["info"], containers: ["ps", "-a"], images: ["images"], networks: ["network", "ls"], volumes: ["volume", "ls"], diskUsage: ["system", "df"], stats: ["stats", "--no-stream"], logs: ["logs", "--tail", "300", container], inspect: ["inspect", container], processes: ["top", container] };
    args = [...map[action]];
  } else if (toolId === "argocd") {
    const map = { version: ["version", "--client", "--short"], applications: ["app", "list"], clusters: ["cluster", "list"], repositories: ["repo", "list"], projects: ["proj", "list"] };
    args = [...map[action]];
  } else if (toolId === "vault") {
    const map = { status: ["status", "-format=json"], secrets: ["secrets", "list", "-format=json"], auth: ["auth", "list", "-format=json"], policies: ["policy", "list", "-format=json"] };
    args = [...map[action]];
  } else if (toolId === "tofu") {
    const map = { version: ["version"], providers: ["providers"], validate: ["validate", "-no-color"], outputs: ["output", "-no-color"], state: ["state", "list"], workspace: ["workspace", "show"] };
    args = [...map[action]];
  } else if (toolId === "nomad") {
    const allocation = devopsValue(input, "target", safeName, "allocation ID", action === "allocations");
    const map = { status: ["status"], nodes: ["node", "status"], jobs: ["job", "status"], servers: ["server", "members"], allocations: ["alloc", "status", allocation] };
    args = [...map[action]];
  }

  return { command, args, displayCommand: commandText(command, args) };
}

function kubernetesTopologyCommand(input) {
  const safeName = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,254}$/;
  const context = devopsValue(input, "context", safeName, "Kubernetes context");
  const namespace = devopsValue(input, "namespace", /^[a-z0-9][a-z0-9.-]{0,62}$/, "Kubernetes namespace");
  const args = ["get", "deployments,pods,services", "-o", "json", ...(context ? ["--context", context] : []), ...(namespace ? ["-n", namespace] : ["-A"])];
  return { command: "kubectl", args, displayCommand: commandText("kubectl", args) };
}

function githubPipelineCommand(input) {
  const repository = devopsValue(input, "repository", /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "GitHub repository");
  const args = ["run", "list", "--limit", "30", "--json", "databaseId,name,workflowName,status,conclusion,createdAt,updatedAt,headBranch,headSha,event,url", ...(repository ? ["--repo", repository] : [])];
  return { command: "gh", args, displayCommand: commandText("gh", args) };
}

function kafkaLagCommand(input) {
  const endpoint = devopsValue(input, "endpoint", /^[A-Za-z0-9_.-]+:\d{1,5}(?:,[A-Za-z0-9_.-]+:\d{1,5})*$/, "Kafka bootstrap server", true, 512);
  const group = devopsValue(input, "group", /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,254}$/, "Kafka consumer group");
  const args = ["--bootstrap-server", endpoint, "--describe", ...(group ? ["--group", group] : ["--all-groups"])];
  return { command: "kafka-consumer-groups.bat", args, displayCommand: commandText("kafka-consumer-groups.bat", args) };
}

function kubernetesDashboardSpecs(input) {
  const safeName = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,254}$/;
  const context = devopsValue(input, "context", safeName, "Kubernetes context");
  const namespace = devopsValue(input, "namespace", /^[a-z0-9][a-z0-9.-]{0,62}$/, "Kubernetes namespace");
  const contextArgs = context ? ["--context", context] : [];
  const scopeArgs = namespace ? ["-n", namespace] : ["-A"];
  const spec = (id, args, required = false) => ({ id, command: "kubectl", args: [...args, ...contextArgs], required, displayCommand: commandText("kubectl", [...args, ...contextArgs]) });
  return [
    spec("nodes", ["get", "nodes", "-o", "json"], true),
    spec("workloads", ["get", "deployments,pods,services", "-o", "json", ...scopeArgs], true),
    spec("nodeMetrics", ["top", "nodes", "--no-headers"]),
    spec("podMetrics", ["top", "pods", "--no-headers", ...scopeArgs]),
    spec("events", ["get", "events", "-o", "json", "--field-selector", "type=Warning", ...scopeArgs]),
  ];
}

function dockerDashboardSpecs() {
  const json = "{{json .}}";
  const spec = (id, args, required = false) => ({ id, command: "docker", args, required, displayCommand: commandText("docker", args) });
  return [
    spec("info", ["info", "--format", json], true),
    spec("containers", ["ps", "-a", "--no-trunc", "--format", json], true),
    spec("stats", ["stats", "--no-stream", "--format", json]),
    spec("images", ["images", "--format", json]),
    spec("networks", ["network", "ls", "--format", json]),
    spec("volumes", ["volume", "ls", "--format", json]),
    spec("diskUsage", ["system", "df", "--format", json]),
  ];
}

function containerWriteActionSpec(input, requireConfirmation = true) {
  if (input.accessMode !== "read-write" || (requireConfirmation && input.confirmation !== "APPLY CONTAINER CHANGE")) throw new Error("Read-write mode and explicit confirmation are required for container changes");
  const platform = String(input.platform || "").toLowerCase(); const action = String(input.action || "");
  const changeReference = devopsValue(input, "changeReference", /^[A-Za-z0-9][A-Za-z0-9 _./:#-]{0,99}$/, "Change reference", false, 100);
  if (platform === "kubernetes") {
    const approved = new Set(["restartDeployment", "scaleDeployment", "deletePod"]); if (!approved.has(action)) throw new Error("Select an approved Kubernetes write action");
    const context = devopsValue(input, "context", /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,254}$/, "Kubernetes context");
    const namespace = devopsValue(input, "namespace", /^[a-z0-9][a-z0-9.-]{0,62}$/, "Kubernetes namespace", true, 63);
    const target = devopsValue(input, "target", /^[a-z0-9][a-z0-9.-]{0,252}$/, action === "deletePod" ? "Pod name" : "Deployment name", true, 253);
    const prefix = [...(context ? ["--context", context] : []), "-n", namespace]; let args;
    if (action === "restartDeployment") args = [...prefix, "rollout", "restart", `deployment/${target}`];
    else if (action === "deletePod") args = [...prefix, "delete", `pod/${target}`, "--wait=false"];
    else {
      const raw = String(input.value ?? "").trim(); const replicas = Number(raw); if (!/^\d{1,4}$/.test(raw) || !Number.isInteger(replicas) || replicas < 0 || replicas > 1000) throw new Error("Replica count must be a whole number from 0 to 1,000");
      args = [...prefix, "scale", `deployment/${target}`, "--replicas", String(replicas)];
    }
    return { command: "kubectl", args, displayCommand: commandText("kubectl", args), platform, action, target, namespace, context, changeReference };
  }
  if (platform === "docker") {
    const actionArgs = { startContainer: ["start"], stopContainer: ["stop", "--time", "30"], restartContainer: ["restart", "--time", "30"], pauseContainer: ["pause"], unpauseContainer: ["unpause"] };
    if (!actionArgs[action]) throw new Error("Select an approved Docker write action");
    const target = devopsValue(input, "target", /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/, "Container name or ID", true, 128); const args = [...actionArgs[action], target];
    return { command: "docker", args, displayCommand: commandText("docker", args), platform, action, target, changeReference };
  }
  throw new Error("Select Kubernetes or Docker for this container action");
}

function containerPreflightSpec(spec) {
  if (spec.platform === "kubernetes") {
    const permission = spec.action === "deletePod" ? ["delete", "pods"] : spec.action === "scaleDeployment" ? ["update", "deployments/scale"] : ["patch", "deployments"];
    const args = [...(spec.context ? ["--context", spec.context] : []), "-n", spec.namespace, "auth", "can-i", ...permission];
    return { command: "kubectl", args, displayCommand: commandText("kubectl", args), pass: (result) => result.code === 0 && /^yes\b/im.test(result.stdout) };
  }
  const args = ["info", "--format", "{{.ServerVersion}}"]; return { command: "docker", args, displayCommand: commandText("docker", args), pass: (result) => result.code === 0 && Boolean(result.stdout.trim()) };
}

async function collectDashboardSections(specs, missingMessage) {
  const found = await available(specs[0].command);
  if (!found.available) throw new Error(missingMessage);
  const started = Date.now();
  const results = await Promise.all(specs.map(async (spec) => {
    try { const result = await run(spec.command, spec.args, { timeoutMs: 45000 }); return [spec.id, { required: spec.required, displayCommand: spec.displayCommand, ...result }]; }
    catch (error) { return [spec.id, { required: spec.required, displayCommand: spec.displayCommand, code: -1, timedOut: false, truncated: false, stdout: "", stderr: error.message }]; }
  }));
  const sections = Object.fromEntries(results); const failed = Object.entries(sections).filter(([, section]) => section.required && section.code !== 0);
  return { ok: !failed.length, error: failed.length ? failed.map(([id, section]) => `${id}: ${section.stderr || section.stdout || "collection failed"}`).join("; ") : undefined, durationMs: Date.now() - started, collectedAt: new Date().toISOString(), sections };
}

const goldenGateActions = new Set(["overview", "lag", "messages", "extract", "replicat", "checkpoints", "versions"]);

function validateGoldenGateEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 512 || /[\r\n\0\s]/.test(raw)) throw new Error("Enter the GoldenGate Administration Service URL");
  let endpoint;
  try { endpoint = new URL(raw); } catch { throw new Error("Enter a valid GoldenGate http or https URL"); }
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || !endpoint.hostname) throw new Error("Enter a valid GoldenGate http or https URL without inline credentials");
  if (!/^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/.test(endpoint.hostname)) throw new Error("Enter a valid GoldenGate server hostname");
  if (endpoint.port && (Number(endpoint.port) < 1 || Number(endpoint.port) > 65535)) throw new Error("GoldenGate port must be between 1 and 65535");
  if (!/^[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(`${endpoint.pathname}${endpoint.search}`)) throw new Error("The GoldenGate URL contains unsupported characters");
  endpoint.hash = "";
  return endpoint.toString().replace(/\/$/, endpoint.pathname === "/" ? "" : "/");
}

function goldenGateCommandLines(action, group) {
  if (!goldenGateActions.has(action)) throw new Error("Select an approved GoldenGate diagnostic");
  if (["extract", "replicat", "checkpoints"].includes(action) && !group) throw new Error("Enter an Extract or Replicat group name for this diagnostic");
  if (action === "overview") return ["INFO ALL"];
  if (action === "lag") return ["INFO ALL", "LAG EXTRACT *", "LAG REPLICAT *"];
  if (action === "messages") return ["VIEW MESSAGES"];
  if (action === "extract") return [`INFO EXTRACT ${group} DETAIL`, `LAG EXTRACT ${group}`];
  if (action === "replicat") return [`INFO REPLICAT ${group} DETAIL`, `LAG REPLICAT ${group}`];
  if (action === "checkpoints") return [`INFO EXTRACT ${group} SHOWCH`, `INFO REPLICAT ${group} SHOWCH`];
  return ["VERSIONS"];
}

function goldenGateAdminClientSpec(input, requestedAction) {
  const action = String(requestedAction || input.action || "overview").toLowerCase();
  if (action === "version") return { command: "adminclient", args: ["-v"], displayCommand: "adminclient -v" };
  const endpoint = validateGoldenGateEndpoint(input.endpoint);
  const credential = String(input.credential || "").trim();
  const deployment = String(input.deployment || "").trim();
  const group = String(input.group || "").trim().toUpperCase();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(credential)) throw new Error("Enter an approved GoldenGate wallet credential alias");
  if (deployment && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(deployment)) throw new Error("Enter a valid GoldenGate deployment name");
  if (group && !/^[A-Z0-9][A-Z0-9_$-]{0,127}$/.test(group)) throw new Error("Enter a valid GoldenGate process group name");
  const commands = goldenGateCommandLines(action, group);
  const connect = `CONNECT ${endpoint}${deployment ? ` DEPLOYMENT ${deployment}` : ""} AS ${credential}`;
  return { command: "adminclient", args: [], stdin: `${connect}\n${commands.join("\n")}\nEXIT\n`, displayCommand: `adminclient · ${action} · ${endpoint}${deployment ? ` · ${deployment}` : ""}`, endpoint, action, group, architecture: "microservices" };
}

function goldenGateClassicSpec(input) {
  const action = String(input.action || "overview").toLowerCase();
  if (action === "messages") throw new Error("Use the live server log monitor for Classic Architecture messages");
  const host = String(input.host || "").trim(); const user = String(input.user || "").trim(); const port = String(input.port || "22").trim(); const identityFile = String(input.identityFile || "").trim();
  const home = String(input.home || "").trim().replace(/\/$/, ""); const group = String(input.group || "").trim().toUpperCase();
  if (!/^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/.test(host)) throw new Error("Enter a valid GoldenGate SSH hostname or IP address");
  if (!/^[A-Za-z0-9._@-]{1,128}$/.test(user)) throw new Error("Enter a valid GoldenGate SSH username");
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("SSH port must be between 1 and 65535");
  if (!/^\/[A-Za-z0-9_./-]{1,511}$/.test(home) || home.includes("..")) throw new Error("Enter an absolute GoldenGate home without spaces or parent traversal");
  if (group && !/^[A-Z0-9][A-Z0-9_$-]{0,127}$/.test(group)) throw new Error("Enter a valid GoldenGate process group name");
  const commands = goldenGateCommandLines(action, group);
  const args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "StrictHostKeyChecking=yes", "-p", port];
  if (identityFile) args.push("-i", resolve(identityFile));
  args.push(`${user}@${host}`);
  const quotedCommands = [...commands, "EXIT"].map((line) => `'${line.replaceAll("'", "'\\''")}'`).join(" ");
  args.push(`cd -- '${home}' && printf '%s\\n' ${quotedCommands} | ./ggsci`);
  return { command: "ssh", args, displayCommand: `ssh ${user}@${host} · ggsci ${action}`, action, group, architecture: "classic", server: host };
}

function goldenGateLagSeconds(value) {
  const match = String(value || "").match(/(\d+):(\d{2}):(\d{2})/); return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
}

function parseGoldenGateDiagnostics(output) {
  const text = String(output || ""); const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); const processes = [];
  const statusPattern = /^(MANAGER|EXTRACT|REPLICAT|DISTSRVR|RECVSRVR|ADMINSRVR|PMSRVR)\s+(RUNNING|STARTING|STOPPED|ABENDED|SUSPENDED)\s*([^\s]*)?\s*(\d+:\d{2}:\d{2})?/i;
  for (const line of lines) { const match = line.match(statusPattern); if (!match) continue; const lagText = match[4] || line.match(/\d+:\d{2}:\d{2}/)?.[0] || "00:00:00"; processes.push({ type: match[1].toUpperCase(), status: match[2].toUpperCase(), group: match[3] && !/^\d+:/.test(match[3]) ? match[3] : "—", lag: lagText, lagSeconds: goldenGateLagSeconds(lagText), raw: line.slice(0, 1000) }); }
  const codes = [...new Set([...text.matchAll(/\b(?:OGG|ORA)-\d{5}\b/gi)].map((match) => match[0].toUpperCase()))].slice(0, 100);
  const errorLines = lines.filter((line) => /\b(?:ERROR|WARNING|FATAL|ABEND(?:ED)?|OGG-\d{5}|ORA-\d{5})\b/i.test(line)).slice(0, 100);
  const counts = { running: processes.filter((process) => process.status === "RUNNING").length, starting: processes.filter((process) => process.status === "STARTING").length, stopped: processes.filter((process) => process.status === "STOPPED").length, abended: processes.filter((process) => process.status === "ABENDED").length, suspended: processes.filter((process) => process.status === "SUSPENDED").length };
  const maxLagSeconds = Math.max(0, ...processes.map((process) => process.lagSeconds), ...[...text.matchAll(/\b(?:lag|checkpoint lag)[^\r\n]*?(\d+:\d{2}:\d{2})/gi)].map((match) => goldenGateLagSeconds(match[1])));
  const findings = [];
  if (counts.abended) findings.push({ severity: "CRITICAL", title: `${counts.abended} process${counts.abended === 1 ? "" : "es"} ABENDED`, evidence: "Review the first OGG/ORA error before the ABEND in ggserr.log and the process report.", recommendation: "Capture the report, discard file, checkpoint and database/network evidence. Do not restart repeatedly until the cause is understood." });
  if (counts.suspended) findings.push({ severity: "HIGH", title: "GoldenGate process suspended", evidence: "A process is waiting in SUSPENDED state, possibly due to an EVENTACTIONS rule.", recommendation: "Inspect STATUS and report evidence, then coordinate any RESUME action with the replication owner." });
  if (counts.stopped) findings.push({ severity: "HIGH", title: `${counts.stopped} process${counts.stopped === 1 ? " is" : "es are"} stopped`, evidence: "Stopped replication can increase trail retention and recovery time.", recommendation: "Confirm whether the stop is planned; review checkpoints and logs before an authorized start." });
  if (maxLagSeconds >= 1800) findings.push({ severity: "CRITICAL", title: "Replication lag exceeds 30 minutes", evidence: `Maximum detected lag is ${maxLagSeconds.toLocaleString()} seconds.`, recommendation: "Separate source capture, trail transport and target apply lag; check long transactions, target waits, network throughput and trail growth." });
  else if (maxLagSeconds >= 300) findings.push({ severity: "HIGH", title: "Replication lag exceeds 5 minutes", evidence: `Maximum detected lag is ${maxLagSeconds.toLocaleString()} seconds.`, recommendation: "Compare Extract and Replicat lag, then inspect checkpoints, database load, network and report messages before tuning." });
  if (/no space|disk full|write.*trail|error opening.*trail|OGG-01091/i.test(text)) findings.push({ severity: "CRITICAL", title: "Trail or filesystem write risk", evidence: "Output contains a disk-space, trail-write or trail-open signal.", recommendation: "Check approved filesystem capacity and trail retention immediately; avoid deleting trails manually." });
  if (/connection refused|network.*error|socket|tcp\/ip|timeout|OGG-01224/i.test(text)) findings.push({ severity: "HIGH", title: "Network or endpoint connectivity signal", evidence: "GoldenGate reported a connection, socket or timeout condition.", recommendation: "Validate DNS, listener/service availability, routes, TLS trust and firewall policy from the GoldenGate server." });
  if (/long transaction|open transaction|transaction.*active/i.test(text)) findings.push({ severity: "MEDIUM", title: "Long-running transaction signal", evidence: "A long or open transaction can hold Extract checkpoints and inflate lag.", recommendation: "Identify the source transaction and business owner; do not terminate it from DBridge." });
  if (/checkpoint.*(?:not|stale|failed|error)|has not checkpointed/i.test(text)) findings.push({ severity: "HIGH", title: "Checkpoint progress needs review", evidence: "The output indicates stale or failed checkpoint progress.", recommendation: "Run STATUS and detailed checkpoint diagnostics, then distinguish active large-transaction work from a stalled process." });
  if (!findings.length) findings.push({ severity: "INFO", title: "No critical GoldenGate signal detected", evidence: `${processes.length} process row${processes.length === 1 ? "" : "s"}, ${codes.length} unique OGG/ORA code${codes.length === 1 ? "" : "s"}, maximum lag ${maxLagSeconds} seconds.`, recommendation: "Continue monitoring ggserr.log, report files, process lag and checkpoint age against the application service level." });
  return { processes, counts, maxLagSeconds, codes, errorLines, findings, lines: lines.length };
}

const tuningChecks = {
  oracle: {
    instance: { label: "Instance health", guidance: "Confirm availability, startup time, archive state and restricted logins.", sql: "select instance_name, host_name, version, status, database_status, startup_time, archiver, logins from v$instance" },
    waits: { label: "Wait classes", guidance: "Review the largest non-idle wait classes before tuning SQL or storage.", sql: "select wait_class, round(time_waited/100,2) seconds_waited, total_waits from v$system_wait_class where wait_class <> 'Idle' order by time_waited desc fetch first 25 rows only" },
    blockers: { label: "Blocking sessions", guidance: "Identify blocking sessions and coordinate before any kill or rollback action.", sql: "select sid, serial#, username, status, event, wait_class, seconds_in_wait, blocking_instance, blocking_session, sql_id, machine, program from v$session where blocking_session is not null order by seconds_in_wait desc" },
    io: { label: "I/O pressure", guidance: "Use high User I/O events to focus storage latency and SQL access-path analysis.", sql: "select event, total_waits, round(time_waited/100,2) seconds_waited, round(average_wait/100,3) average_seconds from v$system_event where wait_class='User I/O' order by time_waited desc fetch first 25 rows only" },
    memory: { label: "SGA memory", guidance: "Inspect major SGA allocations and resizeable components before memory changes.", sql: "select name, round(bytes/1024/1024,2) mb, resizeable from v$sgainfo order by bytes desc" },
    topSql: { label: "Top SQL", guidance: "Rank statements by elapsed time, then compare executions, CPU, reads and rows before tuning.", sql: "select sql_id, plan_hash_value, executions, round(elapsed_time/1000000,3) elapsed_seconds, round(cpu_time/1000000,3) cpu_seconds, buffer_gets, disk_reads, rows_processed, last_active_time from v$sql where executions > 0 order by elapsed_time desc fetch first 25 rows only" },
    tablespaces: { label: "Tablespace capacity", guidance: "Review allocated, free and used percentages before storage reaches operational thresholds.", sql: "select df.tablespace_name, round(df.allocated_mb,1) allocated_mb, round(nvl(fs.free_mb,0),1) free_mb, round(100*(df.allocated_mb-nvl(fs.free_mb,0))/nullif(df.allocated_mb,0),2) used_pct from (select tablespace_name,sum(bytes)/1024/1024 allocated_mb from dba_data_files group by tablespace_name) df left join (select tablespace_name,sum(bytes)/1024/1024 free_mb from dba_free_space group by tablespace_name) fs on fs.tablespace_name=df.tablespace_name order by used_pct desc" },
    invalidObjects: { label: "Invalid objects", guidance: "Identify invalid application and database objects before releases or incident analysis.", sql: "select owner, object_type, count(*) invalid_count from dba_objects where status='INVALID' group by owner, object_type order by invalid_count desc fetch first 100 rows only" },
    jobs: { label: "Scheduler jobs", guidance: "Review running, failed and long scheduler activity without modifying job state.", sql: "select owner, job_name, status, actual_start_date, run_duration, error#, additional_info from dba_scheduler_job_run_details where log_date > systimestamp - interval '24' hour order by log_date desc fetch first 100 rows only" },
    redo: { label: "Redo configuration", guidance: "Confirm redo groups, members, sizes and current status before investigating switch pressure.", sql: "select l.group#, l.thread#, l.sequence#, l.bytes/1024/1024 size_mb, l.members, l.archived, l.status, lf.member from v$log l join v$logfile lf on lf.group#=l.group# order by l.thread#, l.group#, lf.member" },
  },
  postgres: {
    activity: { label: "Active workload", guidance: "Review long-running sessions, state and wait events.", sql: "select pid, usename, datname, application_name, client_addr, state, wait_event_type, wait_event, now()-query_start runtime, left(query,500) query from pg_stat_activity where state <> 'idle' and pid <> pg_backend_pid() order by query_start" },
    blockers: { label: "Blocking sessions", guidance: "Trace blocked PIDs to their blockers before changing locks or sessions.", sql: "select pid blocked_pid, usename blocked_user, pg_blocking_pids(pid) blocking_pids, now()-query_start blocked_for, left(query,500) blocked_query from pg_stat_activity where cardinality(pg_blocking_pids(pid)) > 0 order by query_start" },
    cache: { label: "Cache efficiency", guidance: "Low hit ratios can indicate cold data, undersized memory or scan-heavy SQL.", sql: "select datname, blks_read, blks_hit, round(100.0*blks_hit/greatest(blks_hit+blks_read,1),2) cache_hit_pct, temp_files, temp_bytes, deadlocks from pg_stat_database where datname is not null order by blks_read desc" },
    topQueries: { label: "Expensive queries", guidance: "Compare total and mean execution time with reads and temporary writes.", sql: "select queryid, calls, round(total_exec_time::numeric,2) total_ms, round(mean_exec_time::numeric,2) mean_ms, rows, shared_blks_hit, shared_blks_read, temp_blks_written, left(query,500) query from pg_stat_statements order by total_exec_time desc limit 25" },
    databaseIO: { label: "Database I/O", guidance: "Focus on databases with high read/write time, temporary bytes or deadlocks.", sql: "select datname, xact_commit, xact_rollback, blks_read, blks_hit, temp_files, pg_size_pretty(temp_bytes) temp_size, deadlocks, blk_read_time, blk_write_time from pg_stat_database where datname is not null order by coalesce(blk_read_time,0)+coalesce(blk_write_time,0) desc" },
    indexes: { label: "Index usage", guidance: "Find large or write-heavy indexes with low scan counts before considering index changes.", sql: "select schemaname, relname table_name, indexrelname index_name, idx_scan, idx_tup_read, idx_tup_fetch, pg_size_pretty(pg_relation_size(indexrelid)) index_size from pg_stat_user_indexes order by idx_scan asc, pg_relation_size(indexrelid) desc limit 100" },
    tables: { label: "Table activity", guidance: "Compare sequential scans, index scans, live rows and dead tuples for maintenance planning.", sql: "select schemaname, relname, seq_scan, idx_scan, n_live_tup, n_dead_tup, n_tup_ins, n_tup_upd, n_tup_del, last_autoanalyze from pg_stat_user_tables order by n_dead_tup desc limit 100" },
    replication: { label: "Replication status", guidance: "Review streaming state, WAL positions and replay lag for connected standbys.", sql: "select pid, usename, application_name, client_addr, state, sync_state, write_lag, flush_lag, replay_lag, sent_lsn, replay_lsn from pg_stat_replication order by application_name" },
    maintenance: { label: "Vacuum & analyze", guidance: "Prioritize tables with dead tuples or stale vacuum and analyze timestamps.", sql: "select schemaname, relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum, vacuum_count, autovacuum_count, last_analyze, last_autoanalyze from pg_stat_user_tables order by n_dead_tup desc limit 100" },
    settings: { label: "Core settings", guidance: "Capture performance-critical settings and their source before proposing configuration changes.", sql: "select name, setting, unit, source, pending_restart from pg_settings where name in ('shared_buffers','work_mem','maintenance_work_mem','effective_cache_size','max_connections','random_page_cost','effective_io_concurrency','track_io_timing','autovacuum') order by name" },
  },
  mongodb: {
    server: { label: "Server health", guidance: "Inspect uptime, operation counters, memory, queues and assertions.", sql: "JSON.stringify(db.serverStatus(), null, 2)" },
    operations: { label: "Current operations", guidance: "Review long-running active operations and lock waits.", sql: "JSON.stringify(db.currentOp({active:true, secs_running:{$gte:1}}), null, 2)" },
    replication: { label: "Replication health", guidance: "Confirm member state, lag indicators and heartbeat health.", sql: "JSON.stringify(rs.status(), null, 2)" },
    database: { label: "Database statistics", guidance: "Review data, index and storage size with object counts.", sql: "JSON.stringify(db.stats(1024 * 1024), null, 2)" },
    connections: { label: "Connections", guidance: "Compare current and available connections, then inspect saturation causes.", sql: "JSON.stringify(db.serverStatus().connections, null, 2)" },
    collections: { label: "Collection storage", guidance: "Compare document, data, storage and index size across collections.", sql: "JSON.stringify(db.getCollectionNames().slice(0,100).map(n=>{const s=db.getCollection(n).stats(1024*1024);return {collection:n,count:s.count,sizeMB:s.size,storageMB:s.storageSize,totalIndexMB:s.totalIndexSize,avgObjSize:s.avgObjSize}}), null, 2)" },
    locks: { label: "Lock activity", guidance: "Review lock acquisition and wait modes before investigating contention.", sql: "JSON.stringify(db.serverStatus().locks, null, 2)" },
    profiler: { label: "Profiler status", guidance: "Inspect the current profiling level and recent captured slow operations when profiling is already enabled.", sql: "JSON.stringify({status:db.getProfilingStatus(),recent:db.getCollection('system.profile').find({}).sort({ts:-1}).limit(25).toArray()}, null, 2)" },
    storage: { label: "Storage engine", guidance: "Review WiredTiger cache and storage-engine metrics for eviction or cache pressure.", sql: "JSON.stringify((()=>{const s=db.serverStatus();return {storageEngine:s.storageEngine,wiredTigerCache:s.wiredTiger&&s.wiredTiger.cache}})(), null, 2)" },
    sharding: { label: "Sharding status", guidance: "Confirm shard membership and balancer metadata for sharded deployments.", sql: "JSON.stringify({shards:db.adminCommand({listShards:1}),balancer:db.getSiblingDB('config').settings.findOne({_id:'balancer'})}, null, 2)" },
  },
  mysql: {
    activity: { label: "Active workload", guidance: "Review non-sleeping sessions by runtime and current statement.", sql: "select processlist_id, processlist_user, processlist_host, processlist_db, processlist_command, processlist_time, processlist_state, left(processlist_info,500) processlist_info from performance_schema.threads where processlist_id is not null and processlist_command <> 'Sleep' order by processlist_time desc" },
    digests: { label: "Expensive digests", guidance: "Compare total time, average time and rows examined for frequent statements.", sql: "select schema_name, digest, count_star, round(sum_timer_wait/1000000000000,3) total_seconds, round(avg_timer_wait/1000000000,3) avg_ms, sum_rows_examined, sum_rows_sent, left(digest_text,500) digest_text from performance_schema.events_statements_summary_by_digest where digest_text is not null order by sum_timer_wait desc limit 25" },
    locks: { label: "Lock waits", guidance: "Map requesting and blocking transactions before coordinating remediation.", sql: "select * from performance_schema.data_lock_waits limit 100" },
    buffer: { label: "Buffer pool", guidance: "Review buffer reads, read requests, dirty pages and free pages together.", sql: "show global status where Variable_name in ('Innodb_buffer_pool_read_requests','Innodb_buffer_pool_reads','Innodb_buffer_pool_pages_dirty','Innodb_buffer_pool_pages_free','Threads_connected','Threads_running')" },
    io: { label: "File I/O", guidance: "Find files with the greatest aggregate wait and operation counts.", sql: "select file_name, event_name, count_read, round(sum_timer_read/1000000000000,3) read_seconds, count_write, round(sum_timer_write/1000000000000,3) write_seconds from performance_schema.file_summary_by_instance order by sum_timer_read+sum_timer_write desc limit 25" },
    replication: { label: "Replication status", guidance: "Review receiver, applier and lag fields for the configured replica channel.", sql: "show replica status" },
    indexes: { label: "Index inventory", guidance: "Find wide, duplicated or low-cardinality indexes for evidence-based review.", sql: "select table_schema, table_name, index_name, non_unique, seq_in_index, column_name, cardinality, index_type from information_schema.statistics where table_schema not in ('mysql','performance_schema','information_schema','sys') order by table_schema, table_name, index_name, seq_in_index limit 500" },
    tables: { label: "Table capacity", guidance: "Rank tables by total data and index allocation before storage or partitioning changes.", sql: "select table_schema, table_name, engine, table_rows, round(data_length/1024/1024,1) data_mb, round(index_length/1024/1024,1) index_mb, round((data_length+index_length)/1024/1024,1) total_mb from information_schema.tables where table_type='BASE TABLE' and table_schema not in ('mysql','performance_schema','information_schema','sys') order by data_length+index_length desc limit 100" },
    temp: { label: "Temporary & sorts", guidance: "High disk temporary tables or merge passes can indicate memory or query-shape pressure.", sql: "show global status where Variable_name in ('Created_tmp_tables','Created_tmp_disk_tables','Sort_merge_passes','Sort_rows','Select_full_join','Select_scan','Handler_read_rnd_next')" },
    settings: { label: "Core settings", guidance: "Capture major memory, connection, logging and optimizer settings before configuration review.", sql: "show global variables where Variable_name in ('max_connections','innodb_buffer_pool_size','innodb_log_file_size','tmp_table_size','max_heap_table_size','slow_query_log','long_query_time','performance_schema','optimizer_switch')" },
  },
  sqlserver: {
    activity: { label: "Active requests", guidance: "Compare elapsed time, CPU, reads and waits for executing requests.", sql: "select r.session_id, r.status, r.command, r.cpu_time, r.total_elapsed_time, r.logical_reads, r.reads, r.writes, r.wait_type, r.wait_time, r.blocking_session_id, db_name(r.database_id) database_name, left(t.text,1000) sql_text from sys.dm_exec_requests r cross apply sys.dm_exec_sql_text(r.sql_handle) t where r.session_id <> @@spid order by r.total_elapsed_time desc" },
    blockers: { label: "Blocking chain", guidance: "Use the blocking session and wait resource to trace contention safely.", sql: "select r.session_id, r.blocking_session_id, r.status, r.wait_type, r.wait_time, r.wait_resource, db_name(r.database_id) database_name, left(t.text,1000) sql_text from sys.dm_exec_requests r cross apply sys.dm_exec_sql_text(r.sql_handle) t where r.blocking_session_id > 0 order by r.wait_time desc" },
    waits: { label: "Wait statistics", guidance: "Exclude benign idle waits and investigate high resource or signal time.", sql: "select top (25) wait_type, waiting_tasks_count, wait_time_ms, signal_wait_time_ms, wait_time_ms-signal_wait_time_ms resource_wait_ms from sys.dm_os_wait_stats where wait_type not like 'SLEEP%' and waiting_tasks_count > 0 order by wait_time_ms desc" },
    io: { label: "Database file I/O", guidance: "Compare file latency using stall time divided by read and write counts.", sql: "select top (25) db_name(vfs.database_id) database_name, mf.name logical_name, mf.type_desc, vfs.num_of_reads, vfs.io_stall_read_ms, vfs.num_of_writes, vfs.io_stall_write_ms, cast(vfs.size_on_disk_bytes/1048576.0 as decimal(18,1)) size_mb from sys.dm_io_virtual_file_stats(null,null) vfs join sys.master_files mf on mf.database_id=vfs.database_id and mf.file_id=vfs.file_id order by vfs.io_stall_read_ms+vfs.io_stall_write_ms desc" },
    memory: { label: "Memory pressure", guidance: "Review process commitment, available memory and low-memory indicators.", sql: "select physical_memory_in_use_kb, locked_page_allocations_kb, large_page_allocations_kb, memory_utilization_percentage, available_commit_limit_kb, process_physical_memory_low, process_virtual_memory_low from sys.dm_os_process_memory; select total_physical_memory_kb, available_physical_memory_kb, system_memory_state_desc from sys.dm_os_sys_memory" },
    topQueries: { label: "Top query plans", guidance: "Rank cached plans by total elapsed time and compare execution count, CPU and reads.", sql: "select top (25) convert(varchar(66),qs.query_hash,1) query_hash, qs.execution_count, qs.total_worker_time, qs.total_elapsed_time, qs.total_logical_reads, qs.total_physical_reads, qs.total_rows, qs.last_execution_time, left(st.text,1000) sql_text from sys.dm_exec_query_stats qs cross apply sys.dm_exec_sql_text(qs.sql_handle) st order by qs.total_elapsed_time desc" },
    missingIndexes: { label: "Missing-index signals", guidance: "Treat missing-index DMVs as workload evidence, then test consolidation and write overhead before creation.", sql: "select top (50) db_name(mid.database_id) database_name, object_schema_name(mid.object_id,mid.database_id) schema_name, object_name(mid.object_id,mid.database_id) table_name, migs.user_seeks, migs.avg_total_user_cost, migs.avg_user_impact, mid.equality_columns, mid.inequality_columns, mid.included_columns from sys.dm_db_missing_index_group_stats migs join sys.dm_db_missing_index_groups mig on migs.group_handle=mig.index_group_handle join sys.dm_db_missing_index_details mid on mig.index_handle=mid.index_handle order by migs.avg_total_user_cost*migs.avg_user_impact*(migs.user_seeks+migs.user_scans) desc" },
    databaseSpace: { label: "Database capacity", guidance: "Review allocated database-file sizes, growth configuration and maximum size.", sql: "select db_name(database_id) database_name, name logical_name, type_desc, physical_name, cast(size/128.0 as decimal(18,1)) size_mb, growth, is_percent_growth, max_size from sys.master_files order by size desc" },
    tempdb: { label: "TempDB usage", guidance: "Compare user, internal, version-store and free pages when investigating TempDB pressure.", sql: "select sum(user_object_reserved_page_count)*8/1024.0 user_objects_mb, sum(internal_object_reserved_page_count)*8/1024.0 internal_objects_mb, sum(version_store_reserved_page_count)*8/1024.0 version_store_mb, sum(unallocated_extent_page_count)*8/1024.0 free_mb from tempdb.sys.dm_db_file_space_usage" },
    indexes: { label: "Index usage", guidance: "Compare seeks, scans, lookups and updates to find expensive or unused index candidates.", sql: "select top (100) object_schema_name(i.object_id,db_id()) schema_name, object_name(i.object_id,db_id()) table_name, i.name index_name, i.type_desc, coalesce(s.user_seeks,0) user_seeks, coalesce(s.user_scans,0) user_scans, coalesce(s.user_lookups,0) user_lookups, coalesce(s.user_updates,0) user_updates from sys.indexes i left join sys.dm_db_index_usage_stats s on s.database_id=db_id() and s.object_id=i.object_id and s.index_id=i.index_id where i.object_id>100 and i.index_id>0 order by coalesce(s.user_updates,0) desc" },
  },
};

tuningChecks.mariadb = tuningChecks.mysql;

function diagnosticSql(engine, identifier) {
  if (!/^[A-Za-z0-9_.:$-]{1,64}$/.test(identifier)) throw new Error("Invalid SQL identifier");
  if (engine === "oracle") return `select sql_id, plan_hash_value, executions, round(elapsed_time/1000000,3) elapsed_seconds, round(cpu_time/1000000,3) cpu_seconds, buffer_gets, disk_reads, rows_processed, last_active_time from v$sql where sql_id='${identifier}' order by last_active_time desc fetch first 10 rows only`;
  if (engine === "postgres") return `select queryid, calls, round(total_exec_time::numeric,2) total_ms, round(mean_exec_time::numeric,2) mean_ms, rows, shared_blks_hit, shared_blks_read, temp_blks_written, left(query,300) query from pg_stat_statements where queryid::text='${identifier}' order by total_exec_time desc limit 10`;
  if (engine === "mongodb") return `JSON.stringify(db.currentOp({$or:[{opid:${JSON.stringify(identifier)}},{"command.comment":${JSON.stringify(identifier)}}]}), null, 2)`;
  if (["mysql","mariadb"].includes(engine)) return `select schema_name, digest, count_star, round(sum_timer_wait/1000000000000,3) total_seconds, round(avg_timer_wait/1000000000,3) avg_ms, sum_rows_examined, sum_rows_sent, left(digest_text,500) digest_text from performance_schema.events_statements_summary_by_digest where digest='${identifier}' order by sum_timer_wait desc limit 10`;
  if (engine === "sqlserver") return `select top (10) convert(varchar(66),qs.query_hash,1) query_hash, qs.execution_count, qs.total_worker_time, qs.total_elapsed_time, qs.total_logical_reads, qs.total_physical_reads, qs.total_rows, qs.last_execution_time, left(st.text,1000) sql_text from sys.dm_exec_query_stats qs cross apply sys.dm_exec_sql_text(qs.sql_handle) st where convert(varchar(66),qs.query_hash,1)='${identifier}' order by qs.total_elapsed_time desc`;
  throw new Error("Diagnostics support Oracle SQL_ID, PostgreSQL queryid, MongoDB operation/comment IDs, MySQL digests and SQL Server query hashes.");
}

const recommendationCatalog = {
  oracle: { name: "Oracle", identifier: "SQL_ID", source: "V$SQL", planAction: "Inspect the current and alternate cursors with DBMS_XPLAN.DISPLAY_CURSOR, including ALLSTATS LAST, predicates and peeked binds. Validate any index, SQL rewrite, profile, patch or baseline outside production first." },
  postgres: { name: "PostgreSQL", identifier: "queryid", source: "pg_stat_statements", planAction: "Capture EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS) in an authorized non-production session. Compare estimates, actual rows, loops, spills and scan choices before changing indexes or SQL." },
  mongodb: { name: "MongoDB", identifier: "operation or comment ID", source: "currentOp", planAction: "Run explain('executionStats') for the matching operation in an authorized environment. Compare winning plan, keys examined, documents examined, returned documents and lock behavior." },
  mysql: { name: "MySQL", identifier: "statement digest", source: "performance_schema", planAction: "Use EXPLAIN ANALYZE in an authorized test session. Review estimated versus actual rows, chosen indexes, temporary tables and sort behavior before applying a change." },
  mariadb: { name: "MariaDB", identifier: "statement digest", source: "performance_schema", planAction: "Use ANALYZE or EXPLAIN in an authorized test session. Review estimated versus observed rows, chosen indexes, temporary tables and sort behavior before applying a change." },
  sqlserver: { name: "SQL Server", identifier: "query hash", source: "sys.dm_exec_query_stats", planAction: "Inspect the actual execution plan and Query Store history. Compare estimates, spills, warnings, memory grant, parameter sensitivity and plan changes before forcing or indexing." },
};

function recommendationSql(engine, identifier) {
  if (!/^[A-Za-z0-9_.:$-]{1,64}$/.test(identifier)) throw new Error("Invalid SQL identifier");
  if (engine === "oracle") return `with q as (select count(*) matched, nvl(sum(executions),0) executions, nvl(sum(elapsed_time)/1000,0) elapsed_ms, nvl(sum(cpu_time)/1000,0) cpu_ms, nvl(sum(buffer_gets),0) logical_reads, nvl(sum(disk_reads),0) physical_reads, nvl(sum(rows_processed),0) rows_processed, nvl(sum(parse_calls),0) parses, count(distinct child_number) plan_versions from v$sql where sql_id='${identifier}') select 'matched='||matched metric from q union all select 'executions='||executions from q union all select 'elapsed_ms='||elapsed_ms from q union all select 'cpu_ms='||cpu_ms from q union all select 'logical_reads='||logical_reads from q union all select 'physical_reads='||physical_reads from q union all select 'rows_processed='||rows_processed from q union all select 'parses='||parses from q union all select 'plan_versions='||plan_versions from q`;
  if (engine === "postgres") return `with q as (select count(*) matched, coalesce(sum(calls),0) executions, coalesce(sum(total_exec_time),0) elapsed_ms, coalesce(sum(shared_blks_hit+shared_blks_read),0) logical_reads, coalesce(sum(shared_blks_read),0) physical_reads, coalesce(sum(rows),0) rows_processed, coalesce(sum(temp_blks_written),0) temp_writes, coalesce(sum(shared_blks_hit),0) cache_hits, coalesce(sum(shared_blks_read),0) cache_reads from pg_stat_statements where queryid::text='${identifier}') select 'matched='||matched::text metric from q union all select 'executions='||executions::text from q union all select 'elapsed_ms='||elapsed_ms::text from q union all select 'logical_reads='||logical_reads::text from q union all select 'physical_reads='||physical_reads::text from q union all select 'rows_processed='||rows_processed::text from q union all select 'temp_writes='||temp_writes::text from q union all select 'cache_hits='||cache_hits::text from q union all select 'cache_reads='||cache_reads::text from q`;
  if (engine === "mongodb") {
    const id = JSON.stringify(identifier);
    return `JSON.stringify((()=>{const id=${id};const ids=[id];if(/^\\d+$/.test(id))ids.push(Number(id));const r=db.currentOp({$or:[{opid:{$in:ids}},{"command.comment":id}]});const ops=Array.isArray(r.inprog)?r.inprog:[];const sum=(key)=>ops.reduce((n,o)=>n+(Number(o[key])||0),0);return {matched:ops.length,executions:ops.length,elapsed_ms:ops.reduce((n,o)=>n+(Number(o.microsecs_running)||Number(o.secs_running)*1000000||0)/1000,0),rows_processed:sum("nreturned"),examined_rows:sum("docsExamined"),waiting_locks:ops.filter(o=>o.waitingForLock===true).length,collection_scans:ops.filter(o=>String(o.planSummary||"").toUpperCase().includes("COLLSCAN")).length,max_runtime_seconds:ops.reduce((n,o)=>Math.max(n,Number(o.secs_running)||0),0)};})(),null,2)`;
  }
  if (["mysql","mariadb"].includes(engine)) return `with q as (select count(*) matched, coalesce(sum(count_star),0) executions, coalesce(sum(sum_timer_wait)/1000000000,0) elapsed_ms, coalesce(sum(sum_rows_examined),0) examined_rows, coalesce(sum(sum_rows_sent),0) rows_processed, coalesce(sum(sum_created_tmp_disk_tables),0) temp_writes, coalesce(sum(sum_lock_time)/1000000000,0) lock_ms, coalesce(sum(sum_no_index_used),0) no_index from performance_schema.events_statements_summary_by_digest where digest='${identifier}') select concat('matched=',matched) metric from q union all select concat('executions=',executions) from q union all select concat('elapsed_ms=',elapsed_ms) from q union all select concat('examined_rows=',examined_rows) from q union all select concat('rows_processed=',rows_processed) from q union all select concat('temp_writes=',temp_writes) from q union all select concat('lock_ms=',lock_ms) from q union all select concat('no_index=',no_index) from q`;
  if (engine === "sqlserver") return `with q as (select count(*) matched, coalesce(sum(cast(execution_count as decimal(38,2))),0) executions, coalesce(sum(cast(total_elapsed_time as decimal(38,2)))/1000,0) elapsed_ms, coalesce(sum(cast(total_worker_time as decimal(38,2)))/1000,0) cpu_ms, coalesce(sum(cast(total_logical_reads as decimal(38,2))),0) logical_reads, coalesce(sum(cast(total_physical_reads as decimal(38,2))),0) physical_reads, coalesce(sum(cast(total_rows as decimal(38,2))),0) rows_processed, coalesce(max(plan_generation_num),0) plan_versions from sys.dm_exec_query_stats where convert(varchar(66),query_hash,1)='${identifier}') select concat('matched=',matched) metric from q union all select concat('executions=',executions) from q union all select concat('elapsed_ms=',elapsed_ms) from q union all select concat('cpu_ms=',cpu_ms) from q union all select concat('logical_reads=',logical_reads) from q union all select concat('physical_reads=',physical_reads) from q union all select concat('rows_processed=',rows_processed) from q union all select concat('plan_versions=',plan_versions) from q`;
  throw new Error("Recommendations support Oracle SQL_ID, PostgreSQL queryid, MongoDB operation/comment IDs, MySQL digests and SQL Server query hashes.");
}

function parseRecommendationMetrics(engine, stdout) {
  if (engine === "mongodb") {
    try {
      const output = String(stdout || "").trim();
      const decoded = JSON.parse(output);
      const parsed = Array.isArray(decoded) ? decoded[0] || {} : decoded || {};
      if (Array.isArray(parsed.inprog)) {
        const operations = parsed.inprog;
        const sum = (key) => operations.reduce((total, item) => total + (Number(item[key]) || 0), 0);
        return { matched: operations.length, executions: operations.length, elapsed_ms: operations.reduce((total, item) => total + (Number(item.microsecs_running) || Number(item.secs_running) * 1000000 || 0) / 1000, 0), rows_processed: sum("nreturned"), examined_rows: sum("docsExamined"), waiting_locks: operations.filter((item) => item.waitingForLock === true).length, collection_scans: operations.filter((item) => String(item.planSummary || "").toUpperCase().includes("COLLSCAN")).length, max_runtime_seconds: operations.reduce((maximum, item) => Math.max(maximum, Number(item.secs_running) || 0), 0) };
      }
      return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, Number(value) || 0]));
    } catch { return {}; }
  }
  const metrics = {};
  const matcher = /\b([a-z][a-z_]+)\s*=\s*(-?[0-9]+(?:[.,][0-9]+)?(?:e[+-]?[0-9]+)?)/gi;
  for (const match of String(stdout || "").matchAll(matcher)) {
    const raw = match[2].includes(",") && !match[2].includes(".") ? match[2].replace(",", ".") : match[2].replaceAll(",", "");
    metrics[match[1].toLowerCase()] = Number(raw);
  }
  return metrics;
}

function buildSqlRecommendations(engine, identifier, metrics, customRules = []) {
  const definition = recommendationCatalog[engine];
  if (!definition) throw new Error("Select a supported SQL identifier engine");
  const findings = [];
  const add = (severity, finding, evidence, recommendation) => findings.push({ severity, finding, evidence, recommendation });
  const number = (key) => Number(metrics[key]) || 0;
  const format = (value, digits = 1) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: digits });
  const threshold = (id, level) => Number(customRules.find((rule) => rule?.id === id)?.[level] ?? defaultInvestigationRules.find((rule) => rule.id === id)?.[level]);
  if (!Object.keys(metrics).length) {
    add("MEDIUM", "Metrics could not be parsed", `The ${definition.source} query completed but did not return recognizable metric rows.`, "Review the raw client output and confirm the database client and performance view versions are supported.");
  } else if (number("matched") < 1) {
    add("MEDIUM", "Identifier was not found in the current performance window", `${definition.source} returned zero matching records for ${definition.identifier} ${identifier}.`, "Confirm the identifier and database/service. The statement may have aged out, statistics may have reset, or the operation may no longer be active.");
  } else {
    const executions = Math.max(number("executions"), 1);
    const elapsedMs = number("elapsed_ms");
    const averageMs = elapsedMs / executions;
    const rowsPerExecution = number("rows_processed") / executions;
    add("INFO", "Workload evidence captured", `${format(number("executions"), 0)} execution(s), ${format(elapsedMs)} ms total elapsed and ${format(averageMs)} ms average elapsed.`, "Use the findings below as investigation priorities, then validate against a representative workload and execution plan.");

    const elapsedWarning = threshold("avg_elapsed_ms", "warning");
    const elapsedHigh = threshold("avg_elapsed_ms", "high");
    if (averageMs >= elapsedHigh * 10) add("CRITICAL", "Very high average elapsed time", `${format(averageMs)} ms per execution exceeds the ${format(elapsedHigh * 10)} ms critical review threshold.`, "Prioritize the execution plan, dominant waits, cardinality estimates, bind/parameter values and row-source timing before changing the statement.");
    else if (averageMs >= elapsedHigh) add("HIGH", "High average elapsed time", `${format(averageMs)} ms per execution exceeds the configured ${format(elapsedHigh)} ms high threshold.`, "Compare plan shape and wait time for slow and normal executions; isolate the operator or wait responsible for most elapsed time.");
    else if (averageMs >= elapsedWarning) add("MEDIUM", "Elevated average elapsed time", `${format(averageMs)} ms per execution exceeds the configured ${format(elapsedWarning)} ms warning threshold.`, "Review whether the latency is acceptable for this workload and compare it with the application service-level target.");

    const logicalPerExecution = number("logical_reads") / executions;
    const logicalWarning = threshold("logical_reads_per_execution", "warning");
    const logicalHigh = threshold("logical_reads_per_execution", "high");
    if (logicalPerExecution >= logicalHigh * 10) add("CRITICAL", "Extreme logical-read volume", `${format(logicalPerExecution, 0)} logical reads per execution.`, "Inspect access paths, join order, predicate selectivity and repeated scans. Test a narrower access path or SQL rewrite using representative data.");
    else if (logicalPerExecution >= logicalHigh) add("HIGH", "High logical-read volume", `${format(logicalPerExecution, 0)} logical reads per execution exceeds the configured ${format(logicalHigh, 0)}-read threshold.`, "Find the row source producing most buffers and verify filters, join keys, statistics and index coverage.");
    else if (logicalPerExecution >= logicalWarning) add("MEDIUM", "Elevated logical-read volume", `${format(logicalPerExecution, 0)} logical reads per execution exceeds the configured ${format(logicalWarning, 0)}-read warning.`, "Review the highest-buffer row source and confirm its access path is appropriate for the returned row count.");

    const physicalPerExecution = number("physical_reads") / executions;
    const physicalWarning = threshold("physical_reads_per_execution", "warning");
    const physicalHigh = threshold("physical_reads_per_execution", "high");
    if (physicalPerExecution >= physicalHigh) add("HIGH", "High physical-read volume", `${format(physicalPerExecution, 0)} physical reads per execution exceeds the configured ${format(physicalHigh, 0)}-read threshold.`, "Separate cold-cache behavior from a persistent I/O-heavy access path; review scan volume, cache efficiency and storage latency.");
    else if (physicalPerExecution >= physicalWarning) add("MEDIUM", "Elevated physical-read volume", `${format(physicalPerExecution, 0)} physical reads per execution.`, "Compare warm and cold executions and confirm the storage wait contribution before changing cache or access paths.");

    const cpuMs = number("cpu_ms");
    const cpuRatio = elapsedMs > 0 ? cpuMs / elapsedMs * 100 : 0;
    if (cpuMs > 0 && cpuRatio >= 85 && averageMs >= 100) add("MEDIUM", "CPU-dominant execution", `CPU accounts for ${format(cpuRatio)}% of elapsed time (${format(cpuMs)} ms total CPU).`, "Focus on row processing, expressions, joins, sorts, compilations and access-path efficiency; wait tuning is unlikely to be the primary lever.");
    else if (cpuMs > 0 && cpuRatio < 50 && averageMs >= 500) add("MEDIUM", "Wait-dominant execution", `CPU accounts for only ${format(cpuRatio)}% of elapsed time; approximately ${format(elapsedMs - cpuMs)} ms is outside CPU.`, "Correlate the statement with database wait events, blocking, I/O and remote-call latency before rewriting SQL.");

    if (rowsPerExecution >= 100000) add("MEDIUM", "Large result or row-processing volume", `${format(rowsPerExecution, 0)} rows are processed or returned per execution.`, "Confirm the volume is required. Review filters, pagination, aggregation placement and batch boundaries before tuning only the plan.");
    const examinedPerExecution = number("examined_rows") / executions;
    const examinedRatio = number("rows_processed") > 0 ? number("examined_rows") / number("rows_processed") : number("examined_rows");
    const examinedWarning = threshold("examined_ratio", "warning");
    const examinedHigh = threshold("examined_ratio", "high");
    if (examinedPerExecution >= 10000 && examinedRatio >= examinedHigh) add("HIGH", "Many rows examined for each row returned", `${format(examinedPerExecution, 0)} rows examined per execution and a ${format(examinedRatio)}:1 examined-to-returned ratio.`, "Review predicate selectivity and index alignment. Confirm the filter and sort fields can use a selective access path.");
    else if (examinedPerExecution >= 10000 && examinedRatio >= examinedWarning) add("MEDIUM", "Examined-to-returned ratio needs review", `${format(examinedRatio)} rows are examined for each row returned.`, "Confirm the operation uses the intended filter and sort index, and check whether the returned volume is representative.");
    if (number("temp_writes") > 0) add("MEDIUM", "Temporary work was written", `${format(number("temp_writes"), 0)} temporary block/table write signal(s) were recorded.`, "Inspect sorts, hashes, grouping and intermediate row counts. Reduce rows earlier before considering carefully scoped memory changes.");
    if (number("lock_ms") >= 1000 || number("waiting_locks") > 0) add("HIGH", "Lock waiting is present", number("waiting_locks") > 0 ? `${format(number("waiting_locks"), 0)} matching operation(s) are waiting for a lock.` : `${format(number("lock_ms"))} ms cumulative lock time.`, "Identify the blocker and transaction scope. Coordinate remediation; do not kill sessions or change isolation based only on this snapshot.");
    if (number("no_index") > 0) add("HIGH", "Executions reported no usable index", `${format(number("no_index"), 0)} execution(s) recorded the no-index signal.`, "Use the actual plan to verify the scan. Test a consolidated index or SQL change and measure write, storage and maintenance cost before deployment.");
    const cacheTotal = number("cache_hits") + number("cache_reads");
    const hitRatio = cacheTotal > 0 ? number("cache_hits") / cacheTotal * 100 : 100;
    if (cacheTotal > 0 && hitRatio < 90) add("MEDIUM", "Low statement block-cache hit ratio", `${format(hitRatio)}% of referenced blocks were cache hits.`, "Check whether the sample includes a cold cache, then review scan volume and working-set pressure before resizing memory.");
    if (number("parses") / executions > .5 && executions >= 10) add("MEDIUM", "High parse-to-execution ratio", `${format(number("parses"), 0)} parses for ${format(executions, 0)} executions.`, "Review cursor reuse, bind usage and session cursor configuration. Check child-cursor reasons before changing shared-pool settings.");
    const versionsWarning = threshold("plan_versions", "warning");
    const versionsHigh = threshold("plan_versions", "high");
    if (number("plan_versions") >= versionsHigh) add("HIGH", "Many plan or cursor versions", `${format(number("plan_versions"), 0)} plan/cursor versions were observed.`, "Compare child-cursor or recompile reasons, statistics changes, bind sensitivity and plan history before forcing a plan.");
    else if (number("plan_versions") >= versionsWarning) add("MEDIUM", "Plan stability needs review", `${format(number("plan_versions"), 0)} plan/cursor versions were observed.`, "Compare plan hashes and runtimes over time; determine whether the variation reflects data, parameters, recompiles or environment changes.");
    if (number("collection_scans") > 0) add("HIGH", "Collection scan detected", `${format(number("collection_scans"), 0)} matching MongoDB operation(s) report COLLSCAN.`, "Use executionStats to validate selectivity and test an index whose leading fields match the filter and sort pattern.");
    const runtimeWarning = threshold("long_runtime_seconds", "warning");
    const runtimeHigh = threshold("long_runtime_seconds", "high");
    if (number("max_runtime_seconds") >= runtimeHigh) add("CRITICAL", "Operation exceeds the critical runtime threshold", `Longest matching operation: ${format(number("max_runtime_seconds"))} seconds.`, "Confirm business impact, blocking and progress with the application owner before any cancellation. Capture the plan and operation context first.");
    else if (number("max_runtime_seconds") >= runtimeWarning) add("HIGH", "Long-running active operation", `Longest matching operation: ${format(number("max_runtime_seconds"))} seconds.`, "Inspect the active plan, locks and examined/returned ratio; coordinate with the owner before interrupting it.");
  }
  add("INFO", "Validate the execution plan before applying a change", `${definition.name} recommendations are based on a point-in-time ${definition.source} snapshot.`, definition.planAction);
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) summary[finding.severity.toLowerCase()] += 1;
  return { findings, summary };
}

function performanceSampleSql(engine) {
  if (engine === "oracle") return "with a as (select count(*) active_sessions, sum(case when state='WAITING' and wait_class<>'Idle' then 1 else 0 end) waiting_sessions from v$session where status='ACTIVE' and type='USER'), q as (select nvl(sum(executions),0) executions, nvl(sum(elapsed_time)/1000/nullif(sum(executions),0),0) avg_elapsed_ms, nvl(sum(buffer_gets),0) logical_reads, nvl(sum(disk_reads),0) physical_reads from v$sql where last_active_time > sysdate-5/1440) select 'active_sessions='||active_sessions metric from a union all select 'waiting_sessions='||waiting_sessions from a union all select 'executions='||executions from q union all select 'avg_elapsed_ms='||avg_elapsed_ms from q union all select 'logical_reads='||logical_reads from q union all select 'physical_reads='||physical_reads from q union all select 'throughput='||executions from q union all select 'errors=0' from dual";
  if (engine === "postgres") return "with a as (select count(*) filter(where state='active') active_sessions, count(*) filter(where state='active' and wait_event_type is not null) waiting_sessions from pg_stat_activity where pid<>pg_backend_pid()), q as (select coalesce(sum(calls),0) executions, coalesce(sum(total_exec_time)/nullif(sum(calls),0),0) avg_elapsed_ms, coalesce(sum(shared_blks_hit+shared_blks_read),0) logical_reads, coalesce(sum(shared_blks_read),0) physical_reads from pg_stat_statements) select 'active_sessions='||active_sessions::text metric from a union all select 'waiting_sessions='||waiting_sessions::text from a union all select 'executions='||executions::text from q union all select 'avg_elapsed_ms='||avg_elapsed_ms::text from q union all select 'logical_reads='||logical_reads::text from q union all select 'physical_reads='||physical_reads::text from q union all select 'throughput='||executions::text from q union all select 'errors='||coalesce((select sum(xact_rollback+deadlocks) from pg_stat_database),0)::text";
  if (engine === "mongodb") return "JSON.stringify((()=>{const s=db.serverStatus();const ops=Object.values(s.opcounters||{}).reduce((n,v)=>n+(Number(v)||0),0);const lat=s.opLatencies||{};const latencyOps=Object.values(lat).reduce((n,v)=>n+(Number(v&&v.ops)||0),0);const latencyMicros=Object.values(lat).reduce((n,v)=>n+(Number(v&&v.latency)||0),0);const current=db.currentOp({active:true});const active=Array.isArray(current.inprog)?current.inprog:[];return {active_sessions:active.length,waiting_sessions:active.filter(o=>o.waitingForLock===true).length,executions:ops,avg_elapsed_ms:latencyOps?latencyMicros/latencyOps/1000:0,logical_reads:0,physical_reads:0,throughput:ops,errors:Number(s.asserts&&s.asserts.regular||0)+Number(s.asserts&&s.asserts.warning||0)};})(),null,2)";
  if (["mysql","mariadb"].includes(engine)) return "with a as (select count(*) active_sessions, sum(processlist_state is not null and processlist_command<>'Sleep') waiting_sessions from performance_schema.threads where processlist_id is not null and processlist_command<>'Sleep'), q as (select coalesce(sum(count_star),0) executions, coalesce(sum(sum_timer_wait)/1000000000/nullif(sum(count_star),0),0) avg_elapsed_ms, coalesce(sum(sum_rows_examined),0) logical_reads, 0 physical_reads, coalesce(sum(sum_errors),0) errors from performance_schema.events_statements_summary_by_digest) select concat('active_sessions=',active_sessions) metric from a union all select concat('waiting_sessions=',waiting_sessions) from a union all select concat('executions=',executions) from q union all select concat('avg_elapsed_ms=',avg_elapsed_ms) from q union all select concat('logical_reads=',logical_reads) from q union all select concat('physical_reads=',physical_reads) from q union all select concat('throughput=',executions) from q union all select concat('errors=',errors) from q";
  if (engine === "sqlserver") return "with a as (select count(*) active_sessions, sum(case when wait_type is not null then 1 else 0 end) waiting_sessions from sys.dm_exec_requests where session_id<>@@spid), q as (select coalesce(sum(cast(execution_count as decimal(38,2))),0) executions, coalesce(sum(cast(total_elapsed_time as decimal(38,2)))/1000/nullif(sum(cast(execution_count as decimal(38,2))),0),0) avg_elapsed_ms, coalesce(sum(cast(total_logical_reads as decimal(38,2))),0) logical_reads, coalesce(sum(cast(total_physical_reads as decimal(38,2))),0) physical_reads from sys.dm_exec_query_stats) select concat('active_sessions=',active_sessions) metric from a union all select concat('waiting_sessions=',waiting_sessions) from a union all select concat('executions=',executions) from q union all select concat('avg_elapsed_ms=',avg_elapsed_ms) from q union all select concat('logical_reads=',logical_reads) from q union all select concat('physical_reads=',physical_reads) from q union all select concat('throughput=',executions) from q union all select 'errors=0'";
  throw new Error("Performance recording supports Oracle, PostgreSQL, MongoDB, MySQL, and SQL Server");
}

function parsePerformanceSample(engine, stdout) {
  const parsed = parseRecommendationMetrics(engine, stdout);
  return Object.fromEntries(["active_sessions", "waiting_sessions", "executions", "avg_elapsed_ms", "logical_reads", "physical_reads", "throughput", "errors"].map((key) => [key, Number(parsed[key]) || 0]));
}

function parseCsvText(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  const source = String(text || "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function normalizeCapturedPlan(engine, stdout) {
  const output = String(stdout || "").trim();
  if (engine === "sqlserver") {
    const start = output.indexOf("<ShowPlanXML"); const end = output.lastIndexOf("</ShowPlanXML>");
    return start >= 0 && end > start ? output.slice(start, end + 14).replaceAll('""', '"') : output;
  }
  if (engine === "postgres") return parseCsvText(output)[1]?.[0] || output;
  if (["mysql","mariadb"].includes(engine)) return output.split(/\r?\n/).slice(1).join("\n").replaceAll("\\n", "\n").replaceAll("\\t", "\t").replaceAll('\\"', '"') || output;
  return output;
}

async function capturePlanForIdentifier(input, engine, identifier) {
  if (!/^[A-Za-z0-9_.:$-]{1,100}$/.test(identifier)) throw new Error("Enter a valid statement identifier");
  let planSql;
  if (engine === "oracle") planSql = `select plan_table_output from table(dbms_xplan.display_cursor('${identifier}',null,'ALLSTATS LAST +PEEKED_BINDS +OUTLINE'))`;
  else if (engine === "sqlserver") planSql = `select top (1) convert(nvarchar(max),qp.query_plan) query_plan from sys.dm_exec_query_stats qs cross apply sys.dm_exec_query_plan(qs.plan_handle) qp where convert(varchar(66),qs.query_hash,1)='${identifier}' order by qs.last_execution_time desc`;
  else if (engine === "mongodb") planSql = `JSON.stringify(db.getCollection('system.profile').find({$or:[{opid:${JSON.stringify(identifier)}},{"command.comment":${JSON.stringify(identifier)}}]},{execStats:1,planSummary:1,command:1,ns:1,millis:1,ts:1}).sort({ts:-1}).limit(1).toArray(),null,2)`;
  if (planSql) {
    const result = await executeDatabaseQuery(input, planSql, input.timeoutMs || 45000);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Plan capture failed");
    const directPlan = result.access === "direct" && engine === "oracle" ? result.rows.map((row) => Object.values(row)[0]).join("\n") : result.access === "direct" && engine === "sqlserver" ? String(Object.values(result.rows[0] || {})[0] || "") : result.stdout;
    return { planText: normalizeCapturedPlan(engine, directPlan), source: engine === "oracle" ? "DBMS_XPLAN.DISPLAY_CURSOR" : engine === "sqlserver" ? "sys.dm_exec_query_plan" : "MongoDB system.profile", ...result };
  }
  if (!["postgres", "mysql", "mariadb"].includes(engine)) throw new Error("Direct plan capture supports the six full-diagnostics engines");
  const statementSql = engine === "postgres" ? `select query from pg_stat_statements where queryid::text='${identifier}' order by total_exec_time desc limit 1` : `select sql_text from performance_schema.events_statements_history_long where digest='${identifier}' and sql_text is not null order by timer_end desc limit 1`;
  const statementResult = await executeDatabaseQuery(input, statementSql, input.timeoutMs || 45000);
  if (statementResult.code !== 0) throw new Error(statementResult.stderr || statementResult.stdout || "Statement text could not be captured");
  const statement = statementResult.access === "direct" ? String(Object.values(statementResult.rows[0] || {})[0] || "") : engine === "postgres" ? parseCsvText(statementResult.stdout)[1]?.[0] : statementResult.stdout.split(/\r?\n/).slice(1).join("\n").replaceAll("\\n", "\n");
  if (!statement?.trim()) throw new Error("No recent statement text was available for this identifier");
  assertReadOnly(statement, false, engine);
  const explainSql = engine === "postgres" ? `explain (format json) ${statement.replace(/;\s*$/, "")}` : `explain format=json ${statement.replace(/;\s*$/, "")}`;
  const planResult = await executeDatabaseQuery(input, explainSql, input.timeoutMs || 45000);
  if (planResult.code !== 0) throw new Error(planResult.stderr || planResult.stdout || "EXPLAIN plan capture failed");
  const directPlan = planResult.access === "direct" ? JSON.stringify(Object.values(planResult.rows[0] || {})[0] || planResult.rows, directJsonReplacer, 2) : planResult.stdout;
  return { planText: normalizeCapturedPlan(engine, directPlan), source: engine === "postgres" ? "pg_stat_statements + EXPLAIN FORMAT JSON" : "Performance Schema history + EXPLAIN FORMAT JSON", statementCaptured: true, ...planResult };
}

function planHistorySql(engine, identifier) {
  if (!/^[A-Za-z0-9_.:$-]{1,100}$/.test(identifier)) throw new Error("Enter a valid statement identifier");
  if (engine === "oracle") return `select child_number, plan_hash_value, executions, round(elapsed_time/1000/nullif(executions,0),2) avg_elapsed_ms, is_bind_sensitive, is_bind_aware, is_shareable, loads, invalidations, last_active_time from v$sql where sql_id='${identifier}' order by last_active_time desc`;
  if (engine === "postgres") return `select queryid, calls, plans, round(total_plan_time::numeric,2) total_plan_ms, round(mean_plan_time::numeric,2) mean_plan_ms, round(mean_exec_time::numeric,2) mean_exec_ms, rows, left(query,500) query from pg_stat_statements where queryid::text='${identifier}'`;
  if (engine === "mongodb") return `JSON.stringify(db.getCollection('system.profile').find({$or:[{opid:${JSON.stringify(identifier)}},{"command.comment":${JSON.stringify(identifier)}}]},{ts:1,ns:1,millis:1,planSummary:1,keysExamined:1,docsExamined:1,nreturned:1}).sort({ts:-1}).limit(30).toArray(),null,2)`;
  if (["mysql","mariadb"].includes(engine)) return `select event_id, timer_start, round(timer_wait/1000000000,3) elapsed_ms, rows_examined, rows_sent, rows_affected, no_index_used, no_good_index_used, left(sql_text,500) sql_text from performance_schema.events_statements_history_long where digest='${identifier}' order by timer_end desc limit 30`;
  if (engine === "sqlserver") return `select top (50) convert(varchar(66),q.query_hash,1) query_hash, p.plan_id, p.is_forced_plan, p.force_failure_count, p.last_force_failure_reason_desc, rs.count_executions, cast(rs.avg_duration/1000.0 as decimal(18,2)) avg_duration_ms, cast(rs.avg_cpu_time/1000.0 as decimal(18,2)) avg_cpu_ms, rs.avg_logical_io_reads, rsi.start_time, rsi.end_time from sys.query_store_query q join sys.query_store_plan p on p.query_id=q.query_id join sys.query_store_runtime_stats rs on rs.plan_id=p.plan_id join sys.query_store_runtime_stats_interval rsi on rsi.runtime_stats_interval_id=rs.runtime_stats_interval_id where convert(varchar(66),q.query_hash,1)='${identifier}' order by rsi.end_time desc`;
  throw new Error("Plan history supports the five full-diagnostics engines");
}

function summarizePlanHistory(engine, stdout) {
  const output = String(stdout || "");
  const planTokens = engine === "oracle" ? [...output.matchAll(/\b\d{5,}\b/g)].map((match) => match[0]) : engine === "sqlserver" ? [...output.matchAll(/\bplan[_ ]?id\D+(\d+)/gi)].map((match) => match[1]) : [...output.matchAll(/\b(?:planSummary|plan)["':,\s]+([A-Za-z0-9_ -]+)/gi)].map((match) => match[1].trim());
  return { rows: Math.max(output.split(/\r?\n/).filter(Boolean).length - 1, 0), distinctPlanMarkers: new Set(planTokens).size, bindSensitive: (output.match(/\b(?:Y|true)\b/gi) || []).length, warningSignals: (output.match(/\b(?:invalid|force failure|no_index|collscan|error|warning)\b/gi) || []).length };
}

async function available(command) {
  return new Promise((resolveAvailable) => execFile("where.exe", [command], { windowsHide: true }, (error, stdout) => resolveAvailable({ available: !error, path: error ? null : stdout.trim().split(/\r?\n/)[0] })));
}

async function toolStatus() {
  const entries = await Promise.all(Object.entries(toolDefinitions).map(async ([id, tool]) => {
    const found = await available(tool.command);
    if (!found.available) return [id, { available: false, command: tool.command, version: "Not found in PATH" }];
    try {
      const result = await run(tool.command, tool.versionArgs, { timeoutMs: 5000 });
      return [id, { available: true, command: tool.command, path: found.path, version: (result.stdout || result.stderr).split(/\r?\n/)[0] || "Available" }];
    } catch { return [id, { available: true, command: tool.command, path: found.path, version: "Available" }]; }
  }));
  return Object.fromEntries(entries);
}

async function readVersionBaseline() {
  try {
    const parsed = JSON.parse(await readFile(VERSION_BASELINE_FILE, "utf8"));
    if (!parsed || typeof parsed.capturedAt !== "string" || !parsed.tools || typeof parsed.tools !== "object") return null;
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("The DevOps version baseline could not be read");
  }
}

async function writeVersionBaseline(statuses) {
  const baseline = {
    version: 1,
    capturedAt: new Date().toISOString(),
    tools: Object.fromEntries(Object.entries(statuses).map(([id, item]) => [id, { available: item.available === true, version: String(item.version || "Unknown") }])),
  };
  await mkdir(USER_DATA_ROOT, { recursive: true });
  await writeFile(VERSION_BASELINE_FILE, JSON.stringify(baseline, null, 2), "utf8");
  return baseline;
}

function compareToolVersions(current, baseline) {
  const rows = Object.keys(toolDefinitions).map((id) => {
    const currentTool = current[id] || { available: false, version: "Not found in PATH" };
    const baselineTool = baseline?.tools?.[id];
    let status = "noBaseline";
    if (baseline) {
      if (!baselineTool) status = currentTool.available ? "new" : "unavailable";
      else if (baselineTool.available && !currentTool.available) status = "missing";
      else if (!baselineTool.available && currentTool.available) status = "new";
      else if (!baselineTool.available && !currentTool.available) status = "unavailable";
      else status = String(baselineTool.version) === String(currentTool.version) ? "unchanged" : "changed";
    }
    return {
      id,
      status,
      currentAvailable: currentTool.available === true,
      currentVersion: String(currentTool.version || "Unknown"),
      baselineAvailable: baselineTool?.available === true,
      baselineVersion: baselineTool ? String(baselineTool.version || "Unknown") : "Not captured",
    };
  });
  const summary = rows.reduce((counts, row) => ({ ...counts, [row.status]: (counts[row.status] || 0) + 1 }), {});
  return { capturedAt: baseline?.capturedAt || null, comparedAt: new Date().toISOString(), rows, summary };
}

async function tailFile(path, offset = 0, historyBytes = MAX_TAIL) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error("Log path is not a file");
  const requestedHistory = Math.min(Math.max(Number(historyBytes || MAX_TAIL), MAX_TAIL), MAX_OUTPUT);
  const readLimit = offset ? MAX_TAIL : requestedHistory;
  const start = offset ? (offset > info.size ? 0 : offset) : Math.max(0, info.size - requestedHistory);
  const length = Math.min(info.size - start, readLimit);
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return { text: buffer.toString("utf8"), offset: start + length, size: info.size, modified: info.mtime.toISOString() };
  } finally { await handle.close(); }
}

function parseTrace(text, file) {
  const lines = text.split(/\r?\n/);
  const waits = new Map();
  const errors = [];
  let elapsed = 0;
  for (const line of lines) {
    const wait = line.match(/(?:WAIT|event)\s*[#:=]?\s*['"]?([^'",]+)['"]?/i);
    if (wait) waits.set(wait[1].trim(), (waits.get(wait[1].trim()) || 0) + 1);
    const ela = line.match(/\bela(?:psed)?[=: ]+(\d+)/i);
    if (ela) elapsed += Number(ela[1]);
    if (/ORA-\d{5}|ERROR|FATAL|PANIC/i.test(line) && errors.length < 30) errors.push(line.trim().slice(0, 500));
  }
  return { file, lines: lines.length, bytes: Buffer.byteLength(text), estimatedElapsedMicros: elapsed, topWaits: [...waits.entries()].sort((a,b) => b[1]-a[1]).slice(0,10).map(([event,count]) => ({ event, count })), errors };
}

function uniqueTraceMatches(text, expression, limit = 60) {
  const values = [];
  const seen = new Set();
  for (const match of text.matchAll(expression)) {
    const value = String(match[1] || match[0]).trim().slice(0, 1000);
    if (value && !seen.has(value)) { seen.add(value); values.push(value); }
    if (values.length >= limit) break;
  }
  return values;
}

function collect10053Sql(lines) {
  const start = lines.findIndex((line) => /Current SQL Statement for this session/i.test(line));
  if (start < 0) return "";
  const sql = [];
  for (let index = start + 1; index < lines.length && sql.length < 200; index += 1) {
    const line = lines[index];
    if (sql.length && /^\s*(?:\*{5,}|-{5,})\s*$/.test(line)) break;
    if (!sql.length && /^\s*(?:\*{5,}|-{5,})\s*$/.test(line)) continue;
    sql.push(line);
  }
  return sql.join("\n").trim().slice(0, 30000);
}

function collect10046Sql(lines) {
  const statements = [];
  for (let index = 0; index < lines.length && statements.length < 50; index += 1) {
    if (!/PARSING IN CURSOR\s+#\d+/i.test(lines[index])) continue;
    const sql = [];
    for (index += 1; index < lines.length && sql.length < 300; index += 1) {
      if (/^END OF STMT/i.test(lines[index])) break;
      if (/^(?:PARSING IN CURSOR|PARSE|EXEC|FETCH|WAIT|STAT)\s+#/i.test(lines[index])) { index -= 1; break; }
      sql.push(lines[index]);
    }
    const statement = sql.join("\n").trim();
    if (statement) statements.push(statement.slice(0, 30000));
  }
  return statements;
}

function parseOracleTrace(text, sourceName) {
  const lines = text.split(/\r?\n/);
  const is10053 = /Current SQL Statement for this session|QUERY BLOCK SIGNATURE|SINGLE TABLE ACCESS PATH|CBQT:|10053 trace/i.test(text);
  const isSqlTrace = /PARSING IN CURSOR|\b(?:PARSE|EXEC|FETCH|WAIT)\s+#\d+/i.test(text);
  const type = is10053 ? "10053 Optimizer Trace" : isSqlTrace ? "10046 SQL Trace" : "Oracle Trace";
  const sqlIds = uniqueTraceMatches(text, /\b(?:sql_?id|sqlid)\s*[=:]\s*['"]?([a-z0-9]{13})/gi, 100);
  const cursorIds = new Set();
  const calls = {
    PARSE: { count: 0, cpuMicros: 0, elapsedMicros: 0, physicalReads: 0, consistentReads: 0, currentReads: 0, misses: 0, rows: 0 },
    EXEC: { count: 0, cpuMicros: 0, elapsedMicros: 0, physicalReads: 0, consistentReads: 0, currentReads: 0, misses: 0, rows: 0 },
    FETCH: { count: 0, cpuMicros: 0, elapsedMicros: 0, physicalReads: 0, consistentReads: 0, currentReads: 0, misses: 0, rows: 0 },
  };
  const waitEvents = new Map();
  const errors = [];
  let waitCount = 0;
  let statCount = 0;
  for (const line of lines) {
    const call = line.match(/^\s*(PARSE|EXEC|FETCH)\s+#(\d+):(.+)$/i);
    if (call) {
      const kind = call[1].toUpperCase();
      cursorIds.add(call[2]);
      calls[kind].count += 1;
      const values = Object.fromEntries([...call[3].matchAll(/\b([a-z]+)=(-?\d+)/gi)].map((match) => [match[1].toLowerCase(), Number(match[2])]));
      calls[kind].cpuMicros += values.c || 0;
      calls[kind].elapsedMicros += values.e || 0;
      calls[kind].physicalReads += values.p || 0;
      calls[kind].consistentReads += values.cr || 0;
      calls[kind].currentReads += values.cu || 0;
      calls[kind].misses += values.mis || 0;
      calls[kind].rows += values.r || 0;
    }
    const parsingCursor = line.match(/PARSING IN CURSOR\s+#(\d+)/i);
    if (parsingCursor) cursorIds.add(parsingCursor[1]);
    const wait = line.match(/\bWAIT\s+#?\d+:[^\r\n]*?\bnam=['"]([^'"]+)/i);
    if (wait) {
      waitCount += 1;
      const elapsed = Number(line.match(/\bela=(\d+)/i)?.[1] || 0);
      const current = waitEvents.get(wait[1]) || { count: 0, elapsedMicros: 0 };
      current.count += 1; current.elapsedMicros += elapsed; waitEvents.set(wait[1], current);
    }
    if (/^\s*STAT\s+#\d+/i.test(line)) statCount += 1;
    if (/ORA-\d{5}|\b(?:ERROR|WARNING|FATAL)\b/i.test(line) && errors.length < 80) errors.push(line.trim().slice(0, 1000));
  }

  const optimizerParameters = [];
  let parameterSection = false;
  for (const line of lines) {
    if (/PARAMETERS USED BY THE OPTIMIZER/i.test(line)) { parameterSection = true; continue; }
    if (parameterSection && /^\s*(?:\*{5,}|-{5,})\s*$/.test(line) && optimizerParameters.length) break;
    if (!parameterSection) continue;
    const parameter = line.match(/^\s*([_A-Za-z][A-Za-z0-9_$#.]+)\s*=\s*(.*?)\s*$/);
    if (parameter) optimizerParameters.push({ name: parameter[1], value: parameter[2].slice(0, 500) });
    if (optimizerParameters.length >= 150) break;
  }

  const transformations = uniqueTraceMatches(text, /^\s*((?:(?:CBQT|CVM|SU|SJC|JE|JF|PM|ST|FPD|JPPD|TIMER|kkqct|kkqvm)\b|Considering\b|Passed validity checks\b)[^\r\n]*)/gim, 120);
  const accessPaths = uniqueTraceMatches(text, /^\s*((?:SINGLE TABLE ACCESS PATH|Access Path:|Table Scan|Index Scan|index:|Best Access Path|Access path analysis)[^\r\n]*)/gim, 120);
  const joinOrders = uniqueTraceMatches(text, /^\s*((?:Join order\[|Best join order|Best::|Join Card:|Now joining:)[^\r\n]*)/gim, 120);
  const costDecisions = uniqueTraceMatches(text, /^\s*((?:Final cost|cost:\s*\d|resc:|resp:|Card:)[^\r\n]*)/gim, 120);
  const queryBlocks = uniqueTraceMatches(text, /\bquery block(?: signature)?[^:=\r\n]*[:=]\s*([A-Za-z0-9_$#]+)/gi, 80);
  const outlineHints = [];
  let outline = false;
  for (const line of lines) {
    if (/BEGIN_OUTLINE_DATA/i.test(line)) { outline = true; continue; }
    if (/END_OUTLINE_DATA/i.test(line)) break;
    if (outline && line.trim()) outlineHints.push(line.trim().slice(0, 1000));
    if (outlineHints.length >= 200) break;
  }
  const topWaits = [...waitEvents.entries()].map(([event, value]) => ({ event, ...value })).sort((a, b) => b.elapsedMicros - a.elapsedMicros || b.count - a.count).slice(0, 20);
  const recommendations = [];
  if (is10053) {
    recommendations.push("Review chosen access paths, best join order, cardinality and final cost together; 10053 cost is optimizer-estimated, not elapsed runtime.");
    if (!outlineHints.length) recommendations.push("No outline section was detected. Confirm the trace includes the final optimizer decision section.");
    if (errors.length) recommendations.push("Review optimizer warnings before comparing costs or plan transformations.");
  } else if (isSqlTrace) {
    const highestCall = Object.entries(calls).sort((a, b) => b[1].elapsedMicros - a[1].elapsedMicros)[0];
    if (highestCall?.[1].elapsedMicros) recommendations.push(`${highestCall[0]} has the largest accumulated elapsed time; compare CPU, waits, reads and returned rows.`);
    if (topWaits.length) recommendations.push(`The leading wait is ${topWaits[0].event}; validate its elapsed contribution before tuning SQL or storage.`);
    recommendations.push("Use TKPROF to aggregate cursor calls and rank statements, then validate findings against live AWR/ASH or session statistics when authorized.");
  } else recommendations.push("The file does not contain standard 10053 or 10046 markers. Review the raw trace and confirm the event used to generate it.");
  return {
    sourceName,
    type,
    lines: lines.length,
    bytes: Buffer.byteLength(text),
    databaseVersion: text.match(/Oracle Database[^\r\n]{1,180}/i)?.[0] || "Not detected",
    sqlIds,
    sqlTexts: collect10046Sql(lines),
    cursorCount: cursorIds.size,
    counts: { parse: calls.PARSE.count, execute: calls.EXEC.count, fetch: calls.FETCH.count, wait: waitCount, stat: statCount },
    calls,
    topWaits,
    errors,
    recommendations,
    optimizer: { sqlText: collect10053Sql(lines), optimizerParameters, queryBlocks, transformations, accessPaths, joinOrders, costDecisions, outlineHints },
  };
}

function parseTkprofOutput(text) {
  const sqlIds = uniqueTraceMatches(text, /^SQL ID:\s*([a-z0-9]{13})/gim, 200);
  return {
    lines: text.split(/\r?\n/).length,
    bytes: Buffer.byteLength(text),
    sqlStatements: sqlIds.length || (text.match(/^call\s+count\s+cpu\s+elapsed/gi)?.length || 0),
    sqlIds,
    errors: uniqueTraceMatches(text, /^.*(?:ORA-\d{5}|ERROR|WARNING).*$/gim, 50),
  };
}

async function openBrowser(url) {
  if (process.env.DBRIDGE_NO_BROWSER === "1") return;
  const child = spawn("explorer.exe", [url], { windowsHide: true, detached: true, stdio: "ignore" });
  child.unref();
}

function mongoStudioCollectionName(value, required = true) {
  const name = String(value || "").trim();
  if (required && !name) throw new Error("Select a MongoDB collection");
  if (name && (!/^[A-Za-z0-9_$.-]{1,255}$/.test(name) || name.includes(".."))) throw new Error("Enter a valid MongoDB collection name");
  return name;
}

async function openMongoStudioConnection(input, appName = "DBridge-MongoDB-Studio") {
  const connection = normalizeDatabaseConnection({ ...input, engine: "mongodb" });
  const module = await directDriverModule("mongodb");
  if (!module?.MongoClient) throw new Error("The bundled MongoDB driver is unavailable");
  const auth = connection.authMode === "password" && connection.username ? `${encodeURIComponent(connection.username)}:${encodeURIComponent(connection.password)}@` : "";
  const uri = `mongodb://${auth}${connection.host}:${connection.port}/${connection.database || "admin"}`;
  const timeout = Math.min(Math.max(Number(input.timeoutMs || 30000), 5000), 60000);
  const options = { appName, serverSelectionTimeoutMS: timeout, connectTimeoutMS: timeout, socketTimeoutMS: timeout, maxPoolSize: 4 };
  if (connection.tlsMode === "require") options.tls = true;
  if (connection.tlsMode === "disable") options.tls = false;
  const client = new module.MongoClient(uri, options);
  await client.connect();
  return { client, database: client.db(connection.database || "admin"), connection, timeout };
}

function mongoStudioType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (Buffer.isBuffer(value)) return "binary";
  if (value && typeof value === "object" && value._bsontype) return String(value._bsontype).toLowerCase();
  return typeof value === "object" ? "document" : typeof value;
}

function mongoStudioSample(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value.slice(0, 90);
  if (["number", "boolean", "bigint"].includes(typeof value)) return String(value);
  try { return JSON.stringify(value, directJsonReplacer).slice(0, 140); }
  catch { return String(value).slice(0, 140); }
}

function analyzeMongoStudioSchema(documents) {
  const fields = new Map();
  const visit = (document, prefix = "", depth = 0) => {
    if (!document || typeof document !== "object" || Array.isArray(document) || depth > 5) return;
    for (const [key, value] of Object.entries(document)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const field = fields.get(path) || { path, present: 0, types: new Map(), samples: new Set(), minimum: null, maximum: null };
      const type = mongoStudioType(value);
      field.present += 1;
      field.types.set(type, (field.types.get(type) || 0) + 1);
      if (field.samples.size < 6) field.samples.add(mongoStudioSample(value));
      if (typeof value === "number" && Number.isFinite(value)) {
        field.minimum = field.minimum == null ? value : Math.min(field.minimum, value);
        field.maximum = field.maximum == null ? value : Math.max(field.maximum, value);
      }
      fields.set(path, field);
      if (type === "document") visit(value, path, depth + 1);
      if (type === "array") value.slice(0, 12).forEach((item) => { if (mongoStudioType(item) === "document") visit(item, `${path}[]`, depth + 1); });
    }
  };
  documents.forEach((document) => visit(document));
  return [...fields.values()].map((field) => ({
    path: field.path,
    presencePercent: documents.length ? Math.round(field.present / documents.length * 1000) / 10 : 0,
    cardinalityInSample: field.samples.size,
    types: Object.fromEntries([...field.types.entries()].map(([type, count]) => [type, { count, percent: Math.round(count / field.present * 1000) / 10 }])),
    samples: [...field.samples],
    minimum: field.minimum,
    maximum: field.maximum,
  })).sort((left, right) => left.path.localeCompare(right.path));
}

async function mongoStudioManifest(database, timeout) {
  const collections = (await database.listCollections({}, { nameOnly: false }).toArray()).filter((item) => item.type !== "view").slice(0, 120);
  const rows = await Promise.all(collections.map(async (item) => {
    try {
      const collection = database.collection(item.name);
      const [count, indexes, stats] = await Promise.all([
        collection.estimatedDocumentCount({ maxTimeMS: timeout }),
        collection.listIndexes({ maxTimeMS: timeout }).toArray(),
        database.command({ collStats: item.name, scale: 1024 * 1024 }, { maxTimeMS: timeout }),
      ]);
      return { collection: item.name, count, indexes: indexes.length, sizeMB: Number(stats.size || 0), storageMB: Number(stats.storageSize || 0), indexMB: Number(stats.totalIndexSize || 0), ok: true };
    } catch (error) {
      return { collection: item.name, count: null, indexes: null, sizeMB: null, storageMB: null, indexMB: null, ok: false, error: String(error instanceof Error ? error.message : error).slice(0, 500) };
    }
  }));
  return rows;
}

async function compareMongoStudioMirror(input) {
  const sourceSession = await openMongoStudioConnection(input, "DBridge-Mirror-Source");
  let destinationSession;
  try {
    destinationSession = await openMongoStudioConnection({ engine: "mongodb", connection: input.destination || {}, timeoutMs: input.timeoutMs }, "DBridge-Mirror-Destination");
    const [sourceManifest, destinationManifest] = await Promise.all([
      mongoStudioManifest(sourceSession.database, sourceSession.timeout),
      mongoStudioManifest(destinationSession.database, destinationSession.timeout),
    ]);
    const sourceMap = new Map(sourceManifest.map((item) => [item.collection, item]));
    const destinationMap = new Map(destinationManifest.map((item) => [item.collection, item]));
    const names = [...new Set([...sourceMap.keys(), ...destinationMap.keys()])].sort();
    const collections = names.map((name) => {
      const source = sourceMap.get(name); const destination = destinationMap.get(name);
      const status = !source ? "destination-only" : !destination ? "missing-destination" : !source.ok || !destination.ok ? "check" : source.count === destination.count && source.indexes === destination.indexes ? "matched" : "drift";
      return { collection: name, status, source, destination, countDelta: source?.count != null && destination?.count != null ? destination.count - source.count : null, indexDelta: source?.indexes != null && destination?.indexes != null ? destination.indexes - source.indexes : null };
    });
    return {
      ok: true,
      mode: "mirror",
      source: { host: sourceSession.connection.host, database: sourceSession.connection.database || "admin" },
      destination: { host: destinationSession.connection.host, database: destinationSession.connection.database || "admin" },
      summary: { collections: collections.length, matched: collections.filter((item) => item.status === "matched").length, drift: collections.filter((item) => item.status === "drift").length, missing: collections.filter((item) => item.status.includes("missing") || item.status.includes("only")).length, checks: collections.filter((item) => item.status === "check").length },
      collections,
      comparedAt: new Date().toISOString(),
      note: "Counts are estimated metadata. Validate business-critical collections with mongosync's embedded verifier before cutover.",
    };
  } finally {
    await sourceSession.client.close().catch(() => {});
    if (destinationSession) await destinationSession.client.close().catch(() => {});
  }
}

async function runMongoStudioAction(input) {
  const action = String(input.action || "overview");
  const allowed = new Set(["overview", "documents", "aggregation", "schema", "indexes", "validation", "explain", "performance", "mirror"]);
  if (!allowed.has(action)) throw new Error("Unsupported MongoDB Studio operation");
  if (action === "mirror") return compareMongoStudioMirror(input);
  const session = await openMongoStudioConnection(input);
  const { client, database, connection, timeout } = session;
  const collectionName = mongoStudioCollectionName(input.collection, action !== "overview" && action !== "performance");
  const limit = Math.min(Math.max(Number(input.limit || 50), 1), 1000);
  const filter = safeMongoLiteral(input.filter, {});
  const projection = safeMongoLiteral(input.projection, {});
  const sort = safeMongoLiteral(input.sort, {});
  const started = Date.now();
  try {
    if (action === "overview") {
      const [manifest, dbStats, hello, build] = await Promise.all([
        mongoStudioManifest(database, timeout),
        database.command({ dbStats: 1, scale: 1024 * 1024 }, { maxTimeMS: timeout }),
        database.admin().command({ hello: 1 }, { maxTimeMS: timeout }),
        database.admin().command({ buildInfo: 1 }, { maxTimeMS: timeout }),
      ]);
      return { ok: true, action, database: connection.database || "admin", role: hello.msg === "isdbgrid" ? "mongos" : hello.setName ? "replica set" : "standalone", setName: hello.setName || null, version: build.version, metrics: { collections: manifest.length, objects: dbStats.objects, dataMB: dbStats.dataSize, storageMB: dbStats.storageSize, indexMB: dbStats.indexSize, views: dbStats.views || 0 }, collections: manifest, durationMs: Date.now() - started };
    }
    const collection = database.collection(collectionName);
    if (action === "documents") {
      const cursor = collection.find(filter, { projection, maxTimeMS: timeout }).sort(sort).limit(limit);
      const documents = await cursor.toArray();
      return { ok: true, action, collection: collectionName, documents, count: documents.length, limit, durationMs: Date.now() - started };
    }
    if (action === "aggregation") {
      const pipeline = safeMongoLiteral(input.pipeline, []);
      if (!Array.isArray(pipeline)) throw new Error("Aggregation pipeline must be a JSON array");
      const serialized = JSON.stringify(pipeline);
      if (/\$(?:out|merge|changeStream|changeStreamSplitLargeEvent)\b/i.test(serialized)) throw new Error("Mutating or streaming aggregation stages are blocked in this read-only workspace");
      const documents = await collection.aggregate([...pipeline, { $limit: limit }], { maxTimeMS: timeout, allowDiskUse: false }).toArray();
      return { ok: true, action, collection: collectionName, pipeline, documents, count: documents.length, durationMs: Date.now() - started };
    }
    if (action === "schema") {
      const sampleSize = Math.min(Math.max(Number(input.sampleSize || 200), 20), 1000);
      let documents;
      try { documents = await collection.aggregate([{ $match: filter }, { $sample: { size: sampleSize } }], { maxTimeMS: timeout }).toArray(); }
      catch { documents = await collection.find(filter, { maxTimeMS: timeout }).limit(sampleSize).toArray(); }
      const stats = await database.command({ collStats: collectionName, scale: 1024 * 1024 }, { maxTimeMS: timeout }).catch(() => ({}));
      return { ok: true, action, collection: collectionName, sampleSize: documents.length, collectionMetrics: { count: stats.count, sizeMB: stats.size, storageMB: stats.storageSize, averageDocumentBytes: stats.avgObjSize }, fields: analyzeMongoStudioSchema(documents), durationMs: Date.now() - started };
    }
    if (action === "indexes") {
      const indexes = await collection.listIndexes({ maxTimeMS: timeout }).toArray();
      return { ok: true, action, collection: collectionName, indexes: indexes.map((item) => ({ name: item.name, key: item.key, unique: Boolean(item.unique), sparse: Boolean(item.sparse), hidden: Boolean(item.hidden), partialFilterExpression: item.partialFilterExpression, expireAfterSeconds: item.expireAfterSeconds, collation: item.collation })), durationMs: Date.now() - started };
    }
    if (action === "validation") {
      const info = (await database.listCollections({ name: collectionName }, { nameOnly: false }).toArray())[0];
      return { ok: true, action, collection: collectionName, validation: { validator: info?.options?.validator || {}, validationLevel: info?.options?.validationLevel || "strict (default)", validationAction: info?.options?.validationAction || "error (default)", collation: info?.options?.collation || null, type: info?.type || "collection" }, durationMs: Date.now() - started };
    }
    if (action === "explain") {
      const explain = await collection.find(filter, { projection, maxTimeMS: timeout }).sort(sort).limit(limit).explain("executionStats");
      const stats = explain.executionStats || {};
      return { ok: true, action, collection: collectionName, summary: { executionTimeMillis: stats.executionTimeMillis, documentsReturned: stats.nReturned, documentsExamined: stats.totalDocsExamined, keysExamined: stats.totalKeysExamined, examinedToReturned: stats.nReturned ? Math.round((stats.totalDocsExamined || 0) / stats.nReturned * 100) / 100 : null, winningStage: explain.queryPlanner?.winningPlan?.stage || explain.queryPlanner?.winningPlan?.queryPlan?.stage || "unknown" }, explain, durationMs: Date.now() - started };
    }
    const [status, current, dbStats, collectionStats, repl] = await Promise.all([
      database.admin().command({ serverStatus: 1 }, { maxTimeMS: timeout }),
      database.admin().command({ currentOp: 1, active: true }, { maxTimeMS: timeout }),
      database.command({ dbStats: 1, scale: 1024 * 1024 }, { maxTimeMS: timeout }),
      collectionName ? database.command({ collStats: collectionName, scale: 1024 * 1024 }, { maxTimeMS: timeout }).catch(() => null) : Promise.resolve(null),
      database.admin().command({ replSetGetStatus: 1 }, { maxTimeMS: timeout }).catch(() => null),
    ]);
    const active = Array.isArray(current.inprog) ? current.inprog.slice(0, 80) : [];
    return { ok: true, action, database: connection.database || "admin", metrics: { uptimeSeconds: status.uptime, connectionsCurrent: status.connections?.current, connectionsAvailable: status.connections?.available, queuedReaders: status.globalLock?.currentQueue?.readers, queuedWriters: status.globalLock?.currentQueue?.writers, cacheUsedBytes: status.wiredTiger?.cache?.["bytes currently in the cache"], cacheMaxBytes: status.wiredTiger?.cache?.["maximum bytes configured"], operations: Object.values(status.opcounters || {}).reduce((total, value) => total + (Number(value) || 0), 0), objects: dbStats.objects, dataMB: dbStats.dataSize, storageMB: dbStats.storageSize }, collectionMetrics: collectionStats, currentOperations: active.map((item) => ({ opid: item.opid, operation: item.op, namespace: item.ns, seconds: item.secs_running, waitingForLock: item.waitingForLock, plan: item.planSummary, client: item.client, description: item.desc })), replication: repl ? { set: repl.set, myState: repl.myState, term: repl.term, members: repl.members?.map((item) => ({ name: item.name, state: item.stateStr, health: item.health, optimeDate: item.optimeDate, pingMs: item.pingMs })) } : null, durationMs: Date.now() - started };
  } finally {
    await client.close().catch(() => {});
  }
}

function mongosyncPort(input) {
  const port = Number(input.port || 27182);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Enter a valid local mongosync API port");
  return port;
}

async function callLocalMongosync(port, action, requestBody) {
  const method = action === "progress" ? "GET" : "POST";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/${action}`, { method, headers: { "Content-Type": "application/json" }, ...(method === "POST" ? { body: JSON.stringify(requestBody || {}) } : {}), signal: controller.signal });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { success: false, errorDescription: text || `HTTP ${response.status}` }; }
    if (!response.ok || data.success === false) throw new Error(data.errorDescription || data.error || `mongosync ${action} failed (${response.status})`);
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The local mongosync API did not respond within 12 seconds");
    throw error;
  } finally { clearTimeout(timer); }
}

async function runMongosyncController(input) {
  const action = String(input.action || "progress");
  const allowed = new Set(["progress", "start", "pause", "resume", "commit", "reverse"]);
  if (!allowed.has(action)) throw new Error("Unsupported mongosync lifecycle action");
  const port = mongosyncPort(input);
  if (action === "progress") {
    const response = await callLocalMongosync(port, "progress");
    return { ok: true, action, endpoint: `127.0.0.1:${port}`, ...response, collectedAt: new Date().toISOString() };
  }
  const expectedConfirmation = `APPLY MONGOSYNC ${action.toUpperCase()}`;
  if (String(input.confirmation || "") !== expectedConfirmation) throw new Error(`Type ${expectedConfirmation} to confirm this lifecycle action`);
  const before = await callLocalMongosync(port, "progress");
  const progress = before.progress || {};
  const permittedStates = { start: ["IDLE"], pause: ["RUNNING"], resume: ["PAUSED"], commit: ["RUNNING"], reverse: ["COMMITTED"] };
  if (!permittedStates[action].includes(progress.state)) throw new Error(`mongosync ${action} is not permitted while state is ${progress.state || "unknown"}`);
  if (action === "commit" && progress.canCommit !== true) throw new Error("mongosync reports canCommit=false; verify lag and embedded verifier status before cutover");
  let requestBody = {};
  if (action === "start") {
    const source = String(input.source || "cluster0"); const destination = String(input.destination || "cluster1");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(source) || !/^[A-Za-z0-9_-]{1,64}$/.test(destination) || source === destination) throw new Error("Enter distinct mongosync cluster aliases");
    requestBody = { source, destination, reversible: input.reversible === true };
    const buildIndexes = String(input.buildIndexes || "");
    if (buildIndexes && !["beforeDataCopy", "afterDataCopy", "excludeHashedAfterCopy", "never"].includes(buildIndexes)) throw new Error("Select a supported mongosync index-build mode");
    if (buildIndexes) requestBody.buildIndexes = buildIndexes;
  }
  const response = await callLocalMongosync(port, action, requestBody);
  return { ok: true, action, endpoint: `127.0.0.1:${port}`, before: progress, response, requestedAt: new Date().toISOString(), note: action === "commit" ? "Cutover requested. Poll progress until state is COMMITTED before redirecting application traffic." : "Lifecycle request accepted. Refresh progress to observe the state transition." };
}
async function routeApi(req, res, url, port) {
  if (req.method === "GET" && url.pathname === "/api/studio/pair" && isOperationsStudioOrigin(req)) return json(res, 200, { ok: true, token: SESSION_TOKEN, agent: { product: "DBridge Local Agent", version: "2.28.0", port } });
  if (!isTrusted(req, port)) return json(res, 403, { ok: false, error: "Request rejected by local security policy" });
  if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true, product: "DBridge Portable", version: "2.28.0", host: HOST, port });
  if (req.method === "GET" && url.pathname === "/api/tools/status") return json(res, 200, { ok: true, tools: await toolStatus() });
  if (req.method === "GET" && url.pathname === "/api/adapters") {
    const availability = Object.fromEntries(await Promise.all(Object.entries(sqlAdapterCatalog).map(async ([id, adapter]) => {
      const directAvailable = await directDriverAvailable(id);
      const clientAvailable = adapter.client ? (await available(adapter.client)).available : false;
      return [id, { directAvailable, clientAvailable }];
    })));
    const adapters = Object.fromEntries(Object.entries(sqlAdapterCatalog).map(([id, adapter]) => [id, { ...adapter, ...availability[id], available: availability[id].directAvailable || availability[id].clientAvailable, preferredAccess: availability[id].directAvailable ? "direct" : "client" }]));
    return json(res, 200, { ok: true, total: Object.keys(adapters).length, available: Object.values(adapters).filter((adapter) => adapter.available).length, adapters });
  }
  if (req.method === "POST" && url.pathname === "/api/connections/check") {
    const input = await body(req);
    const engine = String(input.engine || "").toLowerCase();
    const adapter = sqlAdapterCatalog[engine];
    if (!adapter) throw new Error("Select a supported database or warehouse adapter");
    const started = Date.now();
    const useDirect = await shouldUseDirectDriver(input);
    let result;
    if (useDirect) result = await validateDirectDatabase(input);
    else {
      if (!adapter.client) throw new Error(`The bundled ${adapter.driver} driver is unavailable. Re-extract the complete portable package.`);
      const found = await available(adapter.client);
      if (!found.available) throw new Error(`${adapter.client} was not found in PATH and this authentication mode cannot use the bundled direct driver.`);
      const sql = connectionValidationSql(engine);
      const spec = connectionCommand(input, sql);
      result = await run(spec.command, spec.args, { stdin: spec.stdin, env: spec.env, timeoutMs: Math.min(Math.max(Number(input.timeoutMs || 30000), 5000), 60000) });
    }
    const durationMs = Date.now() - started;
    if (result.code !== 0) return json(res, 422, { ok: false, error: result.stderr || result.stdout || "Connection validation failed", engine, durationMs, ...result });
    const { rows: _rows, ...publicResult } = result;
    const accessName = useDirect ? `${adapter.driver} bundled driver` : `${adapter.client} local client`;
    return json(res, 200, { ok: true, engine, access: useDirect ? "direct" : "client", adapter: { name: adapter.name, client: useDirect ? adapter.driver : adapter.client, tier: adapter.tier, auth: adapter.auth }, durationMs, checkedAt: new Date().toISOString(), checks: [{ label: useDirect ? "Bundled direct driver" : "Approved client", status: "pass", evidence: `${accessName} is ready` }, { label: "Connection & authentication", status: "pass", evidence: `Read-only validation completed in ${durationMs} ms` }, { label: "Diagnostic context", status: "pass", evidence: "Identity and database context were returned" }], ...publicResult });
  }
  if (req.method === "POST" && url.pathname === "/api/sql/catalog") {
    const input = await body(req);
    const engine = String(input.engine || "").toLowerCase();
    const adapter = sqlAdapterCatalog[engine];
    if (!adapter) throw new Error("Select a supported database or warehouse adapter");
    const started = Date.now();
    const useDirect = await shouldUseDirectDriver(input);
    if (useDirect) {
      const objects = await directDatabaseCatalog(input);
      return json(res, 200, { ok: true, engine, access: "direct", objects, count: objects.length, durationMs: Date.now() - started, collectedAt: new Date().toISOString(), truncated: objects.length >= 1500 });
    }
    if (!adapter.client) throw new Error(`The bundled ${adapter.driver} driver is unavailable. Re-extract the complete portable package.`);
    const found = await available(adapter.client);
    if (!found.available) throw new Error(`${adapter.client} was not found in PATH and this authentication mode cannot use the bundled direct driver.`);
    let spec;
    if (engine === "bigquery") {
      connectionCommand(input, "select 1");
      const project = String(input.connection?.database || "").trim();
      spec = { command: "bq", args: ["ls", "--format=prettyjson", "--max_results=1500", ...(project ? [`--project_id=${project}`] : [])] };
    } else spec = connectionCommand(input, databaseCatalogSql(engine));
    const result = await run(spec.command, spec.args, { stdin: spec.stdin, env: spec.env, timeoutMs: Math.min(Math.max(Number(input.timeoutMs || 45000), 5000), 60000) });
    const durationMs = Date.now() - started;
    if (result.code !== 0) return json(res, 422, { ok: false, error: result.stderr || result.stdout || "Database catalog collection failed", engine, durationMs, ...result });
    const objects = parseDatabaseCatalog(engine, result.stdout);
    return json(res, 200, { ok: true, engine, objects, count: objects.length, durationMs, collectedAt: new Date().toISOString(), truncated: result.truncated || objects.length >= 1500 });
  }
  if (req.method === "POST" && url.pathname === "/api/mongodb/studio") {
    const input = await body(req);
    return json(res, 200, await runMongoStudioAction(input));
  }
  if (req.method === "POST" && url.pathname === "/api/mongodb/mongosync") {
    const input = await body(req);
    return json(res, 200, await runMongosyncController(input));
  }
  if (req.method === "GET" && url.pathname === "/api/investigation") {
    const store = await readInvestigationStore();
    return json(res, 200, { ok: true, store });
  }
  if (req.method === "POST" && url.pathname === "/api/investigation/baselines") {
    const input = await body(req);
    const baseline = validateInvestigationBaseline(input);
    const store = await readInvestigationStore();
    store.baselines.unshift(baseline);
    store.baselines = store.baselines.slice(0, 100);
    await writeInvestigationStore(store);
    return json(res, 200, { ok: true, baseline, store });
  }
  if (req.method === "POST" && url.pathname === "/api/investigation/baselines/delete") {
    const input = await body(req);
    const id = String(input.id || "");
    if (!/^baseline-[a-f0-9]{16}$/.test(id)) throw new Error("Invalid baseline identifier");
    const store = await readInvestigationStore();
    const before = store.baselines.length;
    store.baselines = store.baselines.filter((baseline) => baseline.id !== id);
    if (store.baselines.length === before) throw new Error("The baseline no longer exists");
    await writeInvestigationStore(store);
    return json(res, 200, { ok: true, id, store });
  }
  if (req.method === "POST" && url.pathname === "/api/investigation/rules") {
    const input = await body(req);
    const store = await readInvestigationStore();
    store.rules = validateInvestigationRules(input);
    await writeInvestigationStore(store);
    return json(res, 200, { ok: true, rules: store.rules, store });
  }
  if (req.method === "POST" && url.pathname === "/api/investigation/events") {
    const input = await body(req);
    const event = validateInvestigationEvent(input);
    const store = await readInvestigationStore();
    store.events.push(event);
    store.events.sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
    store.events = store.events.slice(-500);
    await writeInvestigationStore(store);
    return json(res, 200, { ok: true, event, store });
  }
  if (req.method === "POST" && url.pathname === "/api/investigation/events/delete") {
    const input = await body(req);
    const id = String(input.id || "");
    if (!/^event-[a-f0-9]{16}$/.test(id)) throw new Error("Invalid incident event identifier");
    const store = await readInvestigationStore();
    const before = store.events.length;
    store.events = store.events.filter((event) => event.id !== id);
    if (store.events.length === before) throw new Error("The incident event no longer exists");
    await writeInvestigationStore(store);
    return json(res, 200, { ok: true, id, store });
  }
  if (req.method === "POST" && url.pathname === "/api/investigation/recordings") {
    const recording = validatePerformanceRecording(await body(req));
    const store = await readInvestigationStore();
    store.recordings.unshift(recording); store.recordings = store.recordings.slice(0, 50);
    await writeInvestigationStore(store);
    return json(res, 200, { ok: true, recording, store });
  }
  if (req.method === "POST" && url.pathname === "/api/investigation/recordings/delete") {
    const input = await body(req); const id = String(input.id || "");
    if (!/^recording-[a-f0-9]{16}$/.test(id)) throw new Error("Invalid flight recording identifier");
    const store = await readInvestigationStore(); const before = store.recordings.length; store.recordings = store.recordings.filter((recording) => recording.id !== id);
    if (before === store.recordings.length) throw new Error("The flight recording no longer exists");
    await writeInvestigationStore(store); return json(res, 200, { ok: true, id, store });
  }
  if (req.method === "POST" && url.pathname === "/api/investigation/devops-snapshots") {
    const snapshot = validateDevopsSnapshot(await body(req)); const store = await readInvestigationStore();
    store.devopsSnapshots.unshift(snapshot); store.devopsSnapshots = store.devopsSnapshots.slice(0, 100); await writeInvestigationStore(store);
    return json(res, 200, { ok: true, snapshot, store });
  }
  if (req.method === "POST" && url.pathname === "/api/investigation/devops-snapshots/delete") {
    const input = await body(req); const id = String(input.id || "");
    if (!/^snapshot-[a-f0-9]{16}$/.test(id)) throw new Error("Invalid DevOps snapshot identifier");
    const store = await readInvestigationStore(); const before = store.devopsSnapshots.length; store.devopsSnapshots = store.devopsSnapshots.filter((snapshot) => snapshot.id !== id);
    if (before === store.devopsSnapshots.length) throw new Error("The DevOps snapshot no longer exists");
    await writeInvestigationStore(store); return json(res, 200, { ok: true, id, store });
  }
  if (req.method === "POST" && url.pathname === "/api/investigation/runbooks") {
    const runbook = validateDevopsRunbook(await body(req)); const store = await readInvestigationStore();
    store.runbooks.unshift(runbook); store.runbooks = store.runbooks.slice(0, 100); await writeInvestigationStore(store);
    return json(res, 200, { ok: true, runbook, store });
  }
  if (req.method === "POST" && url.pathname === "/api/investigation/runbooks/delete") {
    const input = await body(req); const id = String(input.id || "");
    if (!/^runbook-[a-f0-9]{16}$/.test(id)) throw new Error("Invalid runbook identifier");
    const store = await readInvestigationStore(); const before = store.runbooks.length; store.runbooks = store.runbooks.filter((runbook) => runbook.id !== id);
    if (before === store.runbooks.length) throw new Error("The runbook no longer exists");
    await writeInvestigationStore(store); return json(res, 200, { ok: true, id, store });
  }
  if (req.method === "POST" && url.pathname === "/api/investigation/autofill-profiles") {
    const profile = validateAutofillProfile(await body(req)); const store = await readInvestigationStore(); store.autofillProfiles.unshift(profile); store.autofillProfiles = store.autofillProfiles.slice(0, 100); await writeInvestigationStore(store); return json(res, 200, { ok: true, profile, store });
  }
  if (req.method === "POST" && url.pathname === "/api/investigation/autofill-profiles/delete") {
    const input = await body(req); const id = String(input.id || ""); if (!/^autofill-[a-f0-9]{16}$/.test(id)) throw new Error("Invalid autofill profile identifier"); const store = await readInvestigationStore(); const before = store.autofillProfiles.length; store.autofillProfiles = store.autofillProfiles.filter((profile) => profile.id !== id); if (before === store.autofillProfiles.length) throw new Error("The autofill profile no longer exists"); await writeInvestigationStore(store); return json(res, 200, { ok: true, id, store });
  }
  if (req.method === "GET" && url.pathname === "/api/editor/session") return json(res, 200, { ok: true, session: await readEditorSession() });
  if (req.method === "POST" && url.pathname === "/api/editor/session") {
    const session = validateEditorSession(await body(req));
    await writeEditorSession(session);
    return json(res, 200, { ok: true, savedAt: new Date().toISOString(), tabCount: session.tabs.length });
  }
  if (req.method === "POST" && url.pathname === "/api/sql/run") {
    const input = await body(req);
    const sql = String(input.sql || "");
    if (!sql || sql.length > 50000) throw new Error("SQL must be between 1 and 50,000 characters");
    assertReadOnly(sql, input.allowWrites === true, String(input.engine || "").toLowerCase());
    const started = Date.now();
    if (await shouldUseDirectDriver(input)) {
      const result = await executeDirectDatabase(input, sql);
      const { rows: _rows, ...publicResult } = result;
      return json(res, 200, { ok: true, access: "direct", durationMs: Date.now() - started, ...publicResult });
    }
    const engine = String(input.engine || "").toLowerCase();
    const adapter = sqlAdapterCatalog[engine];
    if (!adapter) throw new Error("Select a supported database or warehouse adapter");
    if (!adapter.client) throw new Error(`The bundled ${adapter.driver} driver is unavailable. Re-extract the complete portable package.`);
    const found = await available(adapter.client);
    if (!found.available) throw new Error(`${adapter.client} was not found in PATH and this authentication mode cannot use the bundled direct driver.`);
    const spec = connectionCommand(input, sql);
    const result = await run(spec.command, spec.args, { stdin: spec.stdin, env: spec.env, timeoutMs: input.timeoutMs });
    return json(res, result.code === 0 ? 200 : 422, { ok: result.code === 0, access: "client", durationMs: Date.now() - started, ...result, command: spec.command });
  }
  if (req.method === "POST" && url.pathname === "/api/performance/diagnose") {
    const input = await body(req);
    const sql = diagnosticSql(String(input.engine || "").toLowerCase(), String(input.identifier || ""));
    const started = Date.now();
    const result = await executeDatabaseQuery(input, sql, input.timeoutMs || 45000);
    return json(res, result.code === 0 ? 200 : 422, { ok: result.code === 0, durationMs: Date.now() - started, diagnosticSql: sql, ...result });
  }
  if (req.method === "POST" && url.pathname === "/api/performance/sample") {
    const input = await body(req); const engine = String(input.engine || "").toLowerCase(); const sql = performanceSampleSql(engine); const started = Date.now();
    const result = await executeDatabaseQuery(input, sql, input.timeoutMs || 30000);
    if (result.code !== 0) return json(res, 422, { ok: false, error: result.stderr || result.stdout || "Performance sample failed", engine, durationMs: Date.now() - started, ...result });
    return json(res, 200, { ok: true, engine, collectedAt: new Date().toISOString(), durationMs: Date.now() - started, metrics: parsePerformanceSample(engine, result.stdout), truncated: result.truncated });
  }
  if (req.method === "POST" && url.pathname === "/api/performance/plan-capture") {
    const input = await body(req); const engine = String(input.engine || "").toLowerCase(); const identifier = String(input.identifier || "").trim(); const started = Date.now();
    const captured = await capturePlanForIdentifier(input, engine, identifier);
    return json(res, 200, { ok: true, engine, identifier, capturedAt: new Date().toISOString(), durationMs: Date.now() - started, ...captured });
  }
  if (req.method === "POST" && url.pathname === "/api/performance/plan-history") {
    const input = await body(req); const engine = String(input.engine || "").toLowerCase(); const identifier = String(input.identifier || "").trim(); const sql = planHistorySql(engine, identifier); const started = Date.now();
    const result = await executeDatabaseQuery(input, sql, input.timeoutMs || 45000);
    if (result.code !== 0) return json(res, 422, { ok: false, error: result.stderr || result.stdout || "Plan history capture failed", engine, durationMs: Date.now() - started, ...result });
    return json(res, 200, { ok: true, engine, identifier, capturedAt: new Date().toISOString(), durationMs: Date.now() - started, summary: summarizePlanHistory(engine, result.stdout), historySql: sql, ...result });
  }
  if (req.method === "GET" && url.pathname === "/api/performance/recommendation-catalog") {
    const catalog = Object.fromEntries(Object.entries(recommendationCatalog).map(([engine, definition]) => [engine, { name: definition.name, identifier: definition.identifier, source: definition.source }]));
    return json(res, 200, { ok: true, engines: Object.keys(catalog).length, catalog });
  }
  if (req.method === "POST" && url.pathname === "/api/performance/recommend") {
    const input = await body(req);
    const engine = String(input.engine || "").toLowerCase();
    const identifier = String(input.identifier || "").trim();
    const sql = recommendationSql(engine, identifier);
    const started = Date.now();
    const result = await executeDatabaseQuery(input, sql, input.timeoutMs || 45000);
    const durationMs = Date.now() - started;
    if (result.code !== 0) return json(res, 422, { ok: false, error: result.stderr || "The performance evidence query failed", durationMs, recommendationSql: sql, ...result });
    const metrics = parseRecommendationMetrics(engine, result.stdout);
    const investigation = await readInvestigationStore();
    const analysis = buildSqlRecommendations(engine, identifier, metrics, investigation.rules);
    return json(res, 200, { ok: true, engine, identifier, durationMs, metrics, recommendationSql: sql, ...analysis, stdout: result.stdout, stderr: result.stderr, truncated: result.truncated });
  }
  if (req.method === "GET" && url.pathname === "/api/performance/runtime-trace/catalog") {
    const catalog = Object.fromEntries(Object.entries(runtimeTraceCatalog).map(([engine, definition]) => [engine, {
      name: definition.name,
      identifier: definition.identifier,
      example: definition.example,
      equivalent: definition.equivalent,
      traceName: definition.traceName,
      limitation: definition.limitation,
      doc: definition.doc,
      checks: definition.checks.map(({ sql: _sql, ...check }) => check),
    }]));
    return json(res, 200, {
      ok: true,
      engines: Object.keys(catalog).length,
      totalChecks: Object.values(catalog).reduce((total, definition) => total + definition.checks.length, 0),
      catalog,
      safety: "Fixed read-only retained-evidence checks only. No trace, profiler, Query Store, Performance Schema, extension, session event or server setting is enabled or changed.",
    });
  }
  if (req.method === "POST" && url.pathname === "/api/performance/runtime-trace/capture") {
    const input = await body(req);
    const engine = String(input.engine || "").toLowerCase();
    const validated = validateRuntimeTraceInput(engine, input.identifier, input.collection);
    const definition = runtimeTraceCatalog[engine];
    const timeoutMs = Math.min(Math.max(Number(input.timeoutMs || 30000), 5000), 60000);
    let results;
    if (engine === "mongodb") results = await collectMongoRuntimeTrace({ ...input, engine, timeoutMs }, validated.identifier, validated.collection);
    else {
      results = [];
      for (const check of definition.checks) {
        const started = Date.now();
        const common = { id: check.id, label: check.label, phase: check.phase, importance: check.importance, guidance: check.guidance };
        try {
          const sql = runtimeTraceSql(engine, check, validated.identifier);
          const result = await executeDatabaseQuery({ ...input, engine }, sql, timeoutMs);
          const rows = Array.isArray(result.rows) ? result.rows.slice(0, 300) : [];
          const ok = result.code === 0;
          results.push({ ...common, ok, skipped: false, durationMs: Date.now() - started, rowCount: Number(result.rowCount ?? rows.length), rows, access: result.access, error: ok ? undefined : String(result.stderr || result.stdout || "Runtime trace evidence query failed").slice(0, 2000) });
        } catch (error) {
          results.push({ ...common, ok: false, skipped: false, durationMs: Date.now() - started, rows: [], error: String(error instanceof Error ? error.message : error).slice(0, 2000) });
        }
      }
    }
    const analysis = analyzeRuntimeTrace(engine, validated.identifier, validated.collection, results);
    return json(res, 200, {
      ok: true,
      engine,
      identifier: validated.identifier,
      collection: validated.collection,
      collectedAt: new Date().toISOString(),
      safety: "Retained evidence was read only. Trace-generation templates are text for DBA review and are never executed by this endpoint.",
      results,
      analysis,
    });
  }
  if (req.method === "GET" && url.pathname === "/api/performance/oracle-bottleneck/catalog") {
    const catalog = oracleBottleneckCatalog.map(({ sql: _sql, ...item }) => item);
    return json(res, 200, {
      ok: true,
      engine: "oracle",
      totalChecks: catalog.length,
      catalog,
      scopes: {
        core: "Core fixed and dictionary views only",
        diagnostics: "Core plus licensed Diagnostics Pack sources (ASH/AWR)",
        tuning: "Core plus licensed Diagnostics and Tuning Pack sources (ASH/AWR/SQL Monitor)",
      },
      safety: "Fixed read-only Oracle evidence. Core is the default. No pack-only view is queried unless its scope is explicitly selected.",
    });
  }
  if (req.method === "POST" && url.pathname === "/api/performance/oracle-bottleneck/analyze") {
    const input = await body(req);
    if (String(input.engine || "oracle").toLowerCase() !== "oracle") throw new Error("Oracle Bottleneck Intelligence requires an Oracle connection");
    const timeoutMs = Math.min(Math.max(Number(input.timeoutMs || 30000), 5000), 60000);
    const sqlId = String(input.sqlId || "").trim().toLowerCase();
    if (sqlId && !/^[a-z0-9]{13}$/.test(sqlId)) throw new Error("Oracle SQL_ID must contain exactly 13 letters or digits");
    const packScope = String(input.packScope || "core").toLowerCase();
    if (!["core", "diagnostics", "tuning"].includes(packScope)) throw new Error("Select an approved Oracle license scope");
    const allowedLicenses = packScope === "tuning" ? new Set(["core", "diagnostics", "tuning"]) : packScope === "diagnostics" ? new Set(["core", "diagnostics"]) : new Set(["core"]);
    const results = [];
    for (const definition of oracleBottleneckCatalog) {
      const common = {
        id: definition.id,
        label: definition.label,
        phase: definition.phase,
        license: definition.license,
        guidance: definition.guidance,
        sensitive: definition.sensitive === true,
      };
      if (!allowedLicenses.has(definition.license)) {
        results.push({ ...common, ok: false, skipped: true, durationMs: 0, rows: [], error: `${definition.license === "tuning" ? "Tuning" : "Diagnostics"} Pack scope was not selected` });
        continue;
      }
      if (definition.requiresSqlId && !sqlId) {
        results.push({ ...common, ok: false, skipped: true, durationMs: 0, rows: [], error: "Optional SQL_ID not supplied; database-wide checks continued" });
        continue;
      }
      const started = Date.now();
      try {
        const sql = definition.requiresSqlId ? definition.sql.replaceAll("__SQL_ID__", sqlId) : definition.sql;
        const result = await executeDatabaseQuery({ ...input, engine: "oracle" }, sql, timeoutMs);
        const rows = Array.isArray(result.rows) ? result.rows.slice(0, 250) : [];
        const ok = result.code === 0;
        results.push({
          ...common,
          ok,
          skipped: false,
          durationMs: Date.now() - started,
          rowCount: Number(result.rowCount ?? rows.length),
          rows,
          error: ok ? undefined : String(result.stderr || result.stdout || "Oracle evidence query failed").slice(0, 2000),
        });
      } catch (error) {
        results.push({
          ...common,
          ok: false,
          skipped: false,
          durationMs: Date.now() - started,
          rows: [],
          error: String(error instanceof Error ? error.message : error).slice(0, 2000),
        });
      }
    }
    const analysis = analyzeOracleBottlenecks(results, sqlId, packScope);
    return json(res, 200, {
      ok: true,
      engine: "oracle",
      sqlId,
      packScope,
      collectedAt: new Date().toISOString(),
      safety: analysis.safetyNote,
      results,
      analysis,
    });
  }
  if (req.method === "GET" && url.pathname === "/api/performance/oracle-sql-id/catalog") {
    return json(res, 200, { ok: true, engine: "oracle", totalChecks: oracleSqlIdCheckCatalog.length, catalog: oracleSqlIdCheckCatalog, licensingNote: "AWR, ASH and SQL Monitor sources require the appropriate Oracle Diagnostics or Tuning Pack license. DBridge does not enable packs or change database settings." });
  }
  if (req.method === "POST" && url.pathname === "/api/performance/oracle-sql-id/check") {
    const input = await body(req); const check = String(input.check || ""); const identifier = String(input.identifier || "").trim().toLowerCase(); const definition = oracleSqlIdCheckCatalog.find((item) => item.id === check); if (!definition) throw new Error("Select an approved Oracle SQL_ID investigation check");
    const sql = oracleSqlIdCheckSql(check, identifier);
    const packScope = String(input.packScope || "core").toLowerCase();
    if (!["core", "diagnostics", "tuning"].includes(packScope)) throw new Error("Select an approved Oracle license scope");
    const diagnosticsChecks = new Set(["history", "ash", "timeBySlaves", "ioLatency"]);
    const tuningChecks = new Set(["progress", "sqlMonitorReport", "parallelInfo", "currentLine"]);
    const requiredScope = tuningChecks.has(check) ? "tuning" : diagnosticsChecks.has(check) ? "diagnostics" : "core";
    if (requiredScope === "diagnostics" && packScope === "core") return json(res, 422, { ok: false, error: `${definition.label} requires explicit Diagnostics Pack scope`, engine: "oracle", identifier, check, requiredScope, skipped: true });
    if (requiredScope === "tuning" && packScope !== "tuning") return json(res, 422, { ok: false, error: `${definition.label} requires explicit Diagnostics + Tuning Pack scope`, engine: "oracle", identifier, check, requiredScope, skipped: true });
    const started = Date.now(); const result = await executeDatabaseQuery({ ...input, engine: "oracle" }, sql, input.timeoutMs || 60000); const durationMs = Date.now() - started;
    if (result.code !== 0) return json(res, 422, { ok: false, error: result.stderr || result.stdout || `${definition.label} failed`, engine: "oracle", identifier, check, label: definition.label, phase: definition.phase, source: definition.source, guidance: definition.guidance, durationMs, ...result });
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n"); const analysis = analyzeOracleSqlIdCheck(check, output);
    return json(res, 200, { ok: true, engine: "oracle", identifier, check, packScope, requiredScope, label: definition.label, phase: definition.phase, source: definition.source, guidance: definition.guidance, durationMs, analysis, collectedAt: new Date().toISOString(), ...result });
  }
  if (req.method === "GET" && url.pathname === "/api/performance/diagnostic-studio/catalog") {
    const catalog = diagnosticStudioCatalog();
    return json(res, 200, { ok: true, ...catalog });
  }
  if (req.method === "POST" && url.pathname === "/api/performance/diagnostic-studio/analyze") {
    const input = await body(req);
    const engine = String(input.engine || "").toLowerCase();
    const identifier = validateDiagnosticStudioIdentifier(engine, input.identifier);
    const playbookId = String(input.playbook || "slow-sql");
    const packScope = String(input.packScope || "core").toLowerCase();
    if (engine === "oracle" && !["core", "diagnostics", "tuning"].includes(packScope)) throw new Error("Select an approved Oracle license scope");
    const collected = await collectDiagnosticStudioEvidence(input, engine, playbookId, identifier, packScope);
    const report = buildDiagnosticIncidentReport({
      engine,
      playbookId,
      identifier,
      packScope,
      results: collected.results,
      analysis: collected.analysis,
      collectedAt: new Date().toISOString(),
    });
    return json(res, 200, { ...report, serverVersion: collected.serverVersion || undefined });
  }  if (req.method === "GET" && url.pathname === "/api/performance/catalog") {
    const catalog = Object.fromEntries(Object.entries(tuningChecks).map(([engine, checks]) => [engine, Object.fromEntries(Object.entries(checks).map(([id, check]) => [id, { label: check.label, guidance: check.guidance }]))]));
    return json(res, 200, { ok: true, engines: Object.keys(catalog).length, totalChecks: Object.values(catalog).reduce((sum, checks) => sum + Object.keys(checks).length, 0), catalog });
  }
  if (req.method === "GET" && url.pathname === "/api/performance/postgres-bottleneck/catalog") {
    const catalog = postgresBottleneckCatalog.map(({ sql: _sql, ...item }) => item);
    return json(res, 200, {
      ok: true,
      engine: "postgres",
      totalChecks: catalog.length,
      catalog,
      safety: "Fixed read-only PostgreSQL statistics queries. No session is cancelled and no setting, object, or extension is changed.",
    });
  }
  if (req.method === "POST" && url.pathname === "/api/performance/postgres-bottleneck/analyze") {
    const input = await body(req);
    if (String(input.engine || "postgres").toLowerCase() !== "postgres") throw new Error("PostgreSQL Bottleneck Intelligence requires a PostgreSQL connection");
    const timeoutMs = Math.min(Math.max(Number(input.timeoutMs || 30000), 5000), 60000);
    const queryId = String(input.queryId || "").trim();
    if (queryId && !/^-?\d{1,20}$/.test(queryId)) throw new Error("PostgreSQL queryid must be a signed integer with at most 20 digits");
    const results = [];
    let serverVersion = 0;
    for (const definition of postgresBottleneckCatalog) {
      if (definition.requiresQueryId && !queryId) {
        results.push({
          id: definition.id,
          label: definition.label,
          phase: definition.phase,
          guidance: definition.guidance,
          ok: false,
          skipped: true,
          durationMs: 0,
          rows: [],
          error: "Optional queryid not supplied; database-wide checks continued",
        });
        continue;
      }
      if (definition.minVersion && (!serverVersion || serverVersion < definition.minVersion)) {
        results.push({
          id: definition.id,
          label: definition.label,
          phase: definition.phase,
          guidance: definition.guidance,
          ok: false,
          skipped: true,
          durationMs: 0,
          rows: [],
          error: serverVersion
            ? `Requires PostgreSQL ${Math.floor(definition.minVersion / 10000)} or newer`
            : "Server version was unavailable; optional version-specific check skipped",
        });
        continue;
      }
      if (definition.maxVersion && serverVersion && serverVersion > definition.maxVersion) {
        results.push({
          id: definition.id,
          label: definition.label,
          phase: definition.phase,
          guidance: definition.guidance,
          ok: false,
          skipped: true,
          durationMs: 0,
          rows: [],
          error: `Used only through PostgreSQL ${Math.floor(definition.maxVersion / 10000)}; a newer statistics view is checked instead`,
        });
        continue;
      }
      const started = Date.now();
      try {
        const sql = definition.requiresQueryId ? definition.sql.replaceAll("__QUERY_ID__", queryId) : definition.sql;
        const result = await executeDatabaseQuery({ ...input, engine: "postgres" }, sql, timeoutMs);
        let rows = Array.isArray(result.rows) ? result.rows.slice(0, 100) : [];
        if (!rows.length && result.stdout) {
          try {
            const parsed = JSON.parse(result.stdout);
            if (Array.isArray(parsed)) rows = parsed.slice(0, 100);
          } catch {}
        }
        const ok = result.code === 0;
        results.push({
          id: definition.id,
          label: definition.label,
          phase: definition.phase,
          guidance: definition.guidance,
          ok,
          skipped: false,
          durationMs: Date.now() - started,
          rowCount: Number(result.rowCount ?? rows.length),
          rows,
          error: ok ? undefined : String(result.stderr || result.stdout || "PostgreSQL evidence query failed").slice(0, 2000),
        });
        if (definition.id === "environment" && ok) serverVersion = Number(rows[0]?.server_version_num || 0);
      } catch (error) {
        results.push({
          id: definition.id,
          label: definition.label,
          phase: definition.phase,
          guidance: definition.guidance,
          ok: false,
          skipped: false,
          durationMs: Date.now() - started,
          rows: [],
          error: String(error instanceof Error ? error.message : error).slice(0, 2000),
        });
      }
    }
    const analysis = analyzePostgresBottlenecks(results, queryId);
    return json(res, 200, {
      ok: true,
      engine: "postgres",
      queryId,
      serverVersion,
      collectedAt: new Date().toISOString(),
      safety: "Read-only evidence collection completed. Recommendations require verification and normal change control.",
      results,
      analysis,
    });
  }
  if (req.method === "GET" && url.pathname === "/api/performance/mongodb-bottleneck/catalog") {
    return json(res, 200, {
      ok: true,
      engine: "mongodb",
      totalChecks: mongodbBottleneckCatalog.length,
      catalog: mongodbBottleneckCatalog,
      safety: "Direct-driver read-only evidence. No profiler, query setting, plan cache, index, operation, balancer, or topology change is made.",
    });
  }
  if (req.method === "POST" && url.pathname === "/api/performance/mongodb-bottleneck/analyze") {
    const input = await body(req);
    if (String(input.engine || "mongodb").toLowerCase() !== "mongodb") throw new Error("MongoDB Performance Intelligence requires a MongoDB connection");
    const operationId = String(input.operationId || "").trim();
    const collection = String(input.collection || "").trim();
    if (operationId && (operationId.length > 128 || /[\r\n\0]/.test(operationId))) throw new Error("MongoDB operation/comment focus must be at most 128 characters");
    if (collection && (collection.length > 255 || /[\r\n\0$]/.test(collection))) throw new Error("Enter a valid MongoDB collection name");
    const results = await collectMongoBottleneckEvidence(input, { operationId, collection });
    const analysis = analyzeMongoBottlenecks(results, { operationId, collection });
    const environment = results.find((item) => item.id === "environment" && item.ok)?.rows?.[0] || {};
    return json(res, 200, {
      ok: true,
      engine: "mongodb",
      operationId,
      collection,
      serverVersion: environment.version || "",
      topology: environment.role || "",
      collectedAt: new Date().toISOString(),
      safety: "Read-only evidence collection completed. Recommendations require a second snapshot, verification, and normal change control.",
      results,
      analysis,
    });
  }
  if (req.method === "GET" && url.pathname === "/api/performance/relational-bottleneck/catalog") {
    const engine = String(url.searchParams.get("engine") || "").toLowerCase();
    const definitions = relationalBottleneckCatalogs[engine];
    if (!definitions) throw new Error("Advanced relational packs support MySQL, MariaDB, and SQL Server");
    return json(res, 200, {
      ok: true,
      engine,
      totalChecks: definitions.length,
      catalog: definitions.map(({ sql: _sql, ...definition }) => definition),
      safety: "Fixed read-only database evidence only. No server, session, plan, Query Store, replication, index, statistics, configuration, or instrumentation state is changed.",
    });
  }
  if (req.method === "POST" && url.pathname === "/api/performance/relational-bottleneck/analyze") {
    const input = await body(req);
    const engine = String(input.engine || "").toLowerCase();
    const definitions = relationalBottleneckCatalogs[engine];
    if (!definitions) throw new Error("Advanced relational packs support MySQL, MariaDB, and SQL Server");
    const identifier = String(input.identifier || "").trim();
    if (identifier && ["mysql", "mariadb"].includes(engine) && !/^[a-f0-9]{64}$/i.test(identifier)) {
      throw new Error(`${engine === "mariadb" ? "MariaDB" : "MySQL"} statement digest must contain exactly 64 hexadecimal characters`);
    }
    if (identifier && engine === "sqlserver" && !/^0x[a-f0-9]{16}$/i.test(identifier)) {
      throw new Error("SQL Server query hash must use the 0x prefix followed by exactly 16 hexadecimal characters");
    }
    const timeoutMs = Math.min(Math.max(Number(input.timeoutMs || 30000), 5000), 60000);
    const results = [];
    for (const definition of definitions) {
      const common = {
        id: definition.id,
        label: definition.label,
        phase: definition.phase,
        guidance: definition.guidance,
      };
      if (definition.requiresIdentifier && !identifier) {
        results.push({
          ...common,
          ok: false,
          skipped: true,
          durationMs: 0,
          rows: [],
          error: "Optional statement identifier not supplied; database-wide checks continued",
        });
        continue;
      }
      const started = Date.now();
      try {
        const sql = definition.requiresIdentifier ? definition.sql.replaceAll("__IDENTIFIER__", identifier) : definition.sql;
        const result = await executeDatabaseQuery({ ...input, engine }, sql, timeoutMs);
        const rows = Array.isArray(result.rows) ? result.rows.slice(0, 250) : [];
        const ok = result.code === 0;
        results.push({
          ...common,
          ok,
          skipped: false,
          durationMs: Date.now() - started,
          rowCount: Number(result.rowCount ?? rows.length),
          rows,
          error: ok ? undefined : String(result.stderr || result.stdout || `${definition.label} evidence query failed`).slice(0, 2000),
        });
      } catch (error) {
        results.push({
          ...common,
          ok: false,
          skipped: false,
          durationMs: Date.now() - started,
          rows: [],
          error: String(error instanceof Error ? error.message : error).slice(0, 2000),
        });
      }
    }
    const analysis = analyzeRelationalBottlenecks(engine, results, identifier);
    const environment = results.find((item) => item.id === "environment" && item.ok)?.rows?.[0] || {};
    return json(res, 200, {
      ok: true,
      engine,
      identifier,
      serverVersion: environment.version || environment.product_version || "",
      edition: environment.edition || environment.version_comment || "",
      collectedAt: new Date().toISOString(),
      safety: analysis.safetyNote,
      results,
      analysis,
    });
  }  if (req.method === "POST" && url.pathname === "/api/performance/check") {
    const input = await body(req);
    const engine = String(input.engine || "").toLowerCase();
    const check = String(input.check || "");
    const definition = tuningChecks[engine]?.[check];
    if (!definition) throw new Error("Select a supported database tuning check");
    const started = Date.now();
    const result = await executeDatabaseQuery(input, definition.sql, input.timeoutMs || 45000);
    return json(res, result.code === 0 ? 200 : 422, { ok: result.code === 0, engine, check, label: definition.label, guidance: definition.guidance, durationMs: Date.now() - started, ...result });
  }
  if (req.method === "GET" && url.pathname === "/api/logs/migration-compare/catalog") {
    return json(res, 200, { ok: true, engines: migrationLogEngines, maxLogBytes: 3500000, safety: "Pasted logs are parsed in memory by the loopback agent and are not stored, uploaded, or used to run database commands." });
  }
  if (req.method === "POST" && url.pathname === "/api/logs/migration-compare") {
    const input = await body(req);
    const analysis = compareMigrationLogs(input);
    return json(res, 200, { ...analysis, clean: analysis.ok, ok: true });
  }
  if (req.method === "POST" && url.pathname === "/api/logs/tail") {
    const input = await body(req);
    const path = resolve(String(input.path || ""));
    const result = await tailFile(path, Number(input.offset || 0), Number(input.historyBytes || MAX_TAIL));
    return json(res, 200, { ok: true, path, ...result });
  }
  if (req.method === "POST" && url.pathname === "/api/logs/telemetry") {
    const input = await body(req);
    const source = String(input.source || "").toLowerCase();
    const adapter = telemetryAdapters[source];
    if (!adapter) throw new Error("Unsupported cloud telemetry adapter");
    const target = String(input.target || "").trim();
    if (adapter.target && !/^[A-Za-z0-9_./:=@+ -]{1,512}$/.test(target)) throw new Error("This source requires a valid resource, cluster, or log-group identifier");
    const found = await available(adapter.command);
    if (!found.available) throw new Error(`${adapter.command} was not found in PATH. Use the company-approved CLI for this warehouse.`);
    const result = await run(adapter.command, adapter.args(target), { timeoutMs: 45000 });
    return json(res, result.code === 0 ? 200 : 422, { ok: result.code === 0, source, command: adapter.command, collectedAt: new Date().toISOString(), ...result });
  }
  if (req.method === "POST" && url.pathname === "/api/logs/remote-tail") {
    const input = await body(req);
    const spec = remoteTailSpec(input);
    const found = await available(spec.command);
    if (!found.available) throw new Error("OpenSSH client was not found in PATH. Ask IT to enable the approved Windows OpenSSH client.");
    const result = await run(spec.command, spec.args, { timeoutMs: 30000 });
    return json(res, result.code === 0 ? 200 : 422, { ok: result.code === 0, command: spec.command, server: `${spec.user}@${spec.host}:${spec.port}`, path: spec.path, serverOs: spec.serverOs, collectedAt: new Date().toISOString(), ...result });
  }
  if (req.method === "POST" && url.pathname === "/api/logs/native") {
    const input = await body(req);
    const engine = String(input.engine || "").toLowerCase();
    const windowHours = Number(input.windowHours || 24);
    const sql = nativeLogQuery(engine, windowHours);
    const result = await executeDatabaseQuery(input, sql, 45000);
    return json(res, result.code === 0 ? 200 : 422, { ok: result.code === 0, engine, windowHours, collectedAt: new Date().toISOString(), ...result });
  }
  if (req.method === "POST" && url.pathname === "/api/traces/analyze") {
    const input = await body(req);
    const path = resolve(String(input.path || ""));
    const data = await readFile(path);
    if (data.length > 8 * 1024 * 1024) throw new Error("Trace file exceeds the 8 MB analysis limit");
    return json(res, 200, { ok: true, analysis: parseTrace(data.toString("utf8"), path) });
  }
  if (req.method === "POST" && url.pathname === "/api/oracle/trace/analyze") {
    const input = await body(req);
    const traceText = String(input.text || "");
    const sourceName = String(input.sourceName || "Pasted Oracle trace").trim();
    if (!traceText || Buffer.byteLength(traceText) > 6 * 1024 * 1024) throw new Error("Oracle trace content must be between 1 byte and 6 MB");
    if (!sourceName || sourceName.length > 200 || /[\r\n\0]/.test(sourceName)) throw new Error("Enter a valid trace source name");
    return json(res, 200, { ok: true, analysis: parseOracleTrace(traceText, sourceName), analyzedAt: new Date().toISOString() });
  }
  if (req.method === "POST" && url.pathname === "/api/oracle/tkprof") {
    const input = await body(req);
    const sort = String(input.sort || "exeela").toLowerCase();
    const allowedSorts = new Set(["exeela", "execpu", "exedsk", "exequery", "exerow", "fchela", "fchrow", "prsela"]);
    if (!allowedSorts.has(sort)) throw new Error("Select an approved TKPROF sort method");
    const print = Number(input.print || 0);
    if (!Number.isInteger(print) || print < 0 || print > 100000) throw new Error("TKPROF statement limit must be between 0 and 100,000");
    const rawPath = String(input.path || "").trim();
    if (!rawPath || rawPath.length > 1024 || /[\r\n\0]/.test(rawPath)) throw new Error("Enter a valid Oracle trace file path");
    const tracePath = resolve(rawPath);
    const traceInfo = await stat(tracePath);
    if (!traceInfo.isFile()) throw new Error("The Oracle trace path is not a file");
    if (traceInfo.size > 512 * 1024 * 1024) throw new Error("TKPROF input is limited to 512 MB");
    const found = await available("tkprof");
    if (!found.available) throw new Error("tkprof was not found in PATH. Use the company-approved Oracle client that includes TKPROF.");
    await mkdir(TKPROF_ROOT, { recursive: true });
    const outputPath = join(TKPROF_ROOT, `tkprof-${randomBytes(10).toString("hex")}.txt`);
    const args = [tracePath, outputPath, `sort=${sort}`, `sys=${input.includeSys === true ? "yes" : "no"}`, `aggregate=${input.aggregate === false ? "no" : "yes"}`, `waits=${input.includeWaits === false ? "no" : "yes"}`];
    if (print) args.push(`print=${print}`);
    const started = Date.now();
    let result;
    let report = "";
    let reportTruncated = false;
    try {
      result = await run("tkprof", args, { timeoutMs: 60000 });
      try {
        const reportInfo = await stat(outputPath);
        const length = Math.min(reportInfo.size, MAX_OUTPUT);
        const handle = await open(outputPath, "r");
        try {
          const buffer = Buffer.alloc(length);
          await handle.read(buffer, 0, length, 0);
          report = buffer.toString("utf8");
          reportTruncated = reportInfo.size > length;
        } finally { await handle.close(); }
      } catch (error) { if (error?.code !== "ENOENT") throw error; }
    } finally { await unlink(outputPath).catch((error) => { if (error?.code !== "ENOENT") throw error; }); }
    const ok = result?.code === 0 && Boolean(report);
    return json(res, ok ? 200 : 422, { ok, error: ok ? undefined : result?.stderr || result?.stdout || "TKPROF did not produce a report", durationMs: Date.now() - started, sourceName: tracePath.split(/[\\/]/).pop(), sourceBytes: traceInfo.size, sort, command: "tkprof", report, reportTruncated, summary: parseTkprofOutput(report), stdout: result?.stdout || "", stderr: result?.stderr || "", code: result?.code ?? -1 });
  }
  if (req.method === "GET" && url.pathname === "/api/devops/version-comparison") {
    const [current, baseline] = await Promise.all([toolStatus(), readVersionBaseline()]);
    return json(res, 200, { ok: true, comparison: compareToolVersions(current, baseline) });
  }
  if (req.method === "POST" && url.pathname === "/api/devops/version-baseline") {
    const current = await toolStatus();
    const baseline = await writeVersionBaseline(current);
    return json(res, 200, { ok: true, comparison: compareToolVersions(current, baseline) });
  }
  if (req.method === "POST" && url.pathname === "/api/devops/run") {
    const input = await body(req);
    const spec = devopsCommand(input);
    if (String(input.cwd || "").length > 1024 || /[\r\n\0]/.test(String(input.cwd || ""))) throw new Error("Enter a valid working folder");
    const cwd = input.cwd ? resolve(String(input.cwd)) : ROOT;
    const found = await available(spec.command);
    if (!found.available) throw new Error(`${spec.command} was not found in PATH. Use the company-approved client for this method.`);
    const started = Date.now();
    const result = await run(spec.command, spec.args, { cwd, stdin: spec.stdin, timeoutMs: 45000 });
    return json(res, result.code === 0 ? 200 : 422, { ok: result.code === 0, tool: input.tool, action: input.action, durationMs: Date.now() - started, command: spec.command, displayCommand: spec.displayCommand, ...result });
  }
  if (req.method === "POST" && url.pathname === "/api/goldengate/diagnose") {
    const input = await body(req); const architecture = input.architecture === "classic" ? "classic" : "microservices"; const spec = architecture === "classic" ? goldenGateClassicSpec(input) : goldenGateAdminClientSpec(input); const found = await available(spec.command);
    if (!found.available) throw new Error(architecture === "classic" ? "ssh was not found in PATH. Use the company-approved Windows OpenSSH client." : "adminclient was not found in PATH. Add the company-approved Oracle GoldenGate Admin Client to PATH.");
    const started = Date.now(); const result = await run(spec.command, spec.args, { stdin: spec.stdin, timeoutMs: 60000 }); const combined = [result.stdout, result.stderr].filter(Boolean).join("\n"); const analysis = parseGoldenGateDiagnostics(combined);
    return json(res, result.code === 0 ? 200 : 422, { ok: result.code === 0, error: result.code === 0 ? undefined : combined || "GoldenGate diagnostic failed", architecture, action: spec.action, group: spec.group, displayCommand: spec.displayCommand, collectedAt: new Date().toISOString(), durationMs: Date.now() - started, analysis, ...result });
  }
  if (req.method === "POST" && url.pathname === "/api/devops/kubernetes-topology") {
    const input = await body(req); const spec = kubernetesTopologyCommand(input); const found = await available(spec.command);
    if (!found.available) throw new Error("kubectl was not found in PATH. Use the company-approved Kubernetes client.");
    const started = Date.now(); const result = await run(spec.command, spec.args, { timeoutMs: 45000 });
    return json(res, result.code === 0 ? 200 : 422, { ok: result.code === 0, error: result.code === 0 ? undefined : result.stderr || result.stdout || "Kubernetes topology capture failed", durationMs: Date.now() - started, displayCommand: spec.displayCommand, ...result });
  }
  if (req.method === "POST" && url.pathname === "/api/devops/kubernetes-dashboard") {
    const input = await body(req); const result = await collectDashboardSections(kubernetesDashboardSpecs(input), "kubectl was not found in PATH. Use the company-approved Kubernetes client.");
    return json(res, result.ok ? 200 : 422, result);
  }
  if (req.method === "POST" && url.pathname === "/api/devops/docker-dashboard") {
    await body(req); const result = await collectDashboardSections(dockerDashboardSpecs(), "docker was not found in PATH. Use the company-approved Docker client.");
    return json(res, result.ok ? 200 : 422, result);
  }
  if (req.method === "GET" && url.pathname === "/api/devops/container-actions/audit") return json(res, 200, { ok: true, records: await readContainerAuditRecords() });
  if (req.method === "POST" && url.pathname === "/api/devops/container-action/preview") {
    const input = await body(req); const spec = containerWriteActionSpec(input, false); const found = await available(spec.command);
    if (!found.available) throw new Error(`${spec.command} was not found in PATH. Use the company-approved platform client.`);
    const preflight = containerPreflightSpec(spec); const started = Date.now(); const result = await run(preflight.command, preflight.args, { timeoutMs: 30000 }); const permitted = preflight.pass(result);
    return json(res, 200, { ok: true, permitted, platform: spec.platform, action: spec.action, target: spec.target, displayCommand: spec.displayCommand, preflightCommand: preflight.displayCommand, evidence: [result.stdout, result.stderr].filter(Boolean).join("\n").slice(0, 4000), durationMs: Date.now() - started });
  }
  if (req.method === "POST" && url.pathname === "/api/devops/container-action") {
    const input = await body(req); const spec = containerWriteActionSpec(input); const found = await available(spec.command);
    if (!found.available) throw new Error(`${spec.command} was not found in PATH. Use the company-approved platform client.`);
    const preflight = containerPreflightSpec(spec); const preflightResult = await run(preflight.command, preflight.args, { timeoutMs: 30000 });
    if (!preflight.pass(preflightResult)) {
      const detail = [preflightResult.stdout, preflightResult.stderr].filter(Boolean).join("\n") || "Permission preflight did not pass"; let audit = null; let auditWarning = ""; try { audit = await appendContainerAuditRecord({ ...spec, status: "blocked", displayCommand: spec.displayCommand, detail }); } catch (error) { auditWarning = error.message; }
      return json(res, 403, { ok: false, error: `Permission preflight blocked this change: ${detail}`, displayCommand: spec.displayCommand, preflightCommand: preflight.displayCommand, audit, auditWarning });
    }
    const started = Date.now(); const result = await run(spec.command, spec.args, { timeoutMs: 60000 }); const durationMs = Date.now() - started; const detail = [result.stdout, result.stderr].filter(Boolean).join("\n") || (result.code === 0 ? "Action completed" : "Container action failed");
    let audit = null; let auditWarning = ""; try { audit = await appendContainerAuditRecord({ ...spec, status: result.code === 0 ? "success" : "failed", durationMs, displayCommand: spec.displayCommand, detail }); } catch (error) { auditWarning = error.message; }
    return json(res, result.code === 0 ? 200 : 422, { ok: result.code === 0, error: result.code === 0 ? undefined : detail, platform: spec.platform, action: spec.action, target: spec.target, displayCommand: spec.displayCommand, durationMs, audit, auditWarning, ...result });
  }
  if (req.method === "POST" && url.pathname === "/api/devops/pipeline-runs") {
    const input = await body(req); const spec = githubPipelineCommand(input); const found = await available(spec.command);
    if (!found.available) throw new Error("gh was not found in PATH. Use the company-approved GitHub CLI.");
    const started = Date.now(); const result = await run(spec.command, spec.args, { timeoutMs: 45000 });
    return json(res, result.code === 0 ? 200 : 422, { ok: result.code === 0, error: result.code === 0 ? undefined : result.stderr || result.stdout || "GitHub pipeline capture failed", durationMs: Date.now() - started, displayCommand: spec.displayCommand, ...result });
  }
  if (req.method === "POST" && url.pathname === "/api/devops/kafka-lag") {
    const input = await body(req); const spec = kafkaLagCommand(input); const found = await available(spec.command);
    if (!found.available) throw new Error("kafka-consumer-groups.bat was not found in PATH. Use the company-approved Kafka client.");
    const started = Date.now(); const result = await run(spec.command, spec.args, { timeoutMs: 45000 });
    return json(res, result.code === 0 ? 200 : 422, { ok: result.code === 0, error: result.code === 0 ? undefined : result.stderr || result.stdout || "Kafka lag capture failed", durationMs: Date.now() - started, displayCommand: spec.displayCommand, ...result });
  }
  if (req.method === "POST" && url.pathname === "/api/terminal/ssh/preflight") {
    const input = await body(req);
    const target = await preflightSshTarget(input);
    return json(res, 200, { ok: true, target });
  }
  if (req.method === "POST" && url.pathname === "/api/terminal/ssh/trust/forget") {
    const input = await body(req);
    const result = await forgetSshHostTrust(input);
    return json(res, 200, { ok: true, ...result });
  }
  if (req.method === "GET" && url.pathname === "/api/terminal/ssh/limits") {
    return json(res, 200, { ok: true, limits: SSH_TERMINAL_LIMITS, sessions: listSshSessions() });
  }
  if (req.method === "POST" && url.pathname === "/api/terminal/ssh/open") {
    const input = await body(req);
    const session = await openSshSession(input);
    return json(res, 200, { ok: true, ...session });
  }
  if (req.method === "GET" && url.pathname === "/api/terminal/ssh/stream") {
    // Streams until the client disconnects, so it must not fall through to json().
    return attachSshStream(url.searchParams.get("session"), res, securityHeaders);
  }
  if (req.method === "POST" && url.pathname === "/api/terminal/ssh/input") {
    const input = await body(req);
    return json(res, 200, { ok: true, ...writeToSshSession(input.sessionId, input.data) });
  }
  if (req.method === "POST" && url.pathname === "/api/terminal/ssh/resize") {
    const input = await body(req);
    return json(res, 200, { ok: true, ...resizeSshSession(input.sessionId, input.cols, input.rows) });
  }
  if (req.method === "POST" && url.pathname === "/api/terminal/ssh/forward/open") {
    const input = await body(req);
    const forward = await openSshLocalForward(input.sessionId, input);
    return json(res, 200, { ok: true, forward, forwards: listSshForwards(input.sessionId) });
  }
  if (req.method === "POST" && url.pathname === "/api/terminal/ssh/forward/close") {
    const input = await body(req);
    await closeSshForward(input.sessionId, input.forwardId);
    return json(res, 200, { ok: true, forwards: listSshForwards(input.sessionId) });
  }
  if (req.method === "POST" && url.pathname === "/api/terminal/ssh/sftp/list") {
    const input = await body(req);
    const listing = await listSftpDirectory(input.sessionId, input.path);
    return json(res, 200, { ok: true, ...listing });
  }
  if (req.method === "POST" && url.pathname === "/api/terminal/ssh/sftp/read") {
    const input = await body(req);
    const file = await readSftpFile(input.sessionId, input.path);
    return json(res, 200, { ok: true, file });
  }
  if (req.method === "POST" && url.pathname === "/api/terminal/ssh/close") {
    const input = await body(req);
    return json(res, 200, { ok: true, ...closeSshSession(input.sessionId) });
  }
  return json(res, 404, { ok: false, error: "API endpoint not found" });
}

function createAppServer(port) {
  return createServer(async (req, res) => {
    try {
      if (!hasLocalHostHeader(req, port)) return json(res, 403, { ok: false, error: "Local host header required" });
      applyOperationsStudioCors(req, res);
      const url = new URL(req.url || "/", `http://${HOST}:${port}`);
      if (req.method === "OPTIONS" && url.pathname.startsWith("/api/") && isOperationsStudioOrigin(req)) { res.writeHead(204, { "Access-Control-Allow-Origin": req.headers.origin, "Access-Control-Allow-Headers": "Content-Type, X-DBridge-Token", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "600", "Cross-Origin-Resource-Policy": "cross-origin", Vary: "Origin" }); res.end(); return; }
      if (url.pathname.startsWith("/api/")) return await routeApi(req, res, url, port);
      let path = url.pathname === "/" ? join(APP_ROOT, "index.html") : resolve(APP_ROOT, `.${url.pathname}`);
      if (!path.startsWith(resolve(APP_ROOT))) return json(res, 403, { error: "Forbidden" });
      let content = await readFile(path);
      if (path.endsWith("index.html")) content = Buffer.from(content.toString("utf8").replaceAll("__DBRIDGE_TOKEN__", SESSION_TOKEN));
      res.writeHead(200, { ...securityHeaders, "Content-Type": mimeTypes[extname(path)] || "application/octet-stream", "Content-Security-Policy": "default-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:" });
      res.end(content);
    } catch (error) {
      if (error?.code === "ENOENT") return json(res, 404, { error: "Not found" });
      json(res, 500, { ok: false, error: error instanceof Error ? error.message : "Unexpected local service error" });
    }
  });
}

async function listen() {
  for (let port = DEFAULT_PORT; port < DEFAULT_PORT + 10; port += 1) {
    const server = createAppServer(port);
    try {
      await new Promise((resolveListen, rejectListen) => { server.once("error", rejectListen); server.listen(port, HOST, resolveListen); });
      const url = `http://${HOST}:${port}`;
      console.log(`DBridge Portable is running at ${url}`);
      console.log("Close this window to stop DBridge.");
      await openBrowser(url);
      return;
    } catch (error) {
      server.close();
      if (error?.code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("No free DBridge port was found between 17864 and 17873");
}

// Remote shells must not outlive the local service.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => { closeAllSshSessions(); process.exit(0); });
}
process.on("exit", () => closeAllSshSessions());

listen().catch((error) => { console.error(`DBridge failed to start: ${error.message}`); process.exitCode = 1; });
