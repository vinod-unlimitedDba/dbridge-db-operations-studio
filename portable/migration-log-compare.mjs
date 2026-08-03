const MAX_LOG_BYTES = 3_500_000;
const MAX_DIFF_LINES = 5000;
const MAX_DIFF_ROWS = 2500;
const MAX_EVIDENCE_LINES = 3;

export const migrationLogEngines = {
  auto: { label: "Auto-detect", tools: "Data Pump, pg_dump/pg_restore, mysqldump/mariadb-dump, SqlPackage, mongodump/mongorestore" },
  oracle: { label: "Oracle", tools: "expdp / impdp (Data Pump)" },
  postgres: { label: "PostgreSQL", tools: "pg_dump / pg_restore / psql" },
  mysql: { label: "MySQL", tools: "mysqldump / mysql" },
  mariadb: { label: "MariaDB", tools: "mariadb-dump / mariadb" },
  sqlserver: { label: "SQL Server", tools: "SqlPackage / BACPAC / bcp" },
  mongodb: { label: "MongoDB", tools: "mongodump / mongorestore" },
};

const references = {
  oracle: { label: "Oracle Data Pump", url: "https://docs.oracle.com/en/database/oracle/oracle-database/21/sutil/oracle-database-utilities.pdf" },
  postgres: { label: "PostgreSQL pg_restore", url: "https://www.postgresql.org/docs/current/app-pgrestore.html" },
  mysql: { label: "MySQL mysqldump", url: "https://dev.mysql.com/doc/refman/8.4/en/using-mysqldump.html" },
  mariadb: { label: "MariaDB dump", url: "https://mariadb.com/docs/server/clients-and-utilities/backup-restore-and-import-clients/mariadb-dump" },
  sqlserver: { label: "SQL Server SqlPackage", url: "https://learn.microsoft.com/en-us/sql/tools/sqlpackage/sqlpackage-publish" },
  mongodb: { label: "MongoDB mongorestore", url: "https://www.mongodb.com/docs/database-tools/mongorestore/" },
};

function safeText(value) { return String(value ?? "").replaceAll("\0", ""); }
function compactLine(value) { return safeText(value).replace(/\s+/g, " ").trim().slice(0, 1200); }
function toNumber(value) { const raw = String(value ?? "").replaceAll(",", "").trim(); if (!raw) return null; const number = Number(raw); return Number.isFinite(number) ? number : null; }
function canonicalName(value) {
  return compactLine(value)
    .replace(/^(?:table|collection|index|schema|function|procedure|view)\s+/i, "")
    .replace(/["`\[\]]/g, "")
    .replace(/\s*\.\s*/g, ".")
    .replace(/[;,]$/, "")
    .replace(/:.*$/, "")
    .trim();
}
function canonicalType(value, fallback = "OBJECT") {
  const type = compactLine(value || fallback).toUpperCase().replaceAll(" ", "_");
  if (/TABLE_DATA|TABLE|MATERIALIZED_VIEW_DATA/.test(type)) return "TABLE";
  if (/COLLECTION/.test(type)) return "COLLECTION";
  if (/INDEX/.test(type)) return "INDEX";
  if (/CONSTRAINT|REF_CONSTRAINT/.test(type)) return "CONSTRAINT";
  if (/FUNCTION/.test(type)) return "FUNCTION";
  if (/PROCEDURE/.test(type)) return "PROCEDURE";
  if (/PACKAGE/.test(type)) return "PACKAGE";
  if (/TRIGGER/.test(type)) return "TRIGGER";
  if (/SEQUENCE/.test(type)) return "SEQUENCE";
  if (/VIEW/.test(type)) return "VIEW";
  if (/SCHEMA/.test(type)) return "SCHEMA";
  return type.replace(/[^A-Z0-9_]/g, "_").slice(0, 80) || fallback;
}

function createSide(role, text) {
  return {
    role,
    text,
    lines: text.split(/\r\n|\n|\r/),
    objects: new Map(),
    typeCounts: new Map(),
    errors: [],
    warnings: [],
    completionSignals: [],
    hasTableInventory: false,
    hasDdlInventory: false,
    hasRowEvidence: false,
  };
}

function addType(state, type, line) {
  const normalized = canonicalType(type);
  const item = state.typeCounts.get(normalized) || { type: normalized, count: 0, evidence: [] };
  item.count += 1;
  if (item.evidence.length < MAX_EVIDENCE_LINES) item.evidence.push(compactLine(line));
  state.typeCounts.set(normalized, item);
}

function addObject(state, type, name, rows, line, options = {}) {
  const normalizedName = canonicalName(name);
  if (!normalizedName || normalizedName.length > 512) return;
  const normalizedType = canonicalType(type);
  const key = `${normalizedType}:${normalizedName.toLowerCase()}`;
  const item = state.objects.get(key) || { key, type: normalizedType, name: normalizedName, rows: null, evidence: [] };
  const numericRows = toNumber(rows);
  if (numericRows !== null) item.rows = options.accumulate && item.rows !== null ? item.rows + numericRows : numericRows;
  if (item.evidence.length < MAX_EVIDENCE_LINES) item.evidence.push(compactLine(line));
  state.objects.set(key, item);
  addType(state, normalizedType, line);
}

function addIssue(state, severity, code, lineNumber, line) {
  const issue = { side: state.role, severity, code: code || severity.toUpperCase(), lineNumber, message: compactLine(line) };
  const target = severity === "error" ? state.errors : state.warnings;
  if (target.length < 250) target.push(issue);
}

function commonIssues(state, engine, line, lineNumber) {
  if (!line.trim()) return;
  if (engine === "oracle") {
    const match = line.match(/\b((?:ORA|UDI|LRM)-\d{4,5})\b/i);
    if (match) addIssue(state, /ORA-(?:31684|39082|39151)/i.test(match[1]) ? "warning" : "error", match[1].toUpperCase(), lineNumber, line);
  } else if (engine === "postgres") {
    const match = line.match(/\b(ERROR|FATAL|PANIC|WARNING):?/i);
    if (match || /pg_(?:restore|dump):\s*(?:error|warning)/i.test(line)) addIssue(state, /warning/i.test(match?.[1] || line) ? "warning" : "error", match?.[1]?.toUpperCase() || "PG_TOOL", lineNumber, line);
  } else if (engine === "mysql" || engine === "mariadb") {
    const match = line.match(/\b(ERROR\s+\d+|mysqldump:\s*Got error|mariadb-dump:\s*Got error|ERROR)\b/i);
    if (match) addIssue(state, "error", compactLine(match[1]).toUpperCase(), lineNumber, line);
    else if (/\bwarning\b/i.test(line)) addIssue(state, "warning", "WARNING", lineNumber, line);
  } else if (engine === "sqlserver") {
    const match = line.match(/\b(?:Error\s+SQL\d+|Msg\s+\d+|SQL720\d+|error)\b/i);
    if (match) addIssue(state, "error", compactLine(match[0]).toUpperCase(), lineNumber, line);
    else if (/\bwarning\b/i.test(line)) addIssue(state, "warning", "WARNING", lineNumber, line);
  } else if (engine === "mongodb") {
    if (/\b(?:error|fatal|panic)\b/i.test(line) || (/failed to restore/i.test(line) && !/0 (?:document\(s\)|failures)/i.test(line))) addIssue(state, "error", "MONGO_TOOL", lineNumber, line);
    else if (/\bwarning\b/i.test(line)) addIssue(state, "warning", "WARNING", lineNumber, line);
  }
}

function parseOracle(state) {
  for (let index = 0; index < state.lines.length; index += 1) {
    const line = state.lines[index]; commonIssues(state, "oracle", line, index + 1);
    const row = line.match(/(?:\.\s+\.\s+)?(?:exported|imported)\s+((?:"[^"]+"\.)?"[^"]+")\s+.*?\s+([\d,]+)\s+rows\b/i);
    if (row) { addObject(state, "TABLE", row[1], row[2], line, { accumulate: true }); state.hasTableInventory = true; state.hasRowEvidence = true; }
    const warningObject = line.match(/Object type\s+([^:]+):((?:"[^"]+"\.)?"[^"]+")\s+created with compilation warnings/i);
    if (warningObject) { addObject(state, warningObject[1], warningObject[2], null, line); state.hasDdlInventory = true; }
    const processType = line.match(/Processing object type\s+([A-Z0-9_/$]+)/i);
    if (processType) addType(state, processType[1].split("/").at(-1), line);
    if (/Job\s+"[^"]+"\."[^"]+"\s+successfully completed/i.test(line)) state.completionSignals.push(compactLine(line));
    else if (/Job\s+"[^"]+"\."[^"]+"\s+completed with/i.test(line)) state.completionSignals.push(compactLine(line));
  }
}

function parsePostgres(state) {
  let currentTable = "";
  for (let index = 0; index < state.lines.length; index += 1) {
    const line = state.lines[index]; commonIssues(state, "postgres", line, index + 1);
    let match = line.match(/pg_dump:\s+dumping contents of table\s+["']?(.+?)["']?\s*$/i);
    if (match) { currentTable = canonicalName(match[1]); addObject(state, "TABLE", currentTable, null, line); state.hasTableInventory = true; continue; }
    match = line.match(/pg_restore:\s+(?:processing data for table|creating\s+TABLE(?:\s+DATA)?)\s+["']?(.+?)["']?\s*$/i);
    if (match) { currentTable = canonicalName(match[1]); addObject(state, "TABLE", currentTable, null, line); state.hasTableInventory = true; state.hasDdlInventory = true; continue; }
    match = line.match(/pg_restore:\s+creating\s+([A-Z][A-Z ]+?)\s+["']?(.+?)["']?\s*$/i);
    if (match) { addObject(state, match[1], match[2], null, line); state.hasDdlInventory = true; continue; }
    match = line.match(/^;?\s*\d+\s+\d+\s+([A-Z][A-Z ]+)\s+(\S+)\s+(\S+)/);
    if (match) { addObject(state, match[1], `${match[2]}.${match[3]}`, null, line); state.hasDdlInventory = true; if (/TABLE/.test(match[1])) state.hasTableInventory = true; continue; }
    match = line.match(/^COPY\s+([\d,]+)\s*$/i);
    if (match && currentTable) { addObject(state, "TABLE", currentTable, match[1], line); state.hasRowEvidence = true; }
    if (/pg_restore:.*finished item|pg_dump:.*finished item|restore completed|dump complete/i.test(line)) state.completionSignals.push(compactLine(line));
  }
}

function parseMySql(state, engine) {
  let currentTable = "";
  for (let index = 0; index < state.lines.length; index += 1) {
    const line = state.lines[index]; commonIssues(state, engine, line, index + 1);
    let match = line.match(/--\s+(?:Dumping data|Retrieving table structure|Table structure) for table\s+[`"']?([^`"']+)[`"']?/i);
    if (match) { currentTable = canonicalName(match[1]); addObject(state, "TABLE", currentTable, null, line); state.hasTableInventory = true; continue; }
    match = line.match(/\bCREATE\s+(TABLE|VIEW|TRIGGER|PROCEDURE|FUNCTION|EVENT)\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+?)(?:\s|\()/i);
    if (match) { currentTable = /TABLE/i.test(match[1]) ? canonicalName(match[2]) : currentTable; addObject(state, match[1], match[2], null, line); state.hasDdlInventory = true; if (/TABLE/i.test(match[1])) state.hasTableInventory = true; }
    match = line.match(/(?:Table|Rows?)\s+[`"']?([A-Za-z0-9_$.-]+)[`"']?\s*[:=]\s*([\d,]+)\s+rows?/i);
    if (match) { addObject(state, "TABLE", match[1], match[2], line); state.hasTableInventory = true; state.hasRowEvidence = true; }
    match = line.match(/Query OK,\s*([\d,]+)\s+rows? affected/i);
    if (match && currentTable) { addObject(state, "TABLE", currentTable, match[1], line); state.hasRowEvidence = true; }
    if (/Dump completed on|dump completed|import completed|restore completed/i.test(line)) state.completionSignals.push(compactLine(line));
  }
}

function parseSqlServer(state) {
  for (let index = 0; index < state.lines.length; index += 1) {
    const line = state.lines[index]; commonIssues(state, "sqlserver", line, index + 1);
    let match = line.match(/(?:Creating|Created|Altering)\s+(?:object\s+)?\[?(Table|View|Index|Procedure|Function|Schema)\]?\s+\[?([^\]\s]+)\]?\.?\[?([^\]\s]+)?\]?/i);
    if (match) { addObject(state, match[1], match[3] ? `${match[2]}.${match[3]}` : match[2], null, line); state.hasDdlInventory = true; if (/table/i.test(match[1])) state.hasTableInventory = true; }
    match = line.match(/\bCREATE\s+(TABLE|VIEW|INDEX|PROCEDURE|FUNCTION|SCHEMA)\s+([^\s(]+)/i);
    if (match) { addObject(state, match[1], match[2], null, line); state.hasDdlInventory = true; if (/table/i.test(match[1])) state.hasTableInventory = true; }
    match = line.match(/(?:Table\s+)?([A-Za-z0-9_$#.[\]-]+)\s*[:=]\s*([\d,]+)\s+rows?/i);
    if (match) { addObject(state, "TABLE", match[1], match[2], line); state.hasTableInventory = true; state.hasRowEvidence = true; }
    if (/Successfully (?:exported|imported|published)|Publish operation completed/i.test(line)) state.completionSignals.push(compactLine(line));
  }
}

function parseMongo(state) {
  for (let index = 0; index < state.lines.length; index += 1) {
    const line = state.lines[index]; commonIssues(state, "mongodb", line, index + 1);
    let match = line.match(/(?:done dumping|finished restoring)\s+([^\s(]+)\s+\(([\d,]+)\s+documents?(?:,\s*([\d,]+)\s+failures?)?\)/i);
    if (match) { addObject(state, "COLLECTION", match[1], match[2], line); state.hasTableInventory = true; state.hasRowEvidence = true; if (toNumber(match[3]) > 0) addIssue(state, "error", "RESTORE_FAILURES", index + 1, line); continue; }
    match = line.match(/(?:writing|restoring)\s+([^\s]+)\s+(?:to|from)\s+/i);
    if (match) { addObject(state, "COLLECTION", match[1], null, line); state.hasTableInventory = true; continue; }
    match = line.match(/restoring indexes for collection\s+([^\s]+)\s+/i);
    if (match) { addObject(state, "INDEX", match[1], null, line); state.hasDdlInventory = true; }
    if (/[\d,]+ document\(s\) (?:dumped|restored) successfully/i.test(line)) state.completionSignals.push(compactLine(line));
  }
}

function detectEngine(source, target) {
  const text = `${source}\n${target}`.slice(0, 1_000_000);
  const scores = {
    oracle: (text.match(/\b(?:expdp|impdp|ORA-\d+|Processing object type|SYS_(?:EXPORT|IMPORT)_)/gi) || []).length,
    postgres: (text.match(/\b(?:pg_dump|pg_restore|psql:|COPY\s+\d+)/gi) || []).length,
    mysql: (text.match(/\b(?:mysqldump|MySQL dump|Query OK|ERROR \d+ \(\d+\))/gi) || []).length,
    mariadb: (text.match(/\b(?:mariadb-dump|MariaDB dump|mariadb:)/gi) || []).length,
    sqlserver: (text.match(/\b(?:SqlPackage|DACPAC|BACPAC|SQL720\d+|rows copied)/gi) || []).length,
    mongodb: (text.match(/\b(?:mongodump|mongorestore|done dumping|finished restoring|document\(s\) restored)/gi) || []).length,
  };
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[1] > 0 ? Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] : "oracle";
}

function parseSide(role, text, engine) {
  const state = createSide(role, text);
  if (engine === "oracle") parseOracle(state);
  else if (engine === "postgres") parsePostgres(state);
  else if (engine === "mysql" || engine === "mariadb") parseMySql(state, engine);
  else if (engine === "sqlserver") parseSqlServer(state);
  else if (engine === "mongodb") parseMongo(state);
  return state;
}

function inventoryReliable(state, object) {
  return /TABLE|COLLECTION/.test(object.type) ? state.hasTableInventory : state.hasDdlInventory;
}

function compareObjects(source, target) {
  const keys = new Set([...source.objects.keys(), ...target.objects.keys()]);
  const differences = [];
  for (const key of keys) {
    const left = source.objects.get(key) || null;
    const right = target.objects.get(key) || null;
    const sample = left || right;
    let status = "matched";
    if (left && !right) status = inventoryReliable(target, left) ? "missing" : "unverified";
    else if (!left && right) status = inventoryReliable(source, right) ? "unexpected" : "target-only";
    else if (left?.rows !== null && right?.rows !== null && left.rows !== right.rows) status = "row-mismatch";
    else if (left?.rows === null || right?.rows === null) status = "matched-unverified-rows";
    differences.push({
      key,
      type: sample.type,
      name: sample.name,
      status,
      sourceRows: left?.rows ?? null,
      targetRows: right?.rows ?? null,
      rowDelta: left && right && left.rows !== null && right.rows !== null ? right.rows - left.rows : null,
      sourceEvidence: left?.evidence || [],
      targetEvidence: right?.evidence || [],
    });
  }
  const rank = { "row-mismatch": 0, missing: 1, unverified: 2, unexpected: 3, "target-only": 4, "matched-unverified-rows": 5, matched: 6 };
  return differences.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.name.localeCompare(b.name));
}

function normalizeDiffLine(line, ignoreTimestamps) {
  let value = compactLine(line);
  if (ignoreTimestamps) {
    value = value
      .replace(/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?\s*/, "")
      .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{4}\s*/, "")
      .replace(/^\d{2}-[A-Z]{3}-\d{2,4}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?\s*/i, "")
      .replace(/\b(?:elapsed|duration)\s*[=:]\s*\d+(?:\.\d+)?\s*(?:ms|s|seconds?)\b/ig, "elapsed=<time>");
  }
  return value.toLowerCase();
}

function buildRedline(sourceLines, targetLines, ignoreTimestamps) {
  const left = sourceLines.slice(0, MAX_DIFF_LINES);
  const right = targetLines.slice(0, MAX_DIFF_LINES);
  const leftNormalized = left.map((line) => normalizeDiffLine(line, ignoreTimestamps));
  const rightNormalized = right.map((line) => normalizeDiffLine(line, ignoreTimestamps));
  const rows = [];
  let leftIndex = 0; let rightIndex = 0;
  const push = (type, sourceLine = "", targetLine = "", sourceNumber = null, targetNumber = null) => {
    if (rows.length < MAX_DIFF_ROWS) rows.push({ type, sourceLine, targetLine, sourceNumber, targetNumber });
  };
  while ((leftIndex < left.length || rightIndex < right.length) && rows.length < MAX_DIFF_ROWS) {
    if (leftIndex >= left.length) { push("added", "", right[rightIndex], null, rightIndex + 1); rightIndex += 1; continue; }
    if (rightIndex >= right.length) { push("removed", left[leftIndex], "", leftIndex + 1, null); leftIndex += 1; continue; }
    if (leftNormalized[leftIndex] === rightNormalized[rightIndex]) { push("same", left[leftIndex], right[rightIndex], leftIndex + 1, rightIndex + 1); leftIndex += 1; rightIndex += 1; continue; }
    const lookAhead = 24;
    let sourceMatch = -1; let targetMatch = -1;
    for (let offset = 1; offset <= lookAhead; offset += 1) {
      if (sourceMatch < 0 && leftIndex + offset < left.length && leftNormalized[leftIndex + offset] === rightNormalized[rightIndex]) sourceMatch = offset;
      if (targetMatch < 0 && rightIndex + offset < right.length && rightNormalized[rightIndex + offset] === leftNormalized[leftIndex]) targetMatch = offset;
      if (sourceMatch > 0 || targetMatch > 0) break;
    }
    if (sourceMatch > 0 && (targetMatch < 0 || sourceMatch <= targetMatch)) {
      for (let offset = 0; offset < sourceMatch; offset += 1) push("removed", left[leftIndex + offset], "", leftIndex + offset + 1, null);
      leftIndex += sourceMatch;
    } else if (targetMatch > 0) {
      for (let offset = 0; offset < targetMatch; offset += 1) push("added", "", right[rightIndex + offset], null, rightIndex + offset + 1);
      rightIndex += targetMatch;
    } else {
      push("changed", left[leftIndex], right[rightIndex], leftIndex + 1, rightIndex + 1); leftIndex += 1; rightIndex += 1;
    }
  }
  return { rows, truncated: sourceLines.length > MAX_DIFF_LINES || targetLines.length > MAX_DIFF_LINES || rows.length >= MAX_DIFF_ROWS };
}

function quoteIdentifier(engine, value) {
  if (!/^[A-Za-z0-9_$#.-]+$/.test(value)) return null;
  const parts = value.split(".");
  if (engine === "mysql" || engine === "mariadb") return parts.map((part) => `\`${part.replaceAll("`", "``")}\``).join(".");
  if (engine === "sqlserver") return parts.map((part) => `[${part.replaceAll("]", "]]")}]`).join(".");
  return parts.map((part) => `"${part.replaceAll('"', '""')}"`).join(".");
}

function verificationScript(engine, objectDiffs) {
  const tables = objectDiffs.filter((item) => /TABLE|COLLECTION/.test(item.type) && ["missing", "row-mismatch", "unverified", "matched-unverified-rows"].includes(item.status)).slice(0, 50);
  const lines = ["-- Generated verification only; review identifiers and run with read-only access."];
  if (engine === "mongodb") {
    lines.push("// Run in mongosh against the destination database.");
    for (const table of tables) { const name = table.name.split(".").at(-1); if (/^[A-Za-z0-9_$.-]+$/.test(name)) lines.push(`print(${JSON.stringify(table.name)}, db.getCollection(${JSON.stringify(name)}).countDocuments({}));`); }
  } else {
    for (const table of tables) { const quoted = quoteIdentifier(engine, table.name); if (quoted) lines.push(`SELECT '${table.name.replaceAll("'", "''")}' AS object_name, COUNT(*) AS exact_rows FROM ${quoted};`); }
    if (engine === "oracle") lines.push("SELECT owner, object_type, object_name, status FROM all_objects WHERE owner NOT IN ('SYS','SYSTEM') ORDER BY owner, object_type, object_name;");
    if (engine === "postgres") lines.push("SELECT n.nspname AS schema_name, c.relkind, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,3;");
    if (engine === "mysql" || engine === "mariadb") lines.push("SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('mysql','information_schema','performance_schema','sys') ORDER BY 1,2;");
    if (engine === "sqlserver") lines.push("SELECT s.name AS schema_name, o.type_desc, o.name FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id WHERE o.is_ms_shipped=0 ORDER BY 1,2,3;");
  }
  return lines.join("\n");
}

function serializeSide(state) {
  return {
    role: state.role,
    lineCount: state.lines.length,
    objectCount: state.objects.size,
    objects: [...state.objects.values()],
    typeCounts: [...state.typeCounts.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    errors: state.errors,
    warnings: state.warnings,
    completed: state.completionSignals.length > 0,
    completionSignals: state.completionSignals.slice(0, 5),
    evidence: {
      namedTables: state.hasTableInventory,
      namedDdl: state.hasDdlInventory,
      rowCounts: state.hasRowEvidence,
    },
  };
}

export function compareMigrationLogs(input = {}) {
  const exportLog = safeText(input.exportLog);
  const importLog = safeText(input.importLog);
  if (!exportLog.trim() || !importLog.trim()) throw new Error("Paste both the export/source log and import/target log");
  if (Buffer.byteLength(exportLog) > MAX_LOG_BYTES || Buffer.byteLength(importLog) > MAX_LOG_BYTES) throw new Error("Each pasted migration log is limited to 3.5 MB");
  const requestedEngine = safeText(input.engine || "auto").toLowerCase();
  if (!migrationLogEngines[requestedEngine]) throw new Error("Select a supported migration log format");
  const engine = requestedEngine === "auto" ? detectEngine(exportLog, importLog) : requestedEngine;
  const source = parseSide("export", exportLog, engine);
  const target = parseSide("import", importLog, engine);
  const objectDiffs = compareObjects(source, target);
  const redline = buildRedline(source.lines, target.lines, input.ignoreTimestamps !== false);
  const missing = objectDiffs.filter((item) => item.status === "missing").length;
  const rowMismatches = objectDiffs.filter((item) => item.status === "row-mismatch").length;
  const unverified = objectDiffs.filter((item) => /unverified/.test(item.status)).length;
  const unexpected = objectDiffs.filter((item) => /unexpected|target-only/.test(item.status)).length;
  const matched = objectDiffs.filter((item) => /^matched/.test(item.status)).length;
  const targetErrors = target.errors.length;
  const sourceErrors = source.errors.length;
  const score = Math.max(0, Math.min(100, 100 - targetErrors * 18 - sourceErrors * 8 - missing * 12 - rowMismatches * 10 - unverified * 2 - target.warnings.length));
  const findings = [];
  if (targetErrors) findings.push({ severity: "CRITICAL", title: `${targetErrors} import error${targetErrors === 1 ? "" : "s"} detected`, evidence: target.errors.slice(0, 3).map((item) => `${item.code} line ${item.lineNumber}: ${item.message}`).join(" | "), recommendation: "Resolve the first causal import error, rerun with stop-on-error where supported, then compare the clean logs again." });
  if (missing) findings.push({ severity: "HIGH", title: `${missing} source object${missing === 1 ? " is" : "s are"} absent from target evidence`, evidence: objectDiffs.filter((item) => item.status === "missing").slice(0, 8).map((item) => item.name).join(", "), recommendation: "Review filters, remaps, privileges, dependencies, and the generated verification script before declaring the migration complete." });
  if (rowMismatches) findings.push({ severity: "HIGH", title: `${rowMismatches} table or collection row-count mismatch${rowMismatches === 1 ? "" : "es"}`, evidence: objectDiffs.filter((item) => item.status === "row-mismatch").slice(0, 8).map((item) => `${item.name}: ${item.sourceRows} -> ${item.targetRows}`).join(", "), recommendation: "Check rejected rows, table filters, partition handling, constraint failures, and rerun exact destination counts." });
  if (unverified) findings.push({ severity: "MEDIUM", title: `${unverified} object or row result${unverified === 1 ? " needs" : "s need"} database verification`, evidence: "The selected utility log does not enumerate every successful DDL statement or exact row count.", recommendation: "Use the generated read-only verification script. A silent import log is not treated as proof of parity." });
  if (!target.completionSignals.length) findings.push({ severity: "MEDIUM", title: "No explicit target completion marker", evidence: "The pasted import log does not contain a recognized successful completion signal.", recommendation: "Paste the complete verbose import log, including its final summary, before sign-off." });
  if (!findings.length) findings.push({ severity: "CLEAR", title: "No migration discrepancy detected in the supplied evidence", evidence: `${matched} objects matched and no import errors were parsed.`, recommendation: "Keep the report with the change record and run the verification script for any object types or rows the utility log cannot prove." });
  const summary = {
    score,
    verdict: targetErrors || missing || rowMismatches ? "ATTENTION" : unverified || !target.completionSignals.length ? "VERIFY" : "MATCHED",
    sourceObjects: source.objects.size,
    targetObjects: target.objects.size,
    matchedObjects: matched,
    missingObjects: missing,
    unexpectedObjects: unexpected,
    rowMismatches,
    unverified,
    sourceErrors,
    targetErrors,
    changedLines: redline.rows.filter((row) => row.type !== "same").length,
  };
  return {
    ok: targetErrors === 0,
    requestedEngine,
    engine,
    format: migrationLogEngines[engine],
    analyzedAt: new Date().toISOString(),
    summary,
    findings,
    objectDiffs,
    errors: [...source.errors, ...target.errors],
    warnings: [...source.warnings, ...target.warnings],
    redline: redline.rows,
    redlineTruncated: redline.truncated,
    source: serializeSide(source),
    target: serializeSide(target),
    verificationScript: verificationScript(engine, objectDiffs),
    limitations: [
      "Log comparison proves only what the pasted utilities emitted; it does not query either database.",
      "Missing and row-mismatch findings are asserted only when the relevant log side enumerates comparable named evidence.",
      "Exact row parity, invalid objects, grants, statistics, and silent client operations require the generated database verification step.",
    ],
    reference: references[engine],
  };
}
