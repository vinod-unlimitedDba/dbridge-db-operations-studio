const token = document.querySelector('meta[name="dbridge-token"]').content;
const state = { tools: {}, logTimer: null, logOffset: 0, logText: "", lastTelemetry: "", selectedSource: "oracle", currentView: "overview", devopsActiveTool: "github", devopsValues: {}, devopsOutput: "", devopsAuditStop: false, devopsAuditResults: [], devopsAuditHistory: {}, tuningCheck: "instance", dbSnapshotStop: false, dbSnapshotResults: [], versionComparison: null, fileCompare: { before: null, after: null, diff: [], patch: "" }, oracleTraceSource: "Pasted Oracle trace", oracleTraceAnalysis: null, oracleAnalysisText: "", tkprofReport: "", sqlRecommendationText: "", editorTabs: [], activeEditorTab: "", editorSaveTimer: null, editorSaveVersion: 0, editorReady: false, editorSettings: { wordWrap: false, fontSize: 11, autocompleteScope: "all" } };
state.logInsights = { tab: "findings", result: null, report: "" };
state.autocomplete = { visible: false, items: [], selected: 0, tokenStart: 0, tokenEnd: 0, query: "" };
state.investigation = { activeTab: "flight", currentPlan: null, regression: null, baselines: [], rules: [], events: [], recordings: [], devopsSnapshots: [], runbooks: [], autofillProfiles: [], adapters: {}, lastDevops: null, loaded: false };
state.autofill = { selectedId: "", selectedProfileId: "", catalog: [], profiles: [] };
state.flight = { running: false, collecting: false, timer: null, samples: [], rawPrevious: null, startedAt: null };
state.intelligence = { topology: null, pipelineCurrent: null, kafkaCurrent: null, driftBaseline: null, driftCurrent: null, runbookStop: false };
state.containerDashboard = { mode: "kubernetes", accessMode: "read", preflightKey: "", audit: [], kubernetes: null, docker: null };
state.oracleXray = { catalog: [], results: [], stop: false, running: false, activeId: "", runningId: "", startedAt: 0 };
state.performanceWorkspace = { engine: "oracle", mode: "overview", identifiers: { oracle: "8m5j1t2y4n6p9" }, connections: {} };
state.oracleBottleneck = { result: null, previousResult: null, report: "", running: false };
state.postgresBottleneck = { result: null, previousResult: null, report: "", running: false };
state.mongodbBottleneck = { result: null, previousResult: null, report: "", running: false };
state.runtimeTrace = { engine: "oracle", tab: "findings", results: {}, report: "", running: false };
state.connectionSession = { activeEnvironment: "Production", activeEngine: "oracle", timer: null, restoring: false, suspendAutoSave: false };
state.sqlStudio = { connected: false, connecting: false, fingerprint: "", objects: [], objectFilter: "", result: null, adapters: {} };
state.credentials = { keepPass: true };
const containerWriteActions = {
  kubernetes: [
    { id: "restartDeployment", label: "Restart deployment rollout", targetKind: "deployment", placeholder: "deployment-name", guidance: "Triggers a rolling restart using the current Deployment specification." },
    { id: "scaleDeployment", label: "Scale deployment replicas", targetKind: "deployment", placeholder: "deployment-name", guidance: "Sets the requested replica count from 0 to 1,000.", needsValue: true },
    { id: "deletePod", label: "Delete pod for recreation", targetKind: "pod", placeholder: "pod-name", guidance: "Deletes one Pod without waiting; a controller may create its replacement." },
  ],
  docker: [
    { id: "startContainer", label: "Start container", targetKind: "container", placeholder: "container name or ID", guidance: "Starts one existing container." },
    { id: "stopContainer", label: "Stop container", targetKind: "container", placeholder: "container name or ID", guidance: "Requests a graceful stop with a 30-second timeout." },
    { id: "restartContainer", label: "Restart container", targetKind: "container", placeholder: "container name or ID", guidance: "Restarts one container with a 30-second stop timeout." },
    { id: "pauseContainer", label: "Pause container", targetKind: "container", placeholder: "container name or ID", guidance: "Suspends all processes in one running container." },
    { id: "unpauseContainer", label: "Unpause container", targetKind: "container", placeholder: "container name or ID", guidance: "Resumes processes in one paused container." },
  ],
};
state.goldengate = { running: false, collecting: false, diagnosticTimer: null, logTimer: null, lastDiagnostic: null, logFindings: [], logText: "", lastLogSnapshot: "" };
const titles = { overview: "Operations overview", sql: "SQL Studio", performance: "SQL performance", investigation: "Investigation Center", logs: "Logs & traces", devops: "DevOps Hub", security: "Security & policy" };
const pageDetails = {
  overview: { eyebrow: "DBRIDGE / OPERATIONS", context: "Local readiness, safety controls and guided starting points" },
  sql: { eyebrow: "DATABASE / SQL STUDIO", context: "Connect, browse database objects and run protected commands" },
  performance: { eyebrow: "DATABASE / PERFORMANCE", context: "Engine health, statement bottlenecks, traces and recommendations" },
  investigation: { eyebrow: "DATABASE / INVESTIGATION", context: "Correlate plans, baselines, incidents and deployment evidence" },
  logs: { eyebrow: "OBSERVABILITY / LOGS", context: "Follow approved remote logs and analyze trace evidence in real time" },
  devops: { eyebrow: "PLATFORM / DEVOPS", context: "Inspect Kubernetes, Docker, Kafka, delivery and configuration changes" },
  security: { eyebrow: "LOCAL APP / SECURITY", context: "Review portable controls, trust boundaries and office-safe defaults" },
};
const commandPaletteItems = [
  { id: "overview", code: "HOME", label: "Operations overview", description: "Readiness, quick actions and local safety posture", view: "overview", keywords: "home dashboard readiness start" },
  { id: "connect", code: "SQL", label: "Connect to a database", description: "Open SQL Studio connection fields for 15 database and DW adapters", view: "sql", target: "sqlEngine", keywords: "oracle postgres mongodb mysql sql server snowflake database connect" },
  { id: "editor", code: "RUN", label: "Write and run SQL", description: "Open the protected multi-tab query editor", view: "sql", target: "sqlText", keywords: "query editor sql command notepad" },
  { id: "performance", code: "PERF", label: "Database health snapshot", description: "Review waits, locks, I/O, memory and workload pressure", view: "performance", target: "performanceHealthSection", keywords: "performance slow query bottleneck health waits locks" },
  { id: "statement", code: "SQLID", label: "Investigate a statement identifier", description: "Oracle SQL_ID, PostgreSQL queryid, MongoDB operation or digest analysis", view: "performance", target: "performanceStatementSection", keywords: "sql_id sqlid queryid digest mongodb recommendation tuning" },
  { id: "traces", code: "TRACE", label: "Unified Runtime Trace", description: "Capture retained SQL evidence across Oracle, PostgreSQL, MongoDB, MySQL and SQL Server", view: "performance", target: "performanceRuntimeTraceSection", keywords: "oracle 10053 shared pool postgres queryid mongodb mysql digest sql server query store runtime trace" },
  { id: "investigation", code: "EVID", label: "Investigation Center", description: "Plans, regression baselines, flight recordings and incident correlation", view: "investigation", keywords: "plan baseline incident regression evidence compare" },
  { id: "logs", code: "LIVE", label: "Follow a remote database log", description: "Tail approved server logs over SSH, native views, files or cloud telemetry", view: "logs", target: "liveLogConsole", keywords: "alert.log error.log mongo.log live remote ssh log tail" },
  { id: "sources", code: "40+", label: "Database and DW log catalog", description: "Choose from database, NoSQL, warehouse and data-platform sources", view: "logs", target: "logSourceCatalog", keywords: "logs warehouse database catalog source" },
  { id: "containers", code: "K8S", label: "Kubernetes and Docker dashboard", description: "Visual health, inventory, pressure and controlled lifecycle actions", view: "devops", target: "containerVisualBody", keywords: "kubernetes k8s docker pod container dashboard" },
  { id: "compare", code: "DIFF", label: "Compare two deployment files", description: "Redline YAML, JSON, Terraform, SQL and configuration changes", view: "devops", target: "fileDiffOutput", keywords: "file compare diff redline yaml json terraform version" },
  { id: "goldengate", code: "OGG", label: "GoldenGate Operations Center", description: "Process health, lag, checkpoints, ABENDs and live logs", view: "sql", target: "goldenGateSqlStudio", keywords: "oracle goldengate extract replicat lag ggserr" },
  { id: "devops", code: "OPS", label: "Guided DevOps inspection", description: "Approved local CLI methods for Git, cloud, Kafka and platform tools", view: "devops", target: "devopsTool", keywords: "github git kafka terraform helm aws azure gcloud cli" },
  { id: "security", code: "SAFE", label: "Security and policy", description: "Review loopback, token, CSP, credentials and command controls", view: "security", target: "security-view", keywords: "security policy vulnerability local token csp readonly" },
];
const commandPaletteActions = [
  { id: "action-theme", code: "VIEW", label: "Toggle light and dark appearance", description: "Switch the console between the light and dark palette", keywords: "theme dark light night appearance colour color mode", run: () => toggleThemeMode() },
  { id: "action-theme-auto", code: "VIEW", label: "Match system appearance", description: "Follow the operating system light or dark preference", keywords: "theme auto system automatic appearance", run: () => setThemeMode("auto") },
  { id: "action-density", code: "VIEW", label: "Toggle compact density", description: "Tighten spacing to fit more evidence on screen", keywords: "density compact comfortable spacing zoom fit", run: () => toggleDensity() },
  { id: "action-sidebar", code: "VIEW", label: "Toggle left panel auto-hide", description: "Collapse the navigation to an icon rail that opens on hover", keywords: "sidebar left panel collapse hide rail navigation expand", run: () => toggleSidebarMode() },
  { id: "action-shortcuts", code: "KEYS", label: "Show keyboard shortcuts", description: "List every console shortcut and what it does", keywords: "keyboard shortcut keys help hotkey", run: () => openShortcutMap() },
  { id: "action-save-profile", code: "CONN", label: "Save current connection as a profile", description: "Name the current SQL Studio target for quick recall", keywords: "profile connection save named target bookmark", run: () => saveConnectionProfile() },
  { id: "action-refresh", code: "SCAN", label: "Rescan local tool availability", description: "Re-detect approved CLI clients on this workstation", keywords: "refresh rescan tools status path clients detect", run: () => scanTools() },
];
let commandPaletteMatches = commandPaletteItems;
let commandPaletteSelection = 0;
let commandPalettePreviousFocus = null;
let shortcutMapPreviousFocus = null;

const UI_PREFERENCES_STORAGE_KEY = "dbridge.ui.preferences.v1";
const CONNECTION_PROFILE_STORAGE_KEY = "dbridge.sql.profiles.v1";
const KEEP_PASS_STORAGE_KEY = "dbridge.keep-pass.v1";

state.ui = { themeMode: "auto", density: "comfortable", sidebar: "pinned", pulseTimer: null, activeRequests: 0 };

const shortcutMapGroups = [
  {
    title: "Navigation",
    items: [
      { keys: "Ctrl K", label: "Open the command palette" },
      { keys: "Alt 1 – 7", label: "Jump to a workspace" },
      { keys: "Shift /", label: "Show this shortcut map" },
      { keys: "Esc", label: "Close the palette or an overlay" },
    ],
  },
  {
    title: "Appearance",
    items: [
      { keys: "Ctrl Shift L", label: "Toggle light and dark appearance" },
      { keys: "Ctrl Shift D", label: "Toggle compact density" },
      { keys: "Ctrl B", label: "Toggle left panel auto-hide" },
    ],
  },
  {
    title: "SQL editor",
    items: [
      { keys: "Ctrl Enter", label: "Run the active statement" },
      { keys: "Ctrl N", label: "New editor tab" },
      { keys: "Ctrl O", label: "Open a local SQL or text file" },
      { keys: "Ctrl S", label: "Save the active tab to a file" },
    ],
  },
  {
    title: "Editing",
    items: [
      { keys: "Ctrl F", label: "Find in the active tab" },
      { keys: "Ctrl H", label: "Find and replace" },
      { keys: "Ctrl G", label: "Go to line" },
      { keys: "Tab / Enter", label: "Accept a completion suggestion" },
    ],
  },
];

function readUiPreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch { return {}; }
}

function persistUiPreferences() {
  try {
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({ themeMode: state.ui.themeMode, density: state.ui.density, sidebar: state.ui.sidebar }));
  } catch { /* storage blocked: the session still works, it just will not persist */ }
}

function systemPrefersDark() {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
}

function resolvedTheme() {
  return state.ui.themeMode === "auto" ? (systemPrefersDark() ? "dark" : "light") : state.ui.themeMode;
}

function applyTheme(announce = false) {
  const root = document.documentElement;
  const theme = resolvedTheme();
  root.dataset.themeMode = state.ui.themeMode;
  root.dataset.theme = theme;
  root.setAttribute("data-theme-switching", "");
  window.setTimeout(() => root.removeAttribute("data-theme-switching"), 240);
  $$("#themeSwitch button").forEach((button) => {
    const active = button.dataset.themeMode === state.ui.themeMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (announce) toast(state.ui.themeMode === "auto" ? `Appearance follows the system (${theme})` : `${theme === "dark" ? "Dark" : "Light"} appearance enabled`);
}

function setThemeMode(mode, announce = true) {
  state.ui.themeMode = ["light", "dark", "auto"].includes(mode) ? mode : "auto";
  persistUiPreferences();
  applyTheme(announce);
}

function toggleThemeMode() {
  setThemeMode(resolvedTheme() === "dark" ? "light" : "dark");
}

function applyDensity(announce = false) {
  document.documentElement.dataset.density = state.ui.density;
  if (announce) toast(state.ui.density === "compact" ? "Compact density enabled" : "Comfortable density enabled");
}

function toggleDensity() {
  state.ui.density = state.ui.density === "compact" ? "comfortable" : "compact";
  persistUiPreferences();
  applyDensity(true);
}

function applySidebarMode(announce = false) {
  const auto = state.ui.sidebar === "auto";
  document.documentElement.dataset.sidebar = state.ui.sidebar;
  const toggle = $("#toggleSidebarMode");
  if (toggle) {
    toggle.classList.toggle("active", auto);
    toggle.setAttribute("aria-pressed", String(auto));
    toggle.textContent = auto ? "⇥" : "⇤";
    toggle.title = auto ? "Keep the left panel open (Ctrl+B)" : "Auto-hide the left panel (Ctrl+B)";
  }
  if (announce) toast(auto ? "Left panel auto-hides · hover the rail to open it" : "Left panel stays open");
}

function toggleSidebarMode() {
  state.ui.sidebar = state.ui.sidebar === "auto" ? "pinned" : "auto";
  persistUiPreferences();
  applySidebarMode(true);
}

function restoreUiPreferences() {
  const saved = readUiPreferences();
  if (["light", "dark", "auto"].includes(saved.themeMode)) state.ui.themeMode = saved.themeMode;
  if (["compact", "comfortable"].includes(saved.density)) state.ui.density = saved.density;
  if (["auto", "pinned"].includes(saved.sidebar)) state.ui.sidebar = saved.sidebar;
  applyTheme(false);
  applyDensity(false);
  applySidebarMode(false);
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (state.ui.themeMode === "auto") applyTheme(false);
    });
  } catch { /* older engines cannot subscribe; the saved mode still applies */ }
}

function setSessionPulse(label, kind = "") {
  const pulse = $("#sessionPulse");
  if (!pulse) return;
  pulse.className = `session-pulse ${kind}`.trim();
  $("#sessionPulseText").textContent = label;
  clearTimeout(state.ui.pulseTimer);
  if (kind !== "busy") state.ui.pulseTimer = setTimeout(() => {
    pulse.className = "session-pulse";
    $("#sessionPulseText").textContent = "Idle";
  }, 4000);
}

function renderShortcutMap() {
  $("#shortcutMapGroups").innerHTML = shortcutMapGroups.map((group) => `<section class="shortcut-map-group"><h3>${escapeHtml(group.title)}</h3>${group.items.map((item) => `<div class="shortcut-map-item"><span>${escapeHtml(item.label)}</span><kbd>${escapeHtml(item.keys)}</kbd></div>`).join("")}</section>`).join("");
}

function openShortcutMap() {
  shortcutMapPreviousFocus = document.activeElement;
  renderShortcutMap();
  $("#shortcutMap").classList.remove("hidden");
  window.setTimeout(() => $("#closeShortcutMap").focus(), 20);
}

function closeShortcutMap() {
  $("#shortcutMap").classList.add("hidden");
  if (shortcutMapPreviousFocus instanceof HTMLElement) shortcutMapPreviousFocus.focus({ preventScroll: true });
}

function sanitizeProfileName(value) {
  const name = String(value || "").trim();
  if (!name) throw new Error("Enter a name for this connection profile");
  if (name.length > 60) throw new Error("Profile names are limited to 60 characters");
  if (!/^[A-Za-z0-9 _.()\/-]+$/.test(name)) throw new Error("Use letters, numbers, spaces or _ . ( ) / - in profile names");
  return name;
}

const DBRIDGE_ENVIRONMENTS = new Set(["Production", "SIT", "UAT-Test", "DEV"]);

function currentSqlEnvironment() {
  const value = $("#sqlEnvironment")?.value || "Production";
  return DBRIDGE_ENVIRONMENTS.has(value) ? value : "Production";
}

function connectionSessionKey(engine, environment = currentSqlEnvironment()) {
  return `${environment}::${engine}`;
}

function readConnectionProfiles() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONNECTION_PROFILE_STORAGE_KEY) || "null");
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.profiles)) return [];
    return parsed.profiles.reduce((list, profile) => {
      if (!profile || !sqlAdapterUi[profile.engine]) return list;
      try {
        const environment = DBRIDGE_ENVIRONMENTS.has(profile.environment) ? profile.environment : "Production";
        list.push({ name: sanitizeProfileName(profile.name), engine: profile.engine, environment, entry: sanitizeConnectionSessionEntry({ ...profile.entry, environment }) });
      } catch { /* drop any profile that no longer validates */ }
      return list;
    }, []);
  } catch { return []; }
}

function writeConnectionProfiles(profiles) {
  localStorage.setItem(CONNECTION_PROFILE_STORAGE_KEY, JSON.stringify({ version: 1, profiles }));
}

function renderConnectionProfiles(selectedName = "") {
  const engine = $("#sqlEngine").value;
  const environment = currentSqlEnvironment();
  const profiles = readConnectionProfiles().filter((profile) => profile.engine === engine && profile.environment === environment);
  const select = $("#connectionProfileSelect");
  select.innerHTML = `<option value="">${profiles.length ? "Select a saved profile…" : "No profiles saved for this engine"}</option>${profiles.map((profile) => `<option value="${escapeHtml(profile.name)}">${escapeHtml(profile.name)} · ${escapeHtml(profile.entry.host || "no host")}</option>`).join("")}`;
  select.value = profiles.some((profile) => profile.name === selectedName) ? selectedName : "";
  select.disabled = !profiles.length;
  $("#deleteConnectionProfile").disabled = !select.value;
  $("#connectionProfileCount").textContent = profiles.length ? `${profiles.length} saved for ${sqlAdapterUi[engine].name}` : "None saved";
}

async function saveConnectionProfile() {
  const engine = $("#sqlEngine").value;
  const environment = currentSqlEnvironment();
  if (!sqlAdapterUi[engine]) return toast("Select a supported database engine", true);
  const suggested = `${sqlAdapterUi[engine].name} · ${$("#sqlDatabase").value.trim() || $("#sqlHost").value.trim() || "target"}`;
  const requested = window.prompt("Name this connection profile", suggested);
  if (requested === null) return;
  try {
    const name = sanitizeProfileName(requested);
    const entry = sanitizeConnectionSessionEntry({ environment, host: $("#sqlHost").value, port: $("#sqlPort").value, database: $("#sqlDatabase").value, username: $("#sqlUsername").value, authMode: $("#sqlAuthMode").value, tlsMode: $("#sqlTlsMode").value });
    if (state.credentials.keepPass && $("#sqlPassword").value) await rememberDatabaseCredential(connection());
    const profiles = readConnectionProfiles().filter((profile) => !(profile.engine === engine && profile.environment === environment && profile.name === name));
    profiles.push({ name, engine, environment, entry });
    writeConnectionProfiles(profiles);
    renderConnectionProfiles(name);
    toast(state.credentials.keepPass ? `Connection profile "${name}" saved; credential is volatile until the agent stops` : `Connection profile "${name}" saved without the password`);
  } catch (error) {
    toast(error.message, true);
  }
}

async function applyConnectionProfile(name) {
  if (!name) { $("#deleteConnectionProfile").disabled = true; return; }
  const engine = $("#sqlEngine").value;
  const environment = currentSqlEnvironment();
  const profile = readConnectionProfiles().find((item) => item.engine === engine && item.environment === environment && item.name === name);
  if (!profile) return renderConnectionProfiles();
  state.connectionSession.restoring = true;
  applySavedConnectionEntry(engine, profile.entry);
  $("#sqlPassword").value = "";
  state.connectionSession.restoring = false;
  disconnectSqlStudio(false);
  updateConnectionAdapterUi(); updateSnapshotTarget(); updateOracleXrayTarget(); updatePerformanceContextTarget();
  scheduleConnectionSessionSave();
  $("#deleteConnectionProfile").disabled = false;
  if (state.credentials.keepPass) {
    try {
      const status = await api(`/api/credentials/session/status?scope=database&id=${encodeURIComponent(databaseCredentialId(connection()))}`);
      if (status.credential?.available) { toast(`Loaded "${name}" · connecting with agent-memory credential`); await connectSqlStudio(); return; }
    } catch { /* metadata remains usable without a remembered credential */ }
  }
  toast(`Loaded "${name}" · enter the password to connect`);
}

async function deleteConnectionProfile() {
  const engine = $("#sqlEngine").value;
  const name = $("#connectionProfileSelect").value;
  if (!name) return;
  if (!window.confirm(`Delete the saved connection profile "${name}"?`)) return;
  const environment = currentSqlEnvironment();
  const selected = readConnectionProfiles().find((profile) => profile.engine === engine && profile.environment === environment && profile.name === name);
  if (selected && state.credentials.keepPass) {
    const payload = { environment, engine, connection: { ...selected.entry } };
    try { await api("/api/credentials/session/delete", { method: "POST", body: JSON.stringify({ scope: "database", id: databaseCredentialId(payload) }) }); } catch { /* profile deletion still proceeds */ }
  }
  writeConnectionProfiles(readConnectionProfiles().filter((profile) => !(profile.engine === engine && profile.environment === environment && profile.name === name)));
  renderConnectionProfiles();
  toast(`Connection profile "${name}" deleted`);
}
const sqlAdapterUi = {
  oracle: { name: "Oracle", client: "sqlplus", driver: "oracledb", port: "1521", hint: "Direct SQL through the bundled Oracle Thin driver." }, postgres: { name: "PostgreSQL", client: "psql", driver: "pg", port: "5432", hint: "Direct SQL through the bundled PostgreSQL driver and pg_stat views." }, mongodb: { name: "MongoDB", client: "", driver: "mongodb", port: "27017", hint: "Direct read-only connection through the bundled MongoDB driver; no external shell is used." }, mysql: { name: "MySQL", client: "mysql", driver: "mysql2", port: "3306", hint: "Direct SQL through the bundled MySQL driver and Performance Schema." }, sqlserver: { name: "SQL Server", client: "sqlcmd", driver: "tedious", port: "1433", hint: "Direct SQL through the bundled SQL Server driver, DMVs, and Query Store evidence." },
  mariadb: { name: "MariaDB", client: "mysql", driver: "mysql2", port: "3306", hint: "Direct SQL through the bundled MySQL-compatible driver." }, redshift: { name: "Amazon Redshift", client: "psql", driver: "pg", port: "5439", hint: "Direct SQL through the bundled PostgreSQL-compatible driver." }, synapse: { name: "Azure Synapse", client: "sqlcmd", driver: "tedious", port: "1433", hint: "Direct SQL through the bundled SQL Server-compatible driver." }, snowflake: { name: "Snowflake", client: "snowsql", port: "443", host: "ACCOUNT IDENTIFIER", hint: "Enter the Snowflake account identifier, database, username, and approved password." }, bigquery: { name: "Google BigQuery", client: "bq", port: "443", host: "ACTIVE GCLOUD CONTEXT", database: "GOOGLE CLOUD PROJECT", username: "CLI CONTEXT", password: "NOT USED", hint: "Uses the active gcloud/bq sign-in context; the project is entered as Database / service." }, databricks: { name: "Databricks SQL", client: "databricks", port: "443", host: "CLI WORKSPACE", database: "SQL WAREHOUSE ID", username: "CLI PROFILE", password: "NOT STORED / NOT USED", hint: "Uses an approved Databricks CLI profile and SQL warehouse ID." }, db2: { name: "IBM Db2", client: "db2", port: "50000", database: "CATALOG DATABASE ALIAS", hint: "Uses the Db2 CLP and a cataloged database alias." }, hana: { name: "SAP HANA", client: "hdbsql", port: "30015", host: "SECURE USER STORE", database: "DATABASE (REFERENCE)", username: "HDBUSERSTORE KEY", password: "NOT USED", hint: "Uses an approved hdbuserstore key so credentials are not exposed." }, clickhouse: { name: "ClickHouse", client: "clickhouse-client", port: "9000", hint: "Read-only SQL through clickhouse-client; the password is passed only in process environment." }, teradata: { name: "Teradata", client: "bteq", port: "1025", hint: "Read-only SQL through BTEQ. Inline portable credentials reject command delimiter characters." }
};
const sqlContextOnlyEngines = new Set(["bigquery", "databricks", "hana"]);
const sqlPasswordOnlyEngines = new Set(["teradata"]);
const actions = {
  github: { status: "Authentication", repositories: "Repositories", pullRequests: "Pull requests", workflows: "Workflow runs", issues: "Open issues", releases: "Releases" },
  kubernetes: { cluster: "Cluster info", namespaces: "Namespaces", nodes: "Nodes", pods: "Pods", deployments: "Deployments", services: "Services", events: "Events", topPods: "Pod usage", topNodes: "Node usage", describe: "Describe resource" },
  docker: { info: "Engine info", containers: "Containers", images: "Images", networks: "Networks", volumes: "Volumes", diskUsage: "Disk usage", stats: "Stats snapshot", logs: "Container logs", inspect: "Inspect object", processes: "Container processes" },
  kafka: { topics: "List topics", describeTopic: "Describe topic", groups: "Consumer groups", describeGroup: "Group offsets" },
  terraform: { version: "Version", providers: "Providers", validate: "Validate", outputs: "Outputs", state: "State resources", workspace: "Current workspace" },
  helm: { releases: "Releases", repositories: "Repositories", charts: "Search charts", status: "Release status", history: "Release history", values: "Release values" },
  git: { version: "Version", status: "Status", branches: "Branches", remotes: "Remotes", commits: "Recent commits", diff: "Diff summary" },
  aws: { identity: "Caller identity", regions: "Regions", eksClusters: "EKS clusters", ecsClusters: "ECS clusters" },
  azure: { account: "Active account", subscriptions: "Subscriptions", resourceGroups: "Resource groups", aksClusters: "AKS clusters" },
  gcloud: { account: "Accounts", project: "Active project", config: "Configuration", clusters: "GKE clusters", sqlInstances: "Cloud SQL" },
  databricks: { profiles: "Profiles", clusters: "Clusters", jobs: "Jobs", warehouses: "Warehouses" },
  snowflake: { version: "SnowSQL version", context: "Session context", recentQueries: "Recent queries", warehouses: "Warehouses" },
  ssh: { version: "Client version", configuration: "Resolved configuration", connectivity: "Connectivity check" },
  ansible: { version: "Version", config: "Changed configuration", inventory: "Inventory JSON", graph: "Inventory graph" },
  podman: { info: "Engine info", containers: "Containers", images: "Images", networks: "Networks", volumes: "Volumes", diskUsage: "Disk usage", stats: "Stats snapshot", logs: "Container logs", inspect: "Inspect object", processes: "Container processes" },
  argocd: { version: "Client version", applications: "Applications", clusters: "Clusters", repositories: "Repositories", projects: "Projects" },
  vault: { status: "Vault status", secrets: "Secrets engines", auth: "Auth methods", policies: "Policies" },
  tofu: { version: "Version", providers: "Providers", validate: "Validate", outputs: "Outputs", state: "State resources", workspace: "Current workspace" },
  nomad: { status: "Cluster status", nodes: "Nodes", jobs: "Jobs", servers: "Servers", allocations: "Allocation details" },
  goldengate: { version: "Admin Client version", overview: "Process overview", lag: "Extract & Replicat lag", messages: "Error messages", extract: "Extract detail", replicat: "Replicat detail", checkpoints: "Checkpoint history", versions: "GoldenGate versions" },
};
const labels = { github: "GitHub", kubernetes: "Kubernetes", docker: "Docker", kafka: "Kafka", terraform: "Terraform", helm: "Helm", git: "Git", aws: "AWS", azure: "Azure", gcloud: "Google Cloud", databricks: "Databricks", snowflake: "Snowflake", ssh: "SSH", ansible: "Ansible", podman: "Podman", argocd: "Argo CD", vault: "Vault", tofu: "OpenTofu", nomad: "Nomad", goldengate: "Oracle GoldenGate" };
const devopsFields = {
  github: { target: ["REPOSITORY", "Optional owner/repository"] },
  kubernetes: { target: ["KUBERNETES CONTEXT", "Optional kubeconfig context"], secondary: ["NAMESPACE", "Blank means all namespaces"], scope: ["RESOURCE", "Required for Describe, e.g. pod/api-123"] },
  docker: { target: ["CONTAINER OR IMAGE", "Required for logs, inspect or processes"] },
  kafka: { target: ["BOOTSTRAP SERVER", "broker.company.net:9092"], secondary: ["TOPIC", "Required for Describe topic"], scope: ["CONSUMER GROUP", "Required for Group offsets"] },
  terraform: { cwd: true },
  helm: { target: ["KUBERNETES CONTEXT", "Optional kubeconfig context"], secondary: ["NAMESPACE", "Optional namespace"], scope: ["RELEASE", "Required for status, history or values"] },
  git: { cwd: true },
  ssh: { target: ["SSH HOST ALIAS", "Host from approved SSH configuration"] },
  aws: { target: ["AWS PROFILE", "Optional approved profile"], secondary: ["AWS REGION", "Optional, e.g. ap-south-1"] },
  azure: { target: ["AZURE SUBSCRIPTION", "Optional name or subscription ID"] },
  gcloud: { target: ["GOOGLE CLOUD PROJECT", "Optional project ID"] },
  databricks: { target: ["DATABRICKS PROFILE", "Optional approved profile"] },
  snowflake: { target: ["SNOWSQL CONNECTION", "Optional connection name from config"] },
  ansible: { cwd: true },
  podman: { target: ["CONTAINER OR IMAGE", "Required for logs, inspect or processes"] },
  argocd: {},
  vault: {},
  tofu: { cwd: true },
  nomad: { target: ["ALLOCATION ID", "Required only for Allocation details"] },
  goldengate: { target: ["ADMINISTRATION SERVICE URL", "https://ogg-server:9001"], secondary: ["WALLET CREDENTIAL ALIAS", "Approved Admin Client wallet alias"], scope: ["EXTRACT / REPLICAT GROUP", "Required for group detail"] },
};

const autofillToolCategories = {
  kubernetes: "kubernetes", docker: "containers", podman: "containers", kafka: "messaging", goldengate: "goldengate",
  aws: "cloud", azure: "cloud", gcloud: "cloud", databricks: "cloud", snowflake: "cloud",
  github: "delivery", git: "delivery", terraform: "delivery", tofu: "delivery", helm: "delivery", ansible: "delivery", argocd: "delivery", vault: "delivery", nomad: "delivery", ssh: "delivery",
};

const commonSqlCompletionWords = ["SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "GROUP BY", "ORDER BY", "HAVING", "WITH", "UNION ALL", "DISTINCT", "CASE", "WHEN", "THEN", "ELSE", "END", "EXISTS", "BETWEEN", "IN", "IS NULL", "COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "NULLIF", "CURRENT_TIMESTAMP", "EXPLAIN"];
const commonSqlCompletionSnippets = [
  ["SELECT template", "SELECT |\nFROM \nWHERE ", "Projection, source and filter scaffold"],
  ["CTE template", "WITH source_data AS (\n  SELECT |\n  FROM \n)\nSELECT *\nFROM source_data", "Common table expression scaffold"],
  ["JOIN template", "SELECT a.*, b.*\nFROM table_a a\nJOIN table_b b ON b.id = a.id\nWHERE |", "Two-table join scaffold"],
  ["Aggregate template", "SELECT dimension, COUNT(*) AS row_count\nFROM source_table\nGROUP BY dimension\nORDER BY row_count DESC|", "Grouped count and ordering"],
  ["Window function", "ROW_NUMBER() OVER (PARTITION BY partition_column ORDER BY sort_column DESC)|", "Analytic row-number expression"],
  ["CASE expression", "CASE\n  WHEN condition THEN result\n  ELSE fallback\nEND|", "Conditional SQL expression"],
];
const databaseSqlCompletionCatalog = {
  oracle: [["V$SQL", "v$sql", "Shared SQL area"], ["V$SESSION", "v$session", "Session activity"], ["V$SYSTEM_EVENT", "v$system_event", "System wait events"], ["DBA_HIST_SQLSTAT", "dba_hist_sqlstat", "AWR SQL history"], ["DBMS_XPLAN", "SELECT * FROM TABLE(dbms_xplan.display_cursor(NULL, NULL, 'ALLSTATS LAST'))|", "Display the current cursor plan", true], ["SYSDATE", "SYSDATE", "Oracle server date"], ["FETCH FIRST", "FETCH FIRST 50 ROWS ONLY", "Bound the result set"]],
  postgres: [["PG_STAT_ACTIVITY", "pg_stat_activity", "Session and wait activity"], ["PG_STAT_STATEMENTS", "pg_stat_statements", "Statement performance"], ["PG_LOCKS", "pg_locks", "Lock inventory"], ["EXPLAIN ANALYZE", "EXPLAIN (ANALYZE, BUFFERS, VERBOSE)\n|", "Execution plan with runtime evidence", true], ["GENERATE_SERIES", "generate_series(1, 10)", "Generate a value series"], ["JSONB", "jsonb", "Binary JSON type"]],
  mongodb: [["Find documents", "db.collection.find({ | }).limit(50)", "Read documents with a bounded cursor", true], ["Aggregate pipeline", "db.collection.aggregate([\n  { $match: { | } },\n  { $limit: 50 }\n])", "Read-only aggregation pipeline", true], ["Explain execution", "db.collection.find({ | }).explain('executionStats')", "Execution statistics for a find", true], ["Current operations", "db.currentOp({ active: true })|", "Active MongoDB operations", true], ["Server status", "db.serverStatus()|", "Server health document", true], ["Collection stats", "db.collection.stats()|", "Collection storage statistics", true]],
  mysql: [["PROCESSLIST", "performance_schema.processlist", "Current MySQL sessions"], ["STATEMENT DIGESTS", "performance_schema.events_statements_summary_by_digest", "Aggregated statement performance"], ["DATA LOCKS", "performance_schema.data_locks", "InnoDB lock inventory"], ["EXPLAIN ANALYZE", "EXPLAIN ANALYZE\n|", "Runtime execution plan", true], ["SHOW STATUS", "SHOW GLOBAL STATUS|", "Server status variables", true], ["LIMIT", "LIMIT 50", "Bound the result set"]],
  mariadb: [["PROCESSLIST", "information_schema.processlist", "Current MariaDB sessions"], ["INNODB LOCK WAITS", "information_schema.innodb_lock_waits", "InnoDB lock waits"], ["EXPLAIN FORMAT JSON", "EXPLAIN FORMAT=JSON\n|", "JSON execution plan", true], ["SHOW STATUS", "SHOW GLOBAL STATUS|", "Server status variables", true], ["LIMIT", "LIMIT 50", "Bound the result set"]],
  sqlserver: [["DM_EXEC_REQUESTS", "sys.dm_exec_requests", "Executing requests"], ["DM_OS_WAIT_STATS", "sys.dm_os_wait_stats", "Instance wait statistics"], ["DM_EXEC_QUERY_STATS", "sys.dm_exec_query_stats", "Cached query metrics"], ["QUERY STORE", "sys.query_store_runtime_stats", "Query Store runtime history"], ["TOP", "TOP (50)", "Bound the result set"], ["Actual plan XML", "SELECT query_plan\nFROM sys.dm_exec_cached_plans cp\nCROSS APPLY sys.dm_exec_query_plan(cp.plan_handle)\nWHERE |", "Cached plan XML", true]],
  redshift: [["STV_INFLIGHT", "stv_inflight", "Running statements"], ["STL_QUERY", "stl_query", "Completed query history"], ["SVV_TABLE_INFO", "svv_table_info", "Table health and skew"], ["EXPLAIN", "EXPLAIN\n|", "Redshift execution plan", true], ["LIMIT", "LIMIT 50", "Bound the result set"]],
  synapse: [["DM_PDW_EXEC_REQUESTS", "sys.dm_pdw_exec_requests", "Dedicated SQL requests"], ["DM_PDW_REQUEST_STEPS", "sys.dm_pdw_request_steps", "Distributed request steps"], ["DM_PDW_NODES_DB_PARTITION_STATS", "sys.dm_pdw_nodes_db_partition_stats", "Distributed storage statistics"], ["TOP", "TOP (50)", "Bound the result set"]],
  snowflake: [["QUERY_HISTORY", "TABLE(information_schema.query_history())", "Recent query history"], ["WAREHOUSE_METERING_HISTORY", "snowflake.account_usage.warehouse_metering_history", "Warehouse credit history"], ["CURRENT_WAREHOUSE", "CURRENT_WAREHOUSE()", "Active virtual warehouse"], ["QUALIFY", "QUALIFY ROW_NUMBER() OVER (PARTITION BY key ORDER BY timestamp_column DESC) = 1", "Filter analytic results"], ["LIMIT", "LIMIT 50", "Bound the result set"]],
  bigquery: [["INFORMATION_SCHEMA JOBS", "`region-us`.INFORMATION_SCHEMA.JOBS_BY_PROJECT", "BigQuery job history"], ["UNNEST", "UNNEST(array_expression)", "Expand an array"], ["SAFE_DIVIDE", "SAFE_DIVIDE(numerator, denominator)", "Division without errors"], ["QUALIFY", "QUALIFY ROW_NUMBER() OVER (PARTITION BY key ORDER BY timestamp_column DESC) = 1", "Filter analytic results"], ["LIMIT", "LIMIT 50", "Bound the result set"]],
  databricks: [["DESCRIBE HISTORY", "DESCRIBE HISTORY table_name|", "Delta table history", true], ["DESCRIBE DETAIL", "DESCRIBE DETAIL table_name|", "Delta table metadata", true], ["TABLE_CHANGES", "table_changes('table_name', start_version)", "Delta change data feed"], ["OPTIMIZE history", "system.access.audit", "System access audit table"], ["LIMIT", "LIMIT 50", "Bound the result set"]],
  db2: [["MON_GET_CONNECTION", "TABLE(MON_GET_CONNECTION(NULL, -2))", "Db2 connection metrics"], ["MON_GET_PKG_CACHE_STMT", "TABLE(MON_GET_PKG_CACHE_STMT(NULL, NULL, NULL, -2))", "Package cache statements"], ["SYSCAT.TABLES", "syscat.tables", "Table catalog"], ["FETCH FIRST", "FETCH FIRST 50 ROWS ONLY", "Bound the result set"]],
  hana: [["M_CONNECTIONS", "m_connections", "HANA connections"], ["M_ACTIVE_STATEMENTS", "m_active_statements", "Active SQL statements"], ["M_EXPENSIVE_STATEMENTS", "m_expensive_statements", "Expensive statement history"], ["M_SERVICE_MEMORY", "m_service_memory", "Service memory"], ["LIMIT", "LIMIT 50", "Bound the result set"]],
  clickhouse: [["SYSTEM.PROCESSES", "system.processes", "Running queries"], ["SYSTEM.QUERY_LOG", "system.query_log", "Query history"], ["SYSTEM.PARTS", "system.parts", "Active data parts"], ["FORMAT JSON", "FORMAT JSON", "JSON result format"], ["LIMIT", "LIMIT 50", "Bound the result set"]],
  teradata: [["DBC.QRYLOGV", "dbc.qrylogv", "DBQL query history"], ["DBC.DISKSPACEV", "dbc.diskspacev", "Space usage"], ["DBC.TABLESV", "dbc.tablesv", "Object catalog"], ["SAMPLE", "SAMPLE 50", "Bound sample rows"], ["QUALIFY", "QUALIFY ROW_NUMBER() OVER (PARTITION BY key ORDER BY timestamp_column DESC) = 1", "Filter analytic results"]],
};
const editorCommandTemplateCatalog = {
  kubernetes: [["kubectl get nodes", "kubectl get nodes -o wide"], ["kubectl get pods", "kubectl get pods -A -o wide"], ["kubectl deployments", "kubectl get deployments -A -o wide"], ["kubectl services", "kubectl get services -A -o wide"], ["kubectl events", "kubectl get events -A --sort-by=.lastTimestamp"], ["kubectl top nodes", "kubectl top nodes"], ["kubectl top pods", "kubectl top pods -A"]],
  docker: [["docker containers", "docker ps -a"], ["docker live stats", "docker stats --no-stream"], ["docker images", "docker images"], ["docker networks", "docker network ls"], ["docker volumes", "docker volume ls"], ["docker disk usage", "docker system df"]],
  podman: [["Podman containers", "podman ps -a"], ["Podman live stats", "podman stats --no-stream"], ["Podman images", "podman images"], ["Podman networks", "podman network ls"], ["Podman volumes", "podman volume ls"], ["Podman disk usage", "podman system df"]],
  kafka: [["Kafka list topics", "kafka-topics.bat --bootstrap-server broker:9092 --list"], ["Kafka describe topic", "kafka-topics.bat --bootstrap-server broker:9092 --describe --topic topic-name"], ["Kafka consumer groups", "kafka-consumer-groups.bat --bootstrap-server broker:9092 --list"], ["Kafka group lag", "kafka-consumer-groups.bat --bootstrap-server broker:9092 --describe --group group-name"]],
  github: [["GitHub authentication", "gh auth status"], ["GitHub pull requests", "gh pr list --limit 30"], ["GitHub workflow runs", "gh run list --limit 30"], ["GitHub releases", "gh release list --limit 30"]],
  git: [["Git status", "git status --short --branch"], ["Git branches", "git branch --all"], ["Git commits", "git log --oneline --decorate -n 30"], ["Git diff summary", "git diff --stat"]],
  terraform: [["Terraform validate", "terraform validate -no-color"], ["Terraform providers", "terraform providers"], ["Terraform outputs", "terraform output -no-color"], ["Terraform state", "terraform state list"]],
  tofu: [["OpenTofu validate", "tofu validate -no-color"], ["OpenTofu providers", "tofu providers"], ["OpenTofu outputs", "tofu output -no-color"], ["OpenTofu state", "tofu state list"]],
  helm: [["Helm releases", "helm list -A"], ["Helm repositories", "helm repo list"], ["Helm history", "helm history release-name"], ["Helm values", "helm get values release-name --all"]],
  ansible: [["Ansible version", "ansible --version"], ["Ansible inventory", "ansible-inventory --list"], ["Ansible graph", "ansible-inventory --graph"]],
  argocd: [["Argo CD applications", "argocd app list"], ["Argo CD clusters", "argocd cluster list"], ["Argo CD repositories", "argocd repo list"]],
  vault: [["Vault status", "vault status -format=json"], ["Vault secrets engines", "vault secrets list -format=json"], ["Vault auth methods", "vault auth list -format=json"], ["Vault policies", "vault policy list -format=json"]],
  nomad: [["Nomad status", "nomad status"], ["Nomad nodes", "nomad node status"], ["Nomad jobs", "nomad job status"], ["Nomad servers", "nomad server members"]],
  aws: [["AWS identity", "aws sts get-caller-identity --output json"], ["AWS regions", "aws ec2 describe-regions --output table"], ["AWS EKS clusters", "aws eks list-clusters --output table"]],
  azure: [["Azure account", "az account show --output json"], ["Azure subscriptions", "az account list --output table"], ["Azure AKS clusters", "az aks list --output table"]],
  gcloud: [["Google Cloud account", "gcloud auth list"], ["Google Cloud project", "gcloud config get-value project"], ["GKE clusters", "gcloud container clusters list"], ["Cloud SQL instances", "gcloud sql instances list"]],
  databricks: [["Databricks profiles", "databricks auth profiles"], ["Databricks clusters", "databricks clusters list --output json"], ["Databricks jobs", "databricks jobs list --output json"], ["Databricks warehouses", "databricks warehouses list --output json"]],
  snowflake: [["SnowSQL version", "snowsql -v"], ["Snowflake context", "snowsql -q \"select current_user(), current_account(), current_warehouse()\""], ["Snowflake warehouses", "snowsql -q \"show warehouses\""]],
  ssh: [["SSH resolved configuration", "ssh -G approved-host"], ["SSH connectivity", "ssh -o BatchMode=yes -o StrictHostKeyChecking=yes approved-host exit"]],
  goldengate: [["GoldenGate process overview", "INFO ALL"], ["GoldenGate Extract lag", "LAG EXTRACT *"], ["GoldenGate Replicat lag", "LAG REPLICAT *"], ["GoldenGate versions", "VERSIONS"]],
};

const tuningActions = {
  oracle: { instance: ["Instance health", "Confirm availability, startup time, archive state and restricted logins."], waits: ["Wait classes", "Review the largest non-idle wait classes before tuning SQL or storage."], blockers: ["Blocking sessions", "Identify blocking sessions and coordinate before any kill or rollback action."], io: ["I/O pressure", "Use high User I/O events to focus storage latency and SQL access-path analysis."], memory: ["SGA memory", "Inspect major SGA allocations and resizeable components before memory changes."], topSql: ["Top SQL", "Rank statements by elapsed time, then compare executions, CPU, reads and rows before tuning."], tablespaces: ["Tablespace capacity", "Review allocated, free and used percentages before storage reaches operational thresholds."], invalidObjects: ["Invalid objects", "Identify invalid application and database objects before releases or incident analysis."], jobs: ["Scheduler jobs", "Review running, failed and long scheduler activity without modifying job state."], redo: ["Redo configuration", "Confirm redo groups, members, sizes and current status before investigating switch pressure."] },
  postgres: { activity: ["Active workload", "Review long-running sessions, state and wait events."], blockers: ["Blocking sessions", "Trace blocked PIDs to their blockers before changing locks or sessions."], cache: ["Cache efficiency", "Low hit ratios can indicate cold data, undersized memory or scan-heavy SQL."], topQueries: ["Expensive queries", "Compare total and mean execution time with reads and temporary writes."], databaseIO: ["Database I/O", "Focus on databases with high read/write time, temporary bytes or deadlocks."], indexes: ["Index usage", "Find large or write-heavy indexes with low scan counts before considering index changes."], tables: ["Table activity", "Compare scans, live rows and dead tuples for maintenance planning."], replication: ["Replication status", "Review streaming state, WAL positions and replay lag for connected standbys."], maintenance: ["Vacuum & analyze", "Prioritize tables with dead tuples or stale vacuum and analyze timestamps."], settings: ["Core settings", "Capture performance-critical settings and their source before proposing changes."] },
  mongodb: { server: ["Server health", "Inspect uptime, operation counters, memory, queues and assertions."], operations: ["Current operations", "Review long-running active operations and lock waits."], replication: ["Replication health", "Confirm member state, lag indicators and heartbeat health."], database: ["Database statistics", "Review data, index and storage size with object counts."], connections: ["Connections", "Compare current and available connections, then inspect saturation causes."], collections: ["Collection storage", "Compare document, data, storage and index size across collections."], locks: ["Lock activity", "Review lock acquisition and wait modes before investigating contention."], profiler: ["Profiler status", "Inspect current profiling and recent slow operations when profiling is already enabled."], storage: ["Storage engine", "Review WiredTiger cache and storage metrics for eviction or cache pressure."], sharding: ["Sharding status", "Confirm shard membership and balancer metadata for sharded deployments."] },
  mysql: { activity: ["Active workload", "Review non-sleeping sessions by runtime and current statement."], digests: ["Expensive digests", "Compare total time, average time and rows examined for frequent statements."], locks: ["Lock waits", "Map requesting and blocking transactions before coordinating remediation."], buffer: ["Buffer pool", "Review buffer reads, read requests, dirty pages and free pages together."], io: ["File I/O", "Find files with the greatest aggregate wait and operation counts."], replication: ["Replication status", "Review receiver, applier and lag fields for the configured replica channel."], indexes: ["Index inventory", "Find wide, duplicated or low-cardinality indexes for evidence-based review."], tables: ["Table capacity", "Rank tables by total data and index allocation before storage changes."], temp: ["Temporary & sorts", "High disk temporary tables or merge passes can indicate memory or query pressure."], settings: ["Core settings", "Capture major memory, connection, logging and optimizer settings before review."] },
  sqlserver: { activity: ["Active requests", "Compare elapsed time, CPU, reads and waits for executing requests."], blockers: ["Blocking chain", "Use the blocking session and wait resource to trace contention safely."], waits: ["Wait statistics", "Exclude benign idle waits and investigate high resource or signal time."], io: ["Database file I/O", "Compare file latency using stall time divided by read and write counts."], memory: ["Memory pressure", "Review process commitment, available memory and low-memory indicators."], topQueries: ["Top query plans", "Rank cached plans by total elapsed time and compare count, CPU and reads."], missingIndexes: ["Missing-index signals", "Treat missing-index DMVs as workload evidence and test write overhead before creation."], databaseSpace: ["Database capacity", "Review file sizes, growth configuration and maximum size."], tempdb: ["TempDB usage", "Compare user, internal, version-store and free pages when investigating pressure."], indexes: ["Index usage", "Compare seeks, scans, lookups and updates to find expensive or unused candidates."] },
};

const devopsAuditPlans = {
  github: { quick: ["status", "repositories"], full: ["status", "repositories", "pullRequests", "workflows", "issues", "releases"] },
  kubernetes: { quick: ["cluster", "nodes", "pods"], full: ["cluster", "namespaces", "nodes", "pods", "deployments", "services", "events", "topPods", "topNodes"] },
  docker: { quick: ["info", "containers", "images"], full: ["info", "containers", "images", "networks", "volumes", "diskUsage", "stats"] },
  podman: { quick: ["info", "containers", "images"], full: ["info", "containers", "images", "networks", "volumes", "diskUsage", "stats"] },
  kafka: { quick: ["topics", "groups"], full: ["topics", "groups"] },
  terraform: { quick: ["version", "validate", "workspace"], full: ["version", "providers", "validate", "outputs", "state", "workspace"] },
  tofu: { quick: ["version", "validate", "workspace"], full: ["version", "providers", "validate", "outputs", "state", "workspace"] },
  helm: { quick: ["releases", "repositories"], full: ["releases", "repositories", "charts"] },
  ansible: { quick: ["version", "config"], full: ["version", "config", "inventory", "graph"] },
  argocd: { quick: ["version", "applications"], full: ["version", "applications", "clusters", "repositories", "projects"] },
  vault: { quick: ["status", "secrets"], full: ["status", "secrets", "auth", "policies"] },
  nomad: { quick: ["status", "nodes"], full: ["status", "nodes", "jobs", "servers"] },
  git: { quick: ["version", "status", "branches"], full: ["version", "status", "branches", "remotes", "commits", "diff"] },
  ssh: { quick: ["version"], full: ["version", "configuration", "connectivity"] },
  aws: { quick: ["identity", "regions"], full: ["identity", "regions", "eksClusters", "ecsClusters"] },
  azure: { quick: ["account", "subscriptions"], full: ["account", "subscriptions", "resourceGroups", "aksClusters"] },
  gcloud: { quick: ["account", "project"], full: ["account", "project", "config", "clusters", "sqlInstances"] },
  databricks: { quick: ["profiles", "clusters"], full: ["profiles", "clusters", "jobs", "warehouses"] },
  snowflake: { quick: ["version", "context"], full: ["version", "context", "recentQueries", "warehouses"] },
  goldengate: { quick: ["version", "overview", "lag"], full: ["version", "overview", "lag", "messages", "versions"] },
};

const logCatalog = [
  { id:"goldengate", name:"Oracle GoldenGate", group:"data", log:"ggserr.log · reports · discard", mode:"file", path:"\\\\ogg-host\\ogg\\ggserr.log", color:"#f05a45", description:"Replication errors, process lifecycle, lag, report and discard evidence", hint:"Use SSH server monitoring for ggserr.log, Extract/Replicat reports, discard files, or Microservices logs." },
  { id:"oracle", name:"Oracle Database", group:"database", log:"alert.log · listener · audit", mode:"file", path:"C:\\app\\oracle\\diag\\rdbms\\orcl\\ORCL\\trace\\alert_ORCL.log", color:"#e94d64", description:"Alert, listener, audit and trace logs", hint:"Use the ADR alert log, listener log, audit trail, or any mounted Oracle trace file." },
  { id:"postgres", name:"PostgreSQL", group:"database", log:"postgresql.log", mode:"file", path:"C:\\Program Files\\PostgreSQL\\16\\data\\log\\postgresql.log", color:"#4386e8", description:"Server, checkpoint, connection and slow-statement logs" },
  { id:"mysql", name:"MySQL", group:"database", log:"error · slow · general", mode:"file", path:"C:\\ProgramData\\MySQL\\MySQL Server 8.0\\Data\\mysql-error.log", color:"#e59a19", description:"Error, slow-query, general and audit logs" },
  { id:"mariadb", name:"MariaDB", group:"database", log:"mariadb.log", mode:"file", path:"C:\\Program Files\\MariaDB 11.0\\data\\mariadb.log", color:"#64748b", description:"Error, slow-query, general and audit logs" },
  { id:"sqlserver", name:"SQL Server", group:"database", log:"ERRORLOG · Agent", mode:"file", path:"C:\\Program Files\\Microsoft SQL Server\\MSSQL16.MSSQLSERVER\\MSSQL\\Log\\ERRORLOG", color:"#dd4b59", description:"Database Engine ERRORLOG, SQL Agent and Extended Events" },
  { id:"db2", name:"IBM Db2", group:"database", log:"db2diag.log · notify", mode:"file", path:"C:\\ProgramData\\IBM\\DB2\\DB2COPY1\\DB2\\db2diag.log", color:"#2874d0", description:"Diagnostic, notification and administration logs" },
  { id:"hana", name:"SAP HANA", group:"database", log:"indexserver · nameserver", mode:"file", path:"\\\\hana-host\\trace\\indexserver_alert_HDB.trc", color:"#3189a6", description:"Indexserver, nameserver, xsengine and backup traces" },
  { id:"sybase", name:"SAP ASE / Sybase", group:"database", log:"errorlog", mode:"file", path:"\\\\ase-host\\logs\\ASE.log", color:"#477a96", description:"ASE error, audit and backup-server logs" },
  { id:"informix", name:"IBM Informix", group:"database", log:"online.log", mode:"file", path:"\\\\informix-host\\logs\\online.log", color:"#735ab7", description:"Online, message and assertion-failure logs" },
  { id:"firebird", name:"Firebird", group:"database", log:"firebird.log", mode:"file", path:"C:\\Program Files\\Firebird\\Firebird_5_0\\firebird.log", color:"#e25445", description:"Server startup, shutdown, connection and engine errors" },
  { id:"mongodb", name:"MongoDB", group:"nosql", log:"mongod.log · audit", mode:"file", path:"C:\\Program Files\\MongoDB\\Server\\7.0\\log\\mongod.log", color:"#29ad68", description:"Server, replication, sharding, slow-operation and audit logs" },
  { id:"redis", name:"Redis", group:"nosql", log:"redis-server.log", mode:"file", path:"\\\\redis-host\\logs\\redis-server.log", color:"#d94852", description:"Server, persistence, replication and cluster logs" },
  { id:"cassandra", name:"Apache Cassandra", group:"nosql", log:"system.log · debug.log", mode:"file", path:"\\\\cassandra-host\\logs\\system.log", color:"#438bb5", description:"System, debug, GC and audit logs" },
  { id:"elasticsearch", name:"Elasticsearch", group:"nosql", log:"cluster.log · gc", mode:"file", path:"\\\\elastic-host\\logs\\elasticsearch.log", color:"#d3a91f", description:"Cluster, deprecation, slow-search, indexing and GC logs" },
  { id:"opensearch", name:"OpenSearch", group:"nosql", log:"opensearch.log", mode:"file", path:"\\\\opensearch-host\\logs\\opensearch.log", color:"#4b71cf", description:"Cluster, audit, search-slow and indexing-slow logs" },
  { id:"neo4j", name:"Neo4j", group:"nosql", log:"neo4j.log · debug.log", mode:"file", path:"C:\\Neo4j\\logs\\neo4j.log", color:"#3686c6", description:"Database, security, query and debug logs" },
  { id:"couchbase", name:"Couchbase", group:"nosql", log:"info.log · error.log", mode:"file", path:"C:\\Program Files\\Couchbase\\Server\\var\\lib\\couchbase\\logs\\info.log", color:"#e4424c", description:"Cluster, query, index, eventing and audit logs" },
  { id:"influxdb", name:"InfluxDB", group:"nosql", log:"influxd.log", mode:"file", path:"C:\\ProgramData\\InfluxData\\influxdb\\influxd.log", color:"#7137d8", description:"Storage engine, query, task and HTTP logs" },
  { id:"clickhouse", name:"ClickHouse", group:"warehouse", log:"clickhouse-server.log", mode:"file", path:"\\\\clickhouse-host\\logs\\clickhouse-server.log", color:"#d3aa25", description:"Server, query, error and trace logs" },
  { id:"cockroach", name:"CockroachDB", group:"warehouse", log:"cockroach.log", mode:"file", path:"\\\\cockroach-host\\logs\\cockroach.log", color:"#6b59df", description:"SQL, KV, storage, health and security logs" },
  { id:"greenplum", name:"Greenplum", group:"warehouse", log:"gpdb-*.csv", mode:"file", path:"\\\\greenplum-host\\master\\pg_log\\gpdb.csv", color:"#4b8f66", description:"Coordinator, segment, gpAdmin and query logs" },
  { id:"vertica", name:"Vertica", group:"warehouse", log:"vertica.log", mode:"file", path:"\\\\vertica-host\\catalog\\db\\v_db_node_catalog\\vertica.log", color:"#4c7db9", description:"Database, spread, UDx and error-report logs" },
  { id:"teradata", name:"Teradata", group:"warehouse", log:"DBQL · PDE · BAR", mode:"file", path:"\\\\teradata-host\\logs\\teradata.log", color:"#e17432", description:"DBQL exports, PDE events, viewpoint and BAR logs" },
  { id:"netezza", name:"IBM Netezza", group:"warehouse", log:"postgres.log · dbos", mode:"file", path:"\\\\netezza-host\\nz\\kit\\log\\postgres\\pg.log", color:"#7758b5", description:"Database, system, loader and backup logs" },
  { id:"exadata", name:"Oracle Exadata", group:"warehouse", log:"alert · cellsrv · MS", mode:"file", path:"\\\\exadata-cell\\diag\\asm\\cell\\trace\\alert.log", color:"#bd3b4f", description:"Database alert, ASM, cellsrv, MS and ILOM logs" },
  { id:"trino", name:"Trino / Presto", group:"data", log:"server.log · launcher.log", mode:"file", path:"\\\\trino-host\\var\\log\\server.log", color:"#8a4a91", description:"Coordinator, worker, query and launcher logs" },
  { id:"hive", name:"Apache Hive", group:"data", log:"hiveserver2.log", mode:"file", path:"\\\\hive-host\\logs\\hiveserver2.log", color:"#d39a1f", description:"HiveServer2, metastore, operation and audit logs" },
  { id:"hadoop", name:"Hadoop / YARN", group:"data", log:"namenode · resourcemanager", mode:"file", path:"\\\\hadoop-host\\logs\\hadoop-hdfs-namenode.log", color:"#ecb42e", description:"HDFS, YARN, MapReduce and container logs" },
  { id:"spark", name:"Apache Spark", group:"data", log:"driver · executor", mode:"file", path:"\\\\spark-host\\logs\\spark-driver.log", color:"#e4772f", description:"Driver, executor, event and history-server logs" },
  { id:"druid", name:"Apache Druid", group:"data", log:"coordinator · historical", mode:"file", path:"\\\\druid-host\\logs\\druid.log", color:"#4d6fc5", description:"Coordinator, broker, historical, middle-manager and router logs" },
  { id:"kafka", name:"Apache Kafka", group:"data", log:"server.log · controller", mode:"file", path:"\\\\kafka-host\\logs\\server.log", color:"#4d5668", description:"Broker, controller, request, state-change and GC logs" },
  { id:"snowflake", name:"Snowflake", group:"cloud", log:"Query History", mode:"telemetry", path:"", color:"#2c9ed3", description:"Query history, execution status, errors and warehouse timing", hint:"Uses the active company-approved snowsql profile. No local log file is required." },
  { id:"bigquery", name:"Google BigQuery", group:"cloud", log:"Cloud Logging", mode:"telemetry", path:"", color:"#4285f4", description:"BigQuery audit, job and reservation telemetry", hint:"Uses the active gcloud account and project through Cloud Logging." },
  { id:"redshift", name:"Amazon Redshift", group:"cloud", log:"CloudWatch log group", mode:"telemetry", path:"/aws/redshift/cluster/my-cluster/userlog", color:"#8b55c5", description:"Connection, user activity and audit logs from CloudWatch", hint:"Enter the approved CloudWatch log group for the Redshift cluster." },
  { id:"synapse", name:"Azure Synapse", group:"cloud", log:"Azure Monitor", mode:"telemetry", path:"/subscriptions/.../workspaces/my-synapse", color:"#287bd1", description:"Workspace activity, pipeline and SQL telemetry", hint:"Enter the full Azure resource ID. Uses the active az login context." },
  { id:"databricks", name:"Databricks", group:"cloud", log:"Cluster events", mode:"telemetry", path:"", color:"#e4533d", description:"Cluster lifecycle, driver and execution events", hint:"Enter a cluster ID. Uses the active Databricks CLI profile." },
  { id:"fabric", name:"Microsoft Fabric", group:"cloud", log:"Azure activity", mode:"telemetry", path:"/subscriptions/.../providers/Microsoft.Fabric/capacities/...", color:"#6a4dd8", description:"Fabric capacity and workspace activity telemetry", hint:"Enter the Fabric/Azure resource ID. Uses the active az login context." },
  { id:"athena", name:"AWS Athena", group:"cloud", log:"Query executions", mode:"telemetry", path:"", color:"#7554a8", description:"Recent query executions from the active AWS profile", hint:"Uses the active AWS CLI profile and configured region." },
  { id:"cloudsql", name:"Google Cloud SQL", group:"cloud", log:"Cloud Logging", mode:"telemetry", path:"", color:"#4a86d8", description:"Database engine and instance telemetry from Cloud Logging", hint:"Uses the active gcloud account and project." },
  { id:"rds", name:"Amazon RDS", group:"cloud", log:"CloudWatch log group", mode:"telemetry", path:"/aws/rds/instance/my-db/postgresql", color:"#5175b8", description:"Engine, slow-query, audit and upgrade logs", hint:"Enter the approved RDS CloudWatch log group." },
  { id:"aurora", name:"Amazon Aurora", group:"cloud", log:"CloudWatch log group", mode:"telemetry", path:"/aws/rds/cluster/my-cluster/postgresql", color:"#4767a7", description:"Aurora engine, slow-query, audit and error logs", hint:"Enter the approved Aurora CloudWatch log group." },
  { id:"alloydb", name:"Google AlloyDB", group:"cloud", log:"Cloud Logging", mode:"telemetry", path:"", color:"#3f82c9", description:"AlloyDB database, audit and instance telemetry", hint:"Uses the active gcloud account and project." },
  { id:"custom", name:"Custom database / DW", group:"database", log:"Any text log", mode:"file", path:"", color:"#687386", description:"Any readable database, warehouse, appliance or ETL text log", hint:"Enter a local path, UNC share, or mounted log path approved by your company." },
];

const nativeLogEngines = { oracle:"oracle", postgres:"postgres", mongodb:"mongodb", mysql:"mysql", sqlserver:"sqlserver" };
const remoteLogPaths = {
  oracle:"/u01/app/oracle/diag/rdbms/orcl/ORCL/trace/alert_ORCL.log", postgres:"/var/log/postgresql/postgresql.log", mysql:"/var/log/mysql/error.log", mariadb:"/var/log/mysql/mariadb.log", sqlserver:"C:\\Program Files\\Microsoft SQL Server\\MSSQL16.MSSQLSERVER\\MSSQL\\Log\\ERRORLOG", db2:"/home/db2inst1/sqllib/db2dump/db2diag.log", hana:"/usr/sap/HDB/HDB00/host/trace/indexserver_alert_HDB.trc", sybase:"/opt/sap/ASE-16_0/install/ASE.log", informix:"/opt/informix/tmp/online.log", mongodb:"/var/log/mongodb/mongod.log", redis:"/var/log/redis/redis-server.log", cassandra:"/var/log/cassandra/system.log", elasticsearch:"/var/log/elasticsearch/elasticsearch.log", opensearch:"/var/log/opensearch/opensearch.log", neo4j:"/var/log/neo4j/neo4j.log", couchbase:"/opt/couchbase/var/lib/couchbase/logs/info.log", influxdb:"/var/log/influxdb/influxd.log", clickhouse:"/var/log/clickhouse-server/clickhouse-server.log", cockroach:"/var/log/cockroach/cockroach.log", greenplum:"/data/master/gpseg-1/pg_log/gpdb.csv", vertica:"/home/dbadmin/db/v_db_node_catalog/vertica.log", trino:"/var/log/trino/server.log", hive:"/var/log/hive/hiveserver2.log", hadoop:"/var/log/hadoop-hdfs/hadoop-hdfs-namenode.log", spark:"/var/log/spark/spark-driver.log", druid:"/var/log/druid/druid.log", kafka:"/var/log/kafka/server.log"
};
remoteLogPaths.goldengate = "/u01/app/ogg/ggserr.log";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(path, options = {}) {
  state.ui.activeRequests += 1;
  setSessionPulse("Working", "busy");
  try {
    const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", "X-DBridge-Token": token, ...(options.headers || {}) } });
    const result = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
    if (!response.ok || result.ok === false) throw new Error(result.error || result.stderr || `Request failed (${response.status})`);
    return result;
  } finally {
    state.ui.activeRequests = Math.max(0, state.ui.activeRequests - 1);
    if (!state.ui.activeRequests) setSessionPulse("Ready", "live");
  }
}

function credentialLocator(prefix, values) {
  const source = values.map((value) => String(value || "").trim().toLowerCase()).join("\u0000");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function databaseCredentialId(payload = connection()) {
  const source = payload.connection || {};
  return credentialLocator("db", [payload.environment, payload.engine, source.host, source.port, source.database, source.username]);
}

function renderKeepPass() {
  const enabled = state.credentials.keepPass;
  $("#keepPassToggle").checked = enabled;
  $("#keepPassSwitch").classList.toggle("active", enabled);
  $("#keepPassSwitch").setAttribute("aria-pressed", String(enabled));
  $("#keepPassStatus").textContent = enabled ? "Agent memory" : "Disabled";
}

async function changeKeepPass(enabled, announce = true) {
  state.credentials.keepPass = Boolean(enabled);
  try { localStorage.setItem(KEEP_PASS_STORAGE_KEY, String(state.credentials.keepPass)); } catch { /* preference only */ }
  renderKeepPass();
  if (!state.credentials.keepPass) {
    $("#sqlPassword").value = "";
    try { await api("/api/credentials/session/clear", { method: "POST", body: "{}" }); }
    catch (error) { if (announce) toast(error.message, true); }
  }
  window.dispatchEvent(new CustomEvent("dbridge-keep-pass-changed", { detail: { enabled: state.credentials.keepPass } }));
  if (announce) toast(state.credentials.keepPass ? "Keep pass enabled for SQL Studio and SSH until the local agent stops" : "Keep pass disabled; remembered credentials cleared");
}

function restoreKeepPass() {
  let enabled = true;
  try { enabled = localStorage.getItem(KEEP_PASS_STORAGE_KEY) !== "false"; } catch { /* default on */ }
  state.credentials.keepPass = enabled;
  window.dbridgeKeepPassEnabled = () => state.credentials.keepPass;
  renderKeepPass();
}

async function rememberDatabaseCredential(payload) {
  const source = payload.connection || {};
  if (!state.credentials.keepPass || source.authMode === "context") { delete source.credentialId; return payload; }
  source.credentialId = databaseCredentialId(payload);
  if (source.password) {
    await api("/api/credentials/session", { method: "POST", body: JSON.stringify({ scope: "database", id: source.credentialId, username: source.username, password: source.password }) });
    source.password = "";
    $("#sqlPassword").value = "";
  }
  return payload;
}

function toast(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.className = `toast show${error ? " error" : ""}`;
  clearTimeout(element.timer);
  element.timer = setTimeout(() => element.className = "toast", 2800);
}

function setBusy(button, busy, text = "Working…") {
  if (busy) { button.dataset.label = button.innerHTML; button.disabled = true; button.textContent = text; }
  else { button.disabled = false; button.innerHTML = button.dataset.label || button.innerHTML; }
}

function closeApplicationSidebar() {
  document.body.classList.remove("sidebar-open");
  $("#menu")?.setAttribute("aria-expanded", "false");
}

function toggleApplicationSidebar() {
  const open = !document.body.classList.contains("sidebar-open");
  document.body.classList.toggle("sidebar-open", open);
  $("#menu")?.setAttribute("aria-expanded", String(open));
}

// Scores a subsequence match so "kub dash" still finds "Kubernetes and Docker dashboard".
function commandPaletteScore(item, terms) {
  const label = item.label.toLowerCase();
  const haystack = `${item.label} ${item.description} ${item.keywords} ${item.code}`.toLowerCase();
  let total = 0;
  for (const term of terms) {
    const labelIndex = label.indexOf(term);
    if (labelIndex === 0) { total += 120; continue; }
    if (labelIndex > 0) { total += label[labelIndex - 1] === " " ? 90 : 60; continue; }
    const haystackIndex = haystack.indexOf(term);
    if (haystackIndex >= 0) { total += 35; continue; }
    // fall back to an in-order character subsequence over the label
    let cursor = 0;
    for (const character of term) {
      cursor = label.indexOf(character, cursor);
      if (cursor < 0) return -1;
      cursor += 1;
    }
    total += 12;
  }
  return total;
}

function renderCommandPalette(query = "") {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const candidates = [
    ...commandPaletteItems.map((item) => ({ ...item, kind: "view" })),
    ...commandPaletteActions.map((item) => ({ ...item, kind: "action" })),
  ];
  commandPaletteMatches = (terms.length
    ? candidates.map((item) => ({ item, score: commandPaletteScore(item, terms) })).filter((row) => row.score >= 0)
      .sort((a, b) => b.score - a.score).map((row) => row.item)
    : candidates);
  commandPaletteSelection = Math.min(commandPaletteSelection, Math.max(commandPaletteMatches.length - 1, 0));
  const results = $("#commandPaletteResults");
  if (!commandPaletteMatches.length) {
    results.innerHTML = '<div class="command-empty"><b>No matching workspace or action</b><span>Try database, SQL_ID, trace, log, Kubernetes, Docker, theme or security.</span></div>';
    return;
  }
  results.innerHTML = commandPaletteMatches.map((item, index) => `<button type="button" class="command-result${index === commandPaletteSelection ? " selected" : ""}" data-command-index="${index}" role="option" aria-selected="${index === commandPaletteSelection}"><span>${escapeHtml(item.code)}</span><div><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.description)}</small></div><em class="${item.kind === "action" ? "command-kind-action" : ""}">${item.kind === "action" ? "Run" : "Open"}</em></button>`).join("");
  $$("[data-command-index]").forEach((button) => button.addEventListener("click", () => activateCommandPaletteItem(Number(button.dataset.commandIndex))));
}

function openCommandPalette() {
  commandPalettePreviousFocus = document.activeElement;
  commandPaletteSelection = 0;
  $("#commandPaletteSearch").value = "";
  renderCommandPalette();
  $("#commandPalette").classList.remove("hidden");
  document.body.classList.add("palette-open");
  window.setTimeout(() => $("#commandPaletteSearch").focus(), 20);
}

function closeCommandPalette() {
  $("#commandPalette").classList.add("hidden");
  document.body.classList.remove("palette-open");
  if (commandPalettePreviousFocus instanceof HTMLElement) commandPalettePreviousFocus.focus({ preventScroll: true });
}

function activateCommandPaletteItem(index) {
  const item = commandPaletteMatches[index];
  if (!item) return;
  closeCommandPalette();
  if (item.kind === "action") return item.run();
  navigate(item.view);
  if (!item.target) return;
  if (item.view === "performance") setPerformanceMode(performanceModeForTarget(item.target) || state.performanceWorkspace.mode, false);
  window.requestAnimationFrame(() => {
    const target = document.getElementById(item.target);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!target.disabled && /^(?:INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName)) window.setTimeout(() => target.focus({ preventScroll: true }), 280);
  });
}

function handleCommandPaletteKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeCommandPalette();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === "Enter") return activateCommandPaletteItem(commandPaletteSelection);
  if (!commandPaletteMatches.length) return;
  if (event.key === "Home") commandPaletteSelection = 0;
  else if (event.key === "End") commandPaletteSelection = commandPaletteMatches.length - 1;
  else commandPaletteSelection = (commandPaletteSelection + (event.key === "ArrowDown" ? 1 : -1) + commandPaletteMatches.length) % commandPaletteMatches.length;
  renderCommandPalette($("#commandPaletteSearch").value);
  $(`[data-command-index="${commandPaletteSelection}"]`)?.scrollIntoView({ block: "nearest" });
}

function navigate(view) {
  state.currentView = view;
  document.body.dataset.view = view;
  $$(".view").forEach((el) => el.classList.toggle("active", el.id === `${view}-view`));
  $$("#nav button").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  $$("[data-workspace-tab]").forEach((el) => {
    const active = el.dataset.workspaceTab === view;
    el.classList.toggle("active", active);
    el.setAttribute("aria-current", active ? "page" : "false");
  });
  $("#pageTitle").textContent = titles[view];
  const detail = pageDetails[view] || pageDetails.overview;
  $("#pageEyebrow").textContent = detail.eyebrow;
  $("#pageContext").textContent = detail.context;
  closeApplicationSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "devops" && !Object.keys(state.tools).length) scanTools();
  if (view === "devops" && !state.versionComparison) loadVersionComparison();
  if ((view === "investigation" || view === "devops") && !state.investigation.loaded) loadInvestigationWorkspace();
}

function openFriendlyWorkspaceTarget(button) {
  const view = button.dataset.workspaceView;
  const targetId = button.dataset.workspaceTarget;
  if (view) navigate(view);
  if (!targetId) return;
  if (view === "performance" || state.currentView === "performance") setPerformanceMode(performanceModeForTarget(targetId) || state.performanceWorkspace.mode, false);
  window.requestAnimationFrame(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!target.disabled && /^(?:INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName)) {
      window.setTimeout(() => target.focus({ preventScroll: true }), 280);
    }
    if (button.closest(".trace-workspace-tabs")) {
      $$(".trace-workspace-tabs button").forEach((item) => item.classList.toggle("active", item === button));
    }
  });
}

function connection(engineId = "sqlEngine") {
  const payload = { environment: currentSqlEnvironment(), engine: $(`#${engineId}`).value, connection: { host: $("#sqlHost").value.trim(), port: $("#sqlPort").value.trim(), database: $("#sqlDatabase").value.trim(), username: $("#sqlUsername").value.trim(), password: $("#sqlPassword").value, authMode: $("#sqlAuthMode").value, tlsMode: $("#sqlTlsMode").value } };
  if (state.credentials.keepPass && payload.connection.authMode === "password") payload.connection.credentialId = databaseCredentialId(payload);
  return payload;
}

const CONNECTION_SESSION_STORAGE_KEY = "dbridge.sql.connection.v1";

function sanitizeConnectionSessionEntry(value) {
  const entry = value && typeof value === "object" ? value : {};
  const environment = ["Production", "SIT", "UAT-Test", "DEV"].includes(entry.environment) ? entry.environment : "Production";
  const host = String(entry.host || "").trim();
  const port = String(entry.port || "").trim();
  const database = String(entry.database || "").trim();
  const username = String(entry.username || "").trim();
  const authMode = entry.authMode === "context" ? "context" : "password";
  const tlsMode = ["require", "disable"].includes(entry.tlsMode) ? entry.tlsMode : "prefer";
  if (host && !/^[A-Za-z0-9_.-]{1,255}$/.test(host)) throw new Error("Saved connection host is invalid");
  if (port && (!/^\d{1,5}$/.test(port) || Number(port) > 65535)) throw new Error("Saved connection port is invalid");
  if (database && !/^[A-Za-z0-9_.:$@/-]{1,255}$/.test(database)) throw new Error("Saved database or service is invalid");
  if (username && !/^[A-Za-z0-9_.@+\\-]{1,255}$/.test(username)) throw new Error("Saved connection username is invalid");
  return { environment, host, port, database, username, authMode, tlsMode };
}

function readConnectionSession() {
  const fallback = { version: 2, activeEnvironment: "Production", activeEngine: "oracle", connections: {} };
  try {
    const parsed = JSON.parse(localStorage.getItem(CONNECTION_SESSION_STORAGE_KEY) || "null");
    if (!parsed || ![1, 2].includes(parsed.version) || !parsed.connections || typeof parsed.connections !== "object") return fallback;
    const connections = {};
    Object.entries(parsed.connections).forEach(([scope, entry]) => {
      const legacyEngine = sqlAdapterUi[scope] ? scope : "";
      const separator = scope.lastIndexOf("::");
      const environment = legacyEngine ? "Production" : scope.slice(0, separator);
      const engine = legacyEngine || scope.slice(separator + 2);
      if (sqlAdapterUi[engine] && DBRIDGE_ENVIRONMENTS.has(environment)) {
        try { connections[connectionSessionKey(engine, environment)] = sanitizeConnectionSessionEntry({ ...entry, environment }); } catch {}
      }
    });
    const activeEnvironment = DBRIDGE_ENVIRONMENTS.has(parsed.activeEnvironment) ? parsed.activeEnvironment : "Production";
    return { version: 2, activeEnvironment, activeEngine: sqlAdapterUi[parsed.activeEngine] ? parsed.activeEngine : "oracle", connections, savedAt: String(parsed.savedAt || "") };
  } catch { return fallback; }
}

function setConnectionSessionStatus(kind, label, detail) {
  $("#connectionSessionBadge").className = `connection-session-badge ${kind || ""}`.trim();
  $("#connectionSessionBadge").textContent = label;
  $("#connectionSessionStatus").textContent = detail;
}

function persistConnectionSession(engine = $("#sqlEngine").value, makeActive = true, announce = false, environment = currentSqlEnvironment()) {
  try {
    if (!sqlAdapterUi[engine]) throw new Error("Select a supported database engine");
    const stored = readConnectionSession();
    const entry = sanitizeConnectionSessionEntry({ environment, host: $("#sqlHost").value, port: $("#sqlPort").value, database: $("#sqlDatabase").value, username: $("#sqlUsername").value, authMode: $("#sqlAuthMode").value, tlsMode: $("#sqlTlsMode").value });
    stored.version = 2;
    stored.connections[connectionSessionKey(engine, environment)] = entry;
    if (makeActive) { stored.activeEngine = engine; stored.activeEnvironment = environment; }
    stored.savedAt = new Date().toISOString();
    localStorage.setItem(CONNECTION_SESSION_STORAGE_KEY, JSON.stringify(stored));
    state.connectionSession.activeEngine = makeActive ? engine : state.connectionSession.activeEngine;
    state.connectionSession.activeEnvironment = makeActive ? environment : state.connectionSession.activeEnvironment;
    if (performanceWorkspaceCatalog[engine]) state.performanceWorkspace.connections[engine] = { ...entry };
    const savedTime = new Date(stored.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setConnectionSessionStatus("saved", "SAVED", `${environment} · ${sqlAdapterUi[engine].name} · ${savedTime}`);
    if (announce) toast("SQL connection session saved without the password");
    return true;
  } catch (error) {
    setConnectionSessionStatus("error", "NOT SAVED", "Local session storage unavailable");
    if (announce) toast(error.message, true);
    return false;
  }
}

function scheduleConnectionSessionSave() {
  if (state.connectionSession.restoring) return;
  state.connectionSession.suspendAutoSave = false;
  clearTimeout(state.connectionSession.timer);
  state.connectionSession.timer = setTimeout(() => persistConnectionSession($("#sqlEngine").value, true, false), 400);
}

function applySavedConnectionEntry(engine, entry) {
  if (!entry) return false;
  const clean = sanitizeConnectionSessionEntry(entry);
  $("#sqlHost").value = clean.host;
  $("#sqlPort").value = clean.port || (sqlAdapterUi[engine]?.port || "");
  $("#sqlDatabase").value = clean.database;
  $("#sqlUsername").value = clean.username;
  $("#sqlAuthMode").value = sqlContextOnlyEngines.has(engine) ? "context" : clean.authMode;
  $("#sqlTlsMode").value = clean.tlsMode;
  return true;
}

function restoreConnectionSession() {
  const stored = readConnectionSession();
  const engine = stored.activeEngine;
  const environment = stored.activeEnvironment || "Production";
  const entry = stored.connections[connectionSessionKey(engine, environment)];
  state.connectionSession.restoring = true;
  state.connectionSession.activeEngine = engine;
  state.connectionSession.activeEnvironment = environment;
  $("#sqlEnvironment").value = environment;
  $("#sqlEngine").value = engine;
  if (entry) applySavedConnectionEntry(engine, entry);
  else { $("#sqlAuthMode").value = sqlContextOnlyEngines.has(engine) ? "context" : "password"; $("#sqlTlsMode").value = "prefer"; updatePort(); }
  $("#sqlPassword").value = "";
  state.connectionSession.restoring = false;
  if (entry) {
    const savedTime = stored.savedAt ? new Date(stored.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "earlier";
    setConnectionSessionStatus("saved", "RESTORED", `${environment} · ${sqlAdapterUi[engine].name} · ${savedTime}`);
  } else setConnectionSessionStatus("", "LOCAL SESSION", "Changes save automatically");
  updateConnectionAdapterUi(); updateSnapshotTarget(); updateOracleXrayTarget(); updatePerformanceContextTarget();
  return engine;
}

function clearConnectionSession() {
  clearTimeout(state.connectionSession.timer);
  try { localStorage.removeItem(CONNECTION_SESSION_STORAGE_KEY); } catch {}
  state.connectionSession.suspendAutoSave = true;
  state.performanceWorkspace.connections = {};
  setConnectionSessionStatus("cleared", "CLEARED", "Current fields were not changed");
  toast("Saved SQL connection session cleared");
}

function sqlConnectionEngineChanged() {
  const nextEngine = $("#sqlEngine").value;
  const previousEngine = state.connectionSession.activeEngine;
  if (!state.connectionSession.restoring && sqlAdapterUi[previousEngine]) persistConnectionSession(previousEngine, false, false);
  state.connectionSession.activeEngine = nextEngine;
  editorEngineChanged();
  const stored = readConnectionSession();
  const entry = stored.connections[connectionSessionKey(nextEngine)];
  if (entry) applySavedConnectionEntry(nextEngine, entry);
  else { $("#sqlAuthMode").value = sqlContextOnlyEngines.has(nextEngine) ? "context" : "password"; $("#sqlTlsMode").value = "prefer"; }
  $("#sqlPassword").value = "";
  disconnectSqlStudio(false);
  updateConnectionAdapterUi(); updateSnapshotTarget(); updateOracleXrayTarget(); updatePerformanceContextTarget();
  renderConnectionProfiles();
  scheduleConnectionSessionSave();
}

function sqlEnvironmentChanged() {
  const nextEnvironment = currentSqlEnvironment();
  const previousEnvironment = state.connectionSession.activeEnvironment || "Production";
  const engine = $("#sqlEngine").value;
  if (!state.connectionSession.restoring && DBRIDGE_ENVIRONMENTS.has(previousEnvironment)) {
    persistConnectionSession(engine, false, false, previousEnvironment);
  }
  state.connectionSession.activeEnvironment = nextEnvironment;
  const stored = readConnectionSession();
  const entry = stored.connections[connectionSessionKey(engine, nextEnvironment)];
  state.connectionSession.restoring = true;
  if (entry) applySavedConnectionEntry(engine, entry);
  else {
    $("#sqlHost").value = "localhost";
    $("#sqlPort").value = sqlAdapterUi[engine]?.port || "";
    $("#sqlDatabase").value = engine === "oracle" ? "ORCL" : engine === "postgres" ? "postgres" : "";
    $("#sqlUsername").value = "";
    $("#sqlAuthMode").value = sqlContextOnlyEngines.has(engine) ? "context" : "password";
    $("#sqlTlsMode").value = "prefer";
  }
  $("#sqlPassword").value = "";
  state.connectionSession.restoring = false;
  disconnectSqlStudio(false);
  updateConnectionAdapterUi(); updateSnapshotTarget(); updateOracleXrayTarget(); updatePerformanceContextTarget();
  renderConnectionProfiles();
  scheduleConnectionSessionSave();
  toast(`${nextEnvironment} connection workspace selected`);
}

const DB_STUDIO_DEFAULT_DATABASES = {
  oracle: "ORCL", postgres: "postgres", mongodb: "admin", mysql: "mysql", sqlserver: "master",
  mariadb: "mysql", redshift: "dev", synapse: "master", snowflake: "", bigquery: "", databricks: "",
  db2: "", hana: "", clickhouse: "default", teradata: "",
};

function renderDbStudioConnector() {
  if (!$("#dbStudioAdapterName")) return;
  const engine = $("#sqlEngine").value;
  const local = sqlAdapterUi[engine] || sqlAdapterUi.oracle;
  const adapter = state.sqlStudio.adapters[engine] || null;
  const adapters = Object.values(state.sqlStudio.adapters || {});
  const ready = adapters.filter((item) => item.available).length;
  $("#dbStudioReadyCount").textContent = adapters.length ? String(ready) : String(Object.keys(sqlAdapterUi).length);
  $("#dbStudioReadyLabel").textContent = adapters.length ? `${ready} of ${adapters.length} ready on this laptop` : "Connector catalog loaded";
  $("#dbStudioAdapterName").textContent = adapter?.name || local.name;
  const accessState = $("#dbStudioAccessState");
  const access = adapter?.directAvailable ? "BUNDLED DRIVER" : adapter?.clientAvailable ? "LOCAL CLIENT" : adapter?.available === false ? "CLIENT NEEDED" : "READY";
  accessState.textContent = access;
  accessState.className = adapter?.directAvailable ? "ready" : adapter?.clientAvailable ? "client" : adapter?.available === false ? "blocked" : "ready";
  const accessDetail = adapter?.preferredAccess === "direct" ? `${adapter.driver} direct driver` : adapter?.client ? `${adapter.client} approved client` : local.driver ? `${local.driver} bundled driver` : "approved local client";
  $("#dbStudioAdapterMeta").textContent = `${adapter?.tier || local.hint} · ${adapter?.auth || "connection credentials"} · ${accessDetail}.`;
  const badges = [String(adapter?.family || "database").toUpperCase(), "SQL", "CATALOG", "TLS", "AUTOFILL", "READ ONLY"];
  $("#dbStudioCapabilityBadges").innerHTML = badges.map((badge) => `<i>${escapeHtml(badge)}</i>`).join("");
}

async function loadDbStudioAdapters() {
  try {
    const result = await api("/api/adapters");
    state.sqlStudio.adapters = result.adapters || {};
    renderDbStudioConnector();
  } catch (error) {
    $("#dbStudioReadyLabel").textContent = "Readiness check unavailable";
    renderDbStudioConnector();
  }
}

function updateDbStudioAutofillHint() {
  if (!$("#dbStudioAutofillHint")) return;
  const source = $("#dbStudioAutofillSource").value;
  const environment = currentSqlEnvironment();
  const messages = {
    last: `Restores the last non-secret ${environment} session for this adapter.`,
    profile: "Loads the saved connection profile selected in the connection panel below.",
    defaults: `Applies the standard port, service, authentication and TLS defaults for ${environment}.`,
  };
  $("#dbStudioAutofillHint").textContent = `${messages[source]} Passwords are never filled or saved.`;
}

function applyDbStudioAutofill() {
  const source = $("#dbStudioAutofillSource").value;
  const engine = $("#sqlEngine").value;
  const environment = currentSqlEnvironment();
  if (source === "profile") {
    const profile = $("#connectionProfileSelect").value;
    if (!profile) return toast("Select a saved connection profile below before using profile autofill", true);
    applyConnectionProfile(profile);
    updateDbStudioAutofillHint();
    return;
  }
  state.connectionSession.restoring = true;
  if (source === "last") {
    const stored = readConnectionSession();
    const entry = stored.connections[connectionSessionKey(engine, environment)];
    if (!entry) {
      state.connectionSession.restoring = false;
      return toast(`No saved ${environment} session exists for ${sqlAdapterUi[engine].name}`, true);
    }
    applySavedConnectionEntry(engine, entry);
  } else {
    const adapter = sqlAdapterUi[engine] || sqlAdapterUi.oracle;
    $("#sqlPort").value = adapter.port || "";
    $("#sqlDatabase").value = DB_STUDIO_DEFAULT_DATABASES[engine] || "";
    if (environment === "DEV" && !$("#sqlHost").value.trim()) $("#sqlHost").value = "localhost";
    if (environment !== "DEV" && $("#sqlHost").value.trim().toLowerCase() === "localhost") $("#sqlHost").value = "";
    $("#sqlAuthMode").value = sqlContextOnlyEngines.has(engine) ? "context" : "password";
    $("#sqlTlsMode").value = environment === "DEV" ? "prefer" : "require";
  }
  $("#sqlPassword").value = "";
  state.connectionSession.restoring = false;
  disconnectSqlStudio(false);
  updateConnectionAdapterUi(); updateSnapshotTarget(); updateOracleXrayTarget(); updatePerformanceContextTarget();
  scheduleConnectionSessionSave();
  toast(`${environment} ${sqlAdapterUi[engine].name} connection autofilled without secrets`);
}

async function clearDbStudioSecrets() {
  $("#sqlPassword").value = "";
  $("#showSqlPassword").textContent = "Show";
  $("#sqlPassword").type = "password";
  if (state.credentials.keepPass) {
    try { await api("/api/credentials/session/delete", { method: "POST", body: JSON.stringify({ scope: "database", id: databaseCredentialId(connection()) }) }); } catch { /* field is still cleared */ }
  }
  disconnectSqlStudio(false);
  toast("Database credential cleared from browser and volatile agent memory");
}

async function validateDbStudioConnection() {
  const ready = await connectSqlStudio({ silent: false, loadObjects: false });
  if (ready) toast(`${currentSqlEnvironment()} connection validated`);
}

async function refreshDbStudioCatalog() {
  if (!state.sqlStudio.connected || state.sqlStudio.fingerprint !== sqlConnectionFingerprint()) {
    const ready = await connectSqlStudio({ silent: true, loadObjects: true });
    if (!ready) return toast("Validate the database connection before refreshing objects", true);
  } else await loadDatabaseExplorer(false);
}

function setSqlResultActions(enabled) {
  ["exportSqlCsv", "exportSqlJson", "copySqlResult"].forEach((id) => { if ($(`#${id}`)) $(`#${id}`).disabled = !enabled; });
}

function sqlResultObjects() {
  const result = state.sqlStudio.result;
  if (!result?.columns?.length) return [];
  return result.rows.map((row) => Object.fromEntries(result.columns.map((column, index) => [column, row[index] == null ? null : row[index]])));
}

function csvCell(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportSqlResult(format) {
  const result = state.sqlStudio.result;
  if (!result) return toast("Run a SQL statement before exporting results", true);
  const environment = currentSqlEnvironment().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const engine = $("#sqlEngine").value;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let content; let type; let extension;
  if (format === "csv") {
    content = result.columns.length ? [result.columns.map(csvCell).join(","), ...result.rows.map((row) => row.map(csvCell).join(","))].join("\r\n") : result.raw;
    type = "text/csv;charset=utf-8"; extension = "csv";
  } else {
    content = JSON.stringify(result.columns.length ? sqlResultObjects() : { output: result.raw, messages: result.stderr }, null, 2);
    type = "application/json;charset=utf-8"; extension = "json";
  }
  downloadInvestigationArtifact(`dbridge-${environment}-${engine}-${stamp}.${extension}`, content || "", type);
  toast(`SQL result exported as ${extension.toUpperCase()}`);
}

async function copySqlResult() {
  const result = state.sqlStudio.result;
  if (!result) return toast("Run a SQL statement before copying results", true);
  const content = result.columns.length ? [result.columns.join("\t"), ...result.rows.map((row) => row.map((value) => value == null ? "" : String(value)).join("\t"))].join("\n") : result.raw;
  try { await navigator.clipboard.writeText(content || ""); toast("SQL result copied"); }
  catch { toast("Clipboard access was blocked", true); }
}

function updatePort() {
  const adapter = sqlAdapterUi[$("#sqlEngine").value] || sqlAdapterUi.oracle;
  $("#sqlPort").value = adapter.port;
  if ($("#sqlEngine").value === "oracle" && !$("#sqlDatabase").value) $("#sqlDatabase").value = "ORCL";
  updateConnectionAdapterUi();
}

function updateConnectionAdapterUi() {
  const engine = $("#sqlEngine").value;
  const adapter = sqlAdapterUi[engine] || sqlAdapterUi.oracle;
  if (sqlContextOnlyEngines.has(engine)) $("#sqlAuthMode").value = "context";
  if (sqlPasswordOnlyEngines.has(engine)) $("#sqlAuthMode").value = "password";
  $("#sqlHostLabel").textContent = adapter.host || "HOST";
  $("#sqlDatabaseLabel").textContent = adapter.database || "DATABASE / SERVICE";
  $("#sqlUsernameLabel").textContent = adapter.username || "USERNAME";
  $("#sqlPasswordLabel").textContent = adapter.password || "PASSWORD";
  const contextAuth = $("#sqlAuthMode").value === "context";
  $("#sqlAuthMode").disabled = sqlContextOnlyEngines.has(engine) || sqlPasswordOnlyEngines.has(engine);
  $("#sqlPasswordField").classList.toggle("context-auth-hidden", contextAuth);
  const access = adapter.driver ? `Bundled driver: ${adapter.driver}.${adapter.client ? ` ${adapter.client} is only an optional fallback for unsupported authentication modes.` : " No external database shell is used."}` : `Approved local client required: ${adapter.client}.`;
  $("#sqlAdapterHint").textContent = `${adapter.hint} ${access} ${contextAuth ? "Authentication uses the existing approved context." : "The password stays only in memory."}`;
  if ($("#validationAdapterName")) $("#validationAdapterName").textContent = adapter.name;
  renderDbStudioConnector();
  updateDbStudioAutofillHint();
}

function sqlConnectionFingerprint(payload = connection()) {
  const c = payload.connection || {};
  const credential = state.credentials.keepPass ? (c.credentialId || databaseCredentialId(payload)) : c.password;
  return [payload.environment, payload.engine, c.authMode, c.tlsMode, c.host, c.port, c.database, c.username, credential].map((value) => String(value || "")).join("\u0000");
}

function setSqlStudioConnectionState(status, title, detail) {
  const connected = status === "connected";
  state.sqlStudio.connected = connected;
  state.sqlStudio.connecting = status === "connecting";
  $("#sqlLiveConnectionBadge").className = `sql-live-badge ${status}`;
  $("#sqlLiveConnectionBadge").innerHTML = `<i></i>${status === "connected" ? "CONNECTED" : status === "connecting" ? "CONNECTING" : status === "failed" ? "FAILED" : "DISCONNECTED"}`;
  $("#sqlConnectionDetail").className = `sql-connection-detail ${status}`;
  $("#sqlConnectionDetail").innerHTML = `<i></i><div><b>${escapeHtml(title)}</b><small>${escapeHtml(detail)}</small></div>`;
  $("#disconnectSqlStudio").disabled = !connected;
  $("#refreshDatabaseExplorer").disabled = !connected;
  $("#databaseExplorerSearch").disabled = !connected;
}

function disconnectSqlStudio(announce = true) {
  state.sqlStudio.connected = false;
  state.sqlStudio.connecting = false;
  state.sqlStudio.fingerprint = "";
  state.sqlStudio.objects = [];
  state.sqlStudio.objectFilter = "";
  if ($("#databaseExplorerSearch")) $("#databaseExplorerSearch").value = "";
  if ($("#databaseExplorerTarget")) $("#databaseExplorerTarget").textContent = "Connect to browse objects";
  if ($("#databaseExplorerTree")) $("#databaseExplorerTree").innerHTML = '<div class="database-explorer-empty"><span>⌁</span><b>Not connected</b><p>Tables, views and programmable objects will appear here.</p></div>';
  if ($("#sqlLiveConnectionBadge")) setSqlStudioConnectionState("disconnected", "No active connection", "Choose an engine and select Connect.");
  if (announce) toast("SQL Studio disconnected");
}

async function connectSqlStudio(options = {}) {
  if (state.sqlStudio.connecting) return false;
  const silent = options.silent === true;
  const loadObjects = options.loadObjects !== false;
  const payload = { ...connection(), timeoutMs: 30000 };
  const adapter = sqlAdapterUi[payload.engine] || sqlAdapterUi.oracle;
  const button = $("#connectSqlStudio");
  state.sqlStudio.connecting = true;
  setBusy(button, true, "Connecting…");
  setSqlStudioConnectionState("connecting", `Connecting to ${adapter.name}`, `${payload.environment} · ${payload.connection.host || "active context"}${payload.connection.database ? ` / ${payload.connection.database}` : ""}`);
  try {
    await rememberDatabaseCredential(payload);
    const result = await api("/api/connections/check", { method: "POST", body: JSON.stringify(payload) });
    state.sqlStudio.fingerprint = sqlConnectionFingerprint(payload);
    const access = result.access === "direct" ? `${adapter.driver} bundled driver` : `${adapter.client} local client`;
    setSqlStudioConnectionState("connected", `${adapter.name} connection ready`, `${result.durationMs.toLocaleString()} ms · ${access} · read-only by default`);
    $("#databaseExplorerTarget").textContent = `${payload.environment} · ${adapter.name} · ${payload.connection.database || payload.connection.host || "active context"}`;
    persistConnectionSession(payload.engine, true, false);
    if (!silent) toast(`${adapter.name} connected`);
    if (loadObjects) await loadDatabaseExplorer(true);
    return true;
  } catch (error) {
    state.sqlStudio.fingerprint = "";
    setSqlStudioConnectionState("failed", `${adapter.name} connection failed`, error.message);
    $("#databaseExplorerTree").innerHTML = `<div class="database-explorer-empty"><span>!</span><b>Connection failed</b><p>${escapeHtml(error.message)}</p></div>`;
    if (!silent) toast(error.message, true);
    return false;
  } finally {
    state.sqlStudio.connecting = false;
    setBusy(button, false);
  }
}

function renderDatabaseExplorer() {
  const query = String($("#databaseExplorerSearch").value || "").trim().toLowerCase();
  state.sqlStudio.objectFilter = query;
  const filtered = state.sqlStudio.objects.filter((item) => !query || `${item.schema} ${item.name} ${item.type}`.toLowerCase().includes(query));
  state.sqlStudio.renderedObjects = filtered;
  if (!filtered.length) {
    $("#databaseExplorerTree").innerHTML = `<div class="database-explorer-empty"><span>⌕</span><b>${state.sqlStudio.objects.length ? "No matching objects" : "No objects returned"}</b><p>${state.sqlStudio.objects.length ? "Try another schema, table or view name." : "The account may need catalog read permission."}</p></div>`;
    return;
  }
  const groups = new Map();
  filtered.forEach((item, index) => {
    const schema = item.schema || "(default)";
    if (!groups.has(schema)) groups.set(schema, []);
    groups.get(schema).push({ ...item, renderIndex: index });
  });
  $("#databaseExplorerTree").innerHTML = [...groups.entries()].map(([schema, items], groupIndex) => `<section class="database-object-group ${groupIndex < 2 ? "open" : ""}"><button type="button" data-database-group><i>${groupIndex < 2 ? "▾" : "▸"}</i><b>${escapeHtml(schema)}</b><small>${items.length}</small></button><div class="database-object-list">${items.map((item) => `<button type="button" class="database-object-item" data-database-object="${item.renderIndex}" title="Open a bounded query for ${escapeHtml(item.schema)}.${escapeHtml(item.name)}"><span>${escapeHtml(String(item.type || "O").slice(0, 1))}</span><div><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.schema)}</small></div><em>${escapeHtml(item.type)}</em></button>`).join("")}</div></section>`).join("");
  $$("[data-database-group]").forEach((button) => button.addEventListener("click", () => { const group = button.closest(".database-object-group"); group.classList.toggle("open"); button.querySelector("i").textContent = group.classList.contains("open") ? "▾" : "▸"; }));
  $$("[data-database-object]").forEach((button) => button.addEventListener("dblclick", () => openDatabaseObject(Number(button.dataset.databaseObject))));
  $$("[data-database-object]").forEach((button) => button.addEventListener("click", () => { $$(".database-object-item").forEach((item) => item.classList.remove("selected")); button.classList.add("selected"); }));
}

async function loadDatabaseExplorer(silent = false) {
  if (!state.sqlStudio.connected || state.sqlStudio.fingerprint !== sqlConnectionFingerprint()) {
    if (!silent) toast("Connect this SQL Studio session before browsing objects", true);
    return;
  }
  const button = $("#refreshDatabaseExplorer");
  button.disabled = true;
  button.textContent = "…";
  $("#databaseExplorerTree").innerHTML = '<div class="database-explorer-empty"><span>◌</span><b>Loading database objects</b><p>Reading the approved catalog views.</p></div>';
  try {
    const result = await api("/api/sql/catalog", { method: "POST", body: JSON.stringify({ ...connection(), timeoutMs: 45000 }) });
    state.sqlStudio.objects = Array.isArray(result.objects) ? result.objects : [];
    renderDatabaseExplorer();
    $("#databaseExplorerTarget").textContent = `${sqlAdapterUi[result.engine]?.name || result.engine} · ${state.sqlStudio.objects.length.toLocaleString()} objects`;
    if (!silent) toast(`${state.sqlStudio.objects.length.toLocaleString()} database objects loaded`);
  } catch (error) {
    $("#databaseExplorerTree").innerHTML = `<div class="database-explorer-empty"><span>!</span><b>Explorer unavailable</b><p>${escapeHtml(error.message)}</p></div>`;
    if (!silent) toast(error.message, true);
  } finally {
    button.disabled = !state.sqlStudio.connected;
    button.textContent = "↻";
  }
}

function databaseObjectQuery(engine, object) {
  const quote = (value) => `"${String(value || "").replaceAll('"', '""')}"`;
  const bracket = (value) => `[${String(value || "").replaceAll("]", "]]")}]`;
  const tick = (value) => `\`${String(value || "").replaceAll("`", "``")}\``;
  const schema = String(object.schema || "");
  const name = String(object.name || "");
  if (engine === "mongodb") return `JSON.stringify(db.getCollection(${JSON.stringify(name)}).find({}).limit(100).toArray(), null, 2)`;
  if (engine === "bigquery" && object.type === "DATASET") return `SELECT table_schema, table_name, table_type\nFROM \`${schema}.${name}.INFORMATION_SCHEMA.TABLES\`\nORDER BY table_name\nLIMIT 1000`;
  if (["mysql", "mariadb", "clickhouse", "databricks", "bigquery"].includes(engine)) {
    const target = [schema, name].filter(Boolean).map(tick).join(".");
    return `SELECT *\nFROM ${target}\nLIMIT 100`;
  }
  if (["sqlserver", "synapse"].includes(engine)) return `SELECT TOP (100) *\nFROM ${[schema, name].filter(Boolean).map(bracket).join(".")}`;
  const target = [schema, name].filter(Boolean).map(quote).join(".");
  if (["oracle", "db2"].includes(engine)) return `SELECT *\nFROM ${target}\nFETCH FIRST 100 ROWS ONLY`;
  if (engine === "teradata") return `SELECT TOP 100 *\nFROM ${target}`;
  return `SELECT *\nFROM ${target}\nLIMIT 100`;
}

function openDatabaseObject(index) {
  const object = state.sqlStudio.renderedObjects?.[index];
  if (!object) return;
  const engine = $("#sqlEngine").value;
  addEditorTab(databaseObjectQuery(engine, object), engine, object.name, true);
  toast(`${object.schema ? `${object.schema}.` : ""}${object.name} opened in a new query tab`);
}

function parseCsvRows(text, delimiter = ",") {
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((item) => item.some((cell) => String(cell).length));
}

function parseSqlResultRows(engine, text) {
  const raw = String(text || "").trim();
  if (!raw) return { columns: [], rows: [], format: "empty" };
  if (raw.includes("[") || raw.includes("{")) {
    try {
      const start = Math.min(...["[", "{"].map((marker) => { const found = raw.indexOf(marker); return found < 0 ? Number.MAX_SAFE_INTEGER : found; }));
      const parsed = JSON.parse(raw.slice(start));
      if (engine === "databricks" && parsed?.manifest?.schema?.columns && parsed?.result?.data_array) return { columns: parsed.manifest.schema.columns.map((column) => column.name), rows: parsed.result.data_array, format: "json" };
      const values = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
      const columns = [...new Set(values.flatMap((item) => item && typeof item === "object" ? Object.keys(item) : ["value"]))];
      return { columns, rows: values.map((item) => columns.map((column) => item && typeof item === "object" ? item[column] : item)), format: "json" };
    } catch {}
  }
  if (["postgres", "redshift", "sqlserver", "synapse", "snowflake"].includes(engine)) {
    const parsed = parseCsvRows(raw, ",").filter((row) => !row.every((cell) => /^[-\s]*$/.test(cell)) && !/^\(\d+\s+rows?\)$/i.test(row.join("")));
    if (parsed.length >= 1) return { columns: parsed[0], rows: parsed.slice(1), format: "csv" };
  }
  if (["mysql", "mariadb"].includes(engine)) {
    const parsed = parseCsvRows(raw, "\t");
    if (parsed.length >= 1) return { columns: parsed[0], rows: parsed.slice(1), format: "tsv" };
  }
  const lines = raw.split(/\r?\n/);
  const separatorIndex = lines.findIndex((line) => /-{2,}\s+-{2,}/.test(line));
  if (separatorIndex > 0) {
    const ranges = [...lines[separatorIndex].matchAll(/-+/g)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
    const columns = ranges.map((range) => lines[separatorIndex - 1].slice(range.start, range.end).trim()).filter(Boolean);
    const rows = lines.slice(separatorIndex + 1).filter((line) => line.trim() && !/^\d+\s+rows?\s+selected/i.test(line.trim())).map((line) => ranges.map((range) => line.slice(range.start, range.end).trim()));
    if (columns.length && rows.length) return { columns, rows, format: "fixed" };
  }
  return { columns: [], rows: [], format: "raw" };
}

function renderSqlExecutionResult(result, engine) {
  const parsed = parseSqlResultRows(engine, result.stdout);
  state.sqlStudio.result = { ...parsed, raw: result.stdout || "", stderr: result.stderr || "" };
  setSqlResultActions(true);
  $("#sqlMessages").innerHTML = '<pre class="output-pre"></pre>';
  $("#sqlMessages pre").textContent = [result.stderr, result.stdout].filter(Boolean).join("\n\n") || "Statement completed with no client messages.";
  if (!parsed.columns.length) {
    $("#sqlResults").innerHTML = `<div class="sql-result-raw-note">Structured columns were not detected for this client output. The complete response remains available in Messages.</div><pre class="output-pre"></pre>`;
    $("#sqlResults pre").textContent = result.stdout || "Statement completed with no output.";
  } else {
    const rows = parsed.rows.slice(0, 1000);
    $("#sqlResults").innerHTML = `<div class="sql-result-summary"><b>${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"} · ${parsed.columns.length.toLocaleString()} columns</b><span>${escapeHtml(parsed.format.toUpperCase())}${parsed.rows.length > rows.length ? " · first 1,000 shown" : ""}</span></div><div class="sql-result-table-wrap"><table class="sql-result-table"><thead><tr><th class="row-number">#</th>${parsed.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row, rowIndex) => `<tr><td class="row-number">${rowIndex + 1}</td>${parsed.columns.map((_, columnIndex) => `<td title="${escapeHtml(row[columnIndex] == null ? "NULL" : String(row[columnIndex]))}">${escapeHtml(row[columnIndex] == null ? "NULL" : String(row[columnIndex]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  showSqlResultView("results");
}

function showSqlResultView(view) {
  const results = view === "results";
  $("#sqlResults").classList.toggle("hidden", !results);
  $("#sqlMessages").classList.toggle("hidden", results);
  $("#resultGridTab").classList.toggle("active", results);
  $("#resultMessagesTab").classList.toggle("active", !results);
}

function updateLines() {
  const count = $("#sqlText").value.split("\n").length;
  $("#lineNumbers").textContent = Array.from({ length: count }, (_, i) => i + 1).join("\n");
}

function activeEditorTab() { return state.editorTabs.find((tab) => tab.id === state.activeEditorTab); }
function makeEditorId() { return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }

function setEditorSaveStatus(text, className = "") {
  $("#editorSaveStatus").textContent = text;
  $("#editorSaveStatus").className = className;
}

function captureActiveEditor(markDirty = false) {
  const tab = activeEditorTab();
  if (!tab) return;
  tab.content = $("#sqlText").value;
  tab.engine = $("#sqlEngine").value;
  tab.cursor = $("#sqlText").selectionStart;
  if (markDirty) tab.dirty = true;
}

function renderEditorTabs() {
  $("#editorTabs").innerHTML = state.editorTabs.map((tab) => `<div class="editor-tab ${tab.id === state.activeEditorTab ? "active" : ""} ${tab.dirty ? "dirty" : ""}" data-tab="${escapeHtml(tab.id)}"><button type="button" class="editor-tab-main" title="Double-click to rename"><i></i><span>${escapeHtml(tab.name)}</span></button><button type="button" class="editor-tab-close" title="Close tab (Ctrl+W)">×</button></div>`).join("");
  $$("#editorTabs [data-tab]").forEach((tabElement) => {
    tabElement.querySelector(".editor-tab-main").addEventListener("click", () => switchEditorTab(tabElement.dataset.tab));
    tabElement.querySelector(".editor-tab-main").addEventListener("dblclick", () => renameEditorTab(tabElement.dataset.tab));
    tabElement.querySelector(".editor-tab-close").addEventListener("click", () => closeEditorTab(tabElement.dataset.tab));
  });
}

function updateEditorStatus() {
  const textarea = $("#sqlText");
  const before = textarea.value.slice(0, textarea.selectionStart);
  const line = before.split("\n").length;
  const column = before.length - before.lastIndexOf("\n");
  const selected = Math.abs(textarea.selectionEnd - textarea.selectionStart);
  $("#cursorStatus").textContent = `Ln ${line}, Col ${column}`;
  $("#selectionStatus").textContent = `${selected.toLocaleString()} selected`;
  $("#characterStatus").textContent = `${textarea.value.length.toLocaleString()} chars`;
  $("#editorEngineStatus").textContent = $("#sqlEngine").selectedOptions[0]?.textContent || $("#sqlEngine").value;
}

function applyEditorSettings() {
  $("#sqlText").classList.toggle("word-wrap", state.editorSettings.wordWrap);
  $("#sqlText").wrap = state.editorSettings.wordWrap ? "soft" : "off";
  $("#sqlText").style.fontSize = `${state.editorSettings.fontSize}px`;
  $("#lineNumbers").style.fontSize = `${state.editorSettings.fontSize}px`;
  $("#toggleWrap").classList.toggle("active", state.editorSettings.wordWrap);
  const scope = state.editorSettings.autocompleteScope || "all"; const labels = { all: "AUTO · ALL", sql: "AUTO · SQL", ops: "AUTO · OPS", off: "AUTO · OFF" };
  $("#toggleAutocomplete").textContent = labels[scope]; $("#toggleAutocomplete").classList.toggle("active", scope !== "off");
}

function editorCompletionCatalog(engine) {
  const words = commonSqlCompletionWords.map((word) => ({ label: word, insert: `${word} `, detail: "SQL keyword", type: "sql", platform: "SQL", replaceLine: false, keywords: word }));
  const snippets = commonSqlCompletionSnippets.map(([label, insert, detail]) => ({ label, insert, detail, type: "snippet", platform: "SQL", replaceLine: true, keywords: `${label} sql template` }));
  const database = (databaseSqlCompletionCatalog[engine] || []).map(([label, insert, detail, replaceLine = false]) => ({ label, insert, detail, type: replaceLine ? "snippet" : "sql", platform: String(engine || "sql").toUpperCase(), replaceLine, keywords: `${label} ${engine}` }));
  const liveObjects = (typeof state !== "undefined" ? state.sqlStudio?.objects || [] : []).slice(0, 750).map((object) => {
    const qualified = object.schema ? `${object.schema}.${object.name}` : object.name;
    return { label: qualified, insert: qualified, detail: `${object.type || "OBJECT"} · live database catalog`, type: "sql", platform: "LIVE", replaceLine: false, keywords: `${object.schema || ""} ${object.name} ${object.type || ""}` };
  });
  const ops = Object.entries(editorCommandTemplateCatalog).flatMap(([platform, items]) => items.map(([label, insert]) => ({ label, insert, detail: "Approved command reference · opens as editor text only", type: "ops", platform: platform.toUpperCase(), replaceLine: true, keywords: `${label} ${platform} ${insert}` })));
  return [...words, ...snippets, ...database, ...liveObjects, ...ops];
}

function matchEditorCompletions(text, cursor, engine, scope = "all") {
  if (scope === "off" || cursor < 0 || cursor > text.length) return { query: "", items: [] };
  const lineStart = text.lastIndexOf("\n", Math.max(cursor - 1, 0)) + 1; const linePrefix = text.slice(lineStart, cursor); const indent = linePrefix.match(/^\s*/)?.[0] || ""; const lineQuery = linePrefix.trim(); const token = linePrefix.match(/[A-Za-z0-9_.$:@/-]+$/)?.[0] || "";
  if (!lineQuery) return { query: "", items: [] };
  const catalog = editorCompletionCatalog(engine).filter((item) => scope === "all" || (scope === "ops" ? item.type === "ops" : item.type !== "ops"));
  const scored = catalog.flatMap((item) => {
    const query = item.replaceLine ? lineQuery : token; if (!query) return [];
    const needle = query.toLowerCase(); const label = item.label.toLowerCase(); const insert = String(item.insert).replace("|", "").toLowerCase(); const keywords = `${item.keywords} ${item.detail}`.toLowerCase();
    let score = label.startsWith(needle) ? 0 : insert.startsWith(needle) ? 1 : label.split(/\s+/).some((word) => word.startsWith(needle)) ? 2 : keywords.includes(needle) ? 3 : -1;
    if (score < 0 || (insert.trim() === query.toLowerCase() && !item.insert.includes("|"))) return [];
    const start = item.replaceLine ? lineStart + indent.length : cursor - token.length;
    return [{ ...item, start, end: cursor, score }];
  });
  scored.sort((a, b) => a.score - b.score || Number(a.type === "ops") - Number(b.type === "ops") || a.label.localeCompare(b.label));
  return { query: lineQuery, items: scored.slice(0, 9) };
}

function hideEditorAutocomplete(status = "Ready") {
  state.autocomplete.visible = false; state.autocomplete.items = []; state.autocomplete.selected = 0; $("#editorAutocomplete").classList.add("hidden"); $("#autocompleteStatus").textContent = state.editorSettings.autocompleteScope === "off" ? "Off" : status;
}

function renderEditorAutocomplete() {
  const root = $("#editorAutocomplete"); const items = state.autocomplete.items;
  if (!items.length) { hideEditorAutocomplete("No match"); return; }
  state.autocomplete.visible = true; root.classList.remove("hidden"); $("#autocompleteHint").textContent = `${items.length} match${items.length === 1 ? "" : "es"} · ${state.editorSettings.autocompleteScope.toUpperCase()}`; $("#autocompleteStatus").textContent = `${items.length} suggestions`;
  $("#editorAutocompleteList").innerHTML = items.map((item, index) => `<button type="button" role="option" aria-selected="${index === state.autocomplete.selected}" class="editor-completion-item ${item.type} ${index === state.autocomplete.selected ? "selected" : ""}" data-completion-index="${index}"><span>${escapeHtml(item.platform.slice(0, 6))}</span><div><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.detail)}</small></div><em>${item.replaceLine ? "SNIPPET" : "TOKEN"}</em></button>`).join("");
  $$('[data-completion-index]').forEach((button) => { button.addEventListener("mousedown", (event) => event.preventDefault()); button.addEventListener("click", () => acceptEditorAutocomplete(Number(button.dataset.completionIndex))); });
}

function updateEditorAutocomplete() {
  const textarea = $("#sqlText"); if (document.activeElement !== textarea || textarea.selectionStart !== textarea.selectionEnd) return hideEditorAutocomplete();
  const match = matchEditorCompletions(textarea.value, textarea.selectionStart, $("#sqlEngine").value, state.editorSettings.autocompleteScope);
  state.autocomplete.query = match.query; state.autocomplete.items = match.items; state.autocomplete.selected = Math.min(state.autocomplete.selected, Math.max(match.items.length - 1, 0)); renderEditorAutocomplete();
}

function moveEditorAutocomplete(delta) {
  if (!state.autocomplete.visible || !state.autocomplete.items.length) return;
  state.autocomplete.selected = (state.autocomplete.selected + delta + state.autocomplete.items.length) % state.autocomplete.items.length; renderEditorAutocomplete();
  $(`[data-completion-index="${state.autocomplete.selected}"]`)?.scrollIntoView({ block: "nearest" });
}

function acceptEditorAutocomplete(index = state.autocomplete.selected) {
  const item = state.autocomplete.items[index]; if (!item) return false; const textarea = $("#sqlText"); const marker = item.insert.indexOf("|"); const insert = item.insert.replace("|", ""); textarea.setRangeText(insert, item.start, item.end, "end"); const cursor = item.start + (marker >= 0 ? marker : insert.length); textarea.setSelectionRange(cursor, cursor); textarea.dispatchEvent(new Event("input", { bubbles: true })); hideEditorAutocomplete("Inserted"); textarea.focus(); return true;
}

function cycleEditorAutocompleteScope() {
  const scopes = ["all", "sql", "ops", "off"]; const current = scopes.indexOf(state.editorSettings.autocompleteScope); state.editorSettings.autocompleteScope = scopes[(current + 1) % scopes.length]; applyEditorSettings(); hideEditorAutocomplete(); scheduleEditorSave(); if (state.editorSettings.autocompleteScope !== "off") { $("#sqlText").focus(); updateEditorAutocomplete(); } toast(`Real-time completion: ${state.editorSettings.autocompleteScope.toUpperCase()}`);
}

function switchEditorTab(id, capture = true) {
  if (capture) captureActiveEditor();
  if (capture && sqlAdapterUi[state.connectionSession.activeEngine]) persistConnectionSession(state.connectionSession.activeEngine, false, false);
  const tab = state.editorTabs.find((item) => item.id === id);
  if (!tab) return;
  const previousSqlEngine = $("#sqlEngine").value;
  state.activeEditorTab = id;
  $("#sqlEngine").value = tab.engine;
  updatePort();
  const storedConnection = readConnectionSession();
  if (storedConnection.connections[tab.engine]) applySavedConnectionEntry(tab.engine, storedConnection.connections[tab.engine]);
  state.connectionSession.activeEngine = tab.engine;
  $("#sqlPassword").value = "";
  if (previousSqlEngine !== tab.engine || state.sqlStudio.connected) disconnectSqlStudio(false);
  updateConnectionAdapterUi(); updateSnapshotTarget(); updateOracleXrayTarget(); updatePerformanceContextTarget();
  $("#sqlText").value = tab.content;
  updateLines();
  const cursor = Math.min(Number(tab.cursor || 0), tab.content.length);
  $("#sqlText").setSelectionRange(cursor, cursor);
  renderEditorTabs(); updateEditorStatus(); hideEditorAutocomplete();
  if (state.editorReady) { scheduleEditorSave(); scheduleConnectionSessionSave(); }
}

function addEditorTab(content = "", engine = $("#sqlEngine").value, name = "", dirty = false) {
  if (state.editorTabs.length >= 20) { toast("The editor is limited to 20 open tabs", true); return; }
  if (content.length > 50000 || state.editorTabs.reduce((total, tab) => total + tab.content.length, 0) + content.length > 200000) { toast("This file exceeds the local editor-session size limit", true); return; }
  captureActiveEditor();
  const nextNumber = state.editorTabs.reduce((max, tab) => Math.max(max, Number(tab.name.match(/^Query (\d+)$/)?.[1] || 0)), 0) + 1;
  const tab = { id: makeEditorId(), name: name || `Query ${nextNumber}`, engine, content, dirty, cursor: 0 };
  state.editorTabs.push(tab); state.activeEditorTab = tab.id;
  switchEditorTab(tab.id, false); scheduleEditorSave();
  $("#sqlText").focus();
}

function closeEditorTab(id = state.activeEditorTab) {
  const index = state.editorTabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const tab = state.editorTabs[index];
  if (tab.dirty && !confirm(`Close "${tab.name}"? The draft is restored only while this tab remains open.`)) return;
  state.editorTabs.splice(index, 1);
  if (!state.editorTabs.length) {
    state.activeEditorTab = "";
    addEditorTab("", $("#sqlEngine").value, "Query 1", false);
  } else switchEditorTab(state.editorTabs[Math.min(index, state.editorTabs.length - 1)].id, false);
  scheduleEditorSave();
}

function renameEditorTab(id = state.activeEditorTab) {
  const tab = state.editorTabs.find((item) => item.id === id);
  if (!tab) return;
  const name = prompt("Tab name", tab.name)?.trim();
  if (!name) return;
  if (name.length > 100 || /[\r\n]/.test(name)) { toast("Tab name must be 100 characters or fewer", true); return; }
  tab.name = name; tab.dirty = true; renderEditorTabs(); scheduleEditorSave();
}

async function persistEditorSession(version = state.editorSaveVersion) {
  captureActiveEditor();
  try {
    await api("/api/editor/session", { method: "POST", body: JSON.stringify({ tabs: state.editorTabs, activeId: state.activeEditorTab, settings: state.editorSettings }) });
    if (version === state.editorSaveVersion) setEditorSaveStatus("Session saved locally", "saved");
  } catch (error) { if (version === state.editorSaveVersion) setEditorSaveStatus(error.message, "error"); }
}

function scheduleEditorSave() {
  if (!state.editorReady) return;
  clearTimeout(state.editorSaveTimer);
  const version = ++state.editorSaveVersion;
  setEditorSaveStatus("Saving session…", "saving");
  state.editorSaveTimer = setTimeout(() => persistEditorSession(version), 700);
}

async function loadEditorSession() {
  const seedSql = $("#sqlText").value;
  try {
    const result = await api("/api/editor/session");
    const session = result.session || {};
    state.editorTabs = Array.isArray(session.tabs) ? session.tabs : [];
    state.editorSettings = { wordWrap: session.settings?.wordWrap === true, fontSize: Number(session.settings?.fontSize || 11), autocompleteScope: ["all", "sql", "ops", "off"].includes(session.settings?.autocompleteScope) ? session.settings.autocompleteScope : "all" };
    if (!state.editorTabs.length) state.editorTabs = [{ id: makeEditorId(), name: "Query 1", engine: "oracle", content: seedSql, dirty: false, cursor: 0 }];
    state.activeEditorTab = state.editorTabs.some((tab) => tab.id === session.activeId) ? session.activeId : state.editorTabs[0].id;
    applyEditorSettings(); switchEditorTab(state.activeEditorTab, false);
    state.editorReady = true; setEditorSaveStatus("Session restored locally", "saved");
    scheduleEditorSave();
  } catch (error) {
    state.editorTabs = [{ id: makeEditorId(), name: "Query 1", engine: "oracle", content: seedSql, dirty: false, cursor: 0 }];
    state.activeEditorTab = state.editorTabs[0].id; state.editorReady = true;
    applyEditorSettings(); switchEditorTab(state.activeEditorTab, false); setEditorSaveStatus("Session restore unavailable", "error");
  }
}

function editorContentChanged() {
  updateLines(); captureActiveEditor(true); renderEditorTabs(); updateEditorStatus(); scheduleEditorSave(); updateEditorAutocomplete();
}

function editorEngineChanged() {
  updatePort(); captureActiveEditor(true); renderEditorTabs(); updateEditorStatus(); scheduleEditorSave(); updateEditorAutocomplete();
}

function openEditorSearch() {
  $("#editorSearchBar").classList.remove("hidden");
  $("#editorFind").focus(); $("#editorFind").select(); updateFindMatches();
}

function updateFindMatches() {
  const query = $("#editorFind").value;
  if (!query) { $("#findMatches").textContent = "0 matches"; return 0; }
  const source = $("#editorMatchCase").checked ? $("#sqlText").value : $("#sqlText").value.toLowerCase();
  const needle = $("#editorMatchCase").checked ? query : query.toLowerCase();
  let count = 0, position = 0;
  while ((position = source.indexOf(needle, position)) >= 0) { count += 1; position += Math.max(needle.length, 1); }
  $("#findMatches").textContent = `${count} match${count === 1 ? "" : "es"}`; return count;
}

function findEditorMatch(direction = 1) {
  const query = $("#editorFind").value;
  if (!query) return;
  const textarea = $("#sqlText");
  const source = $("#editorMatchCase").checked ? textarea.value : textarea.value.toLowerCase();
  const needle = $("#editorMatchCase").checked ? query : query.toLowerCase();
  let position = direction > 0 ? source.indexOf(needle, textarea.selectionEnd) : source.lastIndexOf(needle, textarea.selectionStart - 1);
  if (position < 0) position = direction > 0 ? source.indexOf(needle) : source.lastIndexOf(needle);
  if (position >= 0) { textarea.focus(); textarea.setSelectionRange(position, position + query.length); updateEditorStatus(); }
  updateFindMatches();
}

function replaceEditorMatch() {
  const textarea = $("#sqlText"); const query = $("#editorFind").value; if (!query) return;
  const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  const matches = $("#editorMatchCase").checked ? selected === query : selected.toLowerCase() === query.toLowerCase();
  if (!matches) { findEditorMatch(1); return; }
  textarea.setRangeText($("#editorReplace").value, textarea.selectionStart, textarea.selectionEnd, "select");
  textarea.dispatchEvent(new Event("input", { bubbles: true })); findEditorMatch(1);
}

function replaceAllEditorMatches() {
  const query = $("#editorFind").value; if (!query) return;
  const flags = $("#editorMatchCase").checked ? "g" : "gi";
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
  const textarea = $("#sqlText"); const replacement = $("#editorReplace").value; const updated = textarea.value.replace(expression, () => replacement);
  if (updated !== textarea.value) { textarea.value = updated; textarea.dispatchEvent(new Event("input", { bubbles: true })); }
  updateFindMatches();
}

function goToEditorLine() {
  const textarea = $("#sqlText"); const total = textarea.value.split("\n").length;
  const requested = Number(prompt(`Go to line (1-${total})`, "1"));
  if (!Number.isInteger(requested) || requested < 1 || requested > total) return;
  let position = 0; for (let line = 1; line < requested; line += 1) position = textarea.value.indexOf("\n", position) + 1;
  textarea.focus(); textarea.setSelectionRange(position, position); updateEditorStatus();
}

function transformEditorLines(transform) {
  const textarea = $("#sqlText"); const start = textarea.value.lastIndexOf("\n", Math.max(0, textarea.selectionStart - 1)) + 1;
  let end = textarea.value.indexOf("\n", textarea.selectionEnd); if (end < 0) end = textarea.value.length;
  const original = textarea.value.slice(start, end); const changed = transform(original);
  textarea.setRangeText(changed, start, end, "select"); textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function handleEditorKeydown(event) {
  const ctrl = event.ctrlKey || event.metaKey;
  if (!ctrl && state.autocomplete.visible && event.key === "ArrowDown") { event.preventDefault(); moveEditorAutocomplete(1); return; }
  if (!ctrl && state.autocomplete.visible && event.key === "ArrowUp") { event.preventDefault(); moveEditorAutocomplete(-1); return; }
  if (!ctrl && state.autocomplete.visible && event.key === "Escape") { event.preventDefault(); hideEditorAutocomplete(); return; }
  if (!ctrl && !event.shiftKey && state.autocomplete.visible && ["Tab", "Enter"].includes(event.key)) { event.preventDefault(); acceptEditorAutocomplete(); return; }
  if (ctrl && event.code === "Space") { event.preventDefault(); updateEditorAutocomplete(); return; }
  if (ctrl && event.key === "Enter") { event.preventDefault(); runSql(); return; }
  if (ctrl && event.key.toLowerCase() === "f") { event.preventDefault(); openEditorSearch(); return; }
  if (ctrl && event.key.toLowerCase() === "h") { event.preventDefault(); openEditorSearch(); $("#editorReplace").focus(); return; }
  if (ctrl && event.key.toLowerCase() === "g") { event.preventDefault(); goToEditorLine(); return; }
  if (ctrl && event.key.toLowerCase() === "o") { event.preventDefault(); $("#editorFilePicker").click(); return; }
  if (ctrl && event.shiftKey && event.key.toLowerCase() === "s") { event.preventDefault(); downloadEditorFile(); return; }
  if (ctrl && event.key.toLowerCase() === "s") { event.preventDefault(); downloadEditorFile(); return; }
  if (ctrl && event.key.toLowerCase() === "n") { event.preventDefault(); addEditorTab(); return; }
  if (ctrl && event.key.toLowerCase() === "w") { event.preventDefault(); closeEditorTab(); return; }
  if (ctrl && event.key === "Tab") { event.preventDefault(); const index = state.editorTabs.findIndex((tab) => tab.id === state.activeEditorTab); switchEditorTab(state.editorTabs[(index + 1) % state.editorTabs.length].id); return; }
  if (ctrl && event.key === "/") { event.preventDefault(); transformEditorLines((text) => text.split("\n").every((line) => /^\s*--/.test(line)) ? text.split("\n").map((line) => line.replace(/^(\s*)-- ?/, "$1")).join("\n") : text.split("\n").map((line) => line.replace(/^(\s*)/, "$1-- ")).join("\n")); return; }
  if (event.key === "Tab") { event.preventDefault(); transformEditorLines((text) => event.shiftKey ? text.split("\n").map((line) => line.replace(/^ {1,2}/, "")).join("\n") : text.split("\n").map((line) => `  ${line}`).join("\n")); return; }
  if (event.key === "Enter" && !event.shiftKey) {
    const textarea = $("#sqlText"); const lineStart = textarea.value.lastIndexOf("\n", textarea.selectionStart - 1) + 1;
    const indent = textarea.value.slice(lineStart, textarea.selectionStart).match(/^\s*/)?.[0] || "";
    event.preventDefault(); textarea.setRangeText(`\n${indent}`, textarea.selectionStart, textarea.selectionEnd, "end"); textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function toggleEditorWrap() { state.editorSettings.wordWrap = !state.editorSettings.wordWrap; applyEditorSettings(); scheduleEditorSave(); }
function zoomEditor(delta) { state.editorSettings.fontSize = Math.min(Math.max(state.editorSettings.fontSize + delta, 9), 20); applyEditorSettings(); scheduleEditorSave(); }

async function openEditorFiles(event) {
  const files = [...(event.target.files || [])];
  for (const file of files) {
    if (state.editorTabs.length >= 20) { toast("The editor is limited to 20 open tabs", true); break; }
    if (file.size > 200000) { toast(`${file.name} is too large for the portable editor`, true); continue; }
    const content = await file.text();
    addEditorTab(content, $("#sqlEngine").value, file.name.slice(0, 100), false, "");
  }
  event.target.value = "";
}

function downloadEditorFile() {
  captureActiveEditor(); const tab = activeEditorTab(); if (!tab) return;
  const filename = (tab.name || "query.sql").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  const finalName = /\.[A-Za-z0-9]{1,8}$/.test(filename) ? filename : `${filename}.sql`;
  const url = URL.createObjectURL(new Blob([tab.content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = finalName; link.click(); URL.revokeObjectURL(url);
  tab.name = finalName; tab.dirty = false; renderEditorTabs(); scheduleEditorSave(); toast(`${finalName} prepared for download`);
}

async function runSql() {
  const button = $("#runSql");
  const payload = { ...connection(), sql: $("#sqlText").value, allowWrites: $("#allowWrites").checked, timeoutMs: 60000 };
  if (payload.allowWrites && !confirm("Write mode is unlocked for this execution. Continue only if you are authorized to modify this database.")) return;
  if (!state.sqlStudio.connected || state.sqlStudio.fingerprint !== sqlConnectionFingerprint(payload)) {
    const connected = await connectSqlStudio({ silent: true, loadObjects: true });
    if (!connected) { toast("Connect SQL Studio successfully before running this command", true); return; }
  }
  setBusy(button, true, "Running…");
  state.sqlStudio.result = null;
  setSqlResultActions(false);
  $("#sqlResults").innerHTML = '<div class="empty-state"><span>●</span><h3>Executing locally</h3><p>Waiting for the selected database connection…</p></div>';
  showSqlResultView("results");
  const started = performance.now();
  try {
    const result = await api("/api/sql/run", { method: "POST", body: JSON.stringify(payload) });
    $("#sqlTiming").textContent = `${result.durationMs} ms · ${result.command || "database"} · exit ${result.code}`;
    renderSqlExecutionResult(result, payload.engine);
    toast("SQL execution completed");
  } catch (error) {
    $("#sqlTiming").textContent = `${Math.round(performance.now() - started)} ms · failed`;
    $("#sqlResults").innerHTML = `<pre class="output-pre error-output"></pre>`;
    $("#sqlResults pre").textContent = error.message;
    $("#sqlMessages").innerHTML = '<pre class="output-pre error-output"></pre>';
    $("#sqlMessages pre").textContent = error.message;
    toast(error.message, true);
  } finally { setBusy(button, false); }
}

function formatSql() {
  const keywords = ["select", "from", "where", "join", "left join", "right join", "inner join", "order by", "group by", "having", "limit", "fetch", "union", "with", "and", "or"];
  let sql = $("#sqlText").value.trim().replace(/\s+/g, " ");
  keywords.forEach((keyword) => { sql = sql.replace(new RegExp(`\\b${keyword.replace(" ", "\\s+")}\\b`, "gi"), (match) => ["and", "or"].includes(keyword) ? `\n  ${match.toUpperCase()}` : `\n${match.toUpperCase()}`); });
  $("#sqlText").value = sql.trim();
  editorContentChanged();
}

const performanceWorkspaceCatalog = {
  oracle: { name: "Oracle", title: "Oracle performance intelligence", identifier: "Oracle SQL_ID", hint: "Optional: enter a 13-character SQL_ID", example: "8m5j1t2y4n6p9", description: "Database-wide waits, blockers, SQL impact, execution plans, memory, I/O, redo/undo, RAC and license-controlled history.", safety: "Core fixed views by default; pack-only sources require an explicit licensed scope. No change is applied." },
  postgres: { name: "PostgreSQL", title: "PostgreSQL performance workspace", identifier: "PostgreSQL queryid", hint: "Enter a pg_stat_statements queryid", example: "-1234567890123456789", description: "pg_stat_activity, pg_stat_statements, locks, cache, table maintenance and replication evidence.", safety: "Uses pg_stat views and read-only EXPLAIN evidence; it does not cancel sessions or change settings." },
  mongodb: { name: "MongoDB", title: "MongoDB performance workspace", identifier: "MongoDB operation / comment ID", hint: "Enter an operation or command comment", example: "orders-api.checkout", description: "Current operations, profiler evidence, locks, cache pressure, replication and collection activity.", safety: "Uses approved inspection commands and never kills an operation or changes the profiler." },
  mysql: { name: "MySQL", title: "MySQL performance workspace", identifier: "MySQL statement digest", hint: "Enter a Performance Schema digest", example: "A1B2C3D4E5F60718", description: "Performance Schema workload, waits, locks, I/O, memory, indexes and replication diagnostics.", safety: "Uses Performance Schema read-only views and never changes indexes, variables or sessions." },
  sqlserver: { name: "SQL Server", title: "SQL Server performance workspace", identifier: "SQL Server query hash", hint: "Enter a query hash", example: "0x0123456789ABCDEF", description: "DMV and Query Store evidence for workload, waits, blockers, memory, I/O and plan behavior.", safety: "Uses approved DMVs and never forces a plan, clears cache or terminates a request." },
};

const runtimeTraceUiCatalog = {
  oracle: {
    name: "Oracle", identifier: "Oracle SQL_ID", example: "8m5j1t2y4n6p9",
    equivalent: "Shared-pool compiler and runtime evidence",
    traceName: "Oracle 10053: retained evidence first",
    limitation: "A past 10053 file cannot be reconstructed from the shared pool. Generate a new trace only by reparsing in a separately approved traced session.",
    doc: "https://docs.oracle.com/en/database/oracle/oracle-database/26/arpls/DBMS_SQLDIAG.html",
  },
  postgres: {
    name: "PostgreSQL", identifier: "PostgreSQL queryid", example: "-1234567890123456789",
    equivalent: "pg_stat_statements and live query_id evidence",
    traceName: "PostgreSQL planner and executor evidence",
    limitation: "pg_stat_statements retains normalized SQL and aggregate counters, not a cached plan tree. DBridge never runs EXPLAIN ANALYZE automatically because it executes the statement.",
    doc: "https://www.postgresql.org/docs/current/pgstatstatements.html",
  },
  mongodb: {
    name: "MongoDB", identifier: "MongoDB operation / comment ID", example: "orders-api.checkout",
    equivalent: "currentOp, existing profiler and query-shape evidence",
    traceName: "MongoDB retained operation evidence",
    limitation: "DBridge reads currentOp and existing profiler data only. It never enables profiling or executes explain automatically.",
    doc: "https://www.mongodb.com/docs/manual/reference/database-profiler/",
  },
  mysql: {
    name: "MySQL", identifier: "MySQL statement digest", example: "A1B2C3D4E5F60718",
    equivalent: "Performance Schema digest and event history",
    traceName: "MySQL optimizer and runtime evidence",
    limitation: "optimizer_trace is session-scoped and requires executing the statement. DBridge reads existing Performance Schema evidence and leaves trace generation as a review-only template.",
    doc: "https://dev.mysql.com/doc/refman/8.4/en/performance-schema-statement-digests.html",
  },
  sqlserver: {
    name: "SQL Server", identifier: "SQL Server query_id or query hash", example: "0x0123456789ABCDEF",
    equivalent: "Query Store and cached DMV evidence",
    traceName: "SQL Server compilation and runtime history",
    limitation: "Query Store and cached DMVs provide retained evidence. DBridge never creates an Extended Events session, forces a plan or clears cache.",
    doc: "https://learn.microsoft.com/en-us/sql/relational-databases/performance/monitoring-performance-by-using-the-query-store",
  },
};

function runtimeTraceFormatMs(value) {
  const number = Number(value || 0);
  if (!number) return "0 ms";
  if (number >= 60000) return `${(number / 60000).toFixed(1)} min`;
  if (number >= 1000) return `${(number / 1000).toFixed(2)} s`;
  return `${number.toFixed(number >= 10 ? 1 : 2)} ms`;
}

function runtimeTraceTimeLabel(item) {
  if (!item.time) return item.phase || "Captured evidence";
  const parsed = new Date(item.time);
  return Number.isNaN(parsed.getTime()) ? String(item.time) : parsed.toLocaleString();
}

function runtimeTraceReportText(result) {
  const analysis = result.analysis;
  const summary = analysis.summary;
  const findings = analysis.findings.map((item, index) => `${index + 1}. [${item.severity}] ${item.title}
Area: ${item.area}
Evidence: ${item.evidence}
Why it matters: ${item.why}
Next action: ${item.nextAction}`).join("\n\n");
  return `${runtimeTraceUiCatalog[result.engine]?.name || result.engine} runtime trace
Identifier: ${result.identifier}
Captured: ${result.collectedAt}
Importance: ${analysis.importanceScore}/100 (${analysis.severity})
Headline: ${analysis.headline}
Equivalent: ${analysis.equivalent}

Executions: ${summary.executions}
Average runtime: ${runtimeTraceFormatMs(summary.averageMs)}
Maximum signal: ${runtimeTraceFormatMs(summary.maximumMs)}
Plan variants: ${summary.planVersions}
Wait signals: ${summary.waitSignals}
Matched rows: ${summary.matchedRows}
Checks: ${summary.checksComplete}/${summary.checksTotal}

${findings || "No ranked performance finding was produced."}

Capture boundary:
${analysis.limitation}

Important: Trace-generation templates require DBA review and are never executed automatically.`;
}

function resetRuntimeTraceView() {
  $("#performanceRuntimeTraceSection").removeAttribute("data-severity");
  $("#runtimeTraceScore").textContent = "—";
  $("#runtimeTraceExecutions").textContent = "—";
  $("#runtimeTraceAverage").textContent = "—";
  $("#runtimeTraceMaximum").textContent = "—";
  $("#runtimeTracePlans").textContent = "—";
  $("#runtimeTraceWaits").textContent = "—";
  $("#runtimeTraceHeadline").textContent = "Capture during the slow period";
  $("#runtimeTraceFindingCount").textContent = "0";
  $("#runtimeTraceTimelineCount").textContent = "0";
  $("#runtimeTraceEvidenceCount").textContent = "0";
  $("#runtimeTraceProgressBar").style.width = "0";
  $("#runtimeTraceProgressText").textContent = "Ready · retained evidence only";
  $("#runtimeTraceFindings").innerHTML = '<div class="runtime-trace-empty"><span>TRACE</span><b>Ready for a retained-evidence capture</b><p>Enter the statement identifier and capture. Findings are ranked by runtime importance.</p></div>';
  $("#runtimeTraceTimeline").innerHTML = '<div class="runtime-trace-empty"><span>TIME</span><b>No runtime timeline yet</b><p>Timestamped and live duration signals will appear here.</p></div>';
  $("#runtimeTraceEvidence").innerHTML = '<div class="runtime-trace-empty"><span>DATA</span><b>No evidence checks yet</b><p>Each fixed read-only check will show success, row count, duration and expandable raw output.</p></div>';
  $("#runtimeTraceTerminalOutput").textContent = "Capture retained evidence to generate the database-specific terminal script.";
}

function clearRuntimeTrace() {
  const engine = state.performanceWorkspace.engine;
  delete state.runtimeTrace.results[engine];
  state.runtimeTrace.report = "";
  state.performanceWorkspace.identifiers[engine] = "";
  $("#runtimeTraceIdentifier").value = "";
  $("#performanceQuickIdentifier").value = "";
  $("#sqlIdentifier").value = "";
  if (engine === "oracle") {
    $("#oracleBottleneckSqlId").value = "";
    $("#oracleXrayIdentifier").value = "";
  } else if (engine === "postgres") $("#postgresQueryId").value = "";
  else if (engine === "mongodb") $("#mongoOperationId").value = "";
  resetRuntimeTraceView();
  setRuntimeTraceTab("findings");
  $("#runtimeTraceIdentifier").focus();
  toast("Runtime evidence cleared");
}

function setRuntimeTraceTab(tab) {
  const selected = ["findings", "timeline", "evidence", "terminal"].includes(tab) ? tab : "findings";
  state.runtimeTrace.tab = selected;
  $$("[data-runtime-trace-tab]").forEach((button) => button.classList.toggle("active", button.dataset.runtimeTraceTab === selected));
  const views = { findings: "runtimeTraceFindings", timeline: "runtimeTraceTimeline", evidence: "runtimeTraceEvidence", terminal: "runtimeTraceTerminal" };
  Object.entries(views).forEach(([id, elementId]) => $(`#${elementId}`).classList.toggle("hidden", id !== selected));
}

function renderRuntimeTrace(result) {
  const analysis = result.analysis;
  const summary = analysis.summary;
  $("#performanceRuntimeTraceSection").dataset.severity = String(analysis.severity || "INFO").toLowerCase();
  state.runtimeTrace.report = runtimeTraceReportText(result);
  $("#runtimeTraceScore").textContent = `${analysis.importanceScore}/100`;
  $("#runtimeTraceHeadline").textContent = analysis.headline;
  $("#runtimeTraceExecutions").textContent = Number(summary.executions || 0).toLocaleString();
  $("#runtimeTraceAverage").textContent = runtimeTraceFormatMs(summary.averageMs);
  $("#runtimeTraceMaximum").textContent = runtimeTraceFormatMs(Math.max(Number(summary.maximumMs || 0), Number(summary.runtimeSeconds || 0) * 1000));
  $("#runtimeTracePlans").textContent = Number(summary.planVersions || 0).toLocaleString();
  $("#runtimeTraceWaits").textContent = Number(summary.waitSignals || 0).toLocaleString();
  $("#runtimeTraceFindingCount").textContent = analysis.findings.length.toLocaleString();
  $("#runtimeTraceTimelineCount").textContent = analysis.timeline.length.toLocaleString();
  $("#runtimeTraceEvidenceCount").textContent = result.results.length.toLocaleString();
  $("#runtimeTraceProgressBar").style.width = "100%";
  $("#runtimeTraceProgressText").textContent = `${summary.checksComplete}/${summary.checksTotal} checks · ${summary.matchedRows} matching rows · ${new Date(result.collectedAt).toLocaleTimeString()}`;
  const filter = $("#runtimeTraceImportance").value;
  const allowed = filter === "high" ? new Set(["HIGH"]) : filter === "medium" ? new Set(["HIGH", "MEDIUM"]) : new Set(["HIGH", "MEDIUM", "INFO"]);
  const findings = analysis.findings.filter((item) => allowed.has(item.severity));
  $("#runtimeTraceFindings").innerHTML = findings.length ? findings.map((item) => `<article class="runtime-finding ${item.severity.toLowerCase()}"><span>${escapeHtml(item.severity)}</span><div><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.evidence)}</p></div><div><b>Why it matters</b><p>${escapeHtml(item.why)}</p></div><div><small>${escapeHtml(item.area)}</small><em>${escapeHtml(item.nextAction)}</em></div></article>`).join("") : '<div class="runtime-trace-empty"><span>OK</span><b>No finding matches this importance filter</b><p>Change the filter to All findings or inspect Evidence checks.</p></div>';
  const timeline = analysis.timeline.slice().sort((a, b) => String(b.time || "").localeCompare(String(a.time || "")));
  $("#runtimeTraceTimeline").innerHTML = timeline.length ? timeline.map((item) => `<div class="runtime-timeline-row"><span>${escapeHtml(runtimeTraceTimeLabel(item))}</span><b>${escapeHtml(item.check)}</b><em>${runtimeTraceFormatMs(item.runtimeMs)}</em><p>${escapeHtml(item.detail)}</p></div>`).join("") : '<div class="runtime-trace-empty"><span>TIME</span><b>No timestamped runtime rows matched</b><p>Live or retained history may be unavailable for this identifier.</p></div>';
  $("#runtimeTraceEvidence").innerHTML = result.results.map((item) => {
    const stateClass = item.skipped ? "skipped" : item.ok ? "" : "failed";
    const icon = item.skipped ? "—" : item.ok ? "✓" : "!";
    const meta = item.skipped ? item.error : item.ok ? `${Number(item.rowCount || item.rows?.length || 0).toLocaleString()} rows · ${Number(item.durationMs || 0).toLocaleString()} ms` : item.error;
    const raw = item.ok ? JSON.stringify(item.rows || [], null, 2) : item.error || "No output";
    return `<article class="runtime-evidence-card ${stateClass}"><button type="button" data-runtime-evidence><i>${icon}</i><span><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.guidance)}</small></span><em>${escapeHtml(item.phase)}</em><em>${escapeHtml(meta)}</em></button><pre>${escapeHtml(raw)}</pre></article>`;
  }).join("");
  $$("[data-runtime-evidence]").forEach((button) => button.addEventListener("click", () => button.parentElement.classList.toggle("open")));
  $("#runtimeTraceTerminalOutput").textContent = analysis.terminalScript;
  setRuntimeTraceTab(state.runtimeTrace.tab);
}

function setRuntimeTraceEngine(engine) {
  const detail = runtimeTraceUiCatalog[engine];
  if (!detail) return;
  state.runtimeTrace.engine = engine;
  $$("[data-runtime-trace-engine]").forEach((button) => {
    const active = button.dataset.runtimeTraceEngine === engine;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("#runtimeTraceEngineBadge").textContent = `${detail.name.toUpperCase()} · ${detail.identifier.toUpperCase()}`;
  $("#runtimeTraceEquivalent").textContent = detail.equivalent;
  $("#runtimeTraceIdentifierLabel").textContent = detail.identifier.toUpperCase();
  $("#runtimeTraceIdentifier").placeholder = detail.example;
  $("#runtimeTraceIdentifier").value = state.performanceWorkspace.identifiers[engine] || detail.example;
  $("#runtimeTraceCollectionField").classList.toggle("hidden", engine !== "mongodb");
  $("#runtimeTraceTraceName").textContent = detail.traceName;
  $("#runtimeTraceLimitation").textContent = detail.limitation;
  $("#runtimeTraceDoc").href = detail.doc;
  const saved = state.runtimeTrace.results[engine];
  if (saved) renderRuntimeTrace(saved);
  else resetRuntimeTraceView();
}

function useSelectedRuntimeTraceIdentifier() {
  const engine = state.performanceWorkspace.engine;
  const detail = runtimeTraceUiCatalog[engine];
  const selected = $("#performanceQuickIdentifier").value.trim() || $("#sqlIdentifier").value.trim() || state.performanceWorkspace.identifiers[engine] || detail.example;
  $("#runtimeTraceIdentifier").value = selected;
  toast(`${detail.identifier} copied into Runtime Trace`);
}

async function captureRuntimeTrace() {
  const button = $("#runtimeTraceCapture");
  const engine = state.performanceWorkspace.engine;
  const identifier = $("#runtimeTraceIdentifier").value.trim();
  const collection = $("#runtimeTraceCollection").value.trim();
  if (!identifier) return toast(`Enter the ${runtimeTraceUiCatalog[engine].identifier}`, true);
  state.performanceWorkspace.identifiers[engine] = identifier;
  $("#performanceQuickIdentifier").value = identifier;
  $("#sqlIdentifier").value = identifier;
  state.runtimeTrace.running = true;
  setBusy(button, true, "Capturing evidence…");
  $("#runtimeTraceProgressBar").style.width = "18%";
  $("#runtimeTraceProgressText").textContent = "Connecting · reading fixed retained-evidence sources sequentially";
  try {
    const result = await api("/api/performance/runtime-trace/capture", { method: "POST", body: JSON.stringify({ ...connection(), engine, identifier, collection, timeoutMs: Number($("#perfTimeout").value) }) });
    state.runtimeTrace.results[engine] = result;
    renderRuntimeTrace(result);
    setRuntimeTraceTab("findings");
    toast(`${runtimeTraceUiCatalog[engine].name} runtime trace captured`);
  } catch (error) {
    $("#runtimeTraceProgressBar").style.width = "100%";
    $("#runtimeTraceProgressText").textContent = `Capture failed · ${error.message}`;
    $("#runtimeTraceFindings").innerHTML = `<div class="runtime-trace-empty"><span>!</span><b>Runtime trace could not complete</b><p>${escapeHtml(error.message)}</p></div>`;
    toast(error.message, true);
  } finally {
    state.runtimeTrace.running = false;
    setBusy(button, false);
  }
}

async function copyRuntimeTraceReport() {
  if (!state.runtimeTrace.report) return toast("Capture a runtime trace first", true);
  try { await navigator.clipboard.writeText(state.runtimeTrace.report); toast("Runtime trace report copied"); }
  catch { toast("Clipboard access was blocked", true); }
}

async function copyRuntimeTraceTerminal() {
  const script = $("#runtimeTraceTerminalOutput").textContent;
  if (!state.runtimeTrace.results[state.performanceWorkspace.engine]) return toast("Capture retained evidence first", true);
  try { await navigator.clipboard.writeText(script); toast("Review-only terminal script copied"); }
  catch { toast("Clipboard access was blocked", true); }
}

function openRuntimeTraceInSqlStudio() {
  const script = $("#runtimeTraceTerminalOutput").textContent;
  if (!state.runtimeTrace.results[state.performanceWorkspace.engine]) return toast("Capture retained evidence first", true);
  navigate("sql");
  addEditorTab(script, state.performanceWorkspace.engine, `${runtimeTraceUiCatalog[state.performanceWorkspace.engine].name} trace`, true);
  toast("Review-only trace script opened in SQL Studio");
}

const performanceModeCatalog = {
  overview: {
    number: "01", eyebrow: "START HERE", name: "Guided Analysis",
    title: "Capture health and statement evidence in one guided flow",
    description: "Confirm the connection, choose the engine, and capture retained runtime evidence for the affected identifier. Start during the slow period for the strongest signal.",
    tips: ["1. Confirm connection", "2. Enter identifier", "3. Capture during the incident"],
    next: "engine", nextLabel: "Continue to Engine Deep Dive",
  },
  engine: {
    number: "02", eyebrow: "FIND THE BOTTLENECK", name: "Engine Deep Dive",
    title: "Correlate waits, workload and resource pressure",
    description: "Use the selected database's focused intelligence workspace to rank probable causes and see the measured evidence, impact, verification and safe next action.",
    tips: ["1. Start database-wide", "2. Add an identifier if known", "3. Repeat for interval evidence"],
    next: "statement", nextLabel: "Continue to SQL Evidence",
  },
  statement: {
    number: "03", eyebrow: "NARROW TO ONE STATEMENT", name: "SQL Evidence",
    title: "Analyze the affected SQL identifier",
    description: "Enter the SQL_ID, queryid, digest, operation comment or query hash. Review raw workload evidence and ranked recommendations without executing or changing the statement.",
    tips: ["1. Confirm identifier", "2. Analyze live evidence", "3. Review plan and workload"],
    next: "advanced", nextLabel: "Continue to Trace & Plans",
  },
  advanced: {
    number: "04", eyebrow: "VERIFY THE CAUSE", name: "Trace & Plans",
    title: "Use deeper diagnostics only when the signal is clear",
    description: "Run one guided check, use Oracle deep X-Ray under the selected license scope, or analyze 10053, 10046 and TKPROF evidence. Every tool remains recommendation-only.",
    tips: ["1. Choose one signal", "2. Preserve licensing boundaries", "3. Validate under change control"],
    next: "overview", nextLabel: "Return to Guided Analysis",
  },
};

const performanceModeSections = {
  overview: ["performanceRuntimeTraceSection", "performanceOverviewHero", "performanceHealthSection"],
  engine: ["performanceOracleIntelligenceSection", "performancePostgresSection", "performanceMongoSection", "performanceEngineFallbackSection"],
  statement: ["performanceStatementSection", "diagnosticCards", "performanceRawOutputSection", "performanceRecommendationSection"],
  advanced: ["performanceChecksSection", "performanceOracleSection", "performanceTraceSection", "performanceChecklistSection"],
};

function performanceModeForTarget(id) {
  if (!id) return "";
  if (id === "performanceRuntimeTraceSection") return "overview";
  const exact = Object.entries(performanceModeSections).find(([, ids]) => ids.includes(id));
  if (exact) return exact[0];
  if (["sqlRecommendationResults", "performanceOutput", "sqlIdentifier", "recommendSql", "diagnoseSql"].includes(id)) return "statement";
  if (["oracleXraySteps", "oracleTraceAnalysis", "tuningOutput"].includes(id)) return "advanced";
  return "";
}

function renderPerformanceFallback() {
  if (!$("#performanceEngineFallbackSection")) return;
  const engine = state.performanceWorkspace.engine;
  const detail = performanceWorkspaceCatalog[engine];
  const checks = Object.entries(tuningActions[engine] || {});
  $("#performanceFallbackTitle").textContent = `${detail?.name || "Database"} guided performance analysis`;
  $("#performanceFallbackDescription").textContent = engine === "mysql"
    ? "Correlate Performance Schema workload, waits, locks, I/O, memory, indexes and replication before changing SQL or configuration."
    : "Correlate live DMVs and Query Store evidence for requests, waits, blockers, memory, file I/O, TempDB and plan behavior.";
  $("#performanceFallbackIdentifier").textContent = `Add a ${detail?.identifier || "statement identifier"} to inspect its workload evidence.`;
  $("#performanceFallbackBadge").textContent = `${checks.length || 10} READ-ONLY CHECKS`;
  $("#performanceFallbackCheckCount").textContent = `${checks.length || 10} checks`;
  $("#performanceFallbackChecks").innerHTML = checks.map(([, item], index) => `<article><i>${String(index + 1).padStart(2, "0")}</i><b>${escapeHtml(item[0])}</b><p>${escapeHtml(item[1])}</p></article>`).join("");
}

function setPerformanceMode(mode, scroll = false) {
  const detail = performanceModeCatalog[mode];
  if (!detail) return;
  state.performanceWorkspace.mode = mode;
  const allIds = [...new Set(Object.values(performanceModeSections).flat())];
  const visible = new Set(performanceModeSections[mode]);
  allIds.forEach((id) => document.getElementById(id)?.classList.toggle("performance-mode-hidden", !visible.has(id)));
  $$("[data-performance-mode]").forEach((button) => {
    const active = button.dataset.performanceMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "step" : "false");
  });
  $("#performanceModeCurrent").textContent = detail.name;
  $("#performanceModeNumber").textContent = detail.number;
  $("#performanceModeEyebrow").textContent = detail.eyebrow;
  $("#performanceModeTitle").textContent = detail.title;
  $("#performanceModeDescription").textContent = detail.description;
  $("#performanceModeTips").innerHTML = detail.tips.map((tip) => `<span>${escapeHtml(tip)}</span>`).join("");
  $("#performanceModeNext").innerHTML = `${escapeHtml(detail.nextLabel)} <b>→</b>`;
  $("#performanceModeNext").dataset.nextMode = detail.next;
  if (mode === "engine") renderPerformanceFallback();
  if (scroll) $("#performanceModeTitle").scrollIntoView({ behavior: "smooth", block: "center" });
}

function updatePerformanceContextTarget() {
  if (!$("#performanceContextTarget")) return;
  const engine = state.performanceWorkspace.engine;
  const adapter = sqlAdapterUi[engine] || sqlAdapterUi.oracle;
  const host = $("#sqlHost").value.trim() || "localhost";
  const port = $("#sqlPort").value.trim() || adapter.port;
  const database = $("#sqlDatabase").value.trim();
  $("#performanceContextTarget").textContent = `${host}:${port}${database ? ` / ${database}` : ""}`;
}

function setPerformanceWorkspaceEngine(engine, syncConnection = true) {
  const detail = performanceWorkspaceCatalog[engine];
  if (!detail) return;
  const previousEngine = state.performanceWorkspace.engine;
  if ($("#sqlEngine").value === previousEngine) state.performanceWorkspace.connections[previousEngine] = { host: $("#sqlHost").value, port: $("#sqlPort").value, database: $("#sqlDatabase").value, username: $("#sqlUsername").value };
  const currentIdentifier = $("#performanceQuickIdentifier")?.value.trim() || $("#sqlIdentifier")?.value.trim();
  if (currentIdentifier) state.performanceWorkspace.identifiers[previousEngine] = currentIdentifier;
  state.performanceWorkspace.engine = engine;
  ["oracle", "postgres", "mongodb", "mysql", "sqlserver"].forEach((id) => $("#performance-view").classList.toggle(`engine-${id}`, id === engine));
  $("#performance-view").classList.toggle("performance-non-oracle", engine !== "oracle");
  $$("[data-performance-engine]").forEach((button) => button.classList.toggle("active", button.dataset.performanceEngine === engine));
  $("#performanceContextName").textContent = detail.title;
  $("#performanceContextDescription").textContent = detail.description;
  $("#performanceIdentifierLabel").textContent = detail.identifier;
  $("#performanceIdentifierHint").textContent = detail.hint;
  $("#performanceIdentifierExample").textContent = `Example: ${detail.example}`;
  $("#performanceQuickSafety").textContent = detail.safety;
  $("#performanceQuickIdentifier").placeholder = detail.hint;
  $("#sqlIdentifier").placeholder = detail.hint;
  const identifier = state.performanceWorkspace.identifiers[engine] || detail.example;
  $("#performanceQuickIdentifier").value = identifier;
  $("#sqlIdentifier").value = identifier;
  if (engine === "postgres" && $("#postgresQueryId")) $("#postgresQueryId").value = /^-?\d{1,20}$/.test(identifier) ? identifier : "";
  if (engine === "oracle" && $("#oracleBottleneckSqlId")) $("#oracleBottleneckSqlId").value = /^[a-z0-9]{13}$/i.test(identifier) ? identifier.toLowerCase() : "";
  if (engine === "mongodb" && $("#mongoOperationId")) $("#mongoOperationId").value = identifier === detail.example ? "" : identifier;
  $("#snapshotEngine").value = engine;
  $("#perfEngine").value = engine;
  $("#tuningEngine").value = engine;
  if (syncConnection) {
    updateTuningChecks();
    const saved = state.performanceWorkspace.connections[engine];
    if (saved) { $("#sqlHost").value = saved.host; $("#sqlPort").value = saved.port; $("#sqlDatabase").value = saved.database; $("#sqlUsername").value = saved.username; }
    else $("#sqlDatabase").value = { oracle: "ORCL", postgres: "postgres", mongodb: "admin", mysql: "mysql", sqlserver: "master" }[engine];
    updateConnectionAdapterUi(); updateSnapshotTarget(); updateOracleXrayTarget();
  } else updateSnapshotTarget();
  updatePerformanceContextTarget();
  renderPerformanceFallback();
  setRuntimeTraceEngine(engine);
}

function scrollPerformanceSection(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const mode = performanceModeForTarget(id);
  if (mode) setPerformanceMode(mode, false);
  $$("[data-performance-jump]").forEach((button) => button.classList.toggle("active", button.dataset.performanceJump === id));
  window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
}

async function runPerformanceQuickRecommendation() {
  const button = $("#performanceQuickRecommend");
  const identifier = $("#performanceQuickIdentifier").value.trim();
  if (!identifier) return toast(`Enter a ${performanceWorkspaceCatalog[state.performanceWorkspace.engine].identifier}`, true);
  $("#sqlIdentifier").value = identifier;
  state.performanceWorkspace.identifiers[state.performanceWorkspace.engine] = identifier;
  scrollPerformanceSection("sqlRecommendationResults");
  setBusy(button, true, "Analyzing…");
  try { await recommendSql(); }
  finally { setBusy(button, false); }
}

async function runPerformanceQuickTrace() {
  const identifier = $("#performanceQuickIdentifier").value.trim();
  if (!identifier) return toast(`Enter a ${performanceWorkspaceCatalog[state.performanceWorkspace.engine].identifier}`, true);
  state.performanceWorkspace.identifiers[state.performanceWorkspace.engine] = identifier;
  $("#runtimeTraceIdentifier").value = identifier;
  $("#sqlIdentifier").value = identifier;
  setPerformanceMode("overview", false);
  scrollPerformanceSection("performanceRuntimeTraceSection");
  await captureRuntimeTrace();
}

async function runPerformanceQuickSnapshot() {
  if (state.performanceWorkspace.engine === "oracle") {
    setPerformanceMode("engine", false);
    scrollPerformanceSection("performanceOracleIntelligenceSection");
    return runOracleBottleneck();
  }
  if (state.performanceWorkspace.engine === "postgres") {
    setPerformanceMode("engine", false);
    scrollPerformanceSection("performancePostgresSection");
    return runPostgresBottleneck();
  }
  if (state.performanceWorkspace.engine === "mongodb") {
    setPerformanceMode("engine", false);
    scrollPerformanceSection("performanceMongoSection");
    return runMongoBottleneck();
  }
  const button = $("#performanceQuickSnapshot");
  setPerformanceMode("overview", false);
  scrollPerformanceSection("performanceHealthSection");
  setBusy(button, true, "Running health…");
  try { await runDatabaseSnapshot(); }
  finally { setBusy(button, false); }
}

function oracleBottleneckReport(result) {
  const analysis = result.analysis || {};
  const scopeLabel = { core: "Core views only", diagnostics: "Core + Diagnostics Pack", tuning: "Core + Diagnostics and Tuning Packs" }[result.packScope] || result.packScope;
  const lines = [
    "DBridge Oracle Bottleneck Intelligence",
    `Collected: ${result.collectedAt || new Date().toISOString()}`,
    `Analysis scope: ${result.sqlId ? `database + SQL_ID ${result.sqlId}` : "whole database"}`,
    `License scope selected: ${scopeLabel}`,
    `Pressure score: ${analysis.pressureScore ?? "—"} / 100`,
    `Workload mode: ${analysis.dominantMode || "—"}`,
    `Primary bottleneck: ${analysis.primary || "No dominant signal"}`,
    `Checks: ${analysis.completed || 0} completed, ${analysis.skipped || 0} skipped, ${analysis.failed || 0} unavailable`,
    "",
    "RANKED FINDINGS",
  ];
  if ((analysis.pressureMap || []).length) {
    lines.push("", "PRESSURE MAP");
    analysis.pressureMap.forEach((item) => lines.push(`${item.area}: ${item.score}/100 · ${item.severity} · ${item.count} finding(s)`));
  }
  (analysis.findings || []).forEach((item, index) => lines.push(
    "",
    `${index + 1}. [${item.severity}] ${item.title} (${item.area})`,
    `Confidence: ${item.confidence || "Measured"}`,
    `Cause: ${item.cause}`,
    `Evidence: ${item.evidence}`,
    `Impact: ${item.impact}`,
    `Verify: ${item.verify}`,
    `Safe next action: ${item.action}`,
    `Reference: ${item.doc}`,
  ));
  lines.push("", "EVIDENCE CHECK STATUS");
  (result.results || []).forEach((item) => lines.push(`${item.ok ? "PASS" : item.skipped ? "SKIP" : "UNAVAILABLE"} | ${String(item.license || "core").toUpperCase()} | ${item.phase} | ${item.label} | ${item.rowCount ?? 0} rows | ${item.durationMs || 0} ms${item.error ? ` | ${item.error}` : ""}`));
  lines.push("", analysis.safetyNote || "Fixed read-only evidence only. Verify every recommendation under normal change control.");
  return lines.join("\n");
}

function renderOraclePressureMap(analysis) {
  const rows = analysis.pressureMap || [];
  $("#oraclePressureMap").innerHTML = rows.length ? rows.map((item) => `
    <div class="postgres-pressure-row ${escapeHtml(String(item.severity || "clear").toLowerCase())}">
      <span><b>${escapeHtml(item.area)}</b><small>${escapeHtml(item.severity)} · ${Number(item.count || 0)} signal${Number(item.count || 0) === 1 ? "" : "s"}</small></span>
      <div><i style="width:${Math.max(4, Math.min(100, Number(item.score || 0)))}%"></i></div>
      <em>${Number(item.score || 0)}</em>
    </div>`).join("") : "<p>No pressure domain crossed a finding threshold in this snapshot.</p>";
}

function renderOracleSnapshotContext(result, previous) {
  const metrics = result.analysis?.metrics || {};
  const focused = result.analysis?.focusedSql;
  const elapsedSeconds = previous ? Math.max(1, (new Date(result.collectedAt) - new Date(previous.collectedAt)) / 1000) : 0;
  const currentEnvironment = result.results?.find((item) => item.id === "environment" && item.ok)?.rows?.[0] || {};
  const previousEnvironment = previous?.results?.find((item) => item.id === "environment" && item.ok)?.rows?.[0] || {};
  const read = (row, key) => row[key] ?? row[key.toUpperCase()] ?? row[key.toLowerCase()];
  const sameBoundary = previous && String(read(currentEnvironment, "startup_time") || "") === String(read(previousEnvironment, "startup_time") || "");
  const focusHtml = focused ? `<div class="postgres-context-focus"><span>FOCUSED SQL_ID</span><b>${escapeHtml(String(focused.sql_id || result.sqlId))}</b><p>${Number(focused.executions || 0).toLocaleString()} executions · ${Number(focused.average_elapsed_ms || 0).toLocaleString()} ms mean · ${Number(focused.plan_count || 0)} plan hash value(s).</p></div>` : `<div class="postgres-context-focus"><span>DATABASE-WIDE SNAPSHOT</span><b>${Number(metrics.activeSessions || 0)} active · ${Number(metrics.waitingSessions || 0)} waiting</b><p>${Number(metrics.blockedSessions || 0)} blocked · ${Number(metrics.sessionUsePercent || 0).toFixed(1)}% session capacity · ${Number(metrics.hostCpuPercent || 0).toFixed(1)}% host CPU.</p></div>`;
  const intervalHtml = `<div class="postgres-context-delta"><span>INTERVAL CONFIDENCE</span><b>${sameBoundary ? `Comparable snapshot · ${elapsedSeconds.toFixed(0)}s apart` : previous ? "Startup boundary changed or unavailable" : "First snapshot captured"}</b><p>${sameBoundary ? "Startup time is unchanged. Use raw SQL/wait/redo counter deltas to confirm rates before tuning." : previous ? "Do not compare cumulative counters across these snapshots." : "Run again in 15–60 seconds during the same incident to separate current rate from lifetime totals."}</p></div>`;
  const resourceHtml = `<div class="postgres-context-note"><span>RESOURCE CONTEXT</span><p>${Number(metrics.databaseCpuRatio || 0).toFixed(1)}% DB CPU ratio · ${Number(metrics.databaseWaitRatio || 0).toFixed(1)}% DB wait ratio · ${Number(metrics.maxReadMs || 0).toFixed(2)} ms max datafile read average · ${formatCompareBytes(Number(metrics.tempBytes || 0))} live temp.</p></div>`;
  $("#oracleSnapshotContext").innerHTML = `${focusHtml}${intervalHtml}${resourceHtml}`;
}

function updateOracleLicenseLanes() {
  const scope = $("#oraclePackScope")?.value || "core";
  const allowed = scope === "tuning" ? 3 : scope === "diagnostics" ? 2 : 1;
  $$(".oracle-license-lanes span").forEach((item, index) => item.classList.toggle("active", index < allowed));
}

function renderOracleBottleneck(result) {
  const analysis = result.analysis || {};
  const findings = analysis.findings || [];
  const priority = Number(analysis.critical || 0) + Number(analysis.high || 0);
  $("#oraclePrimaryBottleneck").textContent = analysis.primary || "No dominant signal";
  $("#oraclePrimaryEvidence").textContent = analysis.primaryEvidence || findings[0]?.evidence || "Capture another snapshot during the incident.";
  $("#oraclePressureScore").textContent = `${analysis.pressureScore ?? 0}`;
  $("#oracleWorkloadMode").textContent = analysis.dominantMode || "QUIET";
  $("#oraclePriorityCount").textContent = `${priority}`;
  $("#oracleChecksComplete").textContent = `${analysis.completed || 0} / ${analysis.total || 30}`;
  $("#oracleChecksNote").textContent = `${analysis.skipped || 0} skipped · ${analysis.failed || 0} unavailable`;
  $("#oracleFindingCount").textContent = `${findings.length} finding${findings.length === 1 ? "" : "s"}`;
  $("#oracleEvidenceSummary").textContent = `${analysis.completed || 0} completed`;
  $("#oracleScopeBadge").textContent = `${result.sqlId ? `SQL_ID ${result.sqlId}` : "WHOLE DATABASE"} · ${String(result.packScope || "core").toUpperCase()}`;
  renderOraclePressureMap(analysis);
  renderOracleSnapshotContext(result, state.oracleBottleneck.result);
  $("#oracleBottleneckFindings").innerHTML = findings.length ? findings.map((item) => `
    <article class="postgres-finding ${escapeHtml(String(item.severity || "INFO").toLowerCase())}">
      <header><span>${escapeHtml(item.severity)}</span><b>${escapeHtml(item.title)}</b><em>${escapeHtml(item.area)} · ${escapeHtml(item.confidence || "Measured")}</em></header>
      <div class="postgres-finding-grid">
        <div><span>PROBABLE CAUSE</span><p>${escapeHtml(item.cause)}</p></div>
        <div><span>MEASURED EVIDENCE</span><p>${escapeHtml(item.evidence)}</p></div>
        <div><span>APPLICATION IMPACT</span><p>${escapeHtml(item.impact)}</p></div>
        <div><span>HOW TO VERIFY</span><p>${escapeHtml(item.verify)}</p></div>
      </div>
      <footer><b>SAFE NEXT ACTION</b><p>${escapeHtml(item.action)}</p><a href="${escapeHtml(item.doc)}" target="_blank" rel="noopener">Official Oracle source ↗</a></footer>
    </article>`).join("") : '<div class="postgres-empty"><span>ORA</span><b>No dominant finding returned</b><p>Capture another scan while the application slowdown is active.</p></div>';
  const primary = findings[0] || {};
  $("#oracleCauseTitle").textContent = primary.title || "No dominant signal";
  $("#oracleCauseChain").innerHTML = [
    ["Symptom", "Application latency, timeout, throughput loss or resource saturation"],
    ["Resource signal", `${analysis.dominantMode || "QUIET"} · ${primary.area || "no dominant resource"}`],
    ["Probable cause", primary.cause || "No current evidence identifies one cause."],
    ["Safe verification", primary.verify || "Capture a second interval and add the affected SQL_ID."],
  ].map((item, index) => `<div><i>${index + 1}</i><p><b>${escapeHtml(item[0])}</b><span>${escapeHtml(item[1])}</span></p></div>`).join("");
  $("#oracleEvidenceChecks").innerHTML = (result.results || []).map((item) => `
    <div class="postgres-check-row ${item.skipped ? "skipped" : item.ok ? "" : "failed"}">
      <i>${item.ok ? "✓" : item.skipped ? "–" : "!"}</i>
      <div><b>${escapeHtml(item.label)} <span class="oracle-check-license">${escapeHtml(String(item.license || "core").toUpperCase())}</span></b><small>${escapeHtml(item.ok ? `${item.phase} · ${item.rowCount || 0} rows${item.sensitive ? " · values redacted" : ""}` : item.error || "Unavailable")}</small></div>
      <em>${item.durationMs ? `${Number(item.durationMs).toLocaleString()} ms` : item.skipped ? "SKIPPED" : "—"}</em>
    </div>`).join("");
  $$("[data-oracle-phase]").forEach((item) => { item.classList.remove("active"); item.classList.add("done"); });
  $("#oracleBottleneckProgress").style.width = "100%";
  $("#oracleBottleneckProgressText").textContent = `Completed ${analysis.completed || 0} of ${analysis.total || 30} checks · ${new Date(result.collectedAt || Date.now()).toLocaleTimeString()}`;
  $("#oracleBottleneckState").className = "complete";
  $("#oracleBottleneckState").innerHTML = "<i></i>COMPLETE";
  state.oracleBottleneck.previousResult = state.oracleBottleneck.result;
  state.oracleBottleneck.result = result;
  state.oracleBottleneck.report = oracleBottleneckReport(result);
}

async function runOracleBottleneck() {
  if (state.oracleBottleneck.running) return;
  const button = $("#runOracleBottleneck");
  const sqlId = $("#oracleBottleneckSqlId").value.trim().toLowerCase();
  const packScope = $("#oraclePackScope").value;
  if (sqlId && !/^[a-z0-9]{13}$/.test(sqlId)) return toast("Oracle SQL_ID must contain exactly 13 letters or digits", true);
  state.oracleBottleneck.running = true;
  syncPerformanceEngine("oracle");
  setBusy(button, true, "Analyzing…");
  $("#oracleBottleneckState").className = "running";
  $("#oracleBottleneckState").innerHTML = "<i></i>COLLECTING";
  $("#oracleBottleneckProgress").style.width = "10%";
  $("#oracleBottleneckProgressText").textContent = `Collecting fixed read-only Oracle evidence · ${packScope.toUpperCase()} scope…`;
  $$("[data-oracle-phase]").forEach((item, index) => { item.classList.toggle("active", index === 0); item.classList.remove("done"); });
  try {
    const result = await api("/api/performance/oracle-bottleneck/analyze", { method: "POST", body: JSON.stringify({ ...connection(), engine: "oracle", sqlId, packScope, timeoutMs: Number($("#perfTimeout").value) }) });
    $("#oracleBottleneckProgress").style.width = "76%";
    $$("[data-oracle-phase]").forEach((item, index) => item.classList.toggle("active", index >= 1));
    renderOracleBottleneck(result);
    toast(`Oracle analysis completed · ${result.analysis?.findings?.length || 0} findings`);
  } catch (error) {
    $("#oracleBottleneckState").className = "";
    $("#oracleBottleneckState").innerHTML = "<i></i>UNAVAILABLE";
    $("#oracleBottleneckProgress").style.width = "0";
    $("#oracleBottleneckProgressText").textContent = error.message;
    $("#oracleBottleneckFindings").innerHTML = `<div class="postgres-empty"><span>!</span><b>Oracle evidence unavailable</b><p>${escapeHtml(error.message)} Confirm the SQL Studio connection and approved V_$ / DBA view privileges.</p></div>`;
    toast(error.message, true);
  } finally {
    state.oracleBottleneck.running = false;
    setBusy(button, false);
  }
}

function postgresBottleneckReport(result) {
  const analysis = result.analysis || {};
  const lines = [
    "DBridge PostgreSQL Bottleneck Intelligence",
    `Collected: ${result.collectedAt || new Date().toISOString()}`,
    `Server version number: ${result.serverVersion || "unavailable"}`,
    `Analysis scope: ${result.queryId ? `database + queryid ${result.queryId}` : "whole database"}`,
    `Pressure score: ${analysis.pressureScore ?? "—"} / 100`,
    `Workload mode: ${analysis.dominantMode || "—"}`,
    `Primary bottleneck: ${analysis.primary || "No dominant signal"}`,
    `Checks: ${analysis.completed || 0} completed, ${analysis.skipped || 0} skipped, ${analysis.failed || 0} failed`,
    "",
    "RANKED FINDINGS",
  ];
  if ((analysis.pressureMap || []).length) {
    lines.push("", "PRESSURE MAP");
    (analysis.pressureMap || []).forEach((item) => lines.push(`${item.area}: ${item.score}/100 · ${item.severity} · ${item.count} finding(s)`));
  }
  (analysis.findings || []).forEach((item, index) => {
    lines.push(
      "",
      `${index + 1}. [${item.severity}] ${item.title} (${item.area})`,
      `Cause: ${item.cause}`,
      `Evidence: ${item.evidence}`,
      `Impact: ${item.impact}`,
      `Verify: ${item.verify}`,
      `Safe next action: ${item.action}`,
      `Reference: ${item.doc}`,
    );
  });
  lines.push("", "EVIDENCE CHECK STATUS");
  (result.results || []).forEach((item) => lines.push(`${item.ok ? "PASS" : item.skipped ? "SKIP" : "UNAVAILABLE"} | ${item.phase} | ${item.label} | ${item.rowCount ?? 0} rows | ${item.durationMs || 0} ms${item.error ? ` | ${item.error}` : ""}`));
  lines.push("", "Safety: fixed read-only evidence collection; verify every recommendation under normal change control.");
  return lines.join("\n");
}

function postgresEvidenceRow(result, id) {
  return result?.results?.find((item) => item.id === id && item.ok)?.rows?.[0] || null;
}

function renderPostgresPressureMap(analysis) {
  const rows = analysis.pressureMap || [];
  $("#postgresPressureMap").innerHTML = rows.length ? rows.map((item) => `
    <div class="postgres-pressure-row ${escapeHtml(String(item.severity || "clear").toLowerCase())}">
      <span><b>${escapeHtml(item.area)}</b><small>${escapeHtml(item.severity)} · ${Number(item.count || 0)} signal${Number(item.count || 0) === 1 ? "" : "s"}</small></span>
      <div><i style="width:${Math.max(4, Math.min(100, Number(item.score || 0)))}%"></i></div>
      <em>${Number(item.score || 0)}</em>
    </div>`).join("") : '<p>No pressure domain crossed a finding threshold in this snapshot.</p>';
}

function renderPostgresSnapshotContext(result, previous) {
  const analysis = result.analysis || {};
  const focused = analysis.focusedStatement;
  const currentDatabase = postgresEvidenceRow(result, "database");
  const previousDatabase = postgresEvidenceRow(previous, "database");
  const currentWal = postgresEvidenceRow(result, "wal");
  const previousWal = postgresEvidenceRow(previous, "wal");
  const elapsedSeconds = previous ? Math.max(1, (new Date(result.collectedAt) - new Date(previous.collectedAt)) / 1000) : 0;
  const sameReset = currentDatabase && previousDatabase && String(currentDatabase.stats_reset || "") === String(previousDatabase.stats_reset || "");
  const deltas = sameReset ? {
    reads: Math.max(0, Number(currentDatabase.blks_read || 0) - Number(previousDatabase.blks_read || 0)),
    temp: Math.max(0, Number(currentDatabase.temp_bytes || 0) - Number(previousDatabase.temp_bytes || 0)),
    transactions: Math.max(0, Number(currentDatabase.xact_commit || 0) + Number(currentDatabase.xact_rollback || 0) - Number(previousDatabase.xact_commit || 0) - Number(previousDatabase.xact_rollback || 0)),
    wal: currentWal && previousWal ? Math.max(0, Number(currentWal.wal_bytes || 0) - Number(previousWal.wal_bytes || 0)) : null,
  } : null;
  const focusHtml = focused ? `<div class="postgres-context-focus"><span>FOCUSED QUERYID</span><b>${escapeHtml(String(focused.queryid || result.queryId))}</b><p>${Number(focused.calls || 0).toLocaleString()} calls · ${Number(focused.mean_exec_ms || 0).toLocaleString()} ms mean · ${Number(focused.max_exec_ms || 0).toLocaleString()} ms max</p></div>` : "";
  const deltaHtml = deltas ? `<div class="postgres-context-delta"><span>SINCE PREVIOUS SCAN · ${elapsedSeconds.toFixed(0)}s</span><b>${(deltas.transactions / elapsedSeconds).toFixed(1)} tx/s · ${(deltas.reads / elapsedSeconds).toFixed(1)} reads/s</b><p>${formatCompareBytes(deltas.temp)} temp${deltas.wal === null ? "" : ` · ${formatCompareBytes(deltas.wal)} WAL`} in the interval. Rates are valid because stats_reset is unchanged.</p></div>` : `<div class="postgres-context-delta"><span>INTERVAL CONFIDENCE</span><b>${previous ? "Comparison boundary changed" : "First snapshot captured"}</b><p>${previous ? "stats_reset differs or a required counter was unavailable; rate comparison was discarded." : "Run again during the same incident to calculate database and WAL rates without resetting statistics."}</p></div>`;
  $("#postgresSnapshotContext").innerHTML = `${focusHtml}${deltaHtml}<div class="postgres-context-note"><span>INTERPRETATION</span><p>Waits and blockers are live. Most counters are cumulative and can include work before the incident.</p></div>`;
}

function renderPostgresBottleneck(result) {
  const analysis = result.analysis || {};
  const findings = analysis.findings || [];
  const priority = Number(analysis.critical || 0) + Number(analysis.high || 0);
  $("#postgresPrimaryBottleneck").textContent = analysis.primary || "No dominant signal";
  $("#postgresPrimaryEvidence").textContent = findings[0]?.evidence || "Capture another snapshot during the incident.";
  $("#postgresPressureScore").textContent = `${analysis.pressureScore ?? 0}`;
  $("#postgresWorkloadMode").textContent = analysis.dominantMode || "QUIET";
  $("#postgresPriorityCount").textContent = `${priority}`;
  $("#postgresChecksComplete").textContent = `${analysis.completed || 0} / ${analysis.total || 26}`;
  $("#postgresChecksNote").textContent = `${analysis.skipped || 0} skipped · ${analysis.failed || 0} unavailable`;
  $("#postgresFindingCount").textContent = `${findings.length} finding${findings.length === 1 ? "" : "s"}`;
  $("#postgresEvidenceSummary").textContent = `${analysis.completed || 0} completed`;
  $("#postgresScopeBadge").textContent = result.queryId ? `QUERYID ${result.queryId}` : "WHOLE DATABASE";
  renderPostgresPressureMap(analysis);
  renderPostgresSnapshotContext(result, state.postgresBottleneck.result);
  $("#postgresBottleneckFindings").innerHTML = findings.length ? findings.map((item) => `
    <article class="postgres-finding ${escapeHtml(String(item.severity || "INFO").toLowerCase())}">
      <header><span>${escapeHtml(item.severity)}</span><b>${escapeHtml(item.title)}</b><em>${escapeHtml(item.area)}</em></header>
      <div class="postgres-finding-grid">
        <div><span>PROBABLE CAUSE</span><p>${escapeHtml(item.cause)}</p></div>
        <div><span>MEASURED EVIDENCE</span><p>${escapeHtml(item.evidence)}</p></div>
        <div><span>APPLICATION IMPACT</span><p>${escapeHtml(item.impact)}</p></div>
        <div><span>HOW TO VERIFY</span><p>${escapeHtml(item.verify)}</p></div>
      </div>
      <footer><b>SAFE NEXT ACTION</b><p>${escapeHtml(item.action)}</p><a href="${escapeHtml(item.doc)}" target="_blank" rel="noopener">Official docs ↗</a></footer>
    </article>`).join("") : '<div class="postgres-empty"><span>PG</span><b>No finding returned</b><p>Capture the scan again during the application slowdown.</p></div>';
  const primary = findings[0] || {};
  $("#postgresCauseTitle").textContent = primary.title || "No dominant signal";
  $("#postgresCauseChain").innerHTML = [
    ["Symptom", "Application query latency or throughput degradation"],
    ["Resource signal", `${analysis.dominantMode || "QUIET"} workload · ${primary.area || "no dominant resource"}`],
    ["Probable cause", primary.cause || "No current evidence identifies one cause."],
    ["Safe verification", primary.verify || "Capture an exact plan and repeat during the incident."],
  ].map((item, index) => `<div><i>${index + 1}</i><p><b>${escapeHtml(item[0])}</b><span>${escapeHtml(item[1])}</span></p></div>`).join("");
  $("#postgresEvidenceChecks").innerHTML = (result.results || []).map((item) => `
    <div class="postgres-check-row ${item.skipped ? "skipped" : item.ok ? "" : "failed"}">
      <i>${item.ok ? "✓" : item.skipped ? "–" : "!"}</i>
      <div><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.ok ? `${item.phase} · ${item.rowCount || 0} rows` : item.error || "Unavailable")}</small></div>
      <em>${item.durationMs ? `${Number(item.durationMs).toLocaleString()} ms` : item.skipped ? "VERSION" : "—"}</em>
    </div>`).join("");
  $$("[data-postgres-phase]").forEach((item) => { item.classList.remove("active"); item.classList.add("done"); });
  $("#postgresBottleneckProgress").style.width = "100%";
  $("#postgresBottleneckProgressText").textContent = `Completed ${analysis.completed || 0} of ${analysis.total || 26} checks · ${new Date(result.collectedAt || Date.now()).toLocaleTimeString()}`;
  $("#postgresBottleneckState").className = "complete";
  $("#postgresBottleneckState").innerHTML = "<i></i>COMPLETE";
  state.postgresBottleneck.previousResult = state.postgresBottleneck.result;
  state.postgresBottleneck.result = result;
  state.postgresBottleneck.report = postgresBottleneckReport(result);
}

async function runPostgresBottleneck() {
  if (state.postgresBottleneck.running) return;
  const button = $("#runPostgresBottleneck");
  const queryId = $("#postgresQueryId").value.trim();
  if (queryId && !/^-?\d{1,20}$/.test(queryId)) return toast("PostgreSQL queryid must be a signed integer with at most 20 digits", true);
  state.postgresBottleneck.running = true;
  syncPerformanceEngine("postgres");
  setBusy(button, true, "Analyzing…");
  $("#postgresBottleneckState").className = "running";
  $("#postgresBottleneckState").innerHTML = "<i></i>COLLECTING";
  $("#postgresBottleneckProgress").style.width = "12%";
  $("#postgresBottleneckProgressText").textContent = "Collecting fixed read-only PostgreSQL evidence checks…";
  $$("[data-postgres-phase]").forEach((item, index) => { item.classList.toggle("active", index === 0); item.classList.remove("done"); });
  try {
    const result = await api("/api/performance/postgres-bottleneck/analyze", { method: "POST", body: JSON.stringify({ ...connection(), engine: "postgres", queryId, timeoutMs: Number($("#perfTimeout").value) }) });
    $("#postgresBottleneckProgress").style.width = "76%";
    $$("[data-postgres-phase]").forEach((item, index) => item.classList.toggle("active", index >= 1));
    renderPostgresBottleneck(result);
    toast(`PostgreSQL analysis completed · ${result.analysis?.findings?.length || 0} findings`);
  } catch (error) {
    $("#postgresBottleneckState").className = "";
    $("#postgresBottleneckState").innerHTML = "<i></i>UNAVAILABLE";
    $("#postgresBottleneckProgress").style.width = "0";
    $("#postgresBottleneckProgressText").textContent = error.message;
    $("#postgresBottleneckFindings").innerHTML = `<div class="postgres-empty"><span>!</span><b>PostgreSQL evidence unavailable</b><p>${escapeHtml(error.message)} Confirm the SQL Studio connection and approved pg_stat privileges.</p></div>`;
    toast(error.message, true);
  } finally {
    state.postgresBottleneck.running = false;
    setBusy(button, false);
  }
}

function mongoBottleneckReport(result) {
  const analysis = result.analysis || {};
  const lines = [
    "DBridge MongoDB Performance Intelligence",
    `Collected: ${result.collectedAt || new Date().toISOString()}`,
    `Server: MongoDB ${result.serverVersion || "version unavailable"} · ${result.topology || "topology unavailable"}`,
    `Scope: ${result.operationId ? `operation/comment ${result.operationId}` : "whole server"}${result.collection ? ` · collection ${result.collection}` : ""}`,
    `Pressure score: ${analysis.pressureScore ?? "—"} / 100`,
    `Workload mode: ${analysis.dominantMode || "—"}`,
    `Primary bottleneck: ${analysis.primary || "No dominant signal"}`,
    `Checks: ${analysis.completed || 0} completed, ${analysis.skipped || 0} skipped, ${analysis.failed || 0} unavailable`,
    "",
    "RANKED FINDINGS",
  ];
  (analysis.findings || []).forEach((item, index) => lines.push(
    "",
    `${index + 1}. [${item.severity}] ${item.title} (${item.area})`,
    `Cause: ${item.cause}`,
    `Evidence: ${item.evidence}`,
    `Impact: ${item.impact}`,
    `Verify: ${item.verify}`,
    `Safe next action: ${item.action}`,
    `Reference: ${item.doc}`,
  ));
  lines.push("", "EVIDENCE CHECK STATUS");
  (result.results || []).forEach((item) => lines.push(`${item.ok ? "PASS" : item.skipped ? "SKIP" : "UNAVAILABLE"} | ${item.phase} | ${item.label} | ${item.rowCount ?? 0} rows | ${item.durationMs || 0} ms${item.error ? ` | ${item.error}` : ""}`));
  lines.push("", analysis.safetyNote || "Read-only evidence only. Verify cumulative metrics with a second snapshot.");
  return lines.join("\n");
}

function renderMongoPressureMap(analysis) {
  const rows = analysis.pressureMap || [];
  $("#mongoPressureMap").innerHTML = rows.length ? rows.map((item) => `
    <div class="postgres-pressure-row ${escapeHtml(String(item.severity || "clear").toLowerCase())}">
      <span><b>${escapeHtml(item.area)}</b><small>${escapeHtml(item.severity)} · ${Number(item.count || 0)} signal${Number(item.count || 0) === 1 ? "" : "s"}</small></span>
      <div><i style="width:${Math.max(4, Math.min(100, Number(item.score || 0)))}%"></i></div>
      <em>${Number(item.score || 0)}</em>
    </div>`).join("") : "<p>No pressure domain crossed a finding threshold in this snapshot.</p>";
}

function renderMongoSnapshotContext(result, previous) {
  const metrics = result.analysis?.metrics || {};
  const elapsedSeconds = previous ? Math.max(1, (new Date(result.collectedAt) - new Date(previous.collectedAt)) / 1000) : 0;
  const uptime = result.results?.find((item) => item.id === "environment" && item.ok)?.rows?.[0]?.uptime;
  const previousUptime = previous?.results?.find((item) => item.id === "environment" && item.ok)?.rows?.[0]?.uptime;
  const sameBoundary = previous && Number(uptime) >= Number(previousUptime);
  $("#mongoSnapshotContext").innerHTML = `
    <div class="postgres-context-focus"><span>LIVE SNAPSHOT</span><b>${Number(metrics.activeOperations || 0)} active · ${Number(metrics.longOperations || 0)} long</b><p>${Number(metrics.lockWaiters || 0)} lock waiters · ${Number(metrics.connectionUsePercent || 0)}% connection capacity · ${Number(metrics.logErrors || 0)} buffered log errors.</p></div>
    <div class="postgres-context-delta"><span>STORAGE & REPLICA</span><b>${Number(metrics.cacheFillPercent || 0).toFixed(1)}% cache · ${Number(metrics.dirtyCachePercent || 0).toFixed(1)}% dirty</b><p>${Number(metrics.maxReplicationLagSeconds || 0).toFixed(1)}s max replica lag · ${Number(metrics.oplogWindowHours || 0).toFixed(1)}h oplog window.</p></div>
    <div class="postgres-context-note"><span>INTERVAL CONFIDENCE</span><p>${sameBoundary ? `Previous scan is ${elapsedSeconds.toFixed(0)}s old and uptime did not roll back. Use raw counter deltas to confirm rates.` : previous ? "Uptime rolled back or was unavailable; do not compare cumulative counters across these snapshots." : "First snapshot captured. Run again in 5–15 seconds during the same incident to distinguish rate from lifetime totals."}</p></div>`;
}

function renderMongoBottleneck(result) {
  const analysis = result.analysis || {};
  const findings = analysis.findings || [];
  const priority = findings.filter((item) => ["CRITICAL", "HIGH"].includes(item.severity)).length;
  $("#mongoPrimaryBottleneck").textContent = analysis.primary || "No dominant signal";
  $("#mongoPrimaryEvidence").textContent = analysis.primaryEvidence || findings[0]?.evidence || "Capture another snapshot during the incident.";
  $("#mongoPressureScore").textContent = `${analysis.pressureScore ?? 0}`;
  $("#mongoWorkloadMode").textContent = analysis.dominantMode || "QUIET";
  $("#mongoPriorityCount").textContent = `${priority}`;
  $("#mongoChecksComplete").textContent = `${analysis.completed || 0} / ${analysis.total || 19}`;
  $("#mongoChecksNote").textContent = `${analysis.skipped || 0} skipped · ${analysis.failed || 0} unavailable`;
  $("#mongoFindingCount").textContent = `${findings.length} finding${findings.length === 1 ? "" : "s"}`;
  $("#mongoEvidenceSummary").textContent = `${analysis.completed || 0} completed`;
  $("#mongoScopeBadge").textContent = result.operationId ? `OP ${result.operationId}` : result.collection ? `COLLECTION ${result.collection}` : "WHOLE SERVER";
  renderMongoPressureMap(analysis);
  renderMongoSnapshotContext(result, state.mongodbBottleneck.result);
  $("#mongoBottleneckFindings").innerHTML = findings.length ? findings.map((item) => `
    <article class="postgres-finding ${escapeHtml(String(item.severity || "INFO").toLowerCase())}">
      <header><span>${escapeHtml(item.severity)}</span><b>${escapeHtml(item.title)}</b><em>${escapeHtml(item.area)}</em></header>
      <div class="postgres-finding-grid">
        <div><span>PROBABLE CAUSE</span><p>${escapeHtml(item.cause)}</p></div>
        <div><span>MEASURED EVIDENCE</span><p>${escapeHtml(item.evidence)}</p></div>
        <div><span>APPLICATION IMPACT</span><p>${escapeHtml(item.impact)}</p></div>
        <div><span>HOW TO VERIFY</span><p>${escapeHtml(item.verify)}</p></div>
      </div>
      <footer><b>SAFE NEXT ACTION</b><p>${escapeHtml(item.action)}</p><a href="${escapeHtml(item.doc)}" target="_blank" rel="noopener">Official docs ↗</a></footer>
    </article>`).join("") : '<div class="postgres-empty"><span>MDB</span><b>No dominant finding returned</b><p>Capture a second scan during the application slowdown to calculate intervals.</p></div>';
  const primary = findings[0] || {};
  $("#mongoCauseTitle").textContent = primary.title || "No dominant signal";
  $("#mongoCauseChain").innerHTML = [
    ["Symptom", "Application operation latency, timeout, or throughput loss"],
    ["Resource signal", `${analysis.dominantMode || "QUIET"} · ${primary.area || "no dominant resource"}`],
    ["Probable cause", primary.cause || "No current evidence identifies one cause."],
    ["Safe verification", primary.verify || "Capture another snapshot and inspect queryPlanner first."],
  ].map((item, index) => `<div><i>${index + 1}</i><p><b>${escapeHtml(item[0])}</b><span>${escapeHtml(item[1])}</span></p></div>`).join("");
  $("#mongoEvidenceChecks").innerHTML = (result.results || []).map((item) => `
    <div class="postgres-check-row ${item.skipped ? "skipped" : item.ok ? "" : "failed"}">
      <i>${item.ok ? "✓" : item.skipped ? "–" : "!"}</i>
      <div><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.ok ? `${item.phase} · ${item.rowCount || 0} rows` : item.error || "Unavailable")}</small></div>
      <em>${item.durationMs ? `${Number(item.durationMs).toLocaleString()} ms` : item.skipped ? "OPTIONAL" : "—"}</em>
    </div>`).join("");
  $$("[data-mongo-phase]").forEach((item) => { item.classList.remove("active"); item.classList.add("done"); });
  $("#mongoBottleneckProgress").style.width = "100%";
  $("#mongoBottleneckProgressText").textContent = `Completed ${analysis.completed || 0} of ${analysis.total || 19} checks · ${new Date(result.collectedAt || Date.now()).toLocaleTimeString()}`;
  $("#mongoBottleneckState").className = "complete";
  $("#mongoBottleneckState").innerHTML = "<i></i>COMPLETE";
  state.mongodbBottleneck.previousResult = state.mongodbBottleneck.result;
  state.mongodbBottleneck.result = result;
  state.mongodbBottleneck.report = mongoBottleneckReport(result);
}

async function runMongoBottleneck() {
  if (state.mongodbBottleneck.running) return;
  const button = $("#runMongoBottleneck");
  const operationId = $("#mongoOperationId").value.trim();
  const collection = $("#mongoCollection").value.trim();
  if (operationId && (/[\r\n\0]/.test(operationId) || operationId.length > 128)) return toast("Operation/comment focus must be at most 128 characters", true);
  if (collection && (/[\r\n\0$]/.test(collection) || collection.length > 255)) return toast("Enter a valid MongoDB collection name", true);
  state.mongodbBottleneck.running = true;
  syncPerformanceEngine("mongodb");
  setBusy(button, true, "Analyzing…");
  $("#mongoBottleneckState").className = "running";
  $("#mongoBottleneckState").innerHTML = "<i></i>COLLECTING";
  $("#mongoBottleneckProgress").style.width = "12%";
  $("#mongoBottleneckProgressText").textContent = "Collecting bounded read-only evidence through the MongoDB driver…";
  $$("[data-mongo-phase]").forEach((item, index) => { item.classList.toggle("active", index === 0); item.classList.remove("done"); });
  try {
    const result = await api("/api/performance/mongodb-bottleneck/analyze", { method: "POST", body: JSON.stringify({ ...connection(), engine: "mongodb", operationId, collection, timeoutMs: Number($("#perfTimeout").value) }) });
    $("#mongoBottleneckProgress").style.width = "76%";
    $$("[data-mongo-phase]").forEach((item, index) => item.classList.toggle("active", index >= 1));
    renderMongoBottleneck(result);
    toast(`MongoDB analysis completed · ${result.analysis?.findings?.length || 0} findings`);
  } catch (error) {
    $("#mongoBottleneckState").className = "";
    $("#mongoBottleneckState").innerHTML = "<i></i>UNAVAILABLE";
    $("#mongoBottleneckProgress").style.width = "0";
    $("#mongoBottleneckProgressText").textContent = error.message;
    $("#mongoBottleneckFindings").innerHTML = `<div class="postgres-empty"><span>!</span><b>MongoDB evidence unavailable</b><p>${escapeHtml(error.message)} Confirm the direct SQL Studio connection and monitoring privileges.</p></div>`;
    toast(error.message, true);
  } finally {
    state.mongodbBottleneck.running = false;
    setBusy(button, false);
  }
}

function syncPerformanceEngine(engine) {
  if ($("#snapshotEngine")) $("#snapshotEngine").value = engine;
  if ($("#sqlEngine").value === engine) { updateSnapshotTarget(); updateOracleXrayTarget(); updatePerformanceContextTarget(); return; }
  $("#sqlEngine").value = engine;
  sqlConnectionEngineChanged();
  updateSnapshotTarget();
  updateOracleXrayTarget();
  updatePerformanceContextTarget();
}

function updateTuningChecks(syncEngine = true) {
  const engine = $("#tuningEngine").value;
  const checks = tuningActions[engine];
  if (!checks[state.tuningCheck]) state.tuningCheck = Object.keys(checks)[0];
  $("#tuningChecks").innerHTML = Object.entries(checks).map(([id, detail]) => `<button type="button" data-check="${id}" class="${id === state.tuningCheck ? "active" : ""}">${escapeHtml(detail[0])}</button>`).join("");
  $$("#tuningChecks [data-check]").forEach((button) => button.addEventListener("click", () => {
    state.tuningCheck = button.dataset.check;
    $$("#tuningChecks [data-check]").forEach((item) => item.classList.toggle("active", item === button));
    $("#tuningGuidance").textContent = checks[state.tuningCheck][1];
  }));
  $("#tuningGuidance").textContent = checks[state.tuningCheck][1];
  if (syncEngine) syncPerformanceEngine(engine);
}

function renderTuningSignals(result, output) {
  const lines = output.split(/\r?\n/).filter((line) => line.trim()).length;
  const reviewSignals = output.split(/\r?\n/).filter((line) => /\b(wait|block|deadlock|error|fatal|panic|timeout|low memory|rollback)\b/i.test(line)).length;
  $("#tuningDuration").textContent = `${result.durationMs.toLocaleString()} ms`;
  $("#tuningRows").textContent = lines.toLocaleString();
  $("#tuningSignals").textContent = reviewSignals.toLocaleString();
  $("#tuningAssessment").textContent = reviewSignals ? "Review" : "No keywords";
  $("#tuningAssessment").className = reviewSignals ? "review" : "stable";
  $("#tuningAssessmentNote").textContent = reviewSignals ? "Inspect highlighted signal types" : "No risk keywords detected";
  $("#runtimeBar").style.width = `${Math.min(100, Math.max(3, result.durationMs / 250))}%`;
  $("#outputBar").style.width = `${Math.min(100, Math.max(3, lines * 3))}%`;
  $("#reviewBar").style.width = `${Math.min(100, reviewSignals * 12)}%`;
  $("#runtimeValue").textContent = `${result.durationMs.toLocaleString()} ms`;
  $("#outputValue").textContent = `${lines.toLocaleString()} lines`;
  $("#reviewValue").textContent = `${reviewSignals.toLocaleString()} signals`;
}

async function runTuningCheck() {
  const button = $("#runTuningCheck");
  const engine = $("#tuningEngine").value;
  const detail = tuningActions[engine][state.tuningCheck];
  const payload = { ...connection(), engine, check: state.tuningCheck, timeoutMs: Number($("#perfTimeout").value) };
  setBusy(button, true, "Checking…");
  $("#tuningCheckStatus").className = "live";
  $("#tuningCheckStatus").textContent = "RUNNING";
  $("#tuningOutput").textContent = `Running ${detail[0]} against the live ${labels[engine] || engine} connection…`;
  try {
    const result = await api("/api/performance/check", { method: "POST", body: JSON.stringify(payload) });
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n") || "The check completed without output.";
    $("#tuningOutput").textContent = `${result.label}\n${result.guidance}\n\n${output}`;
    $("#tuningGuidance").textContent = result.guidance;
    $("#tuningCheckStatus").textContent = "COMPLETE";
    renderTuningSignals(result, output);
    toast(`${result.label} completed`);
  } catch (error) {
    $("#tuningOutput").textContent = `${error.message}\n\nConfirm that the matching database client is in PATH and the account can read the required diagnostic views.`;
    $("#tuningCheckStatus").className = "";
    $("#tuningCheckStatus").textContent = "FAILED";
    $("#tuningAssessment").textContent = "Unavailable";
    $("#tuningAssessment").className = "review";
    $("#tuningAssessmentNote").textContent = "Review client and DB permissions";
    toast(error.message, true);
  } finally { setBusy(button, false); }
}

function countAuditSignals(output) {
  return String(output || "").split(/\r?\n/).filter((line) => /\b(error|failed|failure|fatal|panic|warning|warn|blocked|blocking|deadlock|timeout|unhealthy|degraded|crashloop|backoff|outofsync|unavailable)\b/i.test(line)).length;
}

function renderAuditResultCards(selector, results) {
  if (!results.length) return;
  $(selector).innerHTML = `<div class="audit-result-grid">${results.map((result) => `<details class="audit-result ${result.stopped ? "stopped" : result.ok ? "success" : "failed"}"><summary><span>${result.stopped ? "■" : result.ok ? "✓" : "!"}</span><div><b>${escapeHtml(result.label)}</b><small>${result.ok ? `${result.durationMs.toLocaleString()} ms · ${result.signals} review signals` : escapeHtml(result.error || "Inspection failed")}</small></div><em class="${result.changed ? "changed" : ""}">${result.changed ? "CHANGED" : result.stopped ? "STOPPED" : result.ok ? "PASSED" : "FAILED"}</em></summary><pre class="${result.ok ? "" : "error"}">${escapeHtml(result.output || result.error || "No output returned")}</pre></details>`).join("")}<div class="audit-copy-note">Select any result to expand its full local output.</div></div>`;
}

function updateSnapshotTarget() {
  const engine = $("#snapshotEngine").value;
  const names = { oracle: "Oracle", postgres: "PostgreSQL", mongodb: "MongoDB", mysql: "MySQL", sqlserver: "SQL Server" };
  $("#snapshotTarget").textContent = `${names[engine]} · ${$("#sqlHost").value.trim() || "localhost"}:${$("#sqlPort").value.trim()}`;
}

function updateDbSnapshotSummary(total, started) {
  const results = state.dbSnapshotResults;
  const passed = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok).length;
  const signals = results.reduce((sum, result) => sum + result.signals, 0);
  $("#dbSnapshotCompleted").textContent = `${results.length} / ${total}`;
  $("#dbSnapshotPassed").textContent = passed.toLocaleString();
  $("#dbSnapshotFailed").textContent = failed.toLocaleString();
  $("#dbSnapshotSignals").textContent = signals.toLocaleString();
  $("#dbSnapshotDuration").textContent = started ? `${Math.round(performance.now() - started).toLocaleString()} ms` : "—";
  $("#dbSnapshotProgress").style.width = `${total ? Math.round(100 * results.length / total) : 0}%`;
  renderAuditResultCards("#dbSnapshotResults", results);
}

async function runDatabaseSnapshot() {
  const engine = $("#snapshotEngine").value;
  syncPerformanceEngine(engine);
  const allChecks = Object.keys(tuningActions[engine]);
  const checks = $("#snapshotDepth").value === "full" ? allChecks : allChecks.slice(0, 5);
  const button = $("#runDbSnapshot");
  const stop = $("#stopDbSnapshot");
  const started = performance.now();
  state.dbSnapshotStop = false; state.dbSnapshotResults = [];
  setBusy(button, true, "Running snapshot…"); stop.disabled = false;
  $("#dbSnapshotResults").innerHTML = '<div class="audit-empty"><span>DB</span><b>Health snapshot running</b><p>Results appear here as each fixed diagnostic check completes.</p></div>';
  updateDbSnapshotSummary(checks.length, started);
  for (let index = 0; index < checks.length; index += 1) {
    if (state.dbSnapshotStop) break;
    const check = checks[index];
    const detail = tuningActions[engine][check];
    $("#dbSnapshotProgressText").textContent = `Running ${index + 1} of ${checks.length} · ${detail[0]}`;
    const itemStarted = performance.now();
    try {
      const result = await api("/api/performance/check", { method: "POST", body: JSON.stringify({ ...connection(), engine, check, timeoutMs: Number($("#perfTimeout").value) }) });
      const fullOutput = [result.stdout, result.stderr].filter(Boolean).join("\n") || "Check completed without output.";
      const output = fullOutput.length > 300000 ? `${fullOutput.slice(0, 300000)}\n\n[Output shortened in snapshot view]` : fullOutput;
      state.dbSnapshotResults.push({ id: check, label: detail[0], ok: true, durationMs: result.durationMs, signals: countAuditSignals(output), output: `${result.guidance}\n\n${output}` });
    } catch (error) {
      state.dbSnapshotResults.push({ id: check, label: detail[0], ok: false, durationMs: Math.round(performance.now() - itemStarted), signals: 1, error: error.message, output: `${error.message}\n\nThe account may need an approved diagnostic privilege, or the matching client/view may not be available.` });
    }
    updateDbSnapshotSummary(checks.length, started);
  }
  const stopped = state.dbSnapshotStop;
  $("#dbSnapshotProgressText").textContent = stopped ? `Stopped after ${state.dbSnapshotResults.length} of ${checks.length} checks` : `Completed ${checks.length} checks · ${new Date().toLocaleTimeString()}`;
  if (!stopped) $("#dbSnapshotProgress").style.width = "100%";
  state.dbSnapshotStop = false; stop.disabled = true; setBusy(button, false);
  toast(stopped ? "Database snapshot stopped" : "Database health snapshot completed", false);
}

function updateOracleXrayTarget() {
  if (!$("#oracleXrayTarget")) return;
  const host = $("#sqlHost").value.trim() || "localhost";
  const port = $("#sqlPort").value.trim() || "1521";
  const service = $("#sqlDatabase").value.trim() || "ORCL";
  $("#oracleXrayTarget").textContent = `${host}:${port} / ${service}`;
}

function oracleXrayResultStatus(definition) {
  if (state.oracleXray.runningId === definition.id) return { key: "running", label: "RUNNING" };
  const result = state.oracleXray.results.find((item) => item.id === definition.id);
  if (result) {
    if (!result.ok) return { key: "failed", label: "UNAVAILABLE" };
    if (["HIGH", "MEDIUM"].includes(result.analysis?.severity)) return { key: "review", label: result.analysis.severity };
    return { key: "passed", label: "CAPTURED" };
  }
  if (!state.oracleXray.running && state.oracleXray.stop && state.oracleXray.results.length) return { key: "stopped", label: "NOT RUN" };
  return { key: "", label: "PENDING" };
}

function renderOracleXraySteps() {
  const catalog = state.oracleXray.catalog;
  if (!catalog.length) return;
  $("#oracleXraySteps").innerHTML = catalog.map((definition) => {
    const status = oracleXrayResultStatus(definition);
    const active = state.oracleXray.activeId === definition.id ? " active" : "";
    return `<button type="button" class="${status.key}${active}" data-oracle-xray-step="${escapeHtml(definition.id)}"><i></i><span>${escapeHtml(definition.label.toUpperCase())}</span><small>${escapeHtml(status.label)}</small></button>`;
  }).join("");
  $$("[data-oracle-xray-step]").forEach((button) => button.addEventListener("click", () => selectOracleXrayStep(button.dataset.oracleXrayStep)));
}

function oracleXrayResultOutput(definition, result) {
  if (!result) return `${definition.label}\n${definition.phase} evidence · ${definition.source}\n\nPurpose\n${definition.guidance}\n\nThis step has not run yet.`;
  const analysis = result.analysis;
  const evidence = result.output || result.error || "No output returned.";
  const analysisText = analysis ? [
    `Assessment: ${analysis.severity}`,
    `Finding: ${analysis.headline}`,
    `Signals: ${analysis.signals}`,
    analysis.markers?.length ? `Markers: ${analysis.markers.join(", ")}` : "",
    analysis.errorCodes?.length ? `Oracle errors: ${analysis.errorCodes.join(", ")}` : "",
  ].filter(Boolean).join("\n") : "Assessment: unavailable — inspect the client, privilege, license, and Oracle-version message below.";
  return `${definition.label}\n${definition.phase} evidence · ${definition.source}\n${result.durationMs.toLocaleString()} ms\n\nPurpose\n${definition.guidance}\n\nAutomatic assessment\n${analysisText}\n\nRaw Oracle output\n${evidence}`;
}

function selectOracleXrayStep(id) {
  const definition = state.oracleXray.catalog.find((item) => item.id === id);
  if (!definition) return;
  state.oracleXray.activeId = id;
  const result = state.oracleXray.results.find((item) => item.id === id);
  $("#oracleXraySelectedPhase").textContent = definition.phase.toUpperCase();
  $("#oracleXraySelectedLabel").textContent = definition.label;
  $("#oracleXraySelectedSource").textContent = definition.source;
  $("#oracleXrayOutput").textContent = oracleXrayResultOutput(definition, result);
  renderOracleXraySteps();
}

function summarizeOracleXrayResults(results, total = 22) {
  const completed = results.length;
  const passed = results.filter((result) => result.ok).length;
  const failed = completed - passed;
  const signals = results.reduce((sum, result) => sum + Number(result.analysis?.signals || 0), 0);
  const high = results.filter((result) => result.analysis?.severity === "HIGH").length;
  const medium = results.filter((result) => result.analysis?.severity === "MEDIUM").length;
  const score = Math.max(0, 100 - high * 12 - medium * 6 - failed * 2);
  const markerAdvice = {
    XRAY_SLOW_AVG: ["Workload efficiency", "Average elapsed time is high. Compare plan hashes and per-execution reads before changing SQL or indexes."],
    XRAY_WAIT_SAMPLE: ["Wait pressure", "Active Session History contains non-idle waits. Rank the events and correlate their plan lines."],
    XRAY_ALERT: ["Database correlation", "The alert stream contains a recent priority message. Correlate its timestamp with the SQL execution."],
    XRAY_LONG_REMAINING: ["Long operation", "A live long operation estimates more than five minutes remaining. Confirm progress is advancing."],
    XRAY_MONITOR_ERROR: ["Monitored execution error", "SQL Monitor reports an error state. Inspect the report and Oracle error details."],
    XRAY_LONG_RUNNING: ["Long-running execution", "A monitored execution has exceeded five minutes. Review its current plan line, waits and I/O."],
    XRAY_NO_STATS: ["Missing partition statistics", "A referenced partition has never been analyzed. Validate the maintenance window and gather policy."],
    XRAY_STALE_STATS: ["Stale partition statistics", "Referenced partition statistics are stale. Check incremental statistics and recent data changes."],
    XRAY_BLOCKED_SESSION: ["Blocking chain", "The application query is blocked or participates in a blocker chain. Identify the owning transaction before intervention."],
    XRAY_PX_DOWNGRADE: ["Parallel downgrade", "Allocated parallel servers are below the requested degree. Inspect resource pressure and parallel limits."],
    XRAY_PX_WAIT: ["Parallel wait pressure", "Parallel workers accumulated non-idle waits. Compare skew and wait time across slave sessions."],
    XRAY_SHARED_MISMATCH: ["Cursor sharing", "Child cursor sharing mismatches were found. Review bind metadata, optimizer environment and invalidations."],
    XRAY_HIGH_UNDO: ["Undo pressure", "An executing session owns a large undo footprint. Review transaction scope and commit behavior."],
    XRAY_WAITING: ["Current wait", "A session executing this SQL_ID is waiting on a non-idle event. Investigate the event and blocker context."],
    XRAY_HIGH_IO_LATENCY: ["I/O latency", "Average User I/O wait exceeded the review threshold. Correlate objects, storage latency and plan access paths."],
  };
  const markerMap = new Map();
  results.filter((result) => result.ok).forEach((result) => (result.analysis?.markers || []).forEach((marker) => {
    if (!markerAdvice[marker]) return;
    const current = markerMap.get(marker) || { count: 0, steps: new Set(), severity: result.analysis.severity };
    current.count += 1; current.steps.add(result.label); if (result.analysis.severity === "HIGH") current.severity = "HIGH";
    markerMap.set(marker, current);
  }));
  const findings = [...markerMap.entries()].map(([marker, detail]) => ({ marker, severity: detail.severity, title: markerAdvice[marker][0], detail: `${markerAdvice[marker][1]} Evidence: ${[...detail.steps].join(", ")}.` }));
  const oracleErrors = [...new Set(results.flatMap((result) => result.analysis?.errorCodes || []))];
  if (oracleErrors.length) findings.unshift({ marker: "ORACLE", severity: "HIGH", title: "Oracle errors returned", detail: `${oracleErrors.join(", ")} appeared in diagnostic evidence. Resolve or correlate these errors before tuning the execution plan.` });
  if (failed) findings.push({ marker: "ACCESS", severity: "MEDIUM", title: `${failed} evidence source${failed === 1 ? " is" : "s are"} unavailable`, detail: "Review the selected Oracle account privileges, installed client, database version, and licensed pack access. Other checks completed independently." });
  if (!findings.length && completed) findings.push({ marker: "CLEAR", severity: "INFO", title: "No automatic high-risk marker", detail: "Review captured plans, workload trends and row-source statistics before concluding the SQL is healthy; zero current rows may mean the query is not active now." });
  return { total, completed, passed, failed, signals, high, medium, score, findings };
}

function renderOracleXrayDiagnosis(summary) {
  const status = summary.high ? "High-priority evidence" : summary.medium || summary.failed ? "Review recommended" : summary.completed ? "Evidence captured" : "Not analyzed";
  $("#oracleXrayDiagnosisStatus").textContent = status;
  if (!summary.findings.length) {
    $("#oracleXrayDiagnosis").innerHTML = '<div class="oracle-xray-empty"><span>SQL</span><b>Application performance evidence</b><p>Run the sequence to correlate workload, runtime, optimizer, cursor, parallel, storage and database evidence.</p></div>';
    return;
  }
  $("#oracleXrayDiagnosis").innerHTML = `<div class="oracle-xray-findings">${summary.findings.map((finding) => `<article class="oracle-xray-finding ${finding.severity.toLowerCase()}"><span>${escapeHtml(finding.severity)}</span><div><b>${escapeHtml(finding.title)}</b><p>${escapeHtml(finding.detail)}</p></div></article>`).join("")}</div>`;
}

function updateOracleXraySummary(total = state.oracleXray.catalog.length || 22) {
  const summary = summarizeOracleXrayResults(state.oracleXray.results, total);
  $("#oracleXrayScore").textContent = summary.completed ? summary.score : "—";
  $("#oracleXrayScore").className = !summary.completed ? "" : summary.score >= 85 ? "good" : summary.score >= 60 ? "warn" : "bad";
  $("#oracleXrayScoreNote").textContent = summary.completed ? `${summary.high} high · ${summary.medium} medium` : "No evidence yet";
  $("#oracleXrayCompleted").textContent = `${summary.completed} / ${summary.total}`;
  $("#oracleXraySignals").textContent = summary.signals.toLocaleString();
  $("#oracleXrayUnavailable").textContent = summary.failed.toLocaleString();
  $("#oracleXrayDuration").textContent = state.oracleXray.startedAt ? `${Math.round(performance.now() - state.oracleXray.startedAt).toLocaleString()} ms` : "—";
  $("#oracleXrayProgress").style.width = `${summary.total ? Math.round(100 * summary.completed / summary.total) : 0}%`;
  renderOracleXrayDiagnosis(summary);
  renderOracleXraySteps();
  return summary;
}

async function loadOracleXrayCatalog() {
  try {
    const result = await api("/api/performance/oracle-sql-id/catalog");
    state.oracleXray.catalog = result.catalog || [];
    state.oracleXray.activeId = state.oracleXray.activeId || state.oracleXray.catalog[0]?.id || "";
    updateOracleXraySummary(state.oracleXray.catalog.length);
    if (state.oracleXray.activeId) selectOracleXrayStep(state.oracleXray.activeId);
  } catch (error) {
    $("#oracleXrayProgressText").textContent = `Catalog unavailable · ${error.message}`;
  }
}

function clearOracleXray() {
  if (state.oracleXray.running) return toast("Stop the active sequence before clearing it", true);
  state.oracleXray.results = []; state.oracleXray.stop = false; state.oracleXray.runningId = ""; state.oracleXray.startedAt = 0;
  state.oracleXray.activeId = state.oracleXray.catalog[0]?.id || "";
  $("#oracleXrayStatus").textContent = "READY";
  $("#oracleXrayStatus").className = "";
  $("#oracleXrayStatusNote").textContent = "Waiting to start";
  $("#oracleXrayProgressText").textContent = "Ready · enter an Oracle SQL_ID";
  updateOracleXraySummary();
  if (state.oracleXray.activeId) selectOracleXrayStep(state.oracleXray.activeId);
}

async function runOracleXray() {
  if (state.oracleXray.running) return;
  if (!state.oracleXray.catalog.length) await loadOracleXrayCatalog();
  if (!state.oracleXray.catalog.length) return toast("Oracle SQL_ID check catalog is unavailable", true);
  const identifier = $("#oracleXrayIdentifier").value.trim().toLowerCase();
  if (!/^[a-z0-9]{13}$/.test(identifier)) return toast("Enter a valid 13-character Oracle SQL_ID", true);
  syncPerformanceEngine("oracle"); updateOracleXrayTarget();
  if ($("#sqlIdentifier")) $("#sqlIdentifier").value = identifier;
  const button = $("#runOracleXray"); const stopButton = $("#stopOracleXray"); const total = state.oracleXray.catalog.length;
  state.oracleXray.results = []; state.oracleXray.stop = false; state.oracleXray.running = true; state.oracleXray.startedAt = performance.now();
  setBusy(button, true, "Running sequence…"); stopButton.disabled = false;
  $("#oracleXrayStatus").textContent = "RUNNING"; $("#oracleXrayStatus").className = "warn"; $("#oracleXrayStatusNote").textContent = `SQL_ID ${identifier}`;
  updateOracleXraySummary(total);
  for (let index = 0; index < total; index += 1) {
    if (state.oracleXray.stop) break;
    const definition = state.oracleXray.catalog[index]; const itemStarted = performance.now();
    state.oracleXray.runningId = definition.id; state.oracleXray.activeId = definition.id;
    $("#oracleXrayProgressText").textContent = `Running ${index + 1} of ${total} · ${definition.label}`;
    $("#oracleXrayOutput").textContent = `${definition.label}\n${definition.phase} evidence · ${definition.source}\n\nRunning fixed read-only Oracle diagnostic…`;
    renderOracleXraySteps();
    try {
      const result = await api("/api/performance/oracle-sql-id/check", { method: "POST", body: JSON.stringify({ ...connection(), engine: "oracle", identifier, check: definition.id, packScope: $("#oraclePackScope").value, timeoutMs: Number($("#oracleXrayTimeout").value) }) });
      const fullOutput = [result.stdout, result.stderr].filter(Boolean).join("\n") || "No current rows returned.";
      state.oracleXray.results.push({ id: definition.id, label: definition.label, ok: true, durationMs: result.durationMs, output: fullOutput.length > 500000 ? `${fullOutput.slice(0, 500000)}\n\n[Output shortened in sequence view]` : fullOutput, analysis: result.analysis });
    } catch (error) {
      state.oracleXray.results.push({ id: definition.id, label: definition.label, ok: false, durationMs: Math.round(performance.now() - itemStarted), error: error.message, output: `${error.message}\n\nThis evidence source failed independently. Check the Oracle client, account privilege, database version, and Diagnostics/Tuning Pack authorization where applicable.` });
    }
    state.oracleXray.runningId = "";
    updateOracleXraySummary(total); selectOracleXrayStep(definition.id);
  }
  const stopped = state.oracleXray.stop;
  state.oracleXray.running = false; state.oracleXray.runningId = ""; stopButton.disabled = true; setBusy(button, false);
  const summary = updateOracleXraySummary(total);
  $("#oracleXrayStatus").textContent = stopped ? "STOPPED" : "COMPLETE";
  $("#oracleXrayStatus").className = summary.high ? "bad" : summary.medium || summary.failed ? "warn" : "good";
  $("#oracleXrayStatusNote").textContent = stopped ? `${summary.completed} checks preserved` : `${summary.passed} captured · ${summary.failed} unavailable`;
  $("#oracleXrayProgressText").textContent = stopped ? `Stopped after ${summary.completed} of ${total} checks` : `Completed ${total} checks · ${new Date().toLocaleTimeString()}`;
  if (!stopped) $("#oracleXrayProgress").style.width = "100%";
  toast(stopped ? "Oracle SQL_ID sequence stopped" : "Oracle SQL_ID investigation completed", false);
}

function switchOracleTraceMode(mode) {
  const memory = mode !== "tkprof";
  $("#oracleMemoryPanel").classList.toggle("hidden", !memory);
  $("#tkprofPanel").classList.toggle("hidden", memory);
  $$("[data-oracle-trace-mode]").forEach((button) => button.classList.toggle("active", button.dataset.oracleTraceMode === (memory ? "memory" : "tkprof")));
}

function setOracleAnalysisState(kind, label) {
  $("#oracleAnalysisState").className = `oracle-analysis-state ${kind || ""}`.trim();
  $("#oracleAnalysisState").innerHTML = `<i></i>${escapeHtml(label)}`;
}

async function importOracleTrace(file) {
  if (!file) return;
  if (file.size > 6 * 1024 * 1024) return toast("Oracle trace import is limited to 6 MB", true);
  try {
    const text = await file.text();
    if (/\0/.test(text)) throw new Error("Binary trace content is not supported");
    state.oracleTraceSource = file.name || "Imported Oracle trace";
    $("#oracleTraceText").value = text;
    $("#oracleTraceFileName").textContent = state.oracleTraceSource;
    $("#oracleTraceFileMeta").textContent = `${formatCompareBytes(file.size)} · ${text.split(/\r?\n/).length.toLocaleString()} lines · in memory`;
    $("#oracleAnalysisSource").textContent = `${state.oracleTraceSource} is ready to analyze`;
    setOracleAnalysisState("", "READY");
    toast("Oracle trace loaded into browser memory");
  } catch (error) { toast(error.message, true); }
}

function loadOracleTraceSample() {
  const sample = `Oracle Database 19c Enterprise Edition Release 19.0.0.0.0
----- Current SQL Statement for this session (sql_id=8m5j1t2y4n6p9) -----
select /* trace lab */ c.customer_id, sum(o.amount)
from customers c join orders o on o.customer_id = c.customer_id
group by c.customer_id
***************************************
PARAMETERS USED BY THE OPTIMIZER
optimizer_features_enable = 19.1.0
_optimizer_cost_model = choose
***************************************
QUERY BLOCK SIGNATURE
CBQT: Considering cost-based transformation on query block SEL$1
SINGLE TABLE ACCESS PATH
  Access Path: TableScan
  cost: 42  resc: 42  resp: 42
Join order[1]: CUSTOMERS ORDERS
Best join order: 1
Final cost for query block SEL$1 - All Rows Plan: 84
BEGIN_OUTLINE_DATA
FULL(@"SEL$1" "C"@"SEL$1")
USE_HASH(@"SEL$1" "O"@"SEL$1")
END_OUTLINE_DATA`;
  state.oracleTraceSource = "Oracle 10053 example markers";
  $("#oracleTraceText").value = sample;
  $("#oracleTraceFileName").textContent = state.oracleTraceSource;
  $("#oracleTraceFileMeta").textContent = "Example only · replace with your approved trace";
  $("#oracleAnalysisSource").textContent = "Example markers are ready to analyze";
  setOracleAnalysisState("", "READY");
}

function oracleListCard(title, items, wide = false, warning = false) {
  const cleanItems = (items || []).filter(Boolean);
  return `<article class="oracle-analysis-card${wide ? " wide" : ""}"><header><b>${escapeHtml(title)}</b><span>${cleanItems.length.toLocaleString()}</span></header><ul class="oracle-analysis-list">${cleanItems.length ? cleanItems.map((item) => `<li class="${warning ? "warning" : ""}">${escapeHtml(item)}</li>`).join("") : "<li>No matching markers detected</li>"}</ul></article>`;
}

function formatOracleAnalysis(analysis) {
  const optimizer = analysis.optimizer;
  const decisions = [...optimizer.transformations, ...optimizer.accessPaths, ...optimizer.joinOrders, ...optimizer.costDecisions];
  const sections = [
    `Oracle Trace Lab summary`,
    `Source: ${analysis.sourceName}`,
    `Type: ${analysis.type}`,
    `Database: ${analysis.databaseVersion}`,
    `Lines: ${analysis.lines.toLocaleString()} | Bytes: ${analysis.bytes.toLocaleString()}`,
    `SQL IDs: ${analysis.sqlIds.join(", ") || "None detected"}`,
    `Cursors: ${analysis.cursorCount}`,
    `Calls: PARSE ${analysis.counts.parse}, EXEC ${analysis.counts.execute}, FETCH ${analysis.counts.fetch}, WAIT ${analysis.counts.wait}, STAT ${analysis.counts.stat}`,
    `\nRecommendations:\n${analysis.recommendations.map((item) => `- ${item}`).join("\n")}`,
  ];
  if (optimizer.sqlText) sections.push(`\nCurrent SQL:\n${optimizer.sqlText}`);
  if (analysis.sqlTexts.length) sections.push(`\nSQL statements:\n${analysis.sqlTexts.join("\n\n---\n\n")}`);
  if (optimizer.optimizerParameters.length) sections.push(`\nOptimizer parameters:\n${optimizer.optimizerParameters.map((item) => `${item.name} = ${item.value}`).join("\n")}`);
  if (decisions.length) sections.push(`\nOptimizer decisions:\n${decisions.join("\n")}`);
  if (optimizer.outlineHints.length) sections.push(`\nOutline hints:\n${optimizer.outlineHints.join("\n")}`);
  if (analysis.topWaits.length) sections.push(`\nTop waits:\n${analysis.topWaits.map((item) => `${item.event}: ${item.count} waits, ${item.elapsedMicros} us`).join("\n")}`);
  if (analysis.errors.length) sections.push(`\nWarnings and errors:\n${analysis.errors.join("\n")}`);
  return sections.join("\n");
}

function renderOracleTraceAnalysis(analysis) {
  state.oracleTraceAnalysis = analysis;
  state.oracleAnalysisText = formatOracleAnalysis(analysis);
  const optimizer = analysis.optimizer;
  const decisions = optimizer.transformations.length + optimizer.accessPaths.length + optimizer.joinOrders.length + optimizer.costDecisions.length + optimizer.outlineHints.length;
  const callLines = analysis.counts.parse + analysis.counts.execute + analysis.counts.fetch + analysis.counts.wait;
  $("#oracleTraceType").textContent = analysis.type.replace(" Optimizer Trace", "").replace(" SQL Trace", "");
  $("#oracleTraceVersion").textContent = analysis.databaseVersion;
  $("#oracleTraceSql").textContent = `${analysis.sqlIds.length} / ${analysis.cursorCount}`;
  $("#oracleTraceDecisions").textContent = decisions.toLocaleString();
  $("#oracleTraceCalls").textContent = callLines.toLocaleString();
  $("#oracleTraceWarnings").textContent = analysis.errors.length.toLocaleString();
  $("#oracleAnalysisSource").textContent = `${analysis.sourceName} · ${analysis.lines.toLocaleString()} lines · ${formatCompareBytes(analysis.bytes)}`;
  const cards = [];
  cards.push(oracleListCard("Tuning guidance", analysis.recommendations, true));
  if (optimizer.sqlText || analysis.sqlTexts.length) cards.push(`<article class="oracle-analysis-card wide"><header><b>Captured SQL</b><span>${1 + analysis.sqlTexts.length}</span></header><pre>${escapeHtml([optimizer.sqlText, ...analysis.sqlTexts].filter(Boolean).join("\n\n--- NEXT STATEMENT ---\n\n"))}</pre></article>`);
  if (/10053/.test(analysis.type)) {
    cards.push(oracleListCard("Transformations", optimizer.transformations));
    cards.push(oracleListCard("Access paths", optimizer.accessPaths));
    cards.push(oracleListCard("Join orders", optimizer.joinOrders));
    cards.push(oracleListCard("Cost decisions", optimizer.costDecisions));
    cards.push(oracleListCard("Query blocks", optimizer.queryBlocks));
    cards.push(oracleListCard("Outline hints", optimizer.outlineHints));
    cards.push(oracleListCard("Optimizer parameters", optimizer.optimizerParameters.map((item) => `${item.name} = ${item.value}`), true));
  }
  const activeCalls = Object.entries(analysis.calls).filter(([, value]) => value.count);
  if (activeCalls.length) cards.push(`<article class="oracle-analysis-card wide"><header><b>10046 cursor call totals</b><span>${activeCalls.length}</span></header><table class="oracle-call-table"><thead><tr><th>CALL</th><th>COUNT</th><th>CPU ms</th><th>ELAPSED ms</th><th>DISK</th><th>CONSISTENT</th><th>CURRENT</th><th>ROWS</th></tr></thead><tbody>${activeCalls.map(([name, value]) => `<tr><td>${name}</td><td>${value.count.toLocaleString()}</td><td>${(value.cpuMicros / 1000).toFixed(3)}</td><td>${(value.elapsedMicros / 1000).toFixed(3)}</td><td>${value.physicalReads.toLocaleString()}</td><td>${value.consistentReads.toLocaleString()}</td><td>${value.currentReads.toLocaleString()}</td><td>${value.rows.toLocaleString()}</td></tr>`).join("")}</tbody></table></article>`);
  if (analysis.topWaits.length) cards.push(oracleListCard("Top wait events", analysis.topWaits.map((item) => `${item.event} · ${item.count} waits · ${(item.elapsedMicros / 1000).toFixed(3)} ms`)));
  if (analysis.errors.length) cards.push(oracleListCard("Warnings and errors", analysis.errors, false, true));
  $("#oracleTraceAnalysis").innerHTML = `<div class="oracle-analysis-grid">${cards.join("")}</div>`;
  setOracleAnalysisState("complete", "COMPLETE");
}

async function analyzeOracleTrace() {
  const text = $("#oracleTraceText").value;
  if (!text.trim()) return toast("Paste or import an Oracle trace first", true);
  const button = $("#analyzeOracleTrace");
  setBusy(button, true, "Analyzing…");
  setOracleAnalysisState("running", "ANALYZING");
  $("#oracleAnalysisSource").textContent = "Parsing trace markers in local memory…";
  try {
    const result = await api("/api/oracle/trace/analyze", { method: "POST", body: JSON.stringify({ text, sourceName: state.oracleTraceSource }) });
    renderOracleTraceAnalysis(result.analysis);
    toast(`${result.analysis.type} analysis completed`);
  } catch (error) {
    setOracleAnalysisState("failed", "FAILED");
    $("#oracleAnalysisSource").textContent = error.message;
    toast(error.message, true);
  } finally { setBusy(button, false); }
}

function clearOracleTrace() {
  state.oracleTraceSource = "Pasted Oracle trace"; state.oracleTraceAnalysis = null; state.oracleAnalysisText = "";
  $("#oracleTraceFile").value = ""; $("#oracleTraceText").value = "";
  $("#oracleTraceFileName").textContent = "Choose Oracle .trc file"; $("#oracleTraceFileMeta").textContent = "Up to 6 MB · processed in local memory";
  $("#oracleTraceType").textContent = "Not analyzed"; $("#oracleTraceVersion").textContent = "Oracle version not detected";
  $("#oracleTraceSql").textContent = "0"; $("#oracleTraceDecisions").textContent = "0"; $("#oracleTraceCalls").textContent = "0"; $("#oracleTraceWarnings").textContent = "0";
  $("#oracleAnalysisSource").textContent = "Paste or import a trace to begin"; setOracleAnalysisState("", "READY");
  $("#oracleTraceAnalysis").innerHTML = '<div class="oracle-analysis-empty"><span>10053</span><b>Optimizer trace intelligence</b><p>DBridge detects optimizer parameters, query blocks, transformations, access paths, join orders, cost decisions, outline hints, cursor calls and wait events.</p></div>';
}

function renderTkprofReport() {
  const filter = $("#tkprofFilter").value.trim().toLocaleLowerCase();
  $("#tkprofOutput").textContent = filter ? state.tkprofReport.split(/\r?\n/).filter((line) => line.toLocaleLowerCase().includes(filter)).join("\n") || "No TKPROF lines match this filter." : state.tkprofReport || "TKPROF output will appear here.";
}

async function runTkprof() {
  const button = $("#runTkprof");
  const payload = { path: $("#tkprofPath").value.trim(), sort: $("#tkprofSort").value, print: Number($("#tkprofPrint").value), aggregate: $("#tkprofAggregate").checked, includeWaits: $("#tkprofWaits").checked, includeSys: $("#tkprofSys").checked };
  setBusy(button, true, "Running…");
  $("#tkprofRunState").className = "oracle-analysis-state running"; $("#tkprofRunState").innerHTML = "<i></i>RUNNING";
  $("#tkprofSource").textContent = "Running the approved local TKPROF client…";
  state.tkprofReport = ""; renderTkprofReport();
  try {
    const result = await api("/api/oracle/tkprof", { method: "POST", body: JSON.stringify(payload) });
    state.tkprofReport = result.report;
    $("#tkprofStatements").textContent = result.summary.sqlStatements.toLocaleString();
    $("#tkprofSqlIds").textContent = result.summary.sqlIds.length.toLocaleString();
    $("#tkprofSize").textContent = formatCompareBytes(result.summary.bytes);
    $("#tkprofDuration").textContent = `${result.durationMs.toLocaleString()} ms`;
    $("#tkprofStatus").textContent = result.reportTruncated ? "Truncated" : "Complete";
    $("#tkprofRunState").className = "oracle-analysis-state complete"; $("#tkprofRunState").innerHTML = "<i></i>COMPLETE";
    $("#tkprofSource").textContent = `${result.sourceName} · sorted by ${result.sort}${result.reportTruncated ? " · first 2 MB shown" : ""}`;
    renderTkprofReport();
    toast("TKPROF report completed");
  } catch (error) {
    $("#tkprofRunState").className = "oracle-analysis-state failed"; $("#tkprofRunState").innerHTML = "<i></i>FAILED";
    $("#tkprofStatus").textContent = "Failed"; $("#tkprofSource").textContent = error.message;
    state.tkprofReport = error.message; renderTkprofReport(); toast(error.message, true);
  } finally { setBusy(button, false); }
}

async function diagnoseSql() {
  const button = $("#diagnoseSql");
  const engine = $("#perfEngine").value;
  const payload = { ...connection(), engine, identifier: $("#sqlIdentifier").value.trim(), timeoutMs: Number($("#perfTimeout").value) };
  setBusy(button, true, "Diagnosing…");
  $("#performanceOutput").textContent = "Querying live performance views…";
  try {
    const result = await api("/api/performance/diagnose", { method: "POST", body: JSON.stringify(payload) });
    const output = result.stdout || "No matching performance record was returned.";
    $("#performanceOutput").textContent = `${output}\n\nDiagnostic query:\n${result.diagnosticSql}`;
    const numbers = output.match(/\d+(?:\.\d+)?/g) || [];
    const values = [numbers[2] ? `${numbers[2]} s` : `${result.durationMs} ms`, numbers[3] ? numbers[3] : "See output", numbers[1] || "1", result.durationMs > 10000 ? "High" : "Review"];
    $$("#diagnosticCards article strong").forEach((el, i) => { el.textContent = values[i]; el.className = i === 3 ? (values[i] === "High" ? "risk-high" : "neutral") : ""; });
    toast("Performance diagnosis completed");
  } catch (error) {
    $("#performanceOutput").textContent = `${error.message}\n\nCheck that the matching client is installed and the database account can read its performance views.`;
    toast(error.message, true);
  } finally { setBusy(button, false); }
}

const sqlRecommendationEngineNames = { oracle: "Oracle SQL_ID", postgres: "PostgreSQL queryid", mongodb: "MongoDB operation/comment ID", mysql: "MySQL digest", sqlserver: "SQL Server query hash" };

function recommendationReportText(result) {
  const heading = `${sqlRecommendationEngineNames[result.engine] || result.engine}: ${result.identifier}`;
  const metadata = `Evidence query: ${result.durationMs.toLocaleString()} ms | Findings: ${result.findings.length}`;
  const findings = result.findings.map((item, index) => `${index + 1}. [${item.severity}] ${item.finding}\nEvidence: ${item.evidence}\nRecommended action: ${item.recommendation}`).join("\n\n");
  return `${heading}\n${metadata}\n\n${findings}\n\nImportant: Validate the plan, workload window and business SLA before applying a change.`;
}

function resetRecommendationSummary() {
  ["Critical", "High", "Medium", "Info"].forEach((severity) => { $(`#recommendation${severity}`).textContent = "0"; });
}

function renderSqlRecommendations(result) {
  resetRecommendationSummary();
  ["critical", "high", "medium", "info"].forEach((severity) => { $(`#recommendation${severity[0].toUpperCase()}${severity.slice(1)}`).textContent = (result.summary?.[severity] || 0).toLocaleString(); });
  const results = $("#sqlRecommendationResults");
  results.innerHTML = result.findings.map((item, index) => `<article class="sql-finding severity-${item.severity.toLowerCase()}"><div class="finding-rank">${String(index + 1).padStart(2, "0")}</div><div class="finding-content"><div class="finding-head"><span>${escapeHtml(item.severity)}</span><h3>${escapeHtml(item.finding)}</h3></div><div class="finding-detail evidence"><b>Evidence</b><p>${escapeHtml(item.evidence)}</p></div><div class="finding-detail action"><b>Recommended action</b><p>${escapeHtml(item.recommendation)}</p></div></div></article>`).join("");
  state.sqlRecommendationText = recommendationReportText(result);
}

async function recommendSql() {
  const button = $("#recommendSql");
  const engine = $("#perfEngine").value;
  const identifier = $("#sqlIdentifier").value.trim();
  if (!identifier) return toast("Enter a SQL identifier first", true);
  const payload = { ...connection(), engine, identifier, timeoutMs: Number($("#perfTimeout").value) };
  setBusy(button, true, "Analyzing evidence…");
  resetRecommendationSummary();
  $("#sqlRecommendationResults").innerHTML = '<div class="recommendation-loading"><i></i><div><b>Reading live workload evidence</b><p>Running a fixed read-only query against the selected database performance view…</p></div></div>';
  try {
    const result = await api("/api/performance/recommend", { method: "POST", body: JSON.stringify(payload) });
    renderSqlRecommendations(result);
    toast(`${result.findings.length} SQL recommendation findings ready`);
  } catch (error) {
    state.sqlRecommendationText = "";
    $("#sqlRecommendationResults").innerHTML = `<div class="recommendation-error"><span>!</span><div><b>Recommendation analysis could not run</b><p>${escapeHtml(error.message)}</p><small>Confirm that the matching database client is in PATH and the account can read the required performance view.</small></div></div>`;
    toast(error.message, true);
  } finally { setBusy(button, false); }
}

const defaultTuningRules = [
  { id: "avg_elapsed_ms", name: "Average elapsed time", metric: "avg_elapsed_ms", warning: 250, high: 1000, unit: "ms / execution" },
  { id: "logical_reads_per_execution", name: "Logical reads", metric: "logical_reads_per_execution", warning: 25000, high: 100000, unit: "reads / execution" },
  { id: "physical_reads_per_execution", name: "Physical reads", metric: "physical_reads_per_execution", warning: 2500, high: 10000, unit: "reads / execution" },
  { id: "examined_ratio", name: "Examined-to-returned ratio", metric: "examined_ratio", warning: 25, high: 100, unit: "ratio" },
  { id: "plan_versions", name: "Plan or cursor versions", metric: "plan_versions", warning: 5, high: 20, unit: "versions" },
  { id: "long_runtime_seconds", name: "Active operation runtime", metric: "long_runtime_seconds", warning: 30, high: 300, unit: "seconds" }
];

function planNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const match = String(value ?? "").replaceAll(",", "").match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);
  return match ? Number(match[0]) || 0 : 0;
}

function planFingerprint(nodes) {
  const source = nodes.map((node) => `${node.depth}:${node.operation}:${node.object}`).join("|").toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `PLAN-${(hash >>> 0).toString(16).padStart(8, "0").toUpperCase()}`;
}

function planObjectValue(object, keys) {
  for (const key of keys) if (object?.[key] !== undefined && object?.[key] !== null) return object[key];
  return "";
}

function parseJsonPlan(parsed) {
  const nodes = [];
  const seen = new WeakSet();
  const operationKeys = ["Node Type", "node_type", "operation", "operator", "stage", "PhysicalOp", "LogicalOp", "access_type", "select_type"];
  const objectKeys = ["Relation Name", "relation_name", "Index Name", "index_name", "table_name", "table", "namespace", "object", "Object"];
  const childKeys = new Set(["Plans", "plans", "children", "Children", "inputStage", "inputStages", "outerStage", "innerStage", "winningPlan", "queryPlan", "executionStages", "nested_loop", "query_block", "shards"]);
  function walk(value, depth = 0, parentKey = "") {
    if (!value || typeof value !== "object" || seen.has(value) || nodes.length >= 300) return;
    seen.add(value);
    if (Array.isArray(value)) { value.forEach((item) => walk(item, depth, parentKey)); return; }
    const operation = String(planObjectValue(value, operationKeys) || "").trim();
    const looksLikeNode = Boolean(operation) || (parentKey === "table" && (value.table_name || value.access_type));
    let childDepth = depth;
    if (looksLikeNode) {
      const costInfo = value.cost_info && typeof value.cost_info === "object" ? value.cost_info : {};
      const operationName = operation || `TABLE ${String(value.access_type || "ACCESS").toUpperCase()}`;
      nodes.push({ depth, operation: operationName.slice(0, 160), object: String(planObjectValue(value, objectKeys) || value.key || "").slice(0, 160), cost: planNumber(planObjectValue(value, ["Total Cost", "total_cost", "cost", "EstimatedTotalSubtreeCost"]) || costInfo.query_cost || costInfo.read_cost), estimatedRows: planNumber(planObjectValue(value, ["Plan Rows", "estimated_rows", "rows", "rows_examined_per_scan", "cardinality", "EstimateRows"])), actualRows: planNumber(planObjectValue(value, ["Actual Rows", "actual_rows", "nReturned", "nreturned", "ActualRows"])), timeMs: planNumber(planObjectValue(value, ["Actual Total Time", "actual_time", "executionTimeMillisEstimate", "executionTimeMillis", "ElapsedTime"])), raw: JSON.stringify(value).slice(0, 3000) });
      childDepth += 1;
    }
    for (const [key, child] of Object.entries(value)) if (child && typeof child === "object") walk(child, childKeys.has(key) ? childDepth : depth, key);
  }
  walk(parsed);
  return nodes;
}

function parseXmlPlan(text) {
  const documentNode = new DOMParser().parseFromString(text, "application/xml");
  if (documentNode.querySelector("parsererror")) return [];
  return [...documentNode.querySelectorAll("RelOp")].slice(0, 300).map((element, index) => {
    let depth = 0; let parent = element.parentElement;
    while (parent) { if (parent.localName === "RelOp") depth += 1; parent = parent.parentElement; }
    const object = element.querySelector("Object");
    const runtime = element.querySelector("RunTimeCountersPerThread");
    return { id: index + 1, depth, operation: element.getAttribute("PhysicalOp") || element.getAttribute("LogicalOp") || "RelOp", object: [object?.getAttribute("Schema"), object?.getAttribute("Table"), object?.getAttribute("Index")].filter(Boolean).join(".").replaceAll("[", "").replaceAll("]", ""), cost: planNumber(element.getAttribute("EstimatedTotalSubtreeCost")), estimatedRows: planNumber(element.getAttribute("EstimateRows")), actualRows: planNumber(runtime?.getAttribute("ActualRows")), timeMs: planNumber(runtime?.getAttribute("ActualElapsedms")), raw: element.textContent.slice(0, 3000) };
  });
}

function parseTextPlan(text) {
  const lines = String(text).split(/\r?\n/);
  const nodes = [];
  const headerLine = lines.find((line) => /^\s*\|.*operation/i.test(line));
  const headers = headerLine ? headerLine.split("|").map((value) => value.trim().toLowerCase()).filter(Boolean) : [];
  for (const line of lines) {
    if (nodes.length >= 300) break;
    if (/^\s*\|/.test(line)) {
      const rawColumns = line.split("|");
      const columns = rawColumns.map((value) => value.trim()).filter((value, index) => index > 0 || value);
      const id = columns[0]?.match(/^\*?\s*(\d+)/)?.[1];
      if (!id) continue;
      const operationIndex = Math.max(headers.indexOf("operation"), 1);
      const rawOperation = rawColumns[operationIndex + 1] || columns[operationIndex] || columns[1] || "Operator";
      const operationPadding = rawOperation.match(/^\s*/)?.[0].length || 0;
      const depth = Math.min(Math.max(Math.floor((operationPadding - 1) / 2), 0), 30);
      const rowIndex = headers.findIndex((value) => /^(?:a-rows|rows)$/.test(value));
      const estimateIndex = headers.findIndex((value) => /^(?:e-rows|cardinality)$/.test(value));
      const costIndex = headers.findIndex((value) => /^cost/.test(value));
      nodes.push({ depth, operation: rawOperation.trim(), object: columns[headers.indexOf("name")] || "", cost: planNumber(columns[costIndex]), estimatedRows: planNumber(columns[estimateIndex >= 0 ? estimateIndex : rowIndex]), actualRows: planNumber(columns[headers.indexOf("a-rows")]), timeMs: planNumber(columns[headers.indexOf("a-time")]), raw: line });
      continue;
    }
    if (!/(?:->|cost=|actual time=|scan|join|sort|aggregate|filter|lookup|exchange|spool)/i.test(line)) continue;
    const indent = line.match(/^\s*/)?.[0].length || 0;
    const operation = line.replace(/^\s*(?:->\s*)?/, "").split(/\s+\((?:cost|actual)/i)[0].trim();
    if (!operation || /^(?:planning time|execution time|filter:|rows removed)/i.test(operation)) continue;
    const cost = line.match(/cost=\s*[\d.]+\.\.([\d.]+)/i)?.[1] || line.match(/cost[=: ]+([\d.]+)/i)?.[1];
    const estimatedRows = line.match(/\brows=([\d.e+-]+)/i)?.[1];
    const actualRows = line.match(/actual[^)]*\brows=([\d.e+-]+)/i)?.[1];
    const timeMs = line.match(/actual time=[\d.]+\.\.([\d.]+)/i)?.[1] || line.match(/\btime[=: ]+([\d.]+)\s*ms/i)?.[1];
    nodes.push({ depth: Math.min(Math.floor(indent / 2), 30), operation: operation.slice(0, 160), object: operation.match(/\bon\s+([A-Za-z0-9_."\[\]-]+)/i)?.[1] || "", cost: planNumber(cost), estimatedRows: planNumber(estimatedRows), actualRows: planNumber(actualRows), timeMs: planNumber(timeMs), raw: line });
  }
  return nodes;
}

function analyzePlanContent(text, engine = "generic") {
  const source = String(text || "").trim();
  if (!source) throw new Error("Paste or import an execution plan first");
  if (source.length > 8 * 1024 * 1024) throw new Error("Execution plan input is limited to 8 MB");
  let nodes = [];
  if (/^\s*</.test(source)) nodes = parseXmlPlan(source);
  if (!nodes.length && /^[\s\[{]/.test(source)) { try { nodes = parseJsonPlan(JSON.parse(source)); } catch {} }
  if (!nodes.length) nodes = parseTextPlan(source);
  if (!nodes.length) throw new Error("No plan operators were detected. Use EXPLAIN text/JSON, DBMS_XPLAN, SQL Server XML, or MongoDB executionStats.");
  nodes = nodes.map((node, index) => ({ id: index + 1, depth: Math.min(Math.max(Number(node.depth || 0), 0), 30), operation: String(node.operation || "Operator").trim(), object: String(node.object || "").trim(), cost: planNumber(node.cost), estimatedRows: planNumber(node.estimatedRows), actualRows: planNumber(node.actualRows), timeMs: planNumber(node.timeMs), raw: String(node.raw || "") }));
  const findings = [];
  const add = (severity, title, evidence) => { if (!findings.some((item) => item.title === title && item.evidence === evidence)) findings.push({ severity, title, evidence }); };
  for (const node of nodes) {
    const context = `${node.operation} ${node.object} ${node.raw}`.toLowerCase();
    const rows = Math.max(node.actualRows, node.estimatedRows);
    const ratio = node.estimatedRows > 0 && node.actualRows > 0 ? Math.max(node.actualRows / node.estimatedRows, node.estimatedRows / node.actualRows) : 1;
    if (/collscan|seq(?:uential)? scan|table access full|full table scan|access_type["': ]+all/.test(context)) add(rows >= 10000 ? "HIGH" : "MEDIUM", "Full or collection scan", `${node.operation}${node.object ? ` on ${node.object}` : ""} processes approximately ${Math.round(rows).toLocaleString()} rows.`);
    if (/spill|tempdb|external merge|disk sort|temporary table/.test(context)) add("HIGH", "Disk spill or temporary work", `${node.operation} contains spill, disk sort, or temporary-work evidence.`);
    if (ratio >= 100) add("HIGH", "Severe cardinality estimate error", `${node.operation}: estimated ${Math.round(node.estimatedRows).toLocaleString()} versus actual ${Math.round(node.actualRows).toLocaleString()} rows (${ratio.toFixed(1)}× difference).`);
    else if (ratio >= 10) add("MEDIUM", "Cardinality estimate mismatch", `${node.operation}: estimated ${Math.round(node.estimatedRows).toLocaleString()} versus actual ${Math.round(node.actualRows).toLocaleString()} rows (${ratio.toFixed(1)}× difference).`);
    if (/nested loop/.test(context) && rows >= 100000) add("HIGH", "Large nested-loop input", `${node.operation} processes ${Math.round(rows).toLocaleString()} rows; validate the driving row source and lookup selectivity.`);
    if (/sort|hash aggregate|window/.test(context) && rows >= 100000) add("MEDIUM", "Large memory-sensitive operator", `${node.operation} handles ${Math.round(rows).toLocaleString()} rows and may require sort/hash memory or temporary storage.`);
    if (/key["': ]+null|no index|missing index/.test(context)) add("HIGH", "No usable index signal", `${node.operation} indicates a missing or unused access key.`);
  }
  if (!findings.length) add("INFO", "No high-risk pattern detected", "The parsed operators did not cross built-in scan, spill, cardinality, or row-volume screening rules.");
  const severityOrder = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  const maxCost = Math.max(...nodes.map((node) => node.cost), 0);
  const maxRows = Math.max(...nodes.map((node) => Math.max(node.actualRows, node.estimatedRows)), 0);
  nodes.forEach((node) => {
    const context = `${node.operation} ${node.raw}`.toLowerCase();
    const ratio = node.estimatedRows > 0 && node.actualRows > 0 ? Math.max(node.actualRows / node.estimatedRows, node.estimatedRows / node.actualRows) : 1;
    node.status = /spill|tempdb|collscan/.test(context) || ratio >= 100 ? "high" : /full|seq scan|sort|nested loop/.test(context) || ratio >= 10 ? "medium" : "normal";
  });
  const high = findings.filter((finding) => finding.severity === "HIGH").length;
  const medium = findings.filter((finding) => finding.severity === "MEDIUM").length;
  const score = Math.max(0, 100 - high * 18 - medium * 7);
  return { engine, score, totalCost: maxCost, estimatedRows: Math.max(...nodes.map((node) => node.estimatedRows), 0), actualRows: Math.max(...nodes.map((node) => node.actualRows), 0), warnings: high + medium, fingerprint: planFingerprint(nodes), operators: nodes, findings, analyzedAt: new Date().toISOString() };
}

function renderPlanAnalysis(plan) {
  state.investigation.currentPlan = plan;
  $("#planScore").textContent = `${plan.score}/100`; $("#planOperators").textContent = plan.operators.length.toLocaleString(); $("#planCost").textContent = plan.totalCost.toLocaleString(undefined, { maximumFractionDigits: 1 }); $("#planRows").textContent = Math.max(plan.actualRows, plan.estimatedRows).toLocaleString(undefined, { maximumFractionDigits: 0 }); $("#planWarnings").textContent = plan.warnings.toLocaleString(); $("#investigationRisk").textContent = `${plan.score}/100`;
  $("#planFindings").innerHTML = plan.findings.map((finding) => `<article class="plan-finding ${finding.severity.toLowerCase()}"><div><span>${escapeHtml(finding.severity)}</span><b>${escapeHtml(finding.title)}</b></div><p>${escapeHtml(finding.evidence)}</p></article>`).join("");
  const maxCost = Math.max(plan.totalCost, 1); const maxRows = Math.max(plan.actualRows, plan.estimatedRows, 1);
  $("#planVisual").innerHTML = plan.operators.map((node) => { const rows = Math.max(node.actualRows, node.estimatedRows); return `<article class="plan-node status-${node.status}" style="--depth:${node.depth}"><div class="plan-node-main"><span>${String(node.id).padStart(2, "0")}</span><div><b title="${escapeHtml(node.operation)}">${escapeHtml(node.operation)}</b><small title="${escapeHtml(node.object)}">${escapeHtml(node.object || "No object name")}</small></div></div><div class="node-meter"><span>COST <b>${node.cost.toLocaleString(undefined, { maximumFractionDigits: 1 })}</b></span><div><i style="width:${Math.max(2, Math.min(100, node.cost / maxCost * 100))}%"></i></div></div><div class="node-meter rows"><span>ROWS <b>${rows.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></span><div><i style="width:${Math.max(2, Math.min(100, rows / maxRows * 100))}%"></i></div></div><span class="node-status">${node.status === "normal" ? "NORMAL" : node.status === "medium" ? "REVIEW" : "HIGH"}</span></article>`; }).join("");
  $("#savePlanBaseline").disabled = false;
  if (!$("#baselineName").value) $("#baselineName").value = `${sqlAdapterUi[plan.engine]?.name || plan.engine} ${$("#planIdentifier").value.trim() || plan.fingerprint}`;
  updateInvestigationSummary();
}

async function analyzeVisualPlan() {
  const button = $("#analyzePlan"); setBusy(button, true, "Analyzing…");
  try { const plan = analyzePlanContent($("#planText").value, $("#planEngine").value); renderPlanAnalysis(plan); toast(`${plan.operators.length} plan operators visualized`); }
  catch (error) { toast(error.message, true); }
  finally { setBusy(button, false); }
}

function loadPlanExample() {
  const engine = $("#planEngine").value;
  const samples = {
    oracle: `| Id | Operation                    | Name           | E-Rows | A-Rows | Cost | A-Time |\n|  0 | SELECT STATEMENT             |                |        |   1200 | 1840 | 00:00:04 |\n|  1 |  SORT ORDER BY                |                |  12000 |   1200 | 1840 | 00:00:04 |\n|  2 |   HASH JOIN                   |                |  12000 |   1200 | 1750 | 00:00:03 |\n|  3 |    TABLE ACCESS FULL          | ORDERS         | 850000 | 920000 | 1320 | 00:00:02 |\n|  4 |    TABLE ACCESS BY INDEX ROWID| CUSTOMERS      |  12000 |   1200 |  310 | 00:00:01 |\n|  5 |     INDEX RANGE SCAN          | CUSTOMERS_UK1  |  12000 |   1200 |   42 | 00:00:01 |`,
    postgres: `Sort  (cost=18220.10..18250.10 rows=12000 width=96) (actual time=3180.101..3270.342 rows=1200 loops=1)\n  Sort Key: o.created_at DESC\n  ->  Hash Join  (cost=4100.00..17400.00 rows=12000 width=96) (actual time=90.100..3010.220 rows=1200 loops=1)\n        ->  Seq Scan on orders o  (cost=0.00..11200.00 rows=850000 width=64) (actual time=0.020..2100.300 rows=920000 loops=1)\n        ->  Hash  (cost=3800.00..3800.00 rows=12000 width=32) (actual time=88.100..88.120 rows=1200 loops=1)\n              ->  Index Scan using customers_uk1 on customers c  (cost=0.42..3800.00 rows=12000 width=32) (actual time=0.030..70.200 rows=1200 loops=1)`,
    mongodb: JSON.stringify({ executionStats: { executionTimeMillis: 3270, nReturned: 1200, executionStages: { stage: "SORT", nReturned: 1200, executionTimeMillisEstimate: 3270, inputStage: { stage: "COLLSCAN", namespace: "sales.orders", nReturned: 920000, docsExamined: 920000, executionTimeMillisEstimate: 3010 } } } }, null, 2),
    mysql: JSON.stringify({ query_block: { cost_info: { query_cost: "1840.50" }, ordering_operation: { using_temporary_table: true, using_filesort: true, nested_loop: [{ table: { table_name: "orders", access_type: "ALL", rows_examined_per_scan: 850000, rows_produced_per_join: 920000, cost_info: { read_cost: "1320.00" } } }, { table: { table_name: "customers", access_type: "ref", key: "customers_uk1", rows_examined_per_scan: 1, rows_produced_per_join: 1200, cost_info: { read_cost: "310.00" } } }] } } }, null, 2),
    sqlserver: `<ShowPlanXML><BatchSequence><Batch><Statements><StmtSimple><QueryPlan><RelOp NodeId="0" PhysicalOp="Sort" LogicalOp="Sort" EstimateRows="12000" EstimatedTotalSubtreeCost="18.4"><RunTimeInformation><RunTimeCountersPerThread ActualRows="1200" ActualElapsedms="3270" /></RunTimeInformation><RelOp NodeId="1" PhysicalOp="Hash Match" LogicalOp="Inner Join" EstimateRows="12000" EstimatedTotalSubtreeCost="17.5"><RelOp NodeId="2" PhysicalOp="Table Scan" LogicalOp="Table Scan" EstimateRows="850000" EstimatedTotalSubtreeCost="13.2"><Object Schema="dbo" Table="Orders" /></RelOp><RelOp NodeId="3" PhysicalOp="Index Seek" LogicalOp="Index Seek" EstimateRows="12000" EstimatedTotalSubtreeCost="3.1"><Object Schema="dbo" Table="Customers" Index="Customers_UK1" /></RelOp></RelOp></RelOp></QueryPlan></StmtSimple></Statements></Batch></BatchSequence></ShowPlanXML>`
  };
  $("#planText").value = samples[engine] || samples.postgres; $("#planIdentifier").value = "sample-regression"; toast("Example execution plan loaded");
}

async function readPlanFile(input, target) {
  const file = input.files?.[0]; if (!file) return;
  if (file.size > 8 * 1024 * 1024) { input.value = ""; return toast("Plan file is limited to 8 MB", true); }
  try { $(target).value = await file.text(); toast(`${file.name} loaded in browser memory`); } catch { toast("The plan file could not be read", true); }
  input.value = "";
}

function comparePlanAnalyses(before, after) {
  const beforeBuckets = new Map();
  before.operators.forEach((node) => { const key = `${node.operation}|${node.object}`.toLowerCase(); if (!beforeBuckets.has(key)) beforeBuckets.set(key, []); beforeBuckets.get(key).push(node); });
  const rows = [];
  for (const afterNode of after.operators) {
    const key = `${afterNode.operation}|${afterNode.object}`.toLowerCase();
    const beforeNode = beforeBuckets.get(key)?.shift();
    if (!beforeNode) { rows.push({ state: "added", before: null, after: afterNode, evidence: "New operator introduced" }); continue; }
    const costDelta = beforeNode.cost > 0 ? (afterNode.cost - beforeNode.cost) / beforeNode.cost * 100 : afterNode.cost ? 100 : 0;
    const rowBefore = Math.max(beforeNode.actualRows, beforeNode.estimatedRows); const rowAfter = Math.max(afterNode.actualRows, afterNode.estimatedRows);
    const rowDelta = rowBefore > 0 ? (rowAfter - rowBefore) / rowBefore * 100 : rowAfter ? 100 : 0;
    const riskDelta = ({ normal: 0, medium: 1, high: 2 }[afterNode.status] || 0) - ({ normal: 0, medium: 1, high: 2 }[beforeNode.status] || 0);
    const stateName = riskDelta > 0 || costDelta > 25 || rowDelta > 50 ? "regressed" : riskDelta < 0 || costDelta < -25 || rowDelta < -50 ? "improved" : Math.abs(costDelta) > 5 || Math.abs(rowDelta) > 10 ? "changed" : "stable";
    rows.push({ state: stateName, before: beforeNode, after: afterNode, evidence: `Cost ${costDelta >= 0 ? "+" : ""}${costDelta.toFixed(1)}% · rows ${rowDelta >= 0 ? "+" : ""}${rowDelta.toFixed(1)}%` });
  }
  for (const bucket of beforeBuckets.values()) for (const node of bucket) rows.push({ state: "removed", before: node, after: null, evidence: "Operator removed from changed plan" });
  return { before, after, rows, added: rows.filter((row) => row.state === "added").length, removed: rows.filter((row) => row.state === "removed").length, regressions: rows.filter((row) => ["added", "regressed"].includes(row.state)).length, scoreDelta: after.score - before.score, comparedAt: new Date().toISOString() };
}

function renderPlanRegression(comparison) {
  state.investigation.regression = comparison;
  $("#regressionScoreDelta").textContent = `${comparison.scoreDelta >= 0 ? "+" : ""}${comparison.scoreDelta}`; $("#regressionAdded").textContent = comparison.added.toLocaleString(); $("#regressionRemoved").textContent = comparison.removed.toLocaleString(); $("#regressionSignals").textContent = comparison.regressions.toLocaleString();
  $("#planRegressionOutput").innerHTML = comparison.rows.map((row) => `<article class="regression-row"><div><span class="regression-state ${row.state}">${row.state.toUpperCase()}</span></div><div>${row.before ? `<b>${escapeHtml(row.before.operation)}</b><small>${escapeHtml(row.before.object || "No object")} · cost ${row.before.cost.toLocaleString()}</small>` : "—"}</div><div>${row.after ? `<b>${escapeHtml(row.after.operation)}</b><small>${escapeHtml(row.after.object || "No object")} · cost ${row.after.cost.toLocaleString()}</small>` : "—"}</div><div><b>${escapeHtml(row.evidence)}</b><small>${row.state === "regressed" || row.state === "added" ? "Review introduced cost, row volume, and access path" : row.state === "improved" || row.state === "removed" ? "Potential improvement; validate result correctness" : "Operator retained with metric change"}</small></div></article>`).join("");
  toast(`${comparison.regressions} plan regression signal${comparison.regressions === 1 ? "" : "s"} found`);
}

function runPlanRegression() {
  try { const engine = $("#regressionEngine").value; renderPlanRegression(comparePlanAnalyses(analyzePlanContent($("#regressionBefore").value, engine), analyzePlanContent($("#regressionAfter").value, engine))); }
  catch (error) { toast(error.message, true); }
}

function switchInvestigationTab(tab) {
  state.investigation.activeTab = tab;
  $$("[data-investigation-tab]").forEach((button) => button.classList.toggle("active", button.dataset.investigationTab === tab));
  $$(".investigation-section").forEach((section) => section.classList.toggle("active", section.id === `investigation-${tab}-panel`));
}

function renderAdapters() {
  const entries = Object.entries(state.investigation.adapters);
  $("#adapterGrid").innerHTML = entries.map(([id, adapter]) => `<button type="button" class="adapter-card ${adapter.available ? "available" : ""}" data-adapter="${id}"><i></i><div><span class="adapter-logo">${escapeHtml(adapter.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase())}</span><div><b>${escapeHtml(adapter.name)}</b><small>${escapeHtml(adapter.directAvailable ? `${adapter.driver} · bundled` : adapter.client)}</small></div></div><span>${escapeHtml(adapter.tier.toUpperCase())}</span></button>`).join("");
  $$("#adapterGrid [data-adapter]").forEach((button) => button.addEventListener("click", () => { $("#sqlEngine").value = button.dataset.adapter; updatePort(); $("#validationAdapterName").textContent = state.investigation.adapters[button.dataset.adapter].name; toast(`${state.investigation.adapters[button.dataset.adapter].name} selected for validation`); }));
  $("#adapterMatrixRows").innerHTML = entries.map(([, adapter]) => `<tr><td>${escapeHtml(adapter.name)}</td><td>${escapeHtml(adapter.family)}</td><td>${escapeHtml(adapter.directAvailable ? `${adapter.driver} (bundled)` : adapter.client)}</td><td>${escapeHtml(adapter.tier)}</td><td>${escapeHtml(adapter.auth)}</td><td><span class="adapter-ready ${adapter.available ? "available" : ""}">${adapter.directAvailable ? "DIRECT READY" : adapter.clientAvailable ? "CLIENT READY" : "UNAVAILABLE"}</span></td></tr>`).join("");
  updateInvestigationSummary();
}

function renderTuningRules() {
  $("#tuningRuleRows").innerHTML = state.investigation.rules.map((rule) => `<tr data-rule="${escapeHtml(rule.id)}"><td>${escapeHtml(rule.name)}</td><td><code>${escapeHtml(rule.metric)}</code></td><td><input type="number" min="0" step="any" data-level="warning" value="${Number(rule.warning)}"></td><td><input type="number" min="0" step="any" data-level="high" value="${Number(rule.high)}"></td><td>${escapeHtml(rule.unit)}</td></tr>`).join("");
}

function renderBaselines() {
  const baselines = state.investigation.baselines;
  $("#baselineList").innerHTML = baselines.length ? baselines.map((baseline) => `<article class="baseline-card"><div><em>${escapeHtml((sqlAdapterUi[baseline.engine]?.name || baseline.engine).toUpperCase())}</em><button type="button" data-delete-baseline="${baseline.id}">Delete</button></div><h3>${escapeHtml(baseline.name)}</h3><p>${escapeHtml(baseline.identifier || baseline.plan.fingerprint)} · ${new Date(baseline.capturedAt).toLocaleString()}</p><div><div><span>SCORE</span><b>${baseline.plan.score}/100</b></div><div><span>OPERATORS</span><b>${baseline.plan.operators.length}</b></div><div><span>WARNINGS</span><b>${baseline.plan.warnings}</b></div></div></article>`).join("") : '<div class="baseline-empty">No saved plan baselines yet.</div>';
  $$("[data-delete-baseline]").forEach((button) => button.addEventListener("click", () => deletePlanBaseline(button.dataset.deleteBaseline)));
  updateInvestigationSummary();
}

function eventGroups(type) { return ["database", "log", "trace"].includes(type) ? "database" : ["deployment", "kubernetes", "container", "git"].includes(type) ? "delivery" : "note"; }
function formatTimeDistance(milliseconds) { const minutes = Math.round(Math.abs(milliseconds) / 60000); return minutes < 1 ? "<1 min" : minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${(minutes / 60).toFixed(1)} hr` : `${(minutes / 1440).toFixed(1)} days`; }

function closestEventDistance(event, events) {
  const group = eventGroups(event.type); if (group === "note") return null;
  const opposite = group === "database" ? "delivery" : "database";
  const candidates = events.filter((item) => eventGroups(item.type) === opposite);
  if (!candidates.length) return null;
  return Math.min(...candidates.map((item) => Math.abs(new Date(item.occurredAt) - new Date(event.occurredAt))));
}

function renderIncidentTimeline() {
  const events = [...state.investigation.events].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  const databaseCount = events.filter((event) => eventGroups(event.type) === "database").length; const deliveryCount = events.filter((event) => eventGroups(event.type) === "delivery").length;
  const distances = events.map((event) => closestEventDistance(event, events)).filter((value) => value !== null);
  $("#timelineDatabase").textContent = databaseCount.toLocaleString(); $("#timelineDelivery").textContent = deliveryCount.toLocaleString(); $("#timelineCorrelation").textContent = distances.length ? formatTimeDistance(Math.min(...distances)) : "—";
  $("#incidentTimeline").innerHTML = events.length ? events.map((event) => { const distance = closestEventDistance(event, events); return `<article class="timeline-event ${event.type}"><time>${new Date(event.occurredAt).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time><div class="timeline-event-card"><div><span class="timeline-type">${escapeHtml(event.type)}</span><b>${escapeHtml(event.title)}</b></div><p>${escapeHtml(event.details || "No additional details")}</p></div>${distance === null ? "" : `<span class="timeline-distance">± ${formatTimeDistance(distance)}</span>`}<button class="timeline-delete" type="button" data-delete-event="${event.id}">Delete</button></article>`; }).join("") : '<div class="timeline-empty"><span>00:00</span><b>No incident events captured</b><p>Add database and delivery evidence to calculate temporal correlation.</p></div>';
  $$("[data-delete-event]").forEach((button) => button.addEventListener("click", () => deleteIncidentEvent(button.dataset.deleteEvent)));
  updateInvestigationSummary();
}

function updateInvestigationSummary() {
  $("#investigationBaselines").textContent = state.investigation.baselines.length.toLocaleString(); $("#investigationEvents").textContent = state.investigation.events.length.toLocaleString();
  const adapters = Object.values(state.investigation.adapters); $("#investigationAdapters").textContent = adapters.length ? `${adapters.filter((adapter) => adapter.available).length}/${adapters.length}` : "—";
}

async function loadAdapterReadiness() {
  try { const result = await api("/api/adapters"); state.investigation.adapters = result.adapters; renderAdapters(); }
  catch (error) { $("#adapterGrid").innerHTML = `<div class="baseline-empty">${escapeHtml(error.message)}</div>`; toast(error.message, true); }
}

async function loadInvestigationWorkspace() {
  try {
    const [workspace, adapters] = await Promise.all([api("/api/investigation"), api("/api/adapters")]);
    state.investigation.baselines = workspace.store.baselines || []; state.investigation.rules = workspace.store.rules || defaultTuningRules.map((rule) => ({ ...rule })); state.investigation.events = workspace.store.events || []; state.investigation.recordings = workspace.store.recordings || []; state.investigation.devopsSnapshots = workspace.store.devopsSnapshots || []; state.investigation.runbooks = workspace.store.runbooks || []; state.investigation.autofillProfiles = workspace.store.autofillProfiles || []; state.autofill.profiles = state.investigation.autofillProfiles; state.investigation.adapters = adapters.adapters || {}; state.investigation.loaded = true;
    renderAdapters(); renderTuningRules(); renderBaselines(); renderIncidentTimeline(); renderRecordings(); renderPipelineBaselines(); renderRunbooks(); updateConnectionAdapterUi();
  } catch (error) { toast(error.message, true); }
}

async function validateCurrentConnection() {
  const button = $("#validateConnection"); const engine = $("#sqlEngine").value; setBusy(button, true, "Validating…"); $("#validationStatus").textContent = "Validation running";
  $("#connectionValidation").innerHTML = ["CLIENT", "AUTH", "DIAGNOSTICS"].map((label) => `<div><i></i><span>${label}</span><b>Checking…</b></div>`).join("");
  try { const result = await api("/api/connections/check", { method: "POST", body: JSON.stringify({ ...connection(), engine, timeoutMs: 30000 }) }); $("#validationStatus").textContent = `${result.durationMs.toLocaleString()} ms · ${new Date(result.checkedAt).toLocaleTimeString()}`; $("#connectionValidation").innerHTML = result.checks.map((check) => `<div class="pass" title="${escapeHtml(check.evidence)}"><i></i><span>${escapeHtml(check.label)}</span><b>Passed</b></div>`).join(""); toast(`${result.adapter.name} access validated`); }
  catch (error) { $("#validationStatus").textContent = "Validation failed"; $("#connectionValidation").innerHTML = `<div class="fail"><i></i><span>CLIENT / AUTH</span><b>Failed</b></div><div class="fail"><i></i><span>EVIDENCE</span><b>${escapeHtml(error.message)}</b></div><div><i></i><span>DIAGNOSTICS</span><b>Not run</b></div>`; toast(error.message, true); }
  finally { setBusy(button, false); }
}

async function savePlanBaseline() {
  const plan = state.investigation.currentPlan; if (!plan) return toast("Analyze a plan first", true);
  const name = $("#baselineName").value.trim(); const identifier = $("#planIdentifier").value.trim(); const button = $("#savePlanBaseline"); setBusy(button, true, "Saving…");
  try { const result = await api("/api/investigation/baselines", { method: "POST", body: JSON.stringify({ name, engine: plan.engine, identifier, plan }) }); state.investigation.baselines = result.store.baselines; renderBaselines(); toast("Plan summary baseline saved locally"); }
  catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
}

async function deletePlanBaseline(id) {
  try { const result = await api("/api/investigation/baselines/delete", { method: "POST", body: JSON.stringify({ id }) }); state.investigation.baselines = result.store.baselines; renderBaselines(); toast("Plan baseline deleted"); } catch (error) { toast(error.message, true); }
}

async function saveTuningRules() {
  const rules = state.investigation.rules.map((rule) => { const row = $(`[data-rule="${rule.id}"]`); return { ...rule, warning: Number(row.querySelector('[data-level="warning"]').value), high: Number(row.querySelector('[data-level="high"]').value) }; });
  const button = $("#saveTuningRules"); setBusy(button, true, "Saving…");
  try { const result = await api("/api/investigation/rules", { method: "POST", body: JSON.stringify({ rules }) }); state.investigation.rules = result.rules; renderTuningRules(); toast("Tuning thresholds saved and active"); } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
}

function resetTuningRules() { state.investigation.rules = defaultTuningRules.map((rule) => ({ ...rule })); renderTuningRules(); toast("Default thresholds restored in the form; select Save rules to activate them"); }

function incidentPayload(type, title, details, occurredAt = new Date().toISOString()) { return { type, title, details, occurredAt }; }
async function persistIncidentEvent(payload) { const result = await api("/api/investigation/events", { method: "POST", body: JSON.stringify(payload) }); state.investigation.events = result.store.events; renderIncidentTimeline(); return result.event; }

async function addManualIncidentEvent() {
  const button = $("#addIncidentEvent"); setBusy(button, true, "Adding…");
  try { await persistIncidentEvent(incidentPayload($("#incidentType").value, $("#incidentTitle").value.trim(), $("#incidentDetails").value.trim(), $("#incidentTime").value || new Date().toISOString())); $("#incidentTitle").value = ""; $("#incidentDetails").value = ""; toast("Incident event added"); } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
}

async function captureCurrentPlanEvent() {
  const plan = state.investigation.currentPlan; if (!plan) return toast("Analyze a plan first", true);
  try { await persistIncidentEvent(incidentPayload("database", `Plan ${plan.fingerprint} analyzed`, `${sqlAdapterUi[plan.engine]?.name || plan.engine} · score ${plan.score}/100 · ${plan.operators.length} operators · ${plan.warnings} warning signals`)); toast("Current plan added to the incident timeline"); } catch (error) { toast(error.message, true); }
}

async function captureLastDevopsEvent() {
  const last = state.investigation.lastDevops; if (!last) return toast("Run a DevOps inspection first", true);
  const type = last.tool === "git" || last.tool === "github" ? "git" : last.tool === "kubernetes" ? "kubernetes" : ["docker", "podman"].includes(last.tool) ? "container" : "deployment";
  try { await persistIncidentEvent(incidentPayload(type, `${labels[last.tool]} · ${actions[last.tool][last.action]}`, `${last.durationMs.toLocaleString()} ms · exit ${last.code}\n${String(last.output || "").slice(0, 1500)}`, last.occurredAt)); toast("Last DevOps result added to the incident timeline"); } catch (error) { toast(error.message, true); }
}

async function deleteIncidentEvent(id) { try { const result = await api("/api/investigation/events/delete", { method: "POST", body: JSON.stringify({ id }) }); state.investigation.events = result.store.events; renderIncidentTimeline(); toast("Incident event removed"); } catch (error) { toast(error.message, true); } }

function redactEvidenceText(value) {
  return String(value).replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]").replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[REDACTED_IP]").replace(/\b(?:[A-Za-z0-9-]+\.)+(?:internal|local|corp|com|net|org)\b/gi, "[REDACTED_HOST]").replace(/(['"])(?:(?!\1).){3,}\1/g, "$1[REDACTED_LITERAL]$1");
}

function redactEvidenceValue(value) {
  if (Array.isArray(value)) return value.map(redactEvidenceValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactEvidenceValue(item)]));
  return typeof value === "string" ? redactEvidenceText(value) : value;
}

function investigationEvidenceObject() {
  const plan = state.investigation.currentPlan;
  return { product: "DBridge Portable", version: "2.22.0", exportedAt: new Date().toISOString(), plan: plan ? { engine: plan.engine, score: plan.score, totalCost: plan.totalCost, estimatedRows: plan.estimatedRows, actualRows: plan.actualRows, warnings: plan.warnings, fingerprint: plan.fingerprint, operators: plan.operators.map(({ raw, ...operator }) => operator), findings: plan.findings } : null, regression: state.investigation.regression ? { scoreDelta: state.investigation.regression.scoreDelta, added: state.investigation.regression.added, removed: state.investigation.regression.removed, regressions: state.investigation.regression.regressions, rows: state.investigation.regression.rows.map((row) => ({ state: row.state, before: row.before?.operation || null, after: row.after?.operation || null, evidence: row.evidence })) } : null, baselines: $("#includeBaselinesExport").checked ? state.investigation.baselines : [], recordings: state.investigation.recordings.map((recording) => ({ id: recording.id, name: recording.name, engine: recording.engine, startedAt: recording.startedAt, endedAt: recording.endedAt, samples: recording.samples.length, averageLatencyMs: metricAverage(recording, "avg_elapsed_ms"), averageWaiters: metricAverage(recording, "waiting_sessions") })), devopsSnapshots: state.investigation.devopsSnapshots.map(({ data, ...snapshot }) => ({ ...snapshot, dataBytes: data.length })), runbooks: state.investigation.runbooks, rules: state.investigation.rules, timeline: $("#includeTimelineExport").checked ? state.investigation.events : [], adapterReadiness: Object.fromEntries(Object.entries(state.investigation.adapters).map(([id, adapter]) => [id, { name: adapter.name, client: adapter.client, driver: adapter.driver, preferredAccess: adapter.preferredAccess, available: adapter.available, tier: adapter.tier }])) };
}

function downloadInvestigationArtifact(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

function exportInvestigationJson() {
  let evidence = investigationEvidenceObject(); if ($("#redactEvidence").checked) evidence = redactEvidenceValue(evidence); const json = JSON.stringify(evidence, null, 2);
  downloadInvestigationArtifact(`dbridge-evidence-${new Date().toISOString().slice(0, 10)}.json`, json, "application/json;charset=utf-8"); toast("Sanitized JSON evidence exported");
}

function exportInvestigationHtml() {
  let evidence = investigationEvidenceObject(); if ($("#redactEvidence").checked) evidence = redactEvidenceValue(evidence);
  const plan = evidence.plan; const timeline = evidence.timeline || []; const baselines = evidence.baselines || [];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>DBridge Incident Evidence</title><style>body{max-width:1100px;margin:40px auto;padding:0 24px;color:#20283a;font:14px Segoe UI,Arial;background:#f5f6f9}header{padding:28px;border-radius:14px;background:linear-gradient(135deg,#171d2d,#5937cc);color:white}h1{margin:4px 0}header p{color:#c8c2e7}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}.card,section{padding:16px;border:1px solid #e1e4ea;border-radius:10px;background:white}.card span,th{color:#818a9b;font-size:11px;font-weight:700}.card b{display:block;margin-top:6px;font-size:22px}section{margin:12px 0}table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #eceef2;text-align:left;font-size:12px}.high{color:#c82946}.medium{color:#ad6c00}.event{margin:8px 0;padding:10px;border-left:3px solid #6746ed;background:#faf9ff}.muted{color:#7d8798}footer{padding:20px;text-align:center;color:#8992a2;font-size:11px}@media(max-width:700px){.grid{grid-template-columns:1fr 1fr}}</style></head><body><header><span>DBRIDGE LOCAL INCIDENT EVIDENCE</span><h1>Database and delivery investigation</h1><p>Exported ${escapeHtml(new Date(evidence.exportedAt).toLocaleString())} · generated locally</p></header><div class="grid"><div class="card"><span>PLAN SCORE</span><b>${plan ? `${plan.score}/100` : "—"}</b></div><div class="card"><span>OPERATORS</span><b>${plan?.operators.length || 0}</b></div><div class="card"><span>BASELINES</span><b>${baselines.length}</b></div><div class="card"><span>TIMELINE EVENTS</span><b>${timeline.length}</b></div></div>${plan ? `<section><h2>Plan findings · ${escapeHtml(plan.fingerprint)}</h2>${plan.findings.map((finding) => `<p class="${finding.severity.toLowerCase()}"><b>[${escapeHtml(finding.severity)}] ${escapeHtml(finding.title)}</b><br><span class="muted">${escapeHtml(finding.evidence)}</span></p>`).join("")}</section><section><h2>Operator summary</h2><table><thead><tr><th>#</th><th>OPERATOR</th><th>OBJECT</th><th>COST</th><th>EST. ROWS</th><th>ACTUAL ROWS</th></tr></thead><tbody>${plan.operators.map((node) => `<tr><td>${node.id}</td><td>${escapeHtml(node.operation)}</td><td>${escapeHtml(node.object)}</td><td>${node.cost}</td><td>${node.estimatedRows}</td><td>${node.actualRows}</td></tr>`).join("")}</tbody></table></section>` : ""}<section><h2>Incident timeline</h2>${timeline.length ? timeline.map((event) => `<div class="event"><b>${escapeHtml(event.type.toUpperCase())} · ${escapeHtml(event.title)}</b><br><span class="muted">${escapeHtml(new Date(event.occurredAt).toLocaleString())} · ${escapeHtml(event.details)}</span></div>`).join("") : '<p class="muted">No timeline events included.</p>'}</section><section><h2>Saved baselines</h2>${baselines.length ? `<table><thead><tr><th>NAME</th><th>ENGINE</th><th>CAPTURED</th><th>SCORE</th><th>WARNINGS</th></tr></thead><tbody>${baselines.map((baseline) => `<tr><td>${escapeHtml(baseline.name)}</td><td>${escapeHtml(baseline.engine)}</td><td>${escapeHtml(new Date(baseline.capturedAt).toLocaleString())}</td><td>${baseline.plan.score}/100</td><td>${baseline.plan.warnings}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">No baselines included.</p>'}</section><footer>Recommendation evidence only. Validate plans, waits, workload context, and business impact before applying a change.</footer></body></html>`;
  downloadInvestigationArtifact(`dbridge-evidence-${new Date().toISOString().slice(0, 10)}.html`, html, "text/html;charset=utf-8"); toast("Visual HTML evidence report exported");
}

function copyCurrentPlanFindings() {
  const plan = state.investigation.currentPlan; if (!plan) return toast("Analyze a plan first", true);
  const report = [`Plan ${plan.fingerprint}`, `Score: ${plan.score}/100`, `Operators: ${plan.operators.length}`, "", ...plan.findings.map((finding) => `[${finding.severity}] ${finding.title}\n${finding.evidence}`)].join("\n");
  navigator.clipboard.writeText(report).then(() => toast("Plan findings copied")).catch(() => toast("Clipboard access was blocked", true));
}

function metricAverage(recording, metric) {
  const values = (recording?.samples || []).map((sample) => Number(sample.metrics?.[metric]) || 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function metricTotal(recording, metric) { return (recording?.samples || []).reduce((sum, sample) => sum + (Number(sample.metrics?.[metric]) || 0), 0); }
function percentChange(before, after) { return before ? (after - before) / before * 100 : after ? 100 : 0; }
function signedPercent(value) { return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`; }

function recordingGate(before, after) {
  const latency = percentChange(metricAverage(before, "avg_elapsed_ms"), metricAverage(after, "avg_elapsed_ms"));
  const waits = percentChange(metricAverage(before, "waiting_sessions"), metricAverage(after, "waiting_sessions"));
  const reads = percentChange(metricAverage(before, "logical_reads") + metricAverage(before, "physical_reads"), metricAverage(after, "logical_reads") + metricAverage(after, "physical_reads"));
  const errors = metricTotal(after, "errors") - metricTotal(before, "errors");
  let status = "PASS", className = "pass", note = "No material performance regression detected.";
  if (latency >= 50 || errors > 0 || waits >= 100) { status = "ROLLBACK REVIEW", className = "review", note = "Material latency, wait, or error regression requires release-owner review."; }
  else if (latency >= 20 || waits >= 30 || reads >= 40) { status = "WARNING", className = "warning", note = "Performance changed beyond the warning gate; validate workload and plan evidence."; }
  return { status, className, note, latency, waits, reads, errors };
}

function drawFlightChart() {
  const canvas = $("#flightChart"); if (!canvas) return;
  const width = Math.max(canvas.clientWidth || 760, 320); const height = 220; const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); const context = canvas.getContext("2d"); context.scale(ratio, ratio); context.clearRect(0, 0, width, height);
  context.strokeStyle = "#263142"; context.lineWidth = 1;
  for (let line = 1; line < 5; line += 1) { const y = line * height / 5; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
  const samples = state.flight.samples.slice(-60); if (samples.length < 2) return;
  const series = [{ key: "avg_elapsed_ms", color: "#9b82ff" }, { key: "active_sessions", color: "#42b6f4" }, { key: "waiting_sessions", color: "#efb34b" }];
  for (const definition of series) {
    const values = samples.map((sample) => Number(sample.metrics[definition.key]) || 0); const max = Math.max(...values, 1);
    context.beginPath(); context.strokeStyle = definition.color; context.lineWidth = 2;
    values.forEach((value, index) => { const x = index / Math.max(values.length - 1, 1) * (width - 8) + 4; const y = height - 10 - value / max * (height - 24); if (!index) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke();
  }
}

function renderFlightRecorder() {
  const samples = state.flight.samples; const latest = samples.at(-1); $("#flightSamples").textContent = samples.length.toLocaleString();
  $("#flightLatency").textContent = latest ? `${latest.metrics.avg_elapsed_ms.toLocaleString(undefined, { maximumFractionDigits: 1 })} ms` : "—"; $("#flightActive").textContent = latest ? latest.metrics.active_sessions.toLocaleString() : "0"; $("#flightWaiters").textContent = latest ? latest.metrics.waiting_sessions.toLocaleString() : "0"; $("#flightReads").textContent = latest ? `${(latest.metrics.logical_reads + latest.metrics.physical_reads).toLocaleString(undefined, { maximumFractionDigits: 1 })}/s` : "0/s";
  $("#flightMeta").textContent = latest ? `${sqlAdapterUi[$("#flightEngine").value].name} · last sample ${new Date(latest.collectedAt).toLocaleTimeString()} · browser memory` : "Waiting for recording";
  $("#flightSampleRows").innerHTML = samples.length ? [...samples].reverse().slice(0, 100).map((sample) => `<tr><td>${new Date(sample.collectedAt).toLocaleTimeString()}</td><td>${sample.metrics.avg_elapsed_ms.toLocaleString(undefined, { maximumFractionDigits: 1 })} ms</td><td>${sample.metrics.active_sessions.toLocaleString()}</td><td>${sample.metrics.waiting_sessions.toLocaleString()}</td><td>${(sample.metrics.logical_reads + sample.metrics.physical_reads).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td><td>${sample.metrics.throughput.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td><td>${sample.metrics.errors.toLocaleString()}</td></tr>`).join("") : '<tr><td colspan="7">Start a recording to collect live samples.</td></tr>';
  requestAnimationFrame(drawFlightChart);
}

async function collectFlightSample() {
  if (!state.flight.running || state.flight.collecting || state.flight.samples.length >= 720) { if (state.flight.samples.length >= 720) stopFlightRecording(); return; }
  state.flight.collecting = true; const engine = $("#flightEngine").value;
  try {
    const result = await api("/api/performance/sample", { method: "POST", body: JSON.stringify({ ...connection(), engine, timeoutMs: 30000 }) }); const raw = result.metrics; const previous = state.flight.rawPrevious; const now = new Date(result.collectedAt).getTime(); const seconds = previous ? Math.max((now - previous.time) / 1000, 1) : Number($("#flightInterval").value);
    const metrics = { ...raw, logical_reads: previous ? Math.max(raw.logical_reads - previous.metrics.logical_reads, 0) / seconds : 0, physical_reads: previous ? Math.max(raw.physical_reads - previous.metrics.physical_reads, 0) / seconds : 0, throughput: previous ? Math.max(raw.throughput - previous.metrics.throughput, 0) / seconds : 0, errors: previous ? Math.max(raw.errors - previous.metrics.errors, 0) : 0 };
    state.flight.rawPrevious = { time: now, metrics: raw }; state.flight.samples.push({ collectedAt: result.collectedAt, metrics }); renderFlightRecorder();
  } catch (error) { $("#flightState").className = "flight-state error"; $("#flightState").innerHTML = "<i></i>ERROR"; stopFlightRecording(false); toast(error.message, true); }
  finally { state.flight.collecting = false; }
}

function startFlightRecording() {
  if (state.flight.running) return; state.flight.running = true; state.flight.samples = []; state.flight.rawPrevious = null; state.flight.startedAt = new Date().toISOString();
  $("#flightState").className = "flight-state live"; $("#flightState").innerHTML = "<i></i>RECORDING"; $("#startFlight").disabled = true; $("#stopFlight").disabled = false; $("#saveFlight").disabled = true; $("#flightEngine").disabled = true; $("#flightInterval").disabled = true;
  if (!$("#flightName").value) $("#flightName").value = `${sqlAdapterUi[$("#flightEngine").value].name} ${new Date().toLocaleString()}`;
  collectFlightSample(); state.flight.timer = setInterval(collectFlightSample, Number($("#flightInterval").value) * 1000); toast("SQL performance flight recording started");
}

function stopFlightRecording(showToast = true) {
  clearInterval(state.flight.timer); state.flight.timer = null; state.flight.running = false; $("#flightState").className = "flight-state"; $("#flightState").innerHTML = "<i></i>STOPPED"; $("#startFlight").disabled = false; $("#stopFlight").disabled = true; $("#saveFlight").disabled = !state.flight.samples.length; $("#flightEngine").disabled = false; $("#flightInterval").disabled = false; if (showToast) toast(`Flight recording stopped with ${state.flight.samples.length} sample${state.flight.samples.length === 1 ? "" : "s"}`);
}

async function saveFlightRecording() {
  if (!state.flight.samples.length) return toast("Record at least one sample first", true); const button = $("#saveFlight"); setBusy(button, true, "Saving…");
  try { const result = await api("/api/investigation/recordings", { method: "POST", body: JSON.stringify({ name: $("#flightName").value.trim(), engine: $("#flightEngine").value, samples: state.flight.samples }) }); state.investigation.recordings = result.store.recordings; renderRecordings(); toast("Flight recording summary saved locally"); } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
}

function renderRecordings() {
  const recordings = state.investigation.recordings || []; const options = recordings.map((recording) => `<option value="${recording.id}">${escapeHtml(recording.name)} · ${recording.samples.length} samples</option>`).join("");
  ["recordingBefore", "recordingAfter", "gateBefore", "gateAfter"].forEach((id, index) => { const select = $(`#${id}`); if (!select) return; const current = select.value; select.innerHTML = `<option value="">${index % 2 ? "After / release recording" : "Baseline recording"}</option>${options}`; if (recordings.some((recording) => recording.id === current)) select.value = current; });
  $("#recordingList").innerHTML = recordings.length ? recordings.map((recording) => `<article class="recording-card"><div><em>${escapeHtml(recording.engine.toUpperCase())}</em><button data-delete-recording="${recording.id}">Delete</button></div><h3>${escapeHtml(recording.name)}</h3><p>${new Date(recording.startedAt).toLocaleString()} · ${recording.samples.length} samples</p><div><span>${metricAverage(recording, "avg_elapsed_ms").toFixed(1)} ms avg</span><span>${metricAverage(recording, "waiting_sessions").toFixed(1)} waits</span></div></article>`).join("") : '<div class="baseline-empty">No saved flight recordings yet.</div>';
  $$('[data-delete-recording]').forEach((button) => button.addEventListener("click", () => deleteFlightRecording(button.dataset.deleteRecording)));
}

async function deleteFlightRecording(id) { try { const result = await api("/api/investigation/recordings/delete", { method: "POST", body: JSON.stringify({ id }) }); state.investigation.recordings = result.store.recordings; renderRecordings(); toast("Flight recording deleted"); } catch (error) { toast(error.message, true); } }

function selectedRecording(id) { return state.investigation.recordings.find((recording) => recording.id === $(id).value); }

function applyWorkloadComparison(before, after, target = "workload") {
  if (!before || !after) return toast("Select both a baseline and an after recording", true); const gate = recordingGate(before, after);
  if (target === "workload") { $("#workloadGate").textContent = gate.status; $("#workloadGate").className = gate.className; $("#workloadGateNote").textContent = gate.note; $("#workloadLatencyDelta").textContent = signedPercent(gate.latency); $("#workloadWaitDelta").textContent = signedPercent(gate.waits); $("#workloadReadDelta").textContent = signedPercent(gate.reads); $("#workloadErrorDelta").textContent = `${gate.errors >= 0 ? "+" : ""}${gate.errors}`; }
  else { $("#deploymentGateStatus").textContent = gate.status; $("#deploymentGateStatus").className = gate.className; $("#deploymentGateNote").textContent = gate.note; $("#deploymentGateResult").className = `gate-result ${gate.className}`; $("#deploymentGateResult").innerHTML = `<i></i><div><b>${escapeHtml(gate.status)} · latency ${signedPercent(gate.latency)}</b><p>${escapeHtml(gate.note)} Waits ${signedPercent(gate.waits)}, reads ${signedPercent(gate.reads)}, error delta ${gate.errors >= 0 ? "+" : ""}${gate.errors}.</p></div>`; }
  return gate;
}

function compareSavedRecordings() { applyWorkloadComparison(selectedRecording("#recordingBefore"), selectedRecording("#recordingAfter")); }
function evaluateDeploymentHealth() { applyWorkloadComparison(selectedRecording("#gateBefore"), selectedRecording("#gateAfter"), "deployment"); }

function dashboardSectionJson(sections, id, fallback = {}) {
  try { return JSON.parse(sections?.[id]?.stdout || ""); } catch { return fallback; }
}

function dashboardJsonLines(sections, id) {
  return String(sections?.[id]?.stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
}

function dashboardPercent(value) { const parsed = Number(String(value ?? "").replace("%", "").trim()); return Number.isFinite(parsed) ? Math.max(0, parsed) : 0; }
function averageDashboardPercent(values) { const visible = values.map(dashboardPercent).filter((value) => Number.isFinite(value)); return visible.length ? visible.reduce((sum, value) => sum + value, 0) / visible.length : 0; }

function parseKubectlTop(text, kind) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    const cells = line.split(/\s+/); if (!cells.length || /^(NAME|NAMESPACE)$/i.test(cells[0])) return [];
    if (kind === "nodes" && cells.length >= 5) return [{ name: cells[0], cpu: cells[1], cpuPercent: dashboardPercent(cells[2]), memory: cells[3], memoryPercent: dashboardPercent(cells[4]) }];
    if (kind === "pods" && cells.length >= 4) return [{ namespace: cells[0], name: cells[1], cpu: cells[2], memory: cells[3] }];
    if (kind === "pods" && cells.length >= 3) return [{ namespace: "default", name: cells[0], cpu: cells[1], memory: cells[2] }];
    return [];
  });
}

function kubernetesObjectReady(item) {
  if (item.kind === "Node") return item.status?.conditions?.some((condition) => condition.type === "Ready" && condition.status === "True") || false;
  if (item.kind === "Deployment") return Number(item.status?.readyReplicas || 0) >= Number(item.spec?.replicas || 0);
  if (item.kind === "Pod") return item.status?.phase === "Running" && (item.status?.containerStatuses || []).every((container) => container.ready);
  return true;
}

function parseKubernetesDashboard(sections) {
  const nodes = (dashboardSectionJson(sections, "nodes", { items: [] }).items || []).map((item) => ({ ...item, kind: "Node" }));
  const workloads = dashboardSectionJson(sections, "workloads", { items: [] }).items || [];
  const events = dashboardSectionJson(sections, "events", { items: [] }).items || [];
  const nodeMetrics = parseKubectlTop(sections?.nodeMetrics?.stdout, "nodes"); const podMetrics = parseKubectlTop(sections?.podMetrics?.stdout, "pods");
  const pods = workloads.filter((item) => item.kind === "Pod"); const deployments = workloads.filter((item) => item.kind === "Deployment"); const services = workloads.filter((item) => item.kind === "Service");
  const unhealthyNodes = nodes.filter((item) => !kubernetesObjectReady(item)); const unhealthyPods = pods.filter((item) => !kubernetesObjectReady(item)); const unhealthyDeployments = deployments.filter((item) => !kubernetesObjectReady(item));
  const restartCount = pods.reduce((sum, item) => sum + (item.status?.containerStatuses || []).reduce((total, container) => total + Number(container.restartCount || 0), 0), 0);
  const warningCount = unhealthyNodes.length + unhealthyPods.length + unhealthyDeployments.length + events.length + restartCount;
  const critical = unhealthyNodes.length || pods.some((item) => ["Failed", "Unknown"].includes(item.status?.phase));
  return { nodes, workloads, pods, deployments, services, events, nodeMetrics, podMetrics, restartCount, warningCount, health: critical ? "CRITICAL" : warningCount ? "REVIEW" : "HEALTHY", healthClass: critical ? "bad" : warningCount ? "warn" : "good", readyPods: pods.filter(kubernetesObjectReady).length, cpu: averageDashboardPercent(nodeMetrics.map((item) => item.cpuPercent)), memory: averageDashboardPercent(nodeMetrics.map((item) => item.memoryPercent)) };
}

function parseDockerDashboard(sections) {
  const info = dashboardSectionJson(sections, "info", {}); const containers = dashboardJsonLines(sections, "containers"); const stats = dashboardJsonLines(sections, "stats"); const images = dashboardJsonLines(sections, "images"); const networks = dashboardJsonLines(sections, "networks"); const volumes = dashboardJsonLines(sections, "volumes"); const diskUsage = dashboardJsonLines(sections, "diskUsage");
  const statsByName = new Map(stats.flatMap((item) => [[item.Name, item], [String(item.ID || "").slice(0, 12), item]]));
  const running = containers.filter((item) => String(item.State || item.Status || "").toLowerCase().startsWith("running"));
  const critical = containers.filter((item) => /dead|unhealthy/i.test(`${item.State} ${item.Status}`)); const warnings = containers.filter((item) => /exited|restarting|paused|created/i.test(`${item.State} ${item.Status}`));
  return { info, containers, stats, statsByName, images, networks, volumes, diskUsage, running: running.length, warningCount: critical.length * 2 + warnings.length, health: critical.length ? "CRITICAL" : warnings.length ? "REVIEW" : "HEALTHY", healthClass: critical.length ? "bad" : warnings.length ? "warn" : "good", cpu: averageDashboardPercent(stats.map((item) => item.CPUPerc)), memory: averageDashboardPercent(stats.map((item) => item.MemPerc)) };
}

function containerPressureMarkup(label, value, display = `${value.toFixed(0)}%`) {
  const bounded = Math.min(Math.max(Number(value) || 0, 0), 100); const tone = bounded >= 90 ? "bad" : bounded >= 75 ? "warn" : "";
  return `<div class="pressure-meter"><span>${escapeHtml(label)}<b>${escapeHtml(display)}</b></span><div><i class="${tone}" style="width:${bounded.toFixed(1)}%"></i></div></div>`;
}

function updateContainerDashboardSummary(model, platform) {
  $("#containerPlatformHealth").textContent = model.health; $("#containerPlatformHealth").className = model.healthClass; $("#containerPlatformHealthNote").textContent = platform === "kubernetes" ? `${model.nodes.length} nodes · ${model.restartCount} restarts` : `${model.info.ServerVersion || "Docker engine"} · ${state.containerDashboard.accessMode === "write" ? "read / write" : "read only"}`;
  $("#containerObjectLabel").textContent = platform === "kubernetes" ? "CLUSTER OBJECTS" : "CONTAINERS"; $("#containerObjectCount").textContent = (platform === "kubernetes" ? model.nodes.length + model.workloads.length : model.containers.length).toLocaleString(); $("#containerObjectNote").textContent = platform === "kubernetes" ? "Nodes, workloads and services" : `${model.images.length} images · ${model.networks.length} networks`;
  $("#containerReadyCount").textContent = platform === "kubernetes" ? `${model.readyPods}/${model.pods.length}` : `${model.running}/${model.containers.length}`; $("#containerReadyNote").textContent = platform === "kubernetes" ? "Ready pods" : "Running containers"; $("#containerWarningCount").textContent = model.warningCount.toLocaleString(); $("#containerCpuPressure").textContent = model.cpu ? `${model.cpu.toFixed(0)}%` : "N/A"; $("#containerMemoryPressure").textContent = model.memory ? `${model.memory.toFixed(0)}%` : "N/A";
}

function kubernetesNodeCard(node, metrics) {
  const ready = kubernetesObjectReady(node); const pressure = (node.status?.conditions || []).some((condition) => /Pressure$/.test(condition.type) && condition.status === "True"); const stateClass = ready ? pressure ? "warning" : "" : "failed"; const roles = Object.keys(node.metadata?.labels || {}).filter((key) => key.startsWith("node-role.kubernetes.io/")).map((key) => key.split("/")[1]).filter(Boolean).join(", ") || "worker"; const metric = metrics.find((item) => item.name === node.metadata?.name) || { cpuPercent: 0, memoryPercent: 0 };
  return `<article class="platform-node ${stateClass}"><header><b>${escapeHtml(node.metadata?.name || "node")}</b><em>${ready ? pressure ? "PRESSURE" : "READY" : "NOT READY"}</em></header><p>${escapeHtml(roles)} · ${escapeHtml(node.status?.nodeInfo?.kubeletVersion || "version unknown")} · ${escapeHtml(node.status?.nodeInfo?.osImage || "OS unknown")}</p><footer>${containerPressureMarkup("CPU", metric.cpuPercent)}${containerPressureMarkup("MEM", metric.memoryPercent)}</footer></article>`;
}

function kubernetesWorkloadRow(item) {
  const ready = kubernetesObjectReady(item); const namespace = item.metadata?.namespace || "default"; let kind = item.kind || "Object"; let detail = namespace; let stateClass = ready ? "" : "warning"; let evidence = "READY";
  if (kind === "Deployment") { const expected = Number(item.spec?.replicas || 0); const current = Number(item.status?.readyReplicas || 0); detail = `${namespace} · ${current}/${expected} replicas ready`; evidence = `${current}/${expected}`; if (!current && expected) stateClass = "failed"; }
  else if (kind === "Pod") { const phase = item.status?.phase || "Unknown"; const restarts = (item.status?.containerStatuses || []).reduce((sum, container) => sum + Number(container.restartCount || 0), 0); detail = `${namespace} · ${phase} · ${restarts} restart${restarts === 1 ? "" : "s"}`; evidence = phase.toUpperCase(); if (["Failed", "Unknown"].includes(phase)) stateClass = "failed"; }
  else { detail = `${namespace} · ${item.spec?.type || "ClusterIP"} · ${Object.keys(item.spec?.selector || {}).length} selectors`; evidence = "SERVICE"; }
  return `<article class="workload-health-row ${stateClass}"><span>${escapeHtml(kind.slice(0, 3).toUpperCase())}</span><div><b>${escapeHtml(item.metadata?.name || "unnamed")}</b><small>${escapeHtml(detail)}</small></div><em>${escapeHtml(evidence)}</em></article>`;
}

function renderKubernetesContainerDashboard(model) {
  const warningEvents = [...model.events].sort((a, b) => new Date(b.eventTime || b.lastTimestamp || b.metadata?.creationTimestamp || 0) - new Date(a.eventTime || a.lastTimestamp || a.metadata?.creationTimestamp || 0)).slice(0, 40);
  const events = warningEvents.length ? warningEvents.map((item) => `<article class="container-warning-row ${/failed|backoff|unhealthy|evict/i.test(`${item.reason} ${item.message}`) ? "critical" : ""}"><i></i><div><b>${escapeHtml(item.reason || "Warning")} · ${escapeHtml(item.involvedObject?.kind || "Object")}/${escapeHtml(item.involvedObject?.name || "unknown")}</b><small>${escapeHtml(item.message || "No event detail")}</small><time>${escapeHtml(item.lastTimestamp ? new Date(item.lastTimestamp).toLocaleString() : "recent")}</time></div></article>`).join("") : '<div class="container-section-empty">No Kubernetes warning events were returned.</div>';
  const workloads = [...model.deployments, ...model.pods, ...model.services].sort((a, b) => Number(kubernetesObjectReady(a)) - Number(kubernetesObjectReady(b))).slice(0, 120).map(kubernetesWorkloadRow).join("") || '<div class="container-section-empty">No workloads were returned for this scope.</div>';
  const podMetrics = [...model.podMetrics].slice(0, 50).map((item) => `<article class="container-asset-row"><span>POD</span><div><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.namespace)}</small></div><em>${escapeHtml(item.cpu)} CPU · ${escapeHtml(item.memory)} memory</em></article>`).join("") || '<div class="container-section-empty">Metrics Server data is unavailable; workload health is still shown.</div>';
  $("#containerVisualBody").innerHTML = `<div class="container-visual-grid"><section class="container-visual-card wide"><div class="container-visual-head"><div><h3>Cluster node health</h3><p>Readiness, role, kubelet, CPU and memory pressure</p></div><span>${model.nodes.length} NODES</span></div><div class="platform-node-grid">${model.nodes.length ? model.nodes.map((node) => kubernetesNodeCard(node, model.nodeMetrics)).join("") : '<div class="container-section-empty">No cluster nodes returned.</div>'}</div></section><section class="container-visual-card"><div class="container-visual-head"><div><h3>Workload health map</h3><p>Deployments, pods and services across the selected scope</p></div><span>${model.workloads.length} OBJECTS</span></div><div class="workload-health-list">${workloads}</div></section><section class="container-visual-card"><div class="container-visual-head"><div><h3>Warning event stream</h3><p>Recent cluster warnings and scheduling evidence</p></div><span>${warningEvents.length} EVENTS</span></div><div class="container-warning-list">${events}</div></section><section class="container-visual-card wide"><div class="container-visual-head"><div><h3>Pod resource snapshot</h3><p>Current metrics-server CPU and memory readings</p></div><span>${model.podMetrics.length} PODS</span></div><div class="container-asset-list">${podMetrics}</div></section></div>`;
}

function dockerContainerRow(item, model) {
  const name = item.Names || item.Name || String(item.ID || "container").slice(0, 12); const status = `${item.State || ""} ${item.Status || ""}`.trim(); const critical = /dead|unhealthy/i.test(status); const warning = /exited|restarting|paused|created/i.test(status); const stats = model.statsByName.get(name) || model.statsByName.get(String(item.ID || "").slice(0, 12)) || {}; const cpu = dashboardPercent(stats.CPUPerc); const memory = dashboardPercent(stats.MemPerc);
  return `<article class="container-fleet-row ${critical ? "failed" : warning ? "warning" : ""}"><span>${critical ? "ERR" : warning ? "WAIT" : "RUN"}</span><div><b>${escapeHtml(name)}</b><small>${escapeHtml(item.Image || "image unknown")} · ${escapeHtml(status || "state unknown")} · ${escapeHtml(item.Networks || "default network")}</small></div><div class="fleet-resource">${containerPressureMarkup("CPU", cpu, stats.CPUPerc || "N/A")}${containerPressureMarkup("MEM", memory, stats.MemPerc || stats.MemUsage || "N/A")}</div></article>`;
}

function renderDockerContainerDashboard(model) {
  const maximum = Math.max(model.images.length, model.networks.length, model.volumes.length, 1); const asset = (label, value) => `<div class="container-asset-metric" style="--fill:${(value / maximum * 100).toFixed(0)}%"><div></div><b>${value}</b><span>${label}</span></div>`;
  const fleet = model.containers.length ? model.containers.map((item) => dockerContainerRow(item, model)).join("") : '<div class="container-section-empty">No Docker containers were returned.</div>';
  const usage = model.diskUsage.map((item) => `<article class="container-asset-row"><span>${escapeHtml(item.Type || "ASSET")}</span><div><b>${escapeHtml(String(item.TotalCount ?? item.Count ?? "—"))} total · ${escapeHtml(String(item.Active ?? "—"))} active</b><small>${escapeHtml(item.Size || "size unavailable")}</small></div><em>${escapeHtml(item.Reclaimable || "reclaimable N/A")}</em></article>`).join("");
  const networks = [...model.networks.map((item) => ({ type: "NETWORK", name: item.Name, detail: `${item.Driver || "driver unknown"} · ${item.Scope || "scope unknown"}` })), ...model.volumes.map((item) => ({ type: "VOLUME", name: item.Name, detail: `${item.Driver || "driver unknown"} · ${item.Scope || "local"}` }))].map((item) => `<article class="container-asset-row"><span>${item.type}</span><div><b>${escapeHtml(item.name || "unnamed")}</b><small>${escapeHtml(item.detail)}</small></div><em>DISCOVERED</em></article>`).join("") || '<div class="container-section-empty">No Docker networks or volumes were returned.</div>';
  $("#containerVisualBody").innerHTML = `<div class="container-visual-grid"><section class="container-visual-card wide"><div class="container-visual-head"><div><h3>Docker engine profile</h3><p>Runtime, storage driver and host capacity</p></div><span>${escapeHtml(model.info.Name || "ACTIVE CONTEXT")}</span></div><div class="container-engine-profile"><div><span>SERVER VERSION</span><b>${escapeHtml(model.info.ServerVersion || "Unavailable")}</b></div><div><span>OPERATING SYSTEM</span><b>${escapeHtml(model.info.OperatingSystem || model.info.OSType || "Unavailable")}</b></div><div><span>CPU CAPACITY</span><b>${Number(model.info.NCPU || 0).toLocaleString()} cores</b></div><div><span>STORAGE DRIVER</span><b>${escapeHtml(model.info.Driver || "Unavailable")}</b></div></div></section><section class="container-visual-card"><div class="container-visual-head"><div><h3>Container fleet</h3><p>State, image, network and live resource usage</p></div><span>${model.running}/${model.containers.length} RUNNING</span></div><div class="container-fleet-list">${fleet}</div></section><section class="container-visual-card"><div class="container-visual-head"><div><h3>Runtime asset distribution</h3><p>Images, networks and persistent volumes</p></div><span>INVENTORY</span></div><div class="container-asset-chart">${asset("IMAGES", model.images.length)}${asset("NETWORKS", model.networks.length)}${asset("VOLUMES", model.volumes.length)}</div><div class="container-asset-list">${usage || '<div class="container-section-empty">Docker disk-usage detail is unavailable.</div>'}</div></section><section class="container-visual-card wide"><div class="container-visual-head"><div><h3>Networks & volumes</h3><p>Current connectivity and persistence inventory</p></div><span>${model.networks.length + model.volumes.length} ASSETS</span></div><div class="container-asset-list">${networks}</div></section></div>`;
}

function currentContainerWriteAction() {
  return (containerWriteActions[state.containerDashboard.mode] || []).find((item) => item.id === $("#containerWriteAction").value) || containerWriteActions[state.containerDashboard.mode]?.[0];
}

function renderContainerWriteTargets() {
  const action = currentContainerWriteAction(); const snapshot = state.containerDashboard[state.containerDashboard.mode]; let targets = [];
  if (state.containerDashboard.mode === "kubernetes" && snapshot?.model) targets = (action?.targetKind === "pod" ? snapshot.model.pods : snapshot.model.deployments).map((item) => item.metadata?.name).filter(Boolean);
  if (state.containerDashboard.mode === "docker" && snapshot?.model) targets = snapshot.model.containers.flatMap((item) => [item.Names || item.Name, String(item.ID || "").slice(0, 12)]).filter(Boolean);
  $("#containerWriteTargets").innerHTML = [...new Set(targets)].slice(0, 250).map((target) => `<option value="${escapeHtml(target)}"></option>`).join("");
}

function renderContainerWriteControls() {
  const platform = state.containerDashboard.mode; const actions = containerWriteActions[platform] || []; const previous = $("#containerWriteAction").value;
  $("#containerWriteAction").innerHTML = actions.map((action) => `<option value="${action.id}">${escapeHtml(action.label)}</option>`).join("");
  if (actions.some((action) => action.id === previous)) $("#containerWriteAction").value = previous;
  const action = currentContainerWriteAction(); $("#containerWriteValueField").classList.toggle("hidden", !action?.needsValue); $("#containerWriteTarget").placeholder = action?.placeholder || "Target name or ID";
  $("#containerWriteTitle").textContent = platform === "kubernetes" ? "Kubernetes operational action" : "Docker lifecycle action";
  $("#containerWriteGuidance").textContent = action?.guidance || "Select an approved action.";
  $("#containerWriteSafety").textContent = platform === "kubernetes" ? "Kubernetes changes require a specific namespace and your existing kubeconfig permissions. DBridge cannot bypass RBAC." : "Docker changes use the active local engine context and your existing daemon permissions. Image, volume and network removal are not allowed here.";
  renderContainerWriteTargets(); resetContainerPreflight();
}

function resetContainerPreflight(message = "Choose an action and run Preview & preflight.") {
  state.containerDashboard.preflightKey = ""; $("#containerPreflightStatus").textContent = "NOT RUN"; $("#containerPreflightStatus").className = ""; $("#containerPreflightOutput").textContent = message;
}

function containerWriteRequestBody(confirmed = false) {
  if (state.containerDashboard.accessMode !== "write") throw new Error("Unlock Read-write mode first");
  const platform = state.containerDashboard.mode; const action = currentContainerWriteAction(); const target = $("#containerWriteTarget").value.trim(); const namespace = $("#containerDashboardNamespace").value.trim();
  if (!action || !target) throw new Error("Choose an operation and enter its exact target");
  if (platform === "kubernetes" && !namespace) throw new Error("Enter a specific Kubernetes namespace before making a change");
  const value = Number($("#containerWriteValue").value); if (action.needsValue && (!Number.isInteger(value) || value < 0 || value > 1000)) throw new Error("Replica count must be a whole number from 0 to 1,000");
  return { platform, action: action.id, target, value, changeReference: $("#containerChangeReference").value.trim(), context: $("#containerDashboardContext").value.trim(), namespace, accessMode: "read-write", ...(confirmed ? { confirmation: "APPLY CONTAINER CHANGE" } : {}) };
}

function containerWritePreflightKey(body) {
  return JSON.stringify({ platform: body.platform, action: body.action, target: body.target, value: body.value, changeReference: body.changeReference, context: body.context, namespace: body.namespace });
}

function renderContainerAudit() {
  const records = state.containerDashboard.audit; $("#containerAuditCount").textContent = `${records.length} record${records.length === 1 ? "" : "s"}`;
  $("#containerAuditList").innerHTML = records.length ? records.slice(0, 30).map((record) => { const action = (containerWriteActions[record.platform] || []).find((item) => item.id === record.action); const scope = record.platform === "kubernetes" ? `${record.context || "active context"} / ${record.namespace || "namespace"}` : "active Docker engine"; return `<article class="container-audit-row ${escapeHtml(record.status)}"><span>${escapeHtml(record.status.toUpperCase())}</span><div><b>${escapeHtml(action?.label || record.action)} · ${escapeHtml(record.target)}</b><small>${escapeHtml(scope)}${record.changeReference ? ` · ${escapeHtml(record.changeReference)}` : ""}</small></div><time>${escapeHtml(new Date(record.occurredAt).toLocaleString())}</time></article>`; }).join("") : '<div class="container-audit-empty">No Kubernetes or Docker changes have been recorded locally.</div>';
}

async function loadContainerAudit() {
  try { const result = await api("/api/devops/container-actions/audit"); state.containerDashboard.audit = result.records || []; renderContainerAudit(); }
  catch (error) { $("#containerAuditList").innerHTML = `<div class="container-audit-empty">${escapeHtml(error.message)}</div>`; }
}

async function previewContainerWriteAction() {
  let body; try { body = containerWriteRequestBody(false); } catch (error) { toast(error.message, true); return false; }
  const button = $("#previewContainerWriteAction"); setBusy(button, true, "Checking…"); $("#containerPreflightStatus").textContent = "CHECKING"; $("#containerPreflightStatus").className = ""; $("#containerPreflightOutput").textContent = "Building the allowlisted command and checking current platform permission…";
  try {
    const result = await api("/api/devops/container-action/preview", { method: "POST", body: JSON.stringify(body) }); const evidence = result.evidence || (result.permitted ? "Permission check passed." : "Permission check did not pass.");
    $("#containerPreflightStatus").textContent = result.permitted ? "PERMITTED" : "BLOCKED"; $("#containerPreflightStatus").className = result.permitted ? "pass" : "blocked"; $("#containerPreflightOutput").textContent = [`ACTION  > ${result.displayCommand}`, `PRECHECK > ${result.preflightCommand}`, `RESULT   > ${result.permitted ? "PERMITTED" : "BLOCKED"}`, evidence].join("\n"); state.containerDashboard.preflightKey = result.permitted ? containerWritePreflightKey(body) : ""; toast(result.permitted ? "Preflight passed" : "Preflight blocked this change", !result.permitted); return result.permitted;
  } catch (error) { resetContainerPreflight(error.message); $("#containerPreflightStatus").textContent = "FAILED"; $("#containerPreflightStatus").className = "blocked"; toast(error.message, true); return false; }
  finally { setBusy(button, false); }
}

function setContainerAccessMode(mode) {
  if (!['read', 'write'].includes(mode) || state.containerDashboard.accessMode === mode) return;
  if (mode === "write" && !confirm("Unlock advanced Read-write mode?\n\nOnly the listed lifecycle actions are available. DBridge previews the exact command, runs a permission preflight, requires a second confirmation, and records a sanitized local audit entry.")) return;
  state.containerDashboard.accessMode = mode; const write = mode === "write";
  $$('[data-container-access]').forEach((button) => button.classList.toggle("active", button.dataset.containerAccess === mode)); $(".container-access-bar").classList.toggle("write-mode", write); $("#containerWritePanel").classList.toggle("hidden", !write); $("#containerAccessBadge").classList.toggle("write-mode", write);
  $("#containerAccessBadge").textContent = write ? "LIVE · READ / WRITE" : "LIVE · READ ONLY"; $("#containerAccessIcon").textContent = write ? "RW" : "RO"; $("#containerAccessTitle").textContent = write ? "Read-write mode unlocked" : "Read-only mode"; $("#containerAccessDescription").textContent = write ? "Only allowlisted operational actions are available; confirmation and platform authorization are still required." : "Fixed health and inventory commands only. No workload or container state can be changed.";
  const snapshot = state.containerDashboard[state.containerDashboard.mode]; if (snapshot) updateContainerDashboardSummary(snapshot.model, state.containerDashboard.mode);
  if (write) { renderContainerWriteControls(); loadContainerAudit(); } else resetContainerPreflight("Read-write mode is locked.");
  toast(write ? "Read-write mode unlocked for this session" : "Dashboard returned to Read-only mode");
}

async function applyContainerWriteAction() {
  let body; try { body = containerWriteRequestBody(true); } catch (error) { return toast(error.message, true); }
  const action = currentContainerWriteAction(); const key = containerWritePreflightKey(body); if (state.containerDashboard.preflightKey !== key && !await previewContainerWriteAction()) return;
  const scope = body.platform === "kubernetes" ? `${body.context || "active context"} / ${body.namespace}` : "active Docker engine";
  if (!confirm(`Apply this preflight-approved change?\n\n${action.label}\nTarget: ${body.target}\nScope: ${scope}${action.needsValue ? `\nReplicas: ${body.value}` : ""}${body.changeReference ? `\nReference: ${body.changeReference}` : ""}\n\nThe action runs immediately and is added to the local audit history.`)) return;
  const button = $("#applyContainerWriteAction"); setBusy(button, true, "Applying…"); $("#containerWriteOutput").textContent = `Applying ${action.label} to ${body.target}…`;
  try {
    const result = await api("/api/devops/container-action", { method: "POST", body: JSON.stringify(body) }); $("#containerWriteOutput").textContent = [`> ${result.displayCommand}`, result.stdout, result.stderr, result.auditWarning ? `AUDIT WARNING: ${result.auditWarning}` : ""].filter(Boolean).join("\n") || "Action completed."; toast(`${action.label} completed`); state.containerDashboard.preflightKey = ""; await loadContainerAudit(); await refreshContainerDashboard(); if ($("#containerAutoLock").checked) setContainerAccessMode("read");
  } catch (error) { $("#containerWriteOutput").textContent = error.message; await loadContainerAudit(); toast(error.message, true); }
  finally { setBusy(button, false); }
}

function setContainerDashboardMode(mode) {
  if (!['kubernetes', 'docker'].includes(mode)) return; state.containerDashboard.mode = mode; $$('[data-container-dashboard]').forEach((button) => button.classList.toggle("active", button.dataset.containerDashboard === mode)); $("#containerKubernetesScope").classList.toggle("hidden", mode === "docker");
  $("#containerDashboardScope").textContent = mode === "kubernetes" ? `Kubernetes · ${$("#containerDashboardContext").value.trim() || "active context"} · ${$("#containerDashboardNamespace").value.trim() || "all namespaces"}` : "Docker · active local context";
  const snapshot = state.containerDashboard[mode]; if (snapshot) { updateContainerDashboardSummary(snapshot.model, mode); if (mode === "kubernetes") renderKubernetesContainerDashboard(snapshot.model); else renderDockerContainerDashboard(snapshot.model); $("#containerDashboardUpdated").textContent = `Captured ${new Date(snapshot.collectedAt).toLocaleString()}`; }
  else { $("#containerPlatformHealth").textContent = "NOT RUN"; $("#containerPlatformHealth").className = ""; ["#containerObjectCount", "#containerReadyCount", "#containerWarningCount", "#containerCpuPressure", "#containerMemoryPressure"].forEach((selector) => $(selector).textContent = "—"); $("#containerVisualBody").innerHTML = `<div class="container-visual-empty"><span>${mode === "kubernetes" ? "K8S" : "DKR"}</span><h3>${mode === "kubernetes" ? "Map the Kubernetes cluster" : "Inspect the Docker engine"}</h3><p>Refresh to collect fixed read-only health, inventory, resource and warning evidence from the approved local client.</p></div>`; $("#containerDashboardUpdated").textContent = "No snapshot captured"; }
  if (state.containerDashboard.accessMode === "write") { $("#containerWriteTarget").value = ""; renderContainerWriteControls(); }
}

async function refreshContainerDashboard() {
  const mode = state.containerDashboard.mode; const button = $("#refreshContainerDashboard"); const status = $("#containerDashboardStatus"); setBusy(button, true, "Collecting…"); status.className = "live"; status.innerHTML = "<i></i>COLLECTING";
  try {
    const path = mode === "kubernetes" ? "/api/devops/kubernetes-dashboard" : "/api/devops/docker-dashboard"; const body = mode === "kubernetes" ? { context: $("#containerDashboardContext").value.trim(), namespace: $("#containerDashboardNamespace").value.trim() } : {};
    const result = await api(path, { method: "POST", body: JSON.stringify(body) }); const model = mode === "kubernetes" ? parseKubernetesDashboard(result.sections) : parseDockerDashboard(result.sections); state.containerDashboard[mode] = { model, collectedAt: result.collectedAt, durationMs: result.durationMs }; updateContainerDashboardSummary(model, mode); if (mode === "kubernetes") renderKubernetesContainerDashboard(model); else renderDockerContainerDashboard(model); renderContainerWriteTargets(); $("#containerDashboardScope").textContent = mode === "kubernetes" ? `Kubernetes · ${body.context || "active context"} · ${body.namespace || "all namespaces"}` : `Docker · ${model.info.Name || "active local context"}`; $("#containerDashboardUpdated").textContent = `Captured ${new Date(result.collectedAt).toLocaleString()} · ${result.durationMs.toLocaleString()} ms`; status.className = "live"; status.innerHTML = "<i></i>LIVE SNAPSHOT"; toast(`${mode === "kubernetes" ? "Kubernetes" : "Docker"} visual dashboard refreshed`);
  } catch (error) { status.className = "failed"; status.innerHTML = "<i></i>FAILED"; $("#containerVisualBody").innerHTML = `<div class="container-visual-empty"><span>!</span><h3>Dashboard collection failed</h3><p>${escapeHtml(error.message)}</p></div>`; toast(error.message, true); }
  finally { setBusy(button, false); }
}

async function captureDirectPlan() {
  const engine = $("#directPlanEngine").value; const identifier = $("#directPlanIdentifier").value.trim(); const button = $("#captureDirectPlan"); if (!identifier) return toast("Enter a statement identifier", true); setBusy(button, true, "Capturing…");
  try { const result = await api("/api/performance/plan-capture", { method: "POST", body: JSON.stringify({ ...connection(), engine, identifier, timeoutMs: 45000 }) }); $("#planEngine").value = engine; $("#planIdentifier").value = identifier; $("#planText").value = result.planText; switchInvestigationTab("plan"); const plan = analyzePlanContent(result.planText, engine); renderPlanAnalysis(plan); toast(`Plan captured from ${result.source}`); } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
}

async function capturePlanHistory() {
  const engine = $("#directPlanEngine").value; const identifier = $("#directPlanIdentifier").value.trim(); const button = $("#capturePlanHistory"); if (!identifier) return toast("Enter a statement identifier", true); setBusy(button, true, "Reading history…");
  try { const result = await api("/api/performance/plan-history", { method: "POST", body: JSON.stringify({ ...connection(), engine, identifier, timeoutMs: 45000 }) }); $("#historyRows").textContent = result.summary.rows.toLocaleString(); $("#historyPlans").textContent = result.summary.distinctPlanMarkers.toLocaleString(); $("#historySensitivity").textContent = result.summary.bindSensitive.toLocaleString(); $("#historyWarnings").textContent = result.summary.warningSignals.toLocaleString(); $("#planHistoryOutput").textContent = [result.stdout, result.stderr].filter(Boolean).join("\n") || "No plan history rows returned."; toast("Plan stability history captured"); } catch (error) { $("#planHistoryOutput").textContent = error.message; toast(error.message, true); } finally { setBusy(button, false); }
}

function renderBlockingOutput(output) {
  const lines = String(output || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 80); $("#blockingMap").innerHTML = lines.length ? lines.map((line, index) => `<article class="blocking-node"><span>${index ? "SQL" : "ROOT"}</span><div><b>${index ? `Waiting evidence ${index}` : "Blocking snapshot"}</b><small>${escapeHtml(line)}</small></div><em>${index ? "BLOCKED" : "SOURCE"}</em></article>`).join("") : '<div class="blocking-empty"><span>OK</span><b>No blocking rows returned</b><p>No active blocking chain was visible in this snapshot.</p></div>';
}

async function captureBlockingMap() {
  const engine = $("#blockingEngine").value; const check = engine === "mongodb" ? "locks" : "blockers"; const button = $("#captureBlockingMap"); setBusy(button, true, "Mapping…");
  try { const result = await api("/api/performance/check", { method: "POST", body: JSON.stringify({ ...connection(), engine, check, timeoutMs: 45000 }) }); renderBlockingOutput([result.stdout, result.stderr].filter(Boolean).join("\n")); toast("Wait and blocking map captured"); } catch (error) { $("#blockingMap").innerHTML = `<div class="blocking-empty"><span>!</span><b>Blocking map unavailable</b><p>${escapeHtml(error.message)}</p></div>`; toast(error.message, true); } finally { setBusy(button, false); }
}

function runPlanIndexAdvisor() {
  const plan = state.investigation.currentPlan; if (!plan) return toast("Analyze an execution plan first", true);
  const candidates = plan.operators.filter((node) => /full|seq(?:uential)? scan|collscan|table scan/i.test(`${node.operation} ${node.raw || ""}`)).map((node) => { const rows = Math.max(node.actualRows, node.estimatedRows); const readBenefit = Math.min(95, 45 + Math.log10(Math.max(rows, 1)) * 8); const writeCost = Math.min(80, 18 + Math.log10(Math.max(rows, 1)) * 5); const storage = Math.min(85, 15 + Math.log10(Math.max(rows, 1)) * 6); return { node, rows, readBenefit, writeCost, storage }; });
  $("#indexAdvice").innerHTML = candidates.length ? candidates.map((candidate) => `<article class="index-candidate"><div><h3>Candidate access path for ${escapeHtml(candidate.node.object || candidate.node.operation)}</h3><p>${candidate.rows.toLocaleString()} rows · ${escapeHtml(candidate.node.operation)}. Align leading columns with selective filters and required sort order.</p></div><div class="candidate-score read"><span>READ BENEFIT</span><b>${candidate.readBenefit.toFixed(0)}/100</b></div><div class="candidate-score write"><span>WRITE COST</span><b>${candidate.writeCost.toFixed(0)}/100</b></div><div class="candidate-score storage"><span>STORAGE</span><b>${candidate.storage.toFixed(0)}/100</b></div><footer>Validate with the live execution plan and existing index inventory. Consolidate overlapping indexes and measure DML overhead before deployment.</footer></article>`).join("") : '<div class="blocking-empty"><span>OK</span><b>No scan-based index candidate detected</b><p>Review join, sort, cardinality, and returned-row findings before adding an index.</p></div>';
  toast(`${candidates.length} index candidate${candidates.length === 1 ? "" : "s"} evaluated`);
}

function topologyObjectCard(kind, item) {
  const name = item.metadata?.name || "unnamed"; const namespace = item.metadata?.namespace || "default";
  let detail = namespace; let readiness = "ready";
  if (kind === "Deployment") {
    const expected = Number(item.spec?.replicas || 0); const ready = Number(item.status?.readyReplicas || 0); detail = `${namespace} · ${ready}/${expected} ready`; readiness = ready >= expected ? "ready" : ready ? "warning" : "failed";
  } else if (kind === "Pod") {
    const phase = item.status?.phase || "Unknown"; const ready = (item.status?.containerStatuses || []).every((container) => container.ready); detail = `${namespace} · ${phase}`; readiness = phase === "Running" && ready ? "ready" : phase === "Failed" ? "failed" : "warning";
  } else {
    const type = item.spec?.type || "ClusterIP"; const endpoints = item.spec?.selector ? Object.keys(item.spec.selector).length : 0; detail = `${namespace} · ${type} · ${endpoints} selector${endpoints === 1 ? "" : "s"}`; readiness = endpoints ? "ready" : "warning";
  }
  return `<article class="topology-object ${readiness}"><b>${escapeHtml(name)}</b><small>${escapeHtml(detail)}</small></article>`;
}

function renderKubernetesTopology(items) {
  const groups = { Deployment: [], Pod: [], Service: [] };
  for (const item of items || []) if (groups[item.kind]) groups[item.kind].push(item);
  const total = Object.values(groups).reduce((sum, group) => sum + group.length, 0); $("#topologyObjects").textContent = total.toLocaleString();
  if (!total) { $("#topologyMap").innerHTML = '<div class="module-empty">No deployments, pods, or services were returned for this scope.</div>'; return; }
  const lane = (kind, label) => `<div class="topology-lane"><h4>${label} · ${groups[kind].length}</h4>${groups[kind].length ? groups[kind].slice(0, 80).map((item) => topologyObjectCard(kind, item)).join("") : '<div class="module-empty">None</div>'}</div>`;
  $("#topologyMap").innerHTML = `<div class="topology-lanes">${lane("Deployment", "DEPLOYMENTS")}<div class="topology-arrow">→</div>${lane("Pod", "PODS")}<div class="topology-arrow">→</div>${lane("Service", "SERVICES")}</div>`;
}

async function captureKubernetesTopology() {
  const button = $("#captureTopology"); setBusy(button, true, "Mapping…");
  try {
    const result = await api("/api/devops/kubernetes-topology", { method: "POST", body: JSON.stringify({ context: $("#topologyContext").value.trim(), namespace: $("#topologyNamespace").value.trim() }) });
    const document = JSON.parse(result.stdout || "{}"); const items = Array.isArray(document.items) ? document.items : [];
    state.intelligence.topology = { items, capturedAt: new Date().toISOString(), command: result.displayCommand }; renderKubernetesTopology(items); toast(`Mapped ${items.length} Kubernetes object${items.length === 1 ? "" : "s"}`);
  } catch (error) { $("#topologyMap").innerHTML = `<div class="module-empty">${escapeHtml(error.message)}</div>`; toast(error.message, true); }
  finally { setBusy(button, false); }
}

function pipelineRunKey(run) { return `${run.workflowName || run.name || "workflow"}|${run.headBranch || "branch"}|${run.event || "event"}`; }
function pipelineRunState(run) { return String(run.conclusion || run.status || "unknown").toLowerCase(); }

function renderPipelineRuns(runs, changedKeys = new Set()) {
  $("#pipelineRuns").innerHTML = runs.length ? runs.map((run) => { const status = pipelineRunState(run); const className = status === "success" ? "success" : ["failure", "cancelled", "timed_out", "action_required"].includes(status) ? "failure" : "running"; const changed = changedKeys.has(pipelineRunKey(run)); return `<article class="pipeline-run ${className}"><i></i><div><b>${escapeHtml(run.workflowName || run.name || "GitHub workflow")}${changed ? " · CHANGED" : ""}</b><small>${escapeHtml(run.headBranch || "default branch")} · ${escapeHtml(run.event || "event")} · ${escapeHtml(status)}</small></div><em>${run.createdAt ? escapeHtml(new Date(run.createdAt).toLocaleString()) : "—"}</em></article>`; }).join("") : '<div class="module-empty">No workflow runs were returned.</div>';
}

async function capturePipelineRuns() {
  const button = $("#capturePipelineRuns"); setBusy(button, true, "Capturing…");
  try {
    const repository = $("#pipelineRepository").value.trim(); const result = await api("/api/devops/pipeline-runs", { method: "POST", body: JSON.stringify({ repository }) }); const runs = JSON.parse(result.stdout || "[]");
    if (!Array.isArray(runs)) throw new Error("GitHub CLI returned an unexpected pipeline result");
    state.intelligence.pipelineCurrent = { repository, runs, data: JSON.stringify(runs), capturedAt: new Date().toISOString() }; renderPipelineRuns(runs); $("#savePipelineSnapshot").disabled = !runs.length; $("#pipelineChangeCount").textContent = "—"; toast(`Captured ${runs.length} workflow run${runs.length === 1 ? "" : "s"}`);
  } catch (error) { $("#pipelineRuns").innerHTML = `<div class="module-empty">${escapeHtml(error.message)}</div>`; toast(error.message, true); }
  finally { setBusy(button, false); }
}

function renderPipelineBaselines() {
  const snapshots = (state.investigation.devopsSnapshots || []).filter((snapshot) => snapshot.type === "pipeline"); const select = $("#pipelineBaseline"); if (!select) return; const current = select.value;
  select.innerHTML = `<option value="">Saved pipeline baseline</option>${snapshots.map((snapshot) => `<option value="${snapshot.id}">${escapeHtml(snapshot.name)} · ${escapeHtml(new Date(snapshot.capturedAt).toLocaleString())}</option>`).join("")}`; if (snapshots.some((snapshot) => snapshot.id === current)) select.value = current;
}

async function savePipelineSnapshot() {
  const current = state.intelligence.pipelineCurrent; if (!current?.runs.length) return toast("Capture pipeline runs first", true); const button = $("#savePipelineSnapshot"); setBusy(button, true, "Saving…");
  try { const name = `${current.repository || "Active GitHub repository"} · ${new Date().toLocaleString()}`; const result = await api("/api/investigation/devops-snapshots", { method: "POST", body: JSON.stringify({ type: "pipeline", name, data: current.data, metadata: { repository: current.repository || "active context", runCount: current.runs.length } }) }); state.investigation.devopsSnapshots = result.store.devopsSnapshots; renderPipelineBaselines(); toast("Pipeline baseline saved locally"); } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
}

function comparePipelineRuns() {
  const current = state.intelligence.pipelineCurrent; const baseline = state.investigation.devopsSnapshots.find((snapshot) => snapshot.id === $("#pipelineBaseline").value && snapshot.type === "pipeline"); if (!current || !baseline) return toast("Capture current runs and select a saved baseline", true);
  try {
    const before = JSON.parse(baseline.data); const latestBefore = new Map(); for (const run of before) if (!latestBefore.has(pipelineRunKey(run))) latestBefore.set(pipelineRunKey(run), pipelineRunState(run));
    const changed = new Set(); for (const run of current.runs) { const key = pipelineRunKey(run); const previous = latestBefore.get(key); if (!previous || previous !== pipelineRunState(run)) changed.add(key); }
    $("#pipelineChangeCount").textContent = changed.size.toLocaleString(); renderPipelineRuns(current.runs, changed); toast(`${changed.size} pipeline outcome change${changed.size === 1 ? "" : "s"} detected`);
  } catch (error) { toast(`Saved pipeline baseline is invalid: ${error.message}`, true); }
}

function textFingerprint(text) {
  let hash = 2166136261; for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); } return `FNV-${(hash >>> 0).toString(16).padStart(8, "0").toUpperCase()}`;
}

async function loadDriftFile(side) {
  const input = $(`#drift${side === "baseline" ? "Baseline" : "Current"}File`); const file = input.files?.[0]; if (!file) return; if (file.size > 8 * 1024 * 1024) { input.value = ""; return toast("Configuration comparison files are limited to 8 MB", true); }
  try { const text = await file.text(); if (/\0/.test(text)) throw new Error("Binary configuration files are not supported"); const summary = { name: file.name, size: file.size, lines: text.replace(/\r\n?/g, "\n").split("\n").length, fingerprint: textFingerprint(text) }; state.intelligence[side === "baseline" ? "driftBaseline" : "driftCurrent"] = summary; $(`#drift${side === "baseline" ? "Baseline" : "Current"}Name`).textContent = `${file.name} · ${summary.fingerprint}`; } catch (error) { toast(error.message, true); }
}

function compareConfigurationDrift() {
  const before = state.intelligence.driftBaseline; const after = state.intelligence.driftCurrent; if (!before || !after) return toast("Choose both configuration files", true); const changed = before.fingerprint !== after.fingerprint; const signed = (value) => `${value >= 0 ? "+" : ""}${value.toLocaleString()}`;
  $("#driftResult").innerHTML = `<div class="drift-comparison"><div class="${changed ? "changed" : "same"}"><span>CONTENT</span><b>${changed ? "CHANGED" : "IDENTICAL"}</b></div><div><span>LINE DELTA</span><b>${signed(after.lines - before.lines)}</b></div><div><span>SIZE DELTA</span><b>${signed(after.size - before.size)} B</b></div></div><div class="module-empty">${escapeHtml(before.name)} (${before.fingerprint}) → ${escapeHtml(after.name)} (${after.fingerprint})</div>`; toast(changed ? "Configuration drift detected" : "No configuration drift detected");
}

async function saveDriftSnapshot() {
  const summary = state.intelligence.driftBaseline; if (!summary) return toast("Choose a baseline configuration file first", true); const button = $("#saveDriftSnapshot"); setBusy(button, true, "Saving…");
  try { const name = $("#driftBaselineLabel").value.trim() || `${summary.name} fingerprint`; const result = await api("/api/investigation/devops-snapshots", { method: "POST", body: JSON.stringify({ type: "configuration", name, data: JSON.stringify(summary), metadata: { fingerprint: summary.fingerprint, fileName: summary.name, lines: summary.lines, bytes: summary.size } }) }); state.investigation.devopsSnapshots = result.store.devopsSnapshots; toast("Configuration fingerprint saved without file contents"); } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
}

function parseKafkaLag(output) {
  const lines = String(output || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean); const headerIndex = lines.findIndex((line) => /\bGROUP\b/.test(line) && /\bTOPIC\b/.test(line) && /\bLAG\b/.test(line)); if (headerIndex < 0) return [];
  const headers = lines[headerIndex].split(/\s+/); const positions = Object.fromEntries(headers.map((header, index) => [header, index]));
  return lines.slice(headerIndex + 1).map((line) => line.split(/\s+/)).filter((cells) => cells.length > positions.LAG).map((cells) => ({ group: cells[positions.GROUP] || "—", topic: cells[positions.TOPIC] || "—", partition: cells[positions.PARTITION] || "—", current: Number(cells[positions["CURRENT-OFFSET"]]) || 0, end: Number(cells[positions["LOG-END-OFFSET"]]) || 0, lag: Math.max(Number(cells[positions.LAG]) || 0, 0) }));
}

function renderKafkaLag(rows) {
  const total = rows.reduce((sum, row) => sum + row.lag, 0); const max = Math.max(...rows.map((row) => row.lag), 1); $("#kafkaLagTotal").textContent = total.toLocaleString();
  $("#kafkaLagView").innerHTML = rows.length ? rows.sort((a, b) => b.lag - a.lag).map((row) => `<article class="lag-row"><div><b>${escapeHtml(row.group)} · ${escapeHtml(row.topic)} · partition ${escapeHtml(row.partition)}</b><small>${row.current.toLocaleString()} current → ${row.end.toLocaleString()} log end</small></div><div class="lag-meter"><span><em>LAG</em><b>${row.lag.toLocaleString()}</b></span><div><i style="width:${Math.max(row.lag / max * 100, row.lag ? 3 : 0).toFixed(1)}%"></i></div></div></article>`).join("") : '<div class="module-empty">No consumer lag rows were returned.</div>';
}

async function captureKafkaLag() {
  const button = $("#captureKafkaLag"); setBusy(button, true, "Capturing…");
  try { const endpoint = $("#kafkaLagEndpoint").value.trim(); const group = $("#kafkaLagGroup").value.trim(); const result = await api("/api/devops/kafka-lag", { method: "POST", body: JSON.stringify({ endpoint, group }) }); const rows = parseKafkaLag(result.stdout); state.intelligence.kafkaCurrent = { endpoint, group, rows, data: result.stdout, capturedAt: new Date().toISOString() }; renderKafkaLag(rows); $("#saveKafkaSnapshot").disabled = !rows.length; toast(`Captured ${rows.length} Kafka partition${rows.length === 1 ? "" : "s"}`); } catch (error) { $("#kafkaLagView").innerHTML = `<div class="module-empty">${escapeHtml(error.message)}</div>`; toast(error.message, true); } finally { setBusy(button, false); }
}

async function saveKafkaSnapshot() {
  const current = state.intelligence.kafkaCurrent; if (!current?.rows.length) return toast("Capture Kafka lag first", true); const button = $("#saveKafkaSnapshot"); setBusy(button, true, "Saving…");
  try { const result = await api("/api/investigation/devops-snapshots", { method: "POST", body: JSON.stringify({ type: "kafka", name: `${current.group || "All consumer groups"} · ${new Date().toLocaleString()}`, data: current.data, metadata: { endpoint: current.endpoint, group: current.group || "all", partitions: current.rows.length, totalLag: current.rows.reduce((sum, row) => sum + row.lag, 0) } }) }); state.investigation.devopsSnapshots = result.store.devopsSnapshots; toast("Kafka lag snapshot saved locally"); } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
}

function updateRunbookActions() {
  const tool = $("#runbookTool").value; $("#runbookActions").innerHTML = Object.entries(actions[tool] || {}).map(([id, label]) => `<option value="${id}">${escapeHtml(label)}</option>`).join("");
}

function renderRunbooks() {
  const runbooks = state.investigation.runbooks || []; const list = $("#runbookList"); if (!list) return;
  list.innerHTML = runbooks.length ? runbooks.map((runbook) => `<article class="runbook-card"><h4>${escapeHtml(runbook.name)}</h4><p>${escapeHtml(labels[runbook.tool] || runbook.tool)} · ${runbook.actions.length} approved steps</p><div><button data-run-runbook="${runbook.id}">Run</button><button data-delete-runbook="${runbook.id}">Delete</button></div></article>`).join("") : '<div class="module-empty">Create a runbook from approved inspection actions.</div>';
  $$('[data-run-runbook]').forEach((button) => button.addEventListener("click", () => runSavedRunbook(button.dataset.runRunbook))); $$('[data-delete-runbook]').forEach((button) => button.addEventListener("click", () => deleteSavedRunbook(button.dataset.deleteRunbook)));
}

async function saveRunbook() {
  const tool = $("#runbookTool").value; const selected = [...$("#runbookActions").selectedOptions].map((option) => option.value); const name = $("#runbookName").value.trim(); if (!selected.length) return toast("Select at least one approved runbook action", true); const button = $("#saveRunbook"); setBusy(button, true, "Saving…");
  try { const result = await api("/api/investigation/runbooks", { method: "POST", body: JSON.stringify({ name, tool, actions: selected }) }); state.investigation.runbooks = result.store.runbooks; renderRunbooks(); $("#runbookName").value = ""; toast("Approved diagnostic runbook saved locally"); } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
}

async function deleteSavedRunbook(id) { try { const result = await api("/api/investigation/runbooks/delete", { method: "POST", body: JSON.stringify({ id }) }); state.investigation.runbooks = result.store.runbooks; renderRunbooks(); toast("Runbook deleted"); } catch (error) { toast(error.message, true); } }

async function runSavedRunbook(id) {
  const runbook = state.investigation.runbooks.find((item) => item.id === id); if (!runbook) return toast("The runbook no longer exists", true); if (!window.confirm(`Run ${runbook.actions.length} approved ${labels[runbook.tool] || runbook.tool} inspection steps?`)) return;
  const output = $("#runbookOutput"); output.textContent = `DBridge approved runbook · ${runbook.name}\nTool: ${labels[runbook.tool] || runbook.tool}\nStarted: ${new Date().toLocaleString()}\n`; state.intelligence.runbookStop = false; const context = currentDevopsAuditContext(runbook.tool);
  for (let index = 0; index < runbook.actions.length; index += 1) {
    const action = runbook.actions[index]; output.textContent += `\n=== ${index + 1}/${runbook.actions.length} · ${actions[runbook.tool][action]} ===\n`; output.scrollTop = output.scrollHeight;
    try { const result = await api("/api/devops/run", { method: "POST", body: JSON.stringify({ tool: runbook.tool, action, ...context }) }); output.textContent += `${result.displayCommand}\n${[result.stdout, result.stderr].filter(Boolean).join("\n") || "Completed without output."}\n`; } catch (error) { output.textContent += `FAILED: ${error.message}\nRunbook stopped after the failed step.\n`; toast(`${runbook.name} stopped at ${actions[runbook.tool][action]}`, true); return; }
  }
  output.textContent += `\nCompleted: ${new Date().toLocaleString()}\n`; output.scrollTop = output.scrollHeight; toast(`${runbook.name} completed`);
}

function formatGoldenGateLag(seconds) {
  const value = Math.max(Number(seconds) || 0, 0); const hours = Math.floor(value / 3600); const minutes = Math.floor(value % 3600 / 60); const remainder = Math.floor(value % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function goldenGatePayload() {
  return { architecture: $("#oggArchitecture").value, action: $("#oggAction").value, group: $("#oggGroup").value.trim(), endpoint: $("#oggEndpoint").value.trim(), credential: $("#oggCredential").value.trim(), deployment: $("#oggDeployment").value.trim(), host: $("#oggSshHost").value.trim(), user: $("#oggSshUser").value.trim(), port: $("#oggSshPort").value.trim(), home: $("#oggHome").value.trim(), identityFile: $("#oggSshKey").value.trim() };
}

function renderGoldenGateFindings(findings) {
  const rows = findings || []; $("#oggFindings").innerHTML = rows.length ? rows.map((finding) => `<article class="ogg-finding ${escapeHtml(String(finding.severity || "INFO").toLowerCase())}"><span>${escapeHtml(finding.severity || "INFO")}</span><div><h4>${escapeHtml(finding.title)}</h4><p>${escapeHtml(finding.evidence)}</p><small>${escapeHtml(finding.recommendation)}</small></div></article>`).join("") : '<div class="ogg-empty"><span>OK</span><b>No troubleshooting signal</b><p>Continue monitoring lag, checkpoints, reports, and ggserr.log.</p></div>';
}

function renderGoldenGateAnalysis(analysis, collectedAt) {
  const counts = analysis?.counts || {}; $("#oggRunning").textContent = Number(counts.running || 0).toLocaleString(); $("#oggAbended").textContent = Number(counts.abended || 0).toLocaleString(); $("#oggAbended").className = counts.abended ? "bad" : "good"; $("#oggMaxLag").textContent = formatGoldenGateLag(analysis?.maxLagSeconds); $("#oggMaxLag").className = analysis?.maxLagSeconds >= 300 ? "warn" : "good"; $("#oggCodes").textContent = Number(analysis?.codes?.length || 0).toLocaleString(); $("#oggUpdated").textContent = collectedAt ? new Date(collectedAt).toLocaleTimeString() : "—";
  const processes = analysis?.processes || []; $("#oggProcessGrid").innerHTML = processes.length ? processes.map((process) => `<article class="ogg-process ${escapeHtml(process.status.toLowerCase())}"><header><span>${escapeHtml(process.type)}</span><em>${escapeHtml(process.status)}</em></header><h4>${escapeHtml(process.group || "—")}</h4><p>${escapeHtml(process.raw)}</p><footer><span>LAG AT CHECKPOINT</span><b>${escapeHtml(process.lag || "00:00:00")}</b></footer></article>`).join("") : '<div class="ogg-empty"><span>OGG</span><b>No process rows parsed</b><p>Review the raw diagnostic output. Some GoldenGate versions format service status differently.</p></div>';
  renderGoldenGateFindings([...(analysis?.findings || []), ...state.goldengate.logFindings]);
}

async function runGoldenGateDiagnostic(silent = false) {
  if (state.goldengate.collecting) return; state.goldengate.collecting = true; const button = $("#oggRun"); if (!silent) setBusy(button, true, "Checking…");
  $("#oggConnectionState").textContent = "CHECKING"; $("#oggConnectionState").className = "warn"; $(".ogg-connection-note").className = "ogg-connection-note"; $("#oggDiagnosticMeta").textContent = "Connecting with an approved read-only diagnostic";
  try {
    const result = await api("/api/goldengate/diagnose", { method: "POST", body: JSON.stringify(goldenGatePayload()) }); state.goldengate.lastDiagnostic = result; $("#oggDiagnosticOutput").textContent = [result.stdout, result.stderr].filter(Boolean).join("\n") || "GoldenGate diagnostic completed without output."; $("#oggConnectionState").textContent = "CONNECTED"; $("#oggConnectionState").className = "good"; $(".ogg-connection-note").className = "ogg-connection-note good"; $("#oggDiagnosticMeta").textContent = `${result.architecture === "classic" ? "Classic GGSCI" : "Microservices Admin Client"} · ${result.action} · ${result.durationMs.toLocaleString()} ms`; renderGoldenGateAnalysis(result.analysis, result.collectedAt); if (!silent) toast("GoldenGate diagnostic completed");
  } catch (error) { $("#oggConnectionState").textContent = "FAILED"; $("#oggConnectionState").className = "bad"; $(".ogg-connection-note").className = "ogg-connection-note bad"; $("#oggDiagnosticMeta").textContent = error.message; $("#oggDiagnosticOutput").textContent = error.message; if (!silent) toast(error.message, true); }
  finally { state.goldengate.collecting = false; if (!silent) setBusy(button, false); }
}

function scheduleGoldenGateDiagnostic() {
  clearTimeout(state.goldengate.diagnosticTimer); if (!state.goldengate.running) return; state.goldengate.diagnosticTimer = setTimeout(async () => { await runGoldenGateDiagnostic(true); scheduleGoldenGateDiagnostic(); }, Number($("#oggDiagnosticInterval").value) * 1000);
}

async function toggleGoldenGateMonitor() {
  state.goldengate.running = !state.goldengate.running; $("#oggMonitor").textContent = state.goldengate.running ? "Stop live checks" : "Start live checks"; $("#oggArchitecture").disabled = state.goldengate.running; $("#oggDiagnosticInterval").disabled = state.goldengate.running;
  if (state.goldengate.running) { await runGoldenGateDiagnostic(false); if (state.goldengate.running) scheduleGoldenGateDiagnostic(); toast("GoldenGate live diagnostics started"); } else { clearTimeout(state.goldengate.diagnosticTimer); state.goldengate.diagnosticTimer = null; toast("GoldenGate live diagnostics stopped"); }
}

function updateGoldenGateArchitecture() {
  const classic = $("#oggArchitecture").value === "classic"; $("#oggMaFields").classList.toggle("hidden", classic); const message = [...$("#oggAction").options].find((option) => option.value === "messages"); message.disabled = classic; if (classic && $("#oggAction").value === "messages") $("#oggAction").value = "overview"; $("#oggDiagnosticMeta").textContent = classic ? "Classic GGSCI uses the trusted SSH server fields" : "Admin Client uses the local Oracle wallet credential alias";
}

function placeGoldenGateInSqlStudio() {
  const destination = $("#goldenGateSqlStudio"); const operations = $(".ogg-operations-panel");
  if (destination && operations && operations.parentElement !== destination) destination.append(operations);
}

function updateGoldenGateLogPath() {
  if ($("#oggLogKind").value === "custom") return; const root = $("#oggHome").value.trim().replace(/\/$/, "") || "/u01/app/ogg"; const group = $("#oggGroup").value.trim().toUpperCase() || "PROCESS"; const paths = { error: `${root}/ggserr.log`, report: `${root}/dirrpt/${group}.rpt`, discard: `${root}/dirrpt/${group}.dsc`, admin: `${root}/log/adminsrvr.log` }; $("#oggLogPath").value = paths[$("#oggLogKind").value];
}

function goldenGateLogFindings(text) {
  const findings = []; const codes = [...new Set([...String(text).matchAll(/\b(?:OGG|ORA)-\d{5}\b/gi)].map((match) => match[0].toUpperCase()))];
  if (/ABEND(?:ED)?|FATAL/i.test(text)) findings.push({ severity: "CRITICAL", title: "ABEND or fatal signal in live log", evidence: `The current log window contains an ABEND/FATAL marker${codes.length ? ` with ${codes.slice(0, 5).join(", ")}` : ""}.`, recommendation: "Read backward to the first causal OGG/ORA message, then inspect the matching process report and discard file before an authorized restart." });
  if (/no space|disk full|write.*trail|error opening.*trail|OGG-01091/i.test(text)) findings.push({ severity: "CRITICAL", title: "Trail or filesystem signal in live log", evidence: "A disk-space, trail-write, or trail-open message is visible.", recommendation: "Verify approved filesystem capacity and trail retention; do not manually remove trail files." });
  if (/connection refused|network.*error|socket|tcp\/ip|timeout/i.test(text)) findings.push({ severity: "HIGH", title: "GoldenGate connectivity signal", evidence: "A network, socket, refusal, or timeout message is visible.", recommendation: "Check DNS, listener/service health, routes, TLS trust and firewall policy from the GoldenGate server." });
  if (/checkpoint.*(?:not|stale|failed|error)|has not checkpointed/i.test(text)) findings.push({ severity: "HIGH", title: "Checkpoint signal in live log", evidence: "The live window contains checkpoint failure or stale-progress text.", recommendation: "Use detailed checkpoint and STATUS diagnostics to distinguish a long transaction from a stalled process." });
  if (/long transaction|open transaction|transaction.*active/i.test(text)) findings.push({ severity: "MEDIUM", title: "Long transaction signal in live log", evidence: "An open or long-running transaction can hold the Extract checkpoint.", recommendation: "Identify the source transaction and owner; coordinate remediation outside DBridge." });
  return { findings, codes };
}

function renderGoldenGateLog(text) {
  state.goldengate.logText = text; const lines = String(text || "").split(/\r?\n/).filter(Boolean); const errors = lines.filter((line) => /\b(?:ERROR|FATAL|ABEND(?:ED)?|OGG-\d{5}|ORA-\d{5})\b/i.test(line)).length; const warnings = lines.filter((line) => /\b(?:WARN|WARNING|LAG|CHECKPOINT|RETRY)\b/i.test(line)).length; const signals = goldenGateLogFindings(text); state.goldengate.logFindings = signals.findings; $("#oggLogLines").textContent = lines.length.toLocaleString(); $("#oggLogErrors").textContent = errors.toLocaleString(); $("#oggLogWarnings").textContent = warnings.toLocaleString(); $("#oggLogOutput").textContent = text || "The remote GoldenGate log returned no lines."; $("#oggLogOutput").scrollTop = $("#oggLogOutput").scrollHeight; if (!state.goldengate.lastDiagnostic) $("#oggCodes").textContent = signals.codes.length.toLocaleString(); renderGoldenGateFindings([...(state.goldengate.lastDiagnostic?.analysis?.findings || []), ...signals.findings]);
}

async function pollGoldenGateLog() {
  if (!state.goldengate.logTimer) return; try { const result = await api("/api/logs/remote-tail", { method: "POST", body: JSON.stringify({ host: $("#oggSshHost").value.trim(), user: $("#oggSshUser").value.trim(), port: $("#oggSshPort").value.trim(), identityFile: $("#oggSshKey").value.trim(), serverOs: "linux", path: $("#oggLogPath").value.trim(), lines: 1000 }) }); const snapshot = result.stdout || result.stderr || ""; state.goldengate.lastLogSnapshot = snapshot; renderGoldenGateLog(snapshot); } catch (error) { stopGoldenGateLog(); $("#oggLogOutput").textContent = error.message; toast(error.message, true); return; } state.goldengate.logTimer = setTimeout(pollGoldenGateLog, Number($("#oggLogInterval").value) * 1000);
}

function stopGoldenGateLog() { clearTimeout(state.goldengate.logTimer); state.goldengate.logTimer = null; $("#oggStartLog").textContent = "Start live log"; $("#oggLogState").className = ""; $("#oggLogState").innerHTML = "<i></i>STOPPED"; }

function toggleGoldenGateLog() {
  if (state.goldengate.logTimer) { stopGoldenGateLog(); toast("GoldenGate live log stopped"); return; } state.goldengate.logTimer = true; $("#oggStartLog").textContent = "Stop live log"; $("#oggLogState").className = "live"; $("#oggLogState").innerHTML = "<i></i>FOLLOWING"; $("#oggLogOutput").textContent = "Connecting to the approved GoldenGate server log…"; pollGoldenGateLog();
}

function openGoldenGateInLogCenter() {
  navigate("logs"); chooseLogSource("goldengate"); $("#logTransport").value = "ssh"; updateLogAccess(false); $("#sshHost").value = $("#oggSshHost").value.trim(); $("#sshUser").value = $("#oggSshUser").value.trim(); $("#sshPort").value = $("#oggSshPort").value.trim() || "22"; $("#sshKey").value = $("#oggSshKey").value.trim(); $("#sshOs").value = "linux"; $("#logPath").value = $("#oggLogPath").value.trim(); $("#logFileName").textContent = $("#oggLogPath").value.split("/").pop() || "GoldenGate log"; toast("GoldenGate server log loaded into the Log Center");
}

function currentSource() { return logCatalog.find((source) => source.id === state.selectedSource) || logCatalog[0]; }
function currentTransport() { return currentSource().mode === "telemetry" ? "telemetry" : $("#logTransport").value; }

function updateLogAccess(resetTarget = true) {
  const source = currentSource();
  const select = $("#logTransport");
  const nativeOption = select.querySelector('option[value="native"]');
  nativeOption.disabled = !nativeLogEngines[source.id];
  select.disabled = source.mode === "telemetry";
  if (source.mode === "telemetry") select.value = "telemetry";
  else if (select.value === "telemetry" || (select.value === "native" && !nativeLogEngines[source.id])) select.value = "ssh";
  const transport = currentTransport();
  $("#sshFields").classList.toggle("hidden", transport !== "ssh");
  $("#nativeAccess").classList.toggle("hidden", transport !== "native");
  $("#logPath").disabled = transport === "native";
  $("#selectedSourceMethod").textContent = transport === "ssh" ? "REMOTE SSH" : transport === "native" ? "DB NATIVE" : transport === "telemetry" ? "CLI TELEMETRY" : "FILE TAIL";
  $("#targetFieldTitle").textContent = transport === "ssh" ? "REMOTE SERVER LOG PATH" : transport === "native" ? "DATABASE-NATIVE LOG VIEW" : transport === "telemetry" ? "RESOURCE / LOG GROUP / CLUSTER ID" : "LOCAL, UNC OR MOUNTED PATH";
  if (resetTarget) {
    if (transport === "ssh") $("#logPath").value = remoteLogPaths[source.id] || source.path;
    else if (transport === "native") $("#logPath").value = "Uses SQL Studio connection — no filesystem path required";
    else $("#logPath").value = source.path;
  }
  if (transport === "ssh") {
    $("#sourceHint").textContent = "Uses the approved Windows OpenSSH client, SSH key or agent, and a read-only remote tail command. The host must already be trusted in known_hosts.";
    $("#sshOs").value = source.id === "sqlserver" ? "windows" : "linux";
  } else if (transport === "native") {
    $("#sourceHint").textContent = "Reads the database diagnostic view with SQL Studio credentials. The account needs its approved diagnostic role; no Windows file permission is used.";
    $("#sqlEngine").value = nativeLogEngines[source.id];
  } else if (transport === "telemetry") $("#sourceHint").textContent = source.hint || "Uses the approved cloud CLI and its active sign-in profile.";
  else $("#sourceHint").textContent = source.hint || "Uses a local path, UNC share, or mounted server log readable by your Windows account.";
  $("#pollInterval").value = transport === "file" ? "2000" : "10000";
  $("#logFileName").textContent = transport === "ssh" ? `${source.name} · remote` : transport === "native" ? `${source.name} · native view` : transport === "telemetry" ? `${source.name} telemetry` : (source.path.split(/[\\/]/).pop() || source.log);
  $("#logMeta").textContent = transport === "ssh" ? "Waiting for SSH server" : transport === "native" ? "Waiting for database connection" : transport === "telemetry" ? "Waiting for approved CLI" : "Waiting for file";
  $("#toggleLog").textContent = transport === "file" ? "▶ Start follow" : "▶ Start monitor";
}

function renderLogCatalog() {
  const search = $("#sourceSearch").value.trim().toLowerCase();
  const group = $("#sourceGroup").value;
  const visible = logCatalog.filter((source) => (group === "all" || source.group === group) && `${source.name} ${source.log} ${source.description}`.toLowerCase().includes(search));
  $("#logSources").innerHTML = visible.length ? visible.map((source) => `<button class="catalog-item ${source.id === state.selectedSource ? "active" : ""}" data-source="${source.id}"><span style="background:${source.color}">${source.name.split(/\s+/).map((word) => word[0]).join("").slice(0,2)}</span><b>${escapeHtml(source.name)}</b><small>${escapeHtml(source.log)}</small><i></i></button>`).join("") : '<div class="catalog-empty">No monitoring source matches this filter.</div>';
  $$("#logSources button").forEach((button) => button.addEventListener("click", () => chooseLogSource(button.dataset.source)));
  $("#coverageCount").textContent = `${logCatalog.length} sources`;
}

function chooseLogSource(id) {
  const source = logCatalog.find((item) => item.id === id);
  if (!source) return;
  stopLogFollow();
  state.selectedSource = id; state.logText = ""; state.lastTelemetry = "";
  $("#selectedSourceIcon").textContent = source.name.split(/\s+/).map((word) => word[0]).join("").slice(0,2);
  $("#selectedSourceIcon").style.background = source.color;
  $("#selectedSourceName").textContent = source.name;
  $("#selectedSourceDetails").textContent = source.description;
  updateLogAccess(true);
  $("#logOutput").textContent = currentTransport() === "ssh" ? "Enter the server hostname and SSH username, confirm the remote path, then select “Start monitor”.\n\nAuthentication uses your approved SSH key or agent; passwords are not stored." : currentTransport() === "native" ? "Confirm the SQL Studio connection and select “Start monitor”." : source.mode === "file" ? "Confirm the log path and select “Start follow”." : `Confirm the telemetry target and select “Start monitor”.\n\n${source.hint || "Uses the active approved CLI profile."}`;
  $("#detailLines").textContent = "0"; $("#detailErrors").textContent = "0"; $("#detailWarnings").textContent = "0"; $("#detailInfo").textContent = "0"; $("#detailUpdated").textContent = "—";
  state.logInsights.tab = "findings";
  renderLog();
  renderLogCatalog();
}

function autofillBadge(item) {
  if (item.kind === "performance") return "PT";
  if (item.kind === "log") return "LOG";
  if (item.kind === "goldengate") return "OGG";
  const name = item.kind === "database" ? sqlAdapterUi[item.engine]?.name || item.engine : labels[item.tool] || item.tool;
  return String(name).split(/\s+/).map((word) => word[0]).join("").slice(0, 3).toUpperCase();
}

function buildAutofillCatalog() {
  const performanceChecks = Object.entries(tuningActions).flatMap(([engine, checks]) => Object.entries(checks).map(([action, detail]) => ({ id: `performance:${engine}:${action}`, kind: "performance", category: "performance", title: `${sqlAdapterUi[engine].name}: ${detail[0]}`, description: detail[1], target: "SQL performance · guided checks", engine, action, search: `${sqlAdapterUi[engine].name} ${detail.join(" ")} performance tuning ${action}` })));
  const devops = Object.entries(actions).flatMap(([tool, methods]) => Object.entries(methods).map(([action, label]) => ({ id: `devops:${tool}:${action}`, kind: tool === "goldengate" ? "goldengate" : "devops", category: autofillToolCategories[tool] || "delivery", title: `${labels[tool]}: ${label}`, description: `Selects the approved read-only ${label.toLowerCase()} method and its context-aware fields.`, target: tool === "goldengate" ? "SQL Studio · GoldenGate Operations Center" : "DevOps Hub · guided inspection", tool, action, search: `${labels[tool]} ${label} ${tool} ${action}` })));
  const logs = logCatalog.map((source) => ({ id: `log:${source.id}`, kind: "log", category: "logs", title: `${source.name}: ${source.log}`, description: source.description, target: "Logs & traces · remote server monitoring", sourceId: source.id, search: `${source.name} ${source.log} ${source.description} ${source.group}` }));
  return [...performanceChecks, ...devops, ...logs].map((item) => ({ ...item, badge: autofillBadge(item) }));
}

function currentAutofillItem() { return state.autofill.catalog.find((item) => item.id === state.autofill.selectedId) || null; }

function autofillProfileKind(item) {
  if (!item) return "";
  if (item.kind === "performance") return "database";
  return item.kind;
}

function compatibleAutofillProfiles(item) {
  const kind = autofillProfileKind(item);
  return state.autofill.profiles.filter((profile) => {
    if (profile.kind !== kind) return false;
    if (kind === "database") return profile.data.engine === item.engine;
    if (kind === "devops") return profile.data.tool === item.tool;
    if (kind === "log") return profile.data.source === item.sourceId;
    return true;
  });
}

function selectedAutofillProfile(item = currentAutofillItem()) {
  return compatibleAutofillProfiles(item).find((profile) => profile.id === state.autofill.selectedProfileId) || null;
}

function renderAutofillProfiles() {
  const select = $("#autofillProfile");
  if (!select) return;
  const item = currentAutofillItem(); const compatible = compatibleAutofillProfiles(item);
  if (!compatible.some((profile) => profile.id === state.autofill.selectedProfileId)) state.autofill.selectedProfileId = "";
  select.innerHTML = `<option value="">No saved profile</option>${compatible.map((profile) => `<option value="${profile.id}">${escapeHtml(profile.name)}</option>`).join("")}`;
  select.value = state.autofill.selectedProfileId;
  $("#autofillProfileCount").textContent = state.autofill.profiles.length.toLocaleString();
  $("#autofillDeleteProfile").disabled = !state.autofill.selectedProfileId;
}

function autofillNeeds(item) {
  if (item.kind === "performance") return "Database profile: host, port, database/service and username. Password stays in browser memory and is never saved.";
  if (item.kind === "goldengate") return "GoldenGate profile: architecture, wallet alias or SSH server, deployment, home and process group. No password or SSH key is saved.";
  if (item.kind === "log") return "Log profile: source, SSH host, user, port, server OS and remote path. SSH keys and passwords are never saved.";
  return "DevOps profile: approved target, context, namespace/topic/group and working folder. Authentication remains in the tool's existing local context.";
}

function renderAutofillPreview() {
  const item = currentAutofillItem(); const button = $("#autofillApply");
  if (!item) {
    $("#autofillPreviewKind").textContent = "READY"; $("#autofillPreviewTitle").textContent = "Choose a command template"; $("#autofillPreviewDescription").textContent = "No approved command matches the current filter."; $("#autofillPreviewTarget").textContent = "Waiting for selection"; $("#autofillPreviewNeeds").textContent = "Clear or change the search to choose a command."; button.disabled = true; return;
  }
  const profile = selectedAutofillProfile(item);
  $("#autofillPreviewKind").textContent = item.category.toUpperCase(); $("#autofillPreviewTitle").textContent = item.title; $("#autofillPreviewDescription").textContent = item.description; $("#autofillPreviewTarget").textContent = item.target;
  $("#autofillPreviewNeeds").textContent = profile ? `${profile.name} will fill this workspace. ${autofillNeeds(item)}` : autofillNeeds(item);
  button.disabled = false;
}

function renderAutofillCatalog() {
  const root = $("#autofillCatalog");
  if (!root) return;
  state.autofill.catalog = buildAutofillCatalog();
  const search = $("#autofillSearch").value.trim().toLowerCase(); const category = $("#autofillCategory").value;
  const visible = state.autofill.catalog.filter((item) => (category === "all" || item.category === category) && (!search || `${item.title} ${item.description} ${item.search}`.toLowerCase().includes(search)));
  if (!visible.some((item) => item.id === state.autofill.selectedId)) state.autofill.selectedId = visible[0]?.id || "";
  $("#autofillCommandCount").textContent = state.autofill.catalog.length.toLocaleString();
  $("#autofillDatabaseCount").textContent = state.autofill.catalog.filter((item) => item.kind === "database").length.toLocaleString();
  $("#autofillToolCount").textContent = Object.keys(actions).length.toLocaleString();
  root.innerHTML = visible.length ? visible.map((item) => `<button type="button" class="autofill-card ${item.category} ${item.id === state.autofill.selectedId ? "selected" : ""}" data-autofill-id="${item.id}"><span>${item.badge}</span><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.description)}</small><em>${escapeHtml(item.target)}</em></div></button>`).join("") : '<div class="autofill-empty">No approved command matches this search.</div>';
  $$('[data-autofill-id]').forEach((card) => card.addEventListener("click", () => { state.autofill.selectedId = card.dataset.autofillId; state.autofill.selectedProfileId = ""; renderAutofillCatalog(); }));
  renderAutofillProfiles(); renderAutofillPreview();
}

function applyDatabaseAutofill(profile, engine) {
  $("#sqlEngine").value = engine; updatePort();
  if (profile) { $("#sqlHost").value = profile.data.host; $("#sqlPort").value = profile.data.port || sqlAdapterUi[engine].port; $("#sqlDatabase").value = profile.data.database; $("#sqlUsername").value = profile.data.username; }
  updateConnectionAdapterUi(); updateSnapshotTarget(); updatePerformanceContextTarget();
}

function applyDevopsAutofill(profile, tool) {
  selectDevopsTool(tool);
  if (profile) {
    $("#devopsEndpoint").value = profile.data.target || ""; $("#devopsSecondary").value = profile.data.secondary || ""; $("#devopsScope").value = profile.data.scope || ""; $("#devopsCwd").value = profile.data.cwd || "";
    state.devopsValues[tool] = { target: profile.data.target || "", secondary: profile.data.secondary || "", scope: profile.data.scope || "", cwd: profile.data.cwd || "" };
  }
  updateCommandLabel(); updateDevopsAuditContext();
}

function applyLogAutofill(profile, sourceId) {
  chooseLogSource(sourceId);
  if (!profile) return;
  $("#logTransport").value = "ssh"; updateLogAccess(false); $("#sshHost").value = profile.data.host; $("#sshUser").value = profile.data.user; $("#sshPort").value = profile.data.port || "22"; $("#sshOs").value = profile.data.serverOs || "linux"; $("#logPath").value = profile.data.path; $("#logFileName").textContent = profile.data.path.split(/[\\/]/).pop() || `${currentSource().name} · remote`;
}

function applyGoldenGateAutofill(profile) {
  if (!profile) return;
  $("#oggArchitecture").value = profile.data.architecture || "microservices"; $("#oggEndpoint").value = profile.data.endpoint || ""; $("#oggCredential").value = profile.data.credential || ""; $("#oggDeployment").value = profile.data.deployment || ""; $("#oggSshHost").value = profile.data.host || ""; $("#oggSshUser").value = profile.data.user || ""; $("#oggSshPort").value = profile.data.port || "22"; $("#oggHome").value = profile.data.home || "/u01/app/ogg"; $("#oggGroup").value = profile.data.group || ""; updateGoldenGateArchitecture(); updateGoldenGateLogPath();
}

function revealAutofillTarget(selector) { window.setTimeout(() => document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120); }

function applyAutofillSelection() {
  const item = currentAutofillItem(); if (!item) return;
  const profile = selectedAutofillProfile(item);
  if (item.kind === "performance") {
    navigate("performance"); applyDatabaseAutofill(profile, item.engine); state.tuningCheck = item.action; setPerformanceWorkspaceEngine(item.engine, false); setPerformanceMode("advanced", false); updateTuningChecks(); revealAutofillTarget(".tuning-control-bar");
  } else if (item.kind === "devops") {
    navigate("devops"); applyDevopsAutofill(profile, item.tool); $("#devopsAction").value = item.action; updateCommandLabel(); revealAutofillTarget(".tool-runner");
  } else if (item.kind === "goldengate") {
    navigate("sql"); applyGoldenGateAutofill(profile); $("#oggAction").value = item.action === "version" ? "versions" : item.action; updateGoldenGateArchitecture(); revealAutofillTarget(".ogg-operations-panel");
  } else {
    navigate("logs"); applyLogAutofill(profile, item.sourceId); revealAutofillTarget(".log-console");
  }
  toast(`Autofilled ${item.title}. Review the values before running.`);
}

function currentAutofillProfilePayload(item) {
  const kind = autofillProfileKind(item);
  if (kind === "database") {
    if ($("#sqlEngine").value !== item.engine) throw new Error("Open this command first, enter its database connection context, then save the profile");
    return { kind, data: { engine: item.engine, host: $("#sqlHost").value.trim(), port: $("#sqlPort").value.trim(), database: $("#sqlDatabase").value.trim(), username: $("#sqlUsername").value.trim() } };
  }
  if (kind === "devops") {
    const context = currentDevopsAuditContext(item.tool);
    return { kind, data: { tool: item.tool, ...context } };
  }
  if (kind === "log") {
    if (state.selectedSource !== item.sourceId) throw new Error("Open this log source first, enter its remote server context, then save the profile");
    return { kind, data: { source: item.sourceId, host: $("#sshHost").value.trim(), user: $("#sshUser").value.trim(), port: $("#sshPort").value.trim(), serverOs: $("#sshOs").value, path: $("#logPath").value.trim() } };
  }
  return { kind, data: { architecture: $("#oggArchitecture").value, endpoint: $("#oggEndpoint").value.trim(), credential: $("#oggCredential").value.trim(), deployment: $("#oggDeployment").value.trim(), host: $("#oggSshHost").value.trim(), user: $("#oggSshUser").value.trim(), port: $("#oggSshPort").value.trim(), home: $("#oggHome").value.trim(), group: $("#oggGroup").value.trim() } };
}

async function saveAutofillProfile() {
  const item = currentAutofillItem(); if (!item) return toast("Choose a command template first", true);
  try {
    const payload = currentAutofillProfilePayload(item); const name = window.prompt("Name this non-secret autofill profile:", `${item.title} context`); if (name === null) return;
    const result = await api("/api/investigation/autofill-profiles", { method: "POST", body: JSON.stringify({ name: name.trim(), ...payload }) });
    state.investigation.autofillProfiles = result.store.autofillProfiles || []; state.autofill.profiles = state.investigation.autofillProfiles; state.autofill.selectedProfileId = result.profile.id; renderAutofillCatalog(); toast("Autofill profile saved locally without passwords or private keys");
  } catch (error) { toast(error.message, true); }
}

async function deleteAutofillProfile() {
  const profile = selectedAutofillProfile(); if (!profile) return;
  if (!confirm(`Delete the autofill profile "${profile.name}" from this portable workspace?`)) return;
  try { const result = await api("/api/investigation/autofill-profiles/delete", { method: "POST", body: JSON.stringify({ id: profile.id }) }); state.investigation.autofillProfiles = result.store.autofillProfiles || []; state.autofill.profiles = state.investigation.autofillProfiles; state.autofill.selectedProfileId = ""; renderAutofillCatalog(); toast("Autofill profile deleted"); }
  catch (error) { toast(error.message, true); }
}

const logSeverityLabels = {
  critical: "CRITICAL",
  error: "ERROR",
  warning: "WARNING",
  info: "INFO",
  recovered: "RECOVERED",
  debug: "DEBUG",
};

function classifyLogLine(line) {
  const text = String(line || "");
  if (/\b(?:recovered|resolved|recovery complete|back online|healthy again|connection restored|startup complete|ready to accept|resumed|successfully completed)\b/i.test(text)) return "recovered";
  if (/\b(?:fatal|panic|critical|severe|crash(?:ed)?|abended?|assertion failure|segmentation fault|corrupt(?:ion|ed)?|out of memory)\b|ORA-(?:00600|07445|04031)\b/i.test(text)) return "critical";
  if (/\b(?:error|exception|failed|failure|denied|invalid|unable to|aborted|terminated abnormally|sqlstate)\b|ORA-(?!00000)\d{5}\b|OGG-\d{5}\b/i.test(text)) return "error";
  if (/\b(?:warn(?:ing)?|timeout|timed out|deadlock|slow query|slow operation|retry|lag(?:ging)?|blocked|lock wait|checkpoint incomplete|near limit|connection reset|unavailable)\b/i.test(text)) return "warning";
  if (/\b(?:debug|trace|verbose)\b/i.test(text)) return "debug";
  return "info";
}

function parseLogTimestamp(line, now = new Date()) {
  const text = String(line || "");
  const iso = text.match(/\b(20\d{2}[-/]\d{2}[-/]\d{2}[T ][0-2]\d:[0-5]\d:[0-5]\d(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/);
  if (iso) {
    const parsed = Date.parse(iso[1].replaceAll("/", "-").replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  const local = text.match(/\b(\d{1,2}\/\d{1,2}\/20\d{2},?\s+\d{1,2}:\d{2}:\d{2}(?:\s*[AP]M)?)/i);
  if (local) {
    const parsed = Date.parse(local[1]);
    if (Number.isFinite(parsed)) return parsed;
  }
  const syslog = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+([0-2]\d:[0-5]\d:[0-5]\d)\b/i);
  if (syslog) {
    let parsed = Date.parse(`${syslog[1]} ${syslog[2]} ${now.getFullYear()} ${syslog[3]}`);
    if (Number.isFinite(parsed) && parsed > now.getTime() + 86400000) parsed = Date.parse(`${syslog[1]} ${syslog[2]} ${now.getFullYear() - 1} ${syslog[3]}`);
    if (Number.isFinite(parsed)) return parsed;
  }
  const oracle = text.match(/\b(\d{2}-[A-Za-z]{3}-20\d{2}\s+[0-2]\d:[0-5]\d:[0-5]\d)\b/);
  if (oracle) {
    const parsed = Date.parse(oracle[1]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeLogSignature(line) {
  const source = String(line || "").trim();
  const code = source.match(/\b(?:ORA-\d{5}|OGG-\d{5}|SQLSTATE[ :=_-]*[A-Z0-9]{5}|[A-Z]{2,12}-\d{3,8})\b/i)?.[0]?.toUpperCase() || "";
  const normalized = source
    .replace(/\b20\d{2}[-/]\d{2}[-/]\d{2}[T ][^\s,;]+/g, "<time>")
    .replace(/\b\d{1,2}\/\d{1,2}\/20\d{2},?\s+\d{1,2}:\d{2}:\d{2}(?:\s*[AP]M)?/gi, "<time>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "<uuid>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<hex>")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<ip>")
    .replace(/(["']).{1,120}?\1/g, "<value>")
    .replace(/\b\d+\b/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  return `${code ? `${code} · ` : ""}${normalized || source.slice(0, 220)}`;
}

function logHistoryDepth() {
  const hours = Math.min(Math.max(Number($("#logWindowHours")?.value || 24), 1), 72);
  if (hours <= 1) return { hours, lines: 1000, bytes: 256 * 1024 };
  if (hours <= 6) return { hours, lines: 3000, bytes: 512 * 1024 };
  if (hours <= 12) return { hours, lines: 5000, bytes: 1024 * 1024 };
  return { hours, lines: 10000, bytes: 2 * 1024 * 1024 };
}

function addLogFinding(findings, severity, title, evidence, meaning, action) {
  findings.push({ severity, title, evidence, meaning, action });
}

function analyzeLogWindow(text, hours = 24, now = new Date()) {
  const sourceLines = String(text || "").split(/\r?\n/).filter((line) => line.trim()).slice(-30000);
  let lastTimestamp = null;
  let explicitTimestamps = 0;
  const parsed = sourceLines.map((line, index) => {
    const explicit = parseLogTimestamp(line, now);
    if (explicit !== null) {
      lastTimestamp = explicit;
      explicitTimestamps += 1;
    }
    return {
      index,
      line: line.slice(0, 4000),
      severity: classifyLogLine(line),
      timestamp: explicit ?? lastTimestamp,
      explicitTimestamp: explicit !== null,
    };
  });
  const cutoff = now.getTime() - hours * 3600000;
  const timestamped = explicitTimestamps > 0;
  const events = (timestamped ? parsed.filter((event) => event.timestamp !== null && event.timestamp >= cutoff && event.timestamp <= now.getTime() + 300000) : parsed.map((event) => ({ ...event, timestamp: now.getTime() })));
  const counts = events.reduce((summary, event) => ({ ...summary, [event.severity]: (summary[event.severity] || 0) + 1 }), { critical: 0, error: 0, warning: 0, info: 0, recovered: 0, debug: 0 });
  const errorEvents = events.filter((event) => event.severity === "critical" || event.severity === "error");
  const signatureMap = new Map();
  errorEvents.forEach((event) => {
    const signature = normalizeLogSignature(event.line);
    const current = signatureMap.get(signature) || { signature, count: 0, severity: event.severity, first: event.timestamp, last: event.timestamp, sample: event.line };
    current.count += 1;
    current.first = Math.min(current.first, event.timestamp);
    current.last = Math.max(current.last, event.timestamp);
    if (event.severity === "critical") current.severity = "critical";
    signatureMap.set(signature, current);
  });
  const signatures = [...signatureMap.values()].sort((a, b) => b.count - a.count || b.last - a.last).slice(0, 100);
  const findings = [];
  if (counts.critical) addLogFinding(findings, "critical", "Critical database events require immediate review", `${counts.critical.toLocaleString()} fatal, panic, severe, crash or critical-code event${counts.critical === 1 ? "" : "s"}`, "Critical engine events can precede an outage, corruption, forced restart or unavailable service.", "Open Errors, confirm the first occurrence and correlate it with database availability, storage and host evidence.");
  if (counts.error) addLogFinding(findings, counts.error >= 10 ? "critical" : "error", counts.error >= 10 ? "Error burst detected in the selected window" : "Database errors were retained", `${counts.error.toLocaleString()} error event${counts.error === 1 ? "" : "s"} across ${signatures.length.toLocaleString()} grouped signature${signatures.length === 1 ? "" : "s"}`, "Repeated errors usually identify one failing component, SQL path, login, storage operation or replication stream.", "Start with the most frequent signature, then verify its first and last timestamps before changing configuration.");
  const repeated = signatures.find((signature) => signature.count >= 3);
  if (repeated) addLogFinding(findings, repeated.severity === "critical" ? "critical" : "error", "One error signature is repeating", `${repeated.count.toLocaleString()} occurrences · ${repeated.signature}`, "A repeated signature is more actionable than isolated noise and can reveal a retry loop or persistent dependency failure.", "Search the full log for this signature and correlate it with the affected host, service, session or statement identifier.");
  if (counts.warning) addLogFinding(findings, "warning", "Warnings show performance or resilience pressure", `${counts.warning.toLocaleString()} timeout, slow, retry, lag, blocking or availability warning${counts.warning === 1 ? "" : "s"}`, "Warnings often appear before hard failures and may explain latency without an explicit error.", "Review the Warnings tab and compare the busiest interval with SQL Performance and infrastructure metrics.");
  if (counts.recovered) addLogFinding(findings, "recovered", "Recovery or healthy-state messages were observed", `${counts.recovered.toLocaleString()} recovery, resolved, ready or successful event${counts.recovered === 1 ? "" : "s"}`, "Recovery evidence helps bound the incident and shows whether the fault cleared or continues to recur.", "Confirm that no error with the same signature occurred after the latest recovery event.");
  if (!counts.critical && !counts.error && !counts.warning && events.length) addLogFinding(findings, "info", "No error or warning signal matched", `${events.length.toLocaleString()} events reviewed`, "The loaded window contains informational, debug or recovered activity only.", "Keep monitoring during the affected business period and confirm the source covers the correct server and log.");
  if (!events.length) addLogFinding(findings, "info", "No events fall inside the selected window", timestamped ? `${explicitTimestamps.toLocaleString()} timestamped lines were parsed outside the last ${hours} hours` : "No readable log lines are loaded", "The source may be quiet, the selected window may be too narrow, or the relevant file has not been loaded.", "Confirm the log path and source, widen the time window, or start live monitoring.");
  if (sourceLines.length && !timestamped) addLogFinding(findings, "info", "Timestamp coverage is unavailable", `${sourceLines.length.toLocaleString()} loaded lines are treated as capture-window evidence`, "Without timestamps DBridge cannot prove which lines occurred inside the requested clock window.", "Use a timestamped database log format when strict 24-hour incident boundaries are required.");
  const severityOrder = { critical: 5, error: 4, warning: 3, recovered: 2, info: 1 };
  findings.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
  return { hours, analyzedAt: now.toISOString(), sourceLines: sourceLines.length, explicitTimestamps, timestamped, events, counts, signatures, findings };
}

function logEventTime(event, timestamped) {
  if (!timestamped) return "CAPTURE";
  const text = new Date(event.timestamp).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return event.explicitTimestamp ? text : `≈ ${text}`;
}

function renderLogEventRows(events, analysis, emptyTitle, emptyCopy) {
  if (!events.length) return `<div class="log-intelligence-empty"><span>OK</span><b>${escapeHtml(emptyTitle)}</b><p>${escapeHtml(emptyCopy)}</p></div>`;
  return events.slice().sort((a, b) => b.timestamp - a.timestamp || b.index - a.index).slice(0, 1500).map((event) => `<article class="log-event-row ${event.severity}"><span>${logSeverityLabels[event.severity]}</span><time>${escapeHtml(logEventTime(event, analysis.timestamped))}</time><small>${escapeHtml(currentSource().name)}</small><code>${escapeHtml(event.line)}</code></article>`).join("");
}

function logInsightReport(analysis) {
  const counts = analysis.counts;
  const findings = analysis.findings.map((finding, index) => `${index + 1}. [${finding.severity.toUpperCase()}] ${finding.title}\nEvidence: ${finding.evidence}\nWhy it matters: ${finding.meaning}\nNext action: ${finding.action}`).join("\n\n");
  const signatures = analysis.signatures.slice(0, 20).map((signature, index) => `${index + 1}. ${signature.count}x · ${signature.signature}`).join("\n");
  return `DBridge ${currentSource().name} log findings\nWindow: last ${analysis.hours} hours\nAnalyzed: ${analysis.analyzedAt}\nTimestamp coverage: ${analysis.timestamped ? `${analysis.explicitTimestamps}/${analysis.sourceLines} explicit timestamps` : "capture-window evidence only"}\n\nEvents: ${analysis.events.length}\nCritical: ${counts.critical}\nErrors: ${counts.error}\nWarnings: ${counts.warning}\nRecovered: ${counts.recovered}\nInformation: ${counts.info}\nDebug: ${counts.debug}\n\nFINDINGS\n${findings}\n\nTOP ERROR SIGNATURES\n${signatures || "None"}\n\nRead-only analysis of locally loaded evidence. Verify timestamps and source coverage before operational action.`;
}

function setLogInsightTab(tab) {
  const selected = ["findings", "errors", "warnings", "events"].includes(tab) ? tab : "findings";
  state.logInsights.tab = selected;
  $$("[data-log-insight-tab]").forEach((button) => button.classList.toggle("active", button.dataset.logInsightTab === selected));
  const views = { findings: "logInsightFindings", errors: "logInsightErrorsView", warnings: "logInsightWarningsView", events: "logInsightEvents" };
  Object.entries(views).forEach(([key, id]) => $(`#${id}`).classList.toggle("hidden", key !== selected));
}

function renderLogInsights(analysis) {
  state.logInsights.result = analysis;
  state.logInsights.report = logInsightReport(analysis);
  const counts = analysis.counts;
  const health = counts.critical ? ["critical", "CRITICAL EVENTS FOUND"] : counts.error ? ["error", "ERRORS REQUIRE REVIEW"] : counts.warning ? ["warning", "WARNINGS DETECTED"] : analysis.events.length ? ["healthy", "NO ERROR SIGNAL"] : ["clear", "WAITING FOR EVIDENCE"];
  $("#logInsightHealth").className = health[0];
  $("#logInsightHealth").innerHTML = `<i></i>${health[1]}`;
  $("#logInsightWindowTitle").textContent = `Findings from the last ${analysis.hours} hour${analysis.hours === 1 ? "" : "s"}`;
  $("#logInsightCoverage").textContent = analysis.timestamped ? `${analysis.explicitTimestamps.toLocaleString()} explicit timestamps · ${analysis.events.length.toLocaleString()} events in window` : analysis.sourceLines ? `${analysis.sourceLines.toLocaleString()} loaded lines · capture-window mode` : "No timestamp coverage yet";
  $("#logInsightUpdated").textContent = `Analyzed ${new Date(analysis.analyzedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  $("#logInsightTotal").textContent = analysis.events.length.toLocaleString();
  $("#logInsightCritical").textContent = counts.critical.toLocaleString();
  $("#logInsightErrors").textContent = counts.error.toLocaleString();
  $("#logInsightWarnings").textContent = counts.warning.toLocaleString();
  $("#logInsightRecovered").textContent = counts.recovered.toLocaleString();
  $("#logInsightSignatures").textContent = analysis.signatures.length.toLocaleString();
  $("#logInsightFindingCount").textContent = analysis.findings.length.toLocaleString();
  $("#logInsightErrorCount").textContent = (counts.critical + counts.error).toLocaleString();
  $("#logInsightWarningCount").textContent = counts.warning.toLocaleString();
  $("#logInsightEventCount").textContent = analysis.events.length.toLocaleString();
  const findings = analysis.findings.map((finding) => `<article class="log-finding-card ${finding.severity}"><span>${finding.severity.toUpperCase()}</span><div><b>${escapeHtml(finding.title)}</b><p>${escapeHtml(finding.evidence)}</p></div><div><b>Why it matters</b><p>${escapeHtml(finding.meaning)}</p></div><div><b>Safe next action</b><em>${escapeHtml(finding.action)}</em></div></article>`).join("");
  const signatures = analysis.signatures.filter((signature) => signature.count > 1).slice(0, 20).map((signature) => `<article class="log-signature-card"><strong>${signature.count}×</strong><code title="${escapeHtml(signature.signature)}">${escapeHtml(signature.signature)}</code><span>First ${escapeHtml(logEventTime({ timestamp: signature.first, explicitTimestamp: true }, analysis.timestamped))}</span><span>Last ${escapeHtml(logEventTime({ timestamp: signature.last, explicitTimestamp: true }, analysis.timestamped))}</span></article>`).join("");
  $("#logInsightFindings").innerHTML = `${findings}${signatures ? `<div class="log-signature-list"><h3>Repeated error signatures</h3>${signatures}</div>` : ""}`;
  $("#logInsightErrorsView").innerHTML = renderLogEventRows(analysis.events.filter((event) => event.severity === "critical" || event.severity === "error"), analysis, "No error events in this window", "Critical and error lines will appear here in red.");
  $("#logInsightWarningsView").innerHTML = renderLogEventRows(analysis.events.filter((event) => event.severity === "warning"), analysis, "No warning events in this window", "Timeout, retry, slow and contention signals will appear here in amber.");
  $("#logInsightEvents").innerHTML = renderLogEventRows(analysis.events, analysis, "No events in this window", "Load a log or start monitoring to classify every event.");
  setLogInsightTab(state.logInsights.tab);
}

async function copyLogInsightReport() {
  if (!state.logInsights.result) return toast("Load log evidence before copying findings", true);
  try { await navigator.clipboard.writeText(state.logInsights.report); toast("24-hour log findings copied"); }
  catch { toast("Clipboard access was blocked", true); }
}

async function pollLog() {
  try {
    const source = currentSource();
    const transport = currentTransport();
    const history = logHistoryDepth();
    let result;
    if (transport === "file") result = await api("/api/logs/tail", { method: "POST", body: JSON.stringify({ path: $("#logPath").value.trim(), offset: state.logOffset, historyBytes: history.bytes }) });
    else if (transport === "ssh") result = await api("/api/logs/remote-tail", { method: "POST", body: JSON.stringify({ host: $("#sshHost").value.trim(), user: $("#sshUser").value.trim(), port: $("#sshPort").value.trim(), serverOs: $("#sshOs").value, identityFile: $("#sshKey").value.trim(), path: $("#logPath").value.trim(), lines: history.lines }) });
    else if (transport === "native") result = await api("/api/logs/native", { method: "POST", body: JSON.stringify({ ...connection(), engine: nativeLogEngines[source.id], windowHours: history.hours }) });
    else result = await api("/api/logs/telemetry", { method: "POST", body: JSON.stringify({ source: source.id, target: $("#logPath").value.trim() }) });
    if (transport === "file") {
      state.logOffset = result.offset;
      if (result.text) state.logText += result.text;
      $("#logMeta").textContent = `${Math.round(result.size / 1024).toLocaleString()} KB · ${new Date(result.modified).toLocaleTimeString()}`;
    } else {
      const snapshot = result.stdout || result.stderr || "No telemetry returned.";
      if (snapshot !== state.lastTelemetry) {
        state.lastTelemetry = snapshot;
        state.logText += `\n--- ${new Date(result.collectedAt).toLocaleString()} · ${result.command} ---\n${snapshot}\n`;
      }
      $("#logMeta").textContent = `${result.command}${result.server ? ` · ${result.server}` : ""} · ${new Date(result.collectedAt).toLocaleTimeString()}`;
    }
    if (state.logText.length > 800000) state.logText = state.logText.slice(-800000);
    renderLog();
  } catch (error) {
    stopLogFollow();
    const source = currentSource(); const transport = currentTransport();
    $("#logOutput").textContent = transport === "file" ? `Unable to follow this file:\n${error.message}\n\nConfirm the path and that your Windows account has read permission.` : transport === "ssh" ? `Unable to read ${source.name} from the server:\n${error.message}\n\nConfirm the host is already trusted, your SSH key/agent is available, and the server account can read this log.` : transport === "native" ? `Unable to read the database-native log view:\n${error.message}\n\nConfirm SQL Studio credentials and the database account's diagnostic permissions.` : `Unable to collect ${source.name} telemetry:\n${error.message}\n\nConfirm the approved CLI is installed, signed in, and allowed to read this resource.`;
    toast(error.message, true);
  }
}

function renderLog() {
  const filter = $("#logFilter").value.toLowerCase();
  const allLines = state.logText ? state.logText.split(/\r?\n/).filter(Boolean) : [];
  const visibleLines = (filter ? allLines.filter((line) => line.toLowerCase().includes(filter)) : allLines).slice(-5000);
  $("#logOutput").innerHTML = visibleLines.length ? visibleLines.map((line) => {
    const severity = classifyLogLine(line);
    return `<div class="log-color-line ${severity}"><span>${logSeverityLabels[severity]}</span><code>${escapeHtml(line)}</code></div>`;
  }).join("") : "Waiting for new log lines…";
  $("#logOutput").scrollTop = $("#logOutput").scrollHeight;
  const severities = allLines.map(classifyLogLine);
  const errors = severities.filter((severity) => severity === "critical" || severity === "error").length;
  const warnings = severities.filter((severity) => severity === "warning").length;
  const info = Math.max(0, allLines.length - errors - warnings);
  $("#detailLines").textContent = allLines.length.toLocaleString();
  $("#detailErrors").textContent = errors.toLocaleString();
  $("#detailWarnings").textContent = warnings.toLocaleString();
  $("#detailInfo").textContent = info.toLocaleString();
  $("#detailUpdated").textContent = allLines.length ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  renderLogInsights(analyzeLogWindow(state.logText, logHistoryDepth().hours));
}

function stopLogFollow() {
  clearInterval(state.logTimer); state.logTimer = null; state.logOffset = 0;
  $("#toggleLog").textContent = currentTransport() === "file" ? "▶ Start follow" : "▶ Start monitor";
  $("#streamStatus").className = "stream-status";
  $("#streamStatus").innerHTML = "<i></i>STOPPED";
}

async function continueLogFollow() {
  await pollLog();
  if ($("#streamStatus").classList.contains("live")) state.logTimer = setTimeout(continueLogFollow, Number($("#pollInterval").value));
}

async function toggleLogFollow() {
  if (state.logTimer || $("#streamStatus").classList.contains("live")) { stopLogFollow(); return; }
  state.logOffset = 0; state.logText = "";
  $("#toggleLog").textContent = currentTransport() === "file" ? "■ Stop follow" : "■ Stop monitor";
  $("#streamStatus").className = "stream-status live";
  $("#streamStatus").innerHTML = "<i></i>FOLLOWING";
  await continueLogFollow();
}

async function analyzeTrace() {
  const button = $("#analyzeTrace");
  setBusy(button, true, "Analyzing…");
  try {
    const result = await api("/api/traces/analyze", { method: "POST", body: JSON.stringify({ path: $("#tracePath").value.trim() }) });
    const a = result.analysis;
    const waits = escapeHtml(a.topWaits.map((w) => `${w.count.toString().padStart(5)}  ${w.event}`).join("\n") || "None detected");
    const errors = escapeHtml(a.errors.join("\n") || "None detected");
    $("#traceResults").innerHTML = `<div class="trace-summary"><div><b>${a.lines.toLocaleString()}</b>Lines</div><div><b>${Math.round(a.bytes / 1024).toLocaleString()} KB</b>File size</div><div><b>${a.topWaits.length}</b>Wait types</div><div><b>${a.errors.length}</b>Error lines</div></div><pre class="output-pre">Top waits:\n${waits}\n\nErrors:\n${errors}</pre>`;
    toast("Trace analysis completed locally");
  } catch (error) { $("#traceResults").textContent = error.message; toast(error.message, true); }
  finally { setBusy(button, false); }
}

const versionStatusText = { changed: "Changed", unchanged: "Unchanged", new: "Newly available", missing: "Now missing", unavailable: "Unavailable", noBaseline: "No baseline" };

function renderVersionComparison() {
  const comparison = state.versionComparison;
  if (!comparison) return;
  const summary = comparison.summary || {};
  $("#versionChanged").textContent = ((summary.changed || 0) + (summary.new || 0) + (summary.missing || 0)).toLocaleString();
  $("#versionUnchanged").textContent = (summary.unchanged || 0).toLocaleString();
  $("#versionUnavailable").textContent = (summary.unavailable || 0).toLocaleString();
  $("#versionBaselineTime").textContent = comparison.capturedAt ? new Date(comparison.capturedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not captured";
  $("#versionComparisonRows").innerHTML = comparison.rows.map((row) => `<tr><td>${escapeHtml(labels[row.id] || row.id)}</td><td title="${escapeHtml(row.baselineVersion)}">${escapeHtml(row.baselineVersion)}</td><td title="${escapeHtml(row.currentVersion)}">${escapeHtml(row.currentVersion)}</td><td><span class="version-status status-${row.status}">${escapeHtml(versionStatusText[row.status] || row.status)}</span></td></tr>`).join("");
}

async function loadVersionComparison() {
  const button = $("#refreshVersions");
  setBusy(button, true, "Scanning…");
  $("#versionComparisonRows").innerHTML = '<tr><td colspan="4">Scanning approved local CLI versions…</td></tr>';
  try {
    const result = await api("/api/devops/version-comparison");
    state.versionComparison = result.comparison;
    renderVersionComparison();
  } catch (error) {
    $("#versionComparisonRows").innerHTML = `<tr><td colspan="4">${escapeHtml(error.message)}</td></tr>`;
    toast(error.message, true);
  } finally { setBusy(button, false); }
}

async function captureVersionBaseline() {
  const button = $("#captureVersions");
  setBusy(button, true, "Capturing…");
  try {
    const result = await api("/api/devops/version-baseline", { method: "POST", body: "{}" });
    state.versionComparison = result.comparison;
    renderVersionComparison();
    toast("Current DevOps versions saved as the local baseline");
  } catch (error) { toast(error.message, true); }
  finally { setBusy(button, false); }
}

function formatCompareBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024).toLocaleString()} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function comparisonLines(text) {
  if (!text) return [];
  return text.replace(/\r\n?/g, "\n").split("\n");
}

function setFileDiffState(kind, title, meta) {
  $("#diffStateDot").className = kind || "";
  $("#diffState").textContent = title;
  $("#diffStateMeta").textContent = meta;
}

function updateCompareFileCards() {
  for (const side of ["before", "after"]) {
    const file = state.fileCompare[side];
    const title = $(`#${side}FileName`);
    const meta = $(`#${side}FileMeta`);
    const drop = $(`#${side}Drop`);
    drop.classList.toggle("loaded", Boolean(file));
    title.textContent = file?.name || `Choose ${side === "before" ? "baseline" : "changed"} file`;
    meta.textContent = file ? `${file.lines.toLocaleString()} lines · ${formatCompareBytes(file.size)}` : `Click or drop the ${side === "before" ? "older" : "newer"} version here`;
  }
}

function resetFileDiffResult() {
  state.fileCompare.diff = [];
  state.fileCompare.patch = "";
  $("#diffAdded").textContent = "0";
  $("#diffRemoved").textContent = "0";
  $("#diffUnchanged").textContent = "0";
  $("#diffHunks").textContent = "0";
  $("#copyFileDiff").disabled = true;
  $("#downloadFileDiff").disabled = true;
  $("#diffFileHeader").textContent = "REDLINE COMPARISON";
  $("#fileDiffOutput").innerHTML = '<div class="diff-empty"><span>±</span><b>Select a before file and an after file</b><p>Removed lines appear in red with strike-through. Added lines appear in green with underline.</p></div>';
  setFileDiffState("", state.fileCompare.before && state.fileCompare.after ? "Ready to compare" : "Waiting for two files", "Files stay in browser memory");
}

async function loadCompareFile(side, file) {
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) return toast("Each comparison file is limited to 4 MB", true);
  try {
    const text = await file.text();
    if (/\0/.test(text)) throw new Error("Binary files are not supported. Select a text, code, or configuration file.");
    const lines = comparisonLines(text).length;
    if (lines > 15000) throw new Error("Each comparison file is limited to 15,000 lines");
    state.fileCompare[side] = { name: file.name || `${side}.txt`, size: file.size, lines, text };
    updateCompareFileCards();
    resetFileDiffResult();
    if (state.fileCompare.before && state.fileCompare.after) setFileDiffState("", "Ready to compare", `${state.fileCompare.before.name} → ${state.fileCompare.after.name}`);
  } catch (error) { toast(error.message, true); }
}

function bindCompareDropZone(side) {
  const drop = $(`#${side}Drop`);
  const picker = $(`#${side}File`);
  picker.addEventListener("change", () => { loadCompareFile(side, picker.files[0]); picker.value = ""; });
  ["dragenter", "dragover"].forEach((eventName) => drop.addEventListener(eventName, (event) => { event.preventDefault(); drop.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((eventName) => drop.addEventListener(eventName, (event) => { event.preventDefault(); drop.classList.remove("dragging"); }));
  drop.addEventListener("drop", (event) => loadCompareFile(side, event.dataTransfer?.files?.[0]));
}

function lcsScore(a, b, aStart, aEnd, bStart, bEnd, reverse = false) {
  const width = bEnd - bStart;
  let previous = new Uint32Array(width + 1);
  const aCount = aEnd - aStart;
  for (let offsetA = 0; offsetA < aCount; offsetA += 1) {
    const current = new Uint32Array(width + 1);
    const valueA = a[reverse ? aEnd - 1 - offsetA : aStart + offsetA];
    for (let offsetB = 1; offsetB <= width; offsetB += 1) {
      const valueB = b[reverse ? bEnd - offsetB : bStart + offsetB - 1];
      current[offsetB] = valueA === valueB ? previous[offsetB - 1] + 1 : Math.max(previous[offsetB], current[offsetB - 1]);
    }
    previous = current;
  }
  return previous;
}

function findLcsPairs(a, b, aStart, aEnd, bStart, bEnd, pairs) {
  const aLength = aEnd - aStart;
  const bLength = bEnd - bStart;
  if (!aLength || !bLength) return;
  if (aLength === 1) {
    for (let index = bStart; index < bEnd; index += 1) if (a[aStart] === b[index]) { pairs.push([aStart, index]); break; }
    return;
  }
  if (bLength === 1) {
    for (let index = aStart; index < aEnd; index += 1) if (a[index] === b[bStart]) { pairs.push([index, bStart]); break; }
    return;
  }
  const middleA = aStart + Math.floor(aLength / 2);
  const left = lcsScore(a, b, aStart, middleA, bStart, bEnd, false);
  const right = lcsScore(a, b, middleA, aEnd, bStart, bEnd, true);
  let split = 0;
  let best = -1;
  for (let offset = 0; offset <= bLength; offset += 1) {
    const score = left[offset] + right[bLength - offset];
    if (score > best) { best = score; split = offset; }
  }
  const middleB = bStart + split;
  findLcsPairs(a, b, aStart, middleA, bStart, middleB, pairs);
  findLcsPairs(a, b, middleA, aEnd, middleB, bEnd, pairs);
}

function createLineComparison(beforeText, afterText, ignoreWhitespace, ignoreCase) {
  const before = comparisonLines(beforeText);
  const after = comparisonLines(afterText);
  const normalize = (line) => {
    let value = ignoreWhitespace ? line.trim().replace(/\s+/g, " ") : line;
    if (ignoreCase) value = value.toLocaleLowerCase();
    return value;
  };
  const normalizedBefore = before.map(normalize);
  const normalizedAfter = after.map(normalize);
  let prefix = 0;
  while (prefix < normalizedBefore.length && prefix < normalizedAfter.length && normalizedBefore[prefix] === normalizedAfter[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < normalizedBefore.length - prefix && suffix < normalizedAfter.length - prefix && normalizedBefore[normalizedBefore.length - 1 - suffix] === normalizedAfter[normalizedAfter.length - 1 - suffix]) suffix += 1;
  const middleBefore = normalizedBefore.length - prefix - suffix;
  const middleAfter = normalizedAfter.length - prefix - suffix;
  if (middleBefore * middleAfter > 12000000) throw new Error("These files have too many unrelated lines for a safe browser comparison. Compare smaller sections or enable Ignore whitespace.");
  const pairs = [];
  for (let index = 0; index < prefix; index += 1) pairs.push([index, index]);
  findLcsPairs(normalizedBefore, normalizedAfter, prefix, normalizedBefore.length - suffix, prefix, normalizedAfter.length - suffix, pairs);
  for (let index = suffix; index > 0; index -= 1) pairs.push([normalizedBefore.length - index, normalizedAfter.length - index]);
  const raw = [];
  let oldIndex = 0;
  let newIndex = 0;
  for (const [matchedOld, matchedNew] of pairs) {
    while (oldIndex < matchedOld) raw.push({ type: "delete", text: before[oldIndex++] });
    while (newIndex < matchedNew) raw.push({ type: "insert", text: after[newIndex++] });
    raw.push({ type: "equal", text: before[oldIndex] });
    oldIndex += 1; newIndex += 1;
  }
  while (oldIndex < before.length) raw.push({ type: "delete", text: before[oldIndex++] });
  while (newIndex < after.length) raw.push({ type: "insert", text: after[newIndex++] });
  let oldLine = 1;
  let newLine = 1;
  return raw.map((entry) => {
    const beforeLine = entry.type === "insert" ? null : oldLine++;
    const afterLine = entry.type === "delete" ? null : newLine++;
    return { ...entry, beforeLine, afterLine };
  });
}

function createComparisonPatch(diff) {
  const beforeName = state.fileCompare.before.name.replace(/[\r\n]/g, "_");
  const afterName = state.fileCompare.after.name.replace(/[\r\n]/g, "_");
  const output = [`--- before/${beforeName}`, `+++ after/${afterName}`];
  const changes = diff.map((entry, index) => entry.type === "equal" ? -1 : index).filter((index) => index >= 0);
  if (!changes.length) return [...output, "# No changes"].join("\n");
  const oldPrefix = new Uint32Array(diff.length + 1);
  const newPrefix = new Uint32Array(diff.length + 1);
  for (let index = 0; index < diff.length; index += 1) {
    oldPrefix[index + 1] = oldPrefix[index] + (diff[index].type === "insert" ? 0 : 1);
    newPrefix[index + 1] = newPrefix[index] + (diff[index].type === "delete" ? 0 : 1);
  }
  let changeIndex = 0;
  while (changeIndex < changes.length) {
    const start = Math.max(0, changes[changeIndex] - 3);
    let lastChange = changes[changeIndex];
    while (changeIndex + 1 < changes.length && changes[changeIndex + 1] - lastChange <= 7) { changeIndex += 1; lastChange = changes[changeIndex]; }
    const end = Math.min(diff.length, lastChange + 4);
    const oldCount = oldPrefix[end] - oldPrefix[start];
    const newCount = newPrefix[end] - newPrefix[start];
    const oldStart = oldCount ? oldPrefix[start] + 1 : Math.max(0, oldPrefix[start]);
    const newStart = newCount ? newPrefix[start] + 1 : Math.max(0, newPrefix[start]);
    output.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (let index = start; index < end; index += 1) output.push(`${diff[index].type === "delete" ? "-" : diff[index].type === "insert" ? "+" : " "}${diff[index].text}`);
    changeIndex += 1;
  }
  return output.join("\n");
}

function renderFileComparison() {
  const diff = state.fileCompare.diff;
  if (!diff.length) {
    if (state.fileCompare.patch) $("#fileDiffOutput").innerHTML = '<div class="diff-no-match">The files are identical with the selected comparison options.</div>';
    return;
  }
  const onlyChanges = $("#diffOnlyChanges").checked;
  const context = Number($("#diffContext").value);
  const search = $("#diffSearch").value.trim().toLocaleLowerCase();
  const include = new Set();
  if (search) {
    diff.forEach((entry, index) => { if (entry.type !== "equal" && entry.text.toLocaleLowerCase().includes(search)) include.add(index); });
  } else if (onlyChanges) {
    diff.forEach((entry, index) => {
      if (entry.type === "equal") return;
      for (let nearby = Math.max(0, index - context); nearby <= Math.min(diff.length - 1, index + context); nearby += 1) include.add(nearby);
    });
  } else diff.forEach((_, index) => include.add(index));
  if (!include.size) {
    const identical = diff.every((entry) => entry.type === "equal");
    $("#fileDiffOutput").innerHTML = `<div class="diff-no-match">${identical ? "The files are identical with the selected comparison options." : "No changed lines match this filter."}</div>`;
    return;
  }
  let html = "";
  let previousIndex = -1;
  for (const index of [...include].sort((a, b) => a - b)) {
    if (previousIndex >= 0 && index > previousIndex + 1) html += `<div class="diff-gap">··· ${index - previousIndex - 1} unchanged lines hidden ···</div>`;
    const entry = diff[index];
    const marker = entry.type === "delete" ? "−" : entry.type === "insert" ? "+" : "";
    const className = entry.type === "delete" ? "diff-delete" : entry.type === "insert" ? "diff-insert" : "diff-context";
    html += `<div class="diff-row ${className}"><span class="diff-marker">${marker}</span><span>${entry.beforeLine ?? ""}</span><span>${entry.afterLine ?? ""}</span><code>${escapeHtml(entry.text) || " "}</code></div>`;
    previousIndex = index;
  }
  $("#fileDiffOutput").innerHTML = html;
}

async function runFileComparison() {
  const before = state.fileCompare.before;
  const after = state.fileCompare.after;
  if (!before || !after) return toast("Select both the before and after files", true);
  const button = $("#compareFiles");
  setBusy(button, true, "Comparing…");
  setFileDiffState("", "Comparing files", "Processing locally in this browser");
  await new Promise((resolve) => setTimeout(resolve, 20));
  try {
    const started = performance.now();
    const diff = createLineComparison(before.text, after.text, $("#diffIgnoreWhitespace").checked, $("#diffIgnoreCase").checked);
    state.fileCompare.diff = diff;
    state.fileCompare.patch = createComparisonPatch(diff);
    const added = diff.filter((entry) => entry.type === "insert").length;
    const removed = diff.filter((entry) => entry.type === "delete").length;
    const unchanged = diff.length - added - removed;
    let hunks = 0;
    let inChange = false;
    for (const entry of diff) {
      if (entry.type === "equal") inChange = false;
      else if (!inChange) { hunks += 1; inChange = true; }
    }
    $("#diffAdded").textContent = added.toLocaleString();
    $("#diffRemoved").textContent = removed.toLocaleString();
    $("#diffUnchanged").textContent = unchanged.toLocaleString();
    $("#diffHunks").textContent = hunks.toLocaleString();
    $("#diffFileHeader").textContent = `${before.name}  →  ${after.name}`;
    $("#copyFileDiff").disabled = false;
    $("#downloadFileDiff").disabled = false;
    const elapsed = Math.round(performance.now() - started);
    setFileDiffState(added || removed ? "changed" : "identical", added || removed ? `${added + removed} changed lines` : "Files are identical", `${elapsed.toLocaleString()} ms · browser-local comparison`);
    renderFileComparison();
    toast(added || removed ? "File redline comparison completed" : "The selected files are identical");
  } catch (error) {
    setFileDiffState("failed", "Comparison could not finish", error.message);
    $("#fileDiffOutput").innerHTML = `<div class="diff-no-match">${escapeHtml(error.message)}</div>`;
    toast(error.message, true);
  } finally { setBusy(button, false); }
}

function swapComparisonFiles() {
  [state.fileCompare.before, state.fileCompare.after] = [state.fileCompare.after, state.fileCompare.before];
  updateCompareFileCards();
  resetFileDiffResult();
  if (state.fileCompare.before && state.fileCompare.after) runFileComparison();
}

function clearFileComparison() {
  state.fileCompare = { before: null, after: null, diff: [], patch: "" };
  $("#beforeFile").value = ""; $("#afterFile").value = ""; $("#diffSearch").value = "";
  updateCompareFileCards();
  resetFileDiffResult();
}

async function copyComparisonPatch() {
  if (!state.fileCompare.patch) return;
  try { await navigator.clipboard.writeText(state.fileCompare.patch); toast("Comparison patch copied"); }
  catch { toast("Clipboard access was blocked", true); }
}

function downloadComparisonPatch() {
  if (!state.fileCompare.patch) return;
  const baseName = state.fileCompare.after.name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_.-]+/g, "-") || "changes";
  const url = URL.createObjectURL(new Blob([state.fileCompare.patch], { type: "text/x-diff;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `${baseName}-changes.diff`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Redline patch downloaded");
}

async function scanTools() {
  const buttons = [$ ("#scanTools"), $("#refreshStatus"), $("#overviewScan")].filter(Boolean);
  buttons.forEach((button) => button.disabled = true);
  try {
    const result = await api("/api/tools/status");
    state.tools = result.tools;
    renderTools();
  } catch (error) { toast(error.message, true); }
  finally { buttons.forEach((button) => button.disabled = false); }
}

function renderTools() {
  const entries = Object.entries(state.tools);
  const available = entries.filter(([, value]) => value.available).length;
  $("#availableCount").textContent = `${available} of ${entries.length}`;
  $("#overviewTools").innerHTML = entries.slice(0, 7).map(([id, tool]) => `<div class="tool-ready"><span>${labels[id].slice(0,2).toUpperCase()}</span><b>${labels[id]}</b><small>${tool.available ? tool.version : "Not installed"}</small><i class="${tool.available ? "on" : ""}"></i></div>`).join("");
  $("#devopsGrid").innerHTML = entries.map(([id, tool]) => `<button type="button" data-tool="${id}" class="devops-card ${tool.available ? "available" : ""} ${id === $("#devopsTool").value ? "selected" : ""}"><div><span>${labels[id].slice(0,2).toUpperCase()}</span><i></i></div><b>${labels[id]}</b><small title="${escapeHtml(tool.version)}">${escapeHtml(tool.version)}</small></button>`).join("");
  $$("#devopsGrid [data-tool]").forEach((card) => card.addEventListener("click", () => selectDevopsTool(card.dataset.tool)));
}

function rememberDevopsValues() {
  state.devopsValues[state.devopsActiveTool] = { target: $("#devopsEndpoint").value, secondary: $("#devopsSecondary").value, scope: $("#devopsScope").value, cwd: $("#devopsCwd").value };
}

function applyDevopsField(label, input, spec) {
  label.classList.toggle("hidden", !spec);
  if (!spec) { input.value = ""; return; }
  if (label === $("#endpointLabel")) label.childNodes[0].nodeValue = spec[0];
  else label.querySelector("span").textContent = spec[0];
  input.placeholder = spec[1];
}

function selectDevopsTool(tool) {
  if (!actions[tool]) return;
  rememberDevopsValues();
  state.devopsActiveTool = tool;
  $("#devopsTool").value = tool;
  $("#devopsAuditTool").value = tool;
  updateDevopsActions();
  updateDevopsAuditContext();
  $$("#devopsGrid [data-tool]").forEach((card) => card.classList.toggle("selected", card.dataset.tool === tool));
}

function updateDevopsActions() {
  const tool = $("#devopsTool").value;
  state.devopsActiveTool = tool;
  $("#devopsAction").innerHTML = Object.entries(actions[tool]).map(([id, name]) => `<option value="${id}">${name}</option>`).join("");
  $("#devopsMethods").innerHTML = Object.entries(actions[tool]).map(([id, name], index) => `<button type="button" data-method="${id}" class="${index === 0 ? "active" : ""}">${escapeHtml(name)}</button>`).join("");
  $$("#devopsMethods [data-method]").forEach((button) => button.addEventListener("click", () => { $("#devopsAction").value = button.dataset.method; updateCommandLabel(); }));
  const fields = devopsFields[tool] || {};
  applyDevopsField($("#endpointLabel"), $("#devopsEndpoint"), fields.target);
  applyDevopsField($("#secondaryLabel"), $("#devopsSecondary"), fields.secondary);
  applyDevopsField($("#scopeLabel"), $("#devopsScope"), fields.scope);
  $("#cwdLabel").classList.toggle("hidden", !fields.cwd);
  const saved = state.devopsValues[tool] || {};
  $("#devopsEndpoint").value = saved.target ?? (tool === "kafka" ? "localhost:9092" : "");
  $("#devopsSecondary").value = saved.secondary || "";
  $("#devopsScope").value = saved.scope || "";
  $("#devopsCwd").value = saved.cwd || "";
  updateCommandLabel();
}

function updateCommandLabel() {
  const tool = $("#devopsTool").value;
  const action = $("#devopsAction").value;
  $$("#devopsMethods [data-method]").forEach((button) => button.classList.toggle("active", button.dataset.method === action));
  const scopes = [$("#devopsEndpoint").value.trim(), $("#devopsSecondary").value.trim(), $("#devopsScope").value.trim()].filter(Boolean);
  $("#commandLabel").textContent = `${labels[tool]} · ${actions[tool][action]}${scopes.length ? ` · ${scopes.join(" · ")}` : ""}`;
}

function renderDevopsOutput() {
  const filter = $("#devopsOutputFilter").value.trim().toLowerCase();
  $("#devopsOutput").textContent = filter ? state.devopsOutput.split(/\r?\n/).filter((line) => line.toLowerCase().includes(filter)).join("\n") || "No output lines match this filter." : state.devopsOutput || "Select a tool and guided method, then run the inspection.";
}

async function runDevops() {
  const button = $("#runDevops");
  const payload = { tool: $("#devopsTool").value, action: $("#devopsAction").value, target: $("#devopsEndpoint").value.trim(), secondary: $("#devopsSecondary").value.trim(), scope: $("#devopsScope").value.trim(), cwd: $("#devopsCwd").value.trim() };
  rememberDevopsValues();
  const status = $(".tool-runner .stream-status");
  setBusy(button, true, "Running…");
  status.className = "stream-status live"; status.innerHTML = "<i></i>RUNNING";
  state.devopsOutput = `Running ${labels[payload.tool]} inspection locally…`;
  $("#devopsRunMeta").textContent = "Waiting for the approved local client";
  renderDevopsOutput();
  try {
    const result = await api("/api/devops/run", { method: "POST", body: JSON.stringify(payload) });
    state.devopsOutput = [result.stdout, result.stderr].filter(Boolean).join("\n") || "Command completed without output.";
    $("#commandLabel").textContent = result.displayCommand;
    $("#devopsRunMeta").textContent = `${result.durationMs.toLocaleString()} ms · exit ${result.code} · ${new Date().toLocaleTimeString()}`;
    state.investigation.lastDevops = { tool: payload.tool, action: payload.action, durationMs: result.durationMs, code: result.code, output: state.devopsOutput, occurredAt: new Date().toISOString() };
    status.className = "stream-status live"; status.innerHTML = "<i></i>COMPLETE";
    renderDevopsOutput();
    toast(`${labels[payload.tool]} inspection completed`);
  } catch (error) {
    state.devopsOutput = error.message;
    $("#devopsRunMeta").textContent = "Inspection failed · review the output";
    status.className = "stream-status"; status.innerHTML = "<i></i>FAILED";
    renderDevopsOutput(); toast(error.message, true);
  } finally { setBusy(button, false); }
}

function currentDevopsAuditContext(tool) {
  const saved = state.devopsValues[tool] || {};
  if (tool === $("#devopsTool").value) return { target: $("#devopsEndpoint").value.trim(), secondary: $("#devopsSecondary").value.trim(), scope: $("#devopsScope").value.trim(), cwd: $("#devopsCwd").value.trim() };
  return { target: saved.target || (tool === "kafka" ? "localhost:9092" : ""), secondary: saved.secondary || "", scope: saved.scope || "", cwd: saved.cwd || "" };
}

function updateDevopsAuditContext() {
  const tool = $("#devopsAuditTool").value;
  const context = currentDevopsAuditContext(tool);
  const values = [context.target, context.secondary, context.scope, context.cwd].filter(Boolean);
  $("#devopsAuditContext").textContent = `${labels[tool]} · ${values.length ? values.join(" · ") : "active CLI context"}`;
}

function updateDevopsAuditSummary(total) {
  const results = state.devopsAuditResults;
  $("#devopsAuditCompleted").textContent = `${results.length} / ${total}`;
  $("#devopsAuditPassed").textContent = results.filter((result) => result.ok).length.toLocaleString();
  $("#devopsAuditFailed").textContent = results.filter((result) => !result.ok).length.toLocaleString();
  $("#devopsAuditChanged").textContent = results.filter((result) => result.changed).length.toLocaleString();
  $("#devopsAuditSignals").textContent = results.reduce((sum, result) => sum + result.signals, 0).toLocaleString();
  $("#devopsAuditProgress").style.width = `${total ? Math.round(100 * results.length / total) : 0}%`;
  renderAuditResultCards("#devopsAuditResults", results);
}

async function runDevopsAudit() {
  const tool = $("#devopsAuditTool").value;
  if (tool !== $("#devopsTool").value) selectDevopsTool(tool);
  const context = currentDevopsAuditContext(tool);
  let methods = [...devopsAuditPlans[tool][$("#devopsAuditDepth").value]];
  if (tool === "ssh" && !context.target) methods = methods.filter((method) => method === "version");
  const previous = state.devopsAuditHistory[tool] || {};
  const button = $("#runDevopsAudit");
  const stop = $("#stopDevopsAudit");
  state.devopsAuditStop = false; state.devopsAuditResults = [];
  setBusy(button, true, "Running audit…"); stop.disabled = false;
  $("#devopsAuditResults").innerHTML = '<div class="audit-empty"><span>OPS</span><b>Guided audit running</b><p>Approved inspection results appear here one method at a time.</p></div>';
  updateDevopsAuditSummary(methods.length);
  for (let index = 0; index < methods.length; index += 1) {
    if (state.devopsAuditStop) break;
    const action = methods[index];
    const label = actions[tool][action];
    $("#devopsAuditProgressText").textContent = `Running ${index + 1} of ${methods.length} · ${label}`;
    const started = performance.now();
    try {
      const result = await api("/api/devops/run", { method: "POST", body: JSON.stringify({ tool, action, ...context }) });
      const fullOutput = [result.stdout, result.stderr].filter(Boolean).join("\n") || "Inspection completed without output.";
      const output = fullOutput.length > 300000 ? `${fullOutput.slice(0, 300000)}\n\n[Output shortened in audit view]` : fullOutput;
      state.devopsAuditResults.push({ id: action, label, ok: true, durationMs: result.durationMs, output: `${result.displayCommand}\n\n${output}`, signals: countAuditSignals(output), changed: Object.hasOwn(previous, action) && previous[action] !== output, rawOutput: output });
    } catch (error) {
      state.devopsAuditResults.push({ id: action, label, ok: false, durationMs: Math.round(performance.now() - started), error: error.message, output: error.message, signals: 1, changed: false });
    }
    updateDevopsAuditSummary(methods.length);
  }
  const stopped = state.devopsAuditStop;
  state.devopsAuditHistory[tool] = Object.fromEntries(state.devopsAuditResults.filter((result) => result.ok).map((result) => [result.id, result.rawOutput]));
  $("#devopsAuditProgressText").textContent = stopped ? `Stopped after ${state.devopsAuditResults.length} of ${methods.length} methods` : `Completed ${methods.length} methods · ${new Date().toLocaleTimeString()}`;
  if (!stopped) $("#devopsAuditProgress").style.width = "100%";
  state.devopsAuditStop = false; stop.disabled = true; setBusy(button, false);
  toast(stopped ? `${labels[tool]} audit stopped` : `${labels[tool]} guided audit completed`);
}

async function copyDevopsAudit() {
  if (!state.devopsAuditResults.length) return toast("Run a DevOps audit first", true);
  const tool = $("#devopsAuditTool").value;
  const report = [`DBridge ${labels[tool]} guided audit`, `Captured: ${new Date().toLocaleString()}`, "", ...state.devopsAuditResults.flatMap((result) => [`=== ${result.label} · ${result.ok ? "PASSED" : "FAILED"}${result.changed ? " · CHANGED" : ""} ===`, result.output, ""])].join("\n");
  try { await navigator.clipboard.writeText(report); toast("Guided audit copied"); }
  catch { toast("Clipboard access was blocked", true); }
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
async function copyFrom(selector) { try { await navigator.clipboard.writeText($(selector).textContent); toast("Copied to clipboard"); } catch { toast("Clipboard access was blocked", true); } }

function bind() {
  placeGoldenGateInSqlStudio();
  restoreKeepPass();
  $("#keepPassToggle").addEventListener("change", (event) => changeKeepPass(event.target.checked));
  $("#menu").addEventListener("click", toggleApplicationSidebar);
  $("#sidebarScrim").addEventListener("click", closeApplicationSidebar);
  $("#openCommandPalette").addEventListener("click", openCommandPalette);
  $("#sidebarCommandPalette").addEventListener("click", openCommandPalette);
  $("#closeCommandPalette").addEventListener("click", closeCommandPalette);
  $("#commandPaletteBackdrop").addEventListener("click", closeCommandPalette);
  $("#commandPaletteSearch").addEventListener("input", () => { commandPaletteSelection = 0; renderCommandPalette($("#commandPaletteSearch").value); });
  $("#commandPalette").addEventListener("keydown", handleCommandPaletteKeydown);
  $$("#themeSwitch button").forEach((button) => button.addEventListener("click", () => setThemeMode(button.dataset.themeMode)));
  $("#toggleSidebarMode").addEventListener("click", toggleSidebarMode);
  $("#openShortcutMap").addEventListener("click", openShortcutMap);
  $("#closeShortcutMap").addEventListener("click", closeShortcutMap);
  $("#shortcutMapBackdrop").addEventListener("click", closeShortcutMap);
  $("#shortcutMap").addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); closeShortcutMap(); } });
  $("#connectionProfileSelect").addEventListener("change", () => { applyConnectionProfile($("#connectionProfileSelect").value); updateDbStudioAutofillHint(); });
  $("#dbStudioAutofillSource").addEventListener("change", updateDbStudioAutofillHint);
  $("#dbStudioAutofill").addEventListener("click", applyDbStudioAutofill);
  $("#dbStudioClearSecrets").addEventListener("click", clearDbStudioSecrets);
  $("#dbStudioValidate").addEventListener("click", validateDbStudioConnection);
  $("#dbStudioRefreshCatalog").addEventListener("click", refreshDbStudioCatalog);
  $("#exportSqlCsv").addEventListener("click", () => exportSqlResult("csv"));
  $("#exportSqlJson").addEventListener("click", () => exportSqlResult("json"));
  $("#copySqlResult").addEventListener("click", copySqlResult);
  $("#saveConnectionProfile").addEventListener("click", saveConnectionProfile);
  $("#deleteConnectionProfile").addEventListener("click", deleteConnectionProfile);
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if ($("#commandPalette").classList.contains("hidden")) openCommandPalette();
      else closeCommandPalette();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      toggleThemeMode();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      toggleDensity();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "b") {
      event.preventDefault();
      toggleSidebarMode();
      return;
    }
    const target = event.target;
    const editing = target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    if (!editing && event.key === "?") {
      event.preventDefault();
      if ($("#shortcutMap").classList.contains("hidden")) openShortcutMap();
      else closeShortcutMap();
      return;
    }
    if (event.key === "Escape" && !$("#shortcutMap").classList.contains("hidden")) {
      event.preventDefault();
      closeShortcutMap();
      return;
    }
    if (!editing && event.altKey && /^[1-7]$/.test(event.key)) {
      event.preventDefault();
      const views = ["overview", "sql", "performance", "investigation", "logs", "devops", "security"];
      navigate(views[Number(event.key) - 1]);
    }
  });
  $$("#nav button").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
  $$('[data-jump]').forEach((button) => button.addEventListener("click", () => navigate(button.dataset.jump)));
  $$("[data-workspace-tab]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.workspaceTab));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = $$("[data-workspace-tab]");
      const current = tabs.indexOf(button);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      tabs[next].focus();
    });
  });
  $$("[data-workspace-target], [data-workspace-view]").forEach((button) => button.addEventListener("click", () => openFriendlyWorkspaceTarget(button)));
  $("#sqlEnvironment").addEventListener("change", sqlEnvironmentChanged);
  $("#sqlEngine").addEventListener("change", sqlConnectionEngineChanged);
  $("#sqlAuthMode").addEventListener("change", () => { if ($("#sqlAuthMode").value === "context") $("#sqlPassword").value = ""; updateConnectionAdapterUi(); disconnectSqlStudio(false); scheduleConnectionSessionSave(); });
  $("#sqlTlsMode").addEventListener("change", () => { disconnectSqlStudio(false); scheduleConnectionSessionSave(); });
  $("#showSqlPassword").addEventListener("click", () => { const input = $("#sqlPassword"); input.type = input.type === "password" ? "text" : "password"; $("#showSqlPassword").textContent = input.type === "password" ? "Show" : "Hide"; });
  $("#connectSqlStudio").addEventListener("click", () => connectSqlStudio());
  $("#disconnectSqlStudio").addEventListener("click", () => disconnectSqlStudio(true));
  $("#refreshDatabaseExplorer").addEventListener("click", () => loadDatabaseExplorer(false));
  $("#databaseExplorerSearch").addEventListener("input", renderDatabaseExplorer);
  $("#saveConnectionSession").addEventListener("click", () => { state.connectionSession.suspendAutoSave = false; persistConnectionSession($("#sqlEngine").value, true, true); });
  $("#clearConnectionSession").addEventListener("click", clearConnectionSession);
  $("#sqlText").addEventListener("input", editorContentChanged);
  $("#sqlText").addEventListener("keydown", handleEditorKeydown);
  ["click", "keyup", "select"].forEach((eventName) => $("#sqlText").addEventListener(eventName, updateEditorStatus));
  ["click", "keyup"].forEach((eventName) => $("#sqlText").addEventListener(eventName, updateEditorAutocomplete));
  $("#sqlText").addEventListener("scroll", () => { $("#lineNumbers").scrollTop = $("#sqlText").scrollTop; });
  $("#toggleAutocomplete").addEventListener("click", cycleEditorAutocompleteScope);
  $("#newEditorTab").addEventListener("click", () => addEditorTab());
  $("#openEditorFiles").addEventListener("click", () => $("#editorFilePicker").click());
  $("#editorFilePicker").addEventListener("change", openEditorFiles);
  $("#toggleFind").addEventListener("click", openEditorSearch);
  $("#toggleReplace").addEventListener("click", () => { openEditorSearch(); $("#editorReplace").focus(); });
  $("#goToLine").addEventListener("click", goToEditorLine);
  $("#toggleWrap").addEventListener("click", toggleEditorWrap);
  $("#zoomOut").addEventListener("click", () => zoomEditor(-1));
  $("#zoomIn").addEventListener("click", () => zoomEditor(1));
  $("#downloadEditorFile").addEventListener("click", downloadEditorFile);
  $("#editorFind").addEventListener("input", updateFindMatches);
  $("#editorFind").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); findEditorMatch(event.shiftKey ? -1 : 1); } else if (event.key === "Escape") $("#editorSearchBar").classList.add("hidden"); });
  $("#editorMatchCase").addEventListener("change", updateFindMatches);
  $("#findPrevious").addEventListener("click", () => findEditorMatch(-1));
  $("#findNext").addEventListener("click", () => findEditorMatch(1));
  $("#replaceOne").addEventListener("click", replaceEditorMatch);
  $("#replaceAll").addEventListener("click", replaceAllEditorMatches);
  $("#closeFind").addEventListener("click", () => $("#editorSearchBar").classList.add("hidden"));
  $("#runSql").addEventListener("click", runSql);
  $("#formatSql").addEventListener("click", formatSql);
  $("#resultGridTab").addEventListener("click", () => showSqlResultView("results"));
  $("#resultMessagesTab").addEventListener("click", () => showSqlResultView("messages"));
  $("#perfEngine").addEventListener("change", () => setPerformanceWorkspaceEngine($("#perfEngine").value));
  $$("[data-performance-engine]").forEach((button) => button.addEventListener("click", () => setPerformanceWorkspaceEngine(button.dataset.performanceEngine)));
  $$("[data-runtime-trace-engine]").forEach((button) => button.addEventListener("click", () => setPerformanceWorkspaceEngine(button.dataset.runtimeTraceEngine)));
  $$("[data-runtime-trace-tab]").forEach((button) => button.addEventListener("click", () => setRuntimeTraceTab(button.dataset.runtimeTraceTab)));
  $("#runtimeTraceUseSelected").addEventListener("click", useSelectedRuntimeTraceIdentifier);
  $("#runtimeTraceReset").addEventListener("click", clearRuntimeTrace);
  $("#runtimeTraceCapture").addEventListener("click", captureRuntimeTrace);
  $("#runtimeTraceImportance").addEventListener("change", () => {
    const saved = state.runtimeTrace.results[state.performanceWorkspace.engine];
    if (saved) renderRuntimeTrace(saved);
  });
  $("#runtimeTraceCopyReport").addEventListener("click", copyRuntimeTraceReport);
  $("#runtimeTraceCopyTerminal").addEventListener("click", copyRuntimeTraceTerminal);
  $("#runtimeTraceOpenSqlStudio").addEventListener("click", openRuntimeTraceInSqlStudio);
  $("#runtimeTraceIdentifier").addEventListener("input", () => {
    const value = $("#runtimeTraceIdentifier").value;
    state.performanceWorkspace.identifiers[state.performanceWorkspace.engine] = value.trim();
    $("#performanceQuickIdentifier").value = value;
    $("#sqlIdentifier").value = value;
  });
  $$("[data-performance-mode]").forEach((button) => button.addEventListener("click", () => setPerformanceMode(button.dataset.performanceMode, true)));
  $$("[data-performance-jump]").forEach((button) => button.addEventListener("click", () => scrollPerformanceSection(button.dataset.performanceJump)));
  $("#performanceModeNext").addEventListener("click", () => setPerformanceMode($("#performanceModeNext").dataset.nextMode || "overview", true));
  $("#runPerformanceFallbackHealth").addEventListener("click", async () => {
    setPerformanceMode("overview", false);
    scrollPerformanceSection("performanceHealthSection");
    await runDatabaseSnapshot();
  });
  $("#openPerformanceFallbackStatement").addEventListener("click", () => {
    setPerformanceMode("statement", true);
    window.setTimeout(() => $("#sqlIdentifier").focus({ preventScroll: true }), 250);
  });
  $("#openPerformanceFallbackChecks").addEventListener("click", () => {
    setPerformanceMode("advanced", false);
    scrollPerformanceSection("performanceChecksSection");
  });
  $("#performanceOpenSqlStudio").addEventListener("click", () => { navigate("sql"); $("#sqlHost").focus(); });
  $("#performanceQuickRecommend").addEventListener("click", runPerformanceQuickRecommendation);
  $("#performanceQuickTrace").addEventListener("click", runPerformanceQuickTrace);
  $("#performanceQuickSnapshot").addEventListener("click", runPerformanceQuickSnapshot);
  $("#runOracleBottleneck").addEventListener("click", runOracleBottleneck);
  $("#runPostgresBottleneck").addEventListener("click", runPostgresBottleneck);
  $("#runMongoBottleneck").addEventListener("click", runMongoBottleneck);
  $("#useOracleSelectedSql").addEventListener("click", () => {
    const identifier = ($("#performanceQuickIdentifier").value || $("#sqlIdentifier").value).trim().toLowerCase();
    if (!/^[a-z0-9]{13}$/.test(identifier)) return toast("Select a valid 13-character Oracle SQL_ID first", true);
    $("#oracleBottleneckSqlId").value = identifier;
    $("#oracleXrayIdentifier").value = identifier;
    toast("Selected SQL_ID added to Oracle intelligence");
  });
  $("#oracleBottleneckSqlId").addEventListener("input", () => {
    const input = $("#oracleBottleneckSqlId");
    input.value = input.value.replace(/[^a-z0-9]/gi, "").slice(0, 13).toLowerCase();
    const value = input.value;
    if (!/^[a-z0-9]{13}$/.test(value)) return;
    state.performanceWorkspace.identifiers.oracle = value;
    $("#oracleXrayIdentifier").value = value;
    if (state.performanceWorkspace.engine === "oracle") {
      $("#performanceQuickIdentifier").value = value;
      $("#sqlIdentifier").value = value;
    }
  });
  $("#oraclePackScope").addEventListener("change", updateOracleLicenseLanes);
  $("#copyOracleBottleneckAnalysis").addEventListener("click", async () => {
    if (!state.oracleBottleneck.report) return toast("Run the Oracle bottleneck analysis first", true);
    try { await navigator.clipboard.writeText(state.oracleBottleneck.report); toast("Oracle analysis report copied"); }
    catch { toast("Clipboard access was blocked", true); }
  });
  $("#usePostgresSelectedQuery").addEventListener("click", () => {
    const identifier = ($("#performanceQuickIdentifier").value || $("#sqlIdentifier").value).trim();
    if (!/^-?\d{1,20}$/.test(identifier)) return toast("Select a valid PostgreSQL queryid first", true);
    $("#postgresQueryId").value = identifier;
    toast("Selected queryid added to the bottleneck scan");
  });
  $("#postgresQueryId").addEventListener("input", () => {
    const value = $("#postgresQueryId").value.trim();
    if (!value || !/^-?\d{1,20}$/.test(value)) return;
    state.performanceWorkspace.identifiers.postgres = value;
    if (state.performanceWorkspace.engine === "postgres") {
      $("#performanceQuickIdentifier").value = value;
      $("#sqlIdentifier").value = value;
    }
  });
  $("#copyPostgresAnalysis").addEventListener("click", async () => {
    if (!state.postgresBottleneck.report) return toast("Run the PostgreSQL bottleneck analysis first", true);
    try { await navigator.clipboard.writeText(state.postgresBottleneck.report); toast("PostgreSQL analysis report copied"); }
    catch { toast("Clipboard access was blocked", true); }
  });
  $("#mongoOperationId").addEventListener("input", () => {
    const value = $("#mongoOperationId").value.trim();
    if (!value || /[\r\n\0]/.test(value)) return;
    state.performanceWorkspace.identifiers.mongodb = value;
    if (state.performanceWorkspace.engine === "mongodb") {
      $("#performanceQuickIdentifier").value = value;
      $("#sqlIdentifier").value = value;
    }
  });
  $("#copyMongoAnalysis").addEventListener("click", async () => {
    if (!state.mongodbBottleneck.report) return toast("Run the MongoDB performance analysis first", true);
    try { await navigator.clipboard.writeText(state.mongodbBottleneck.report); toast("MongoDB findings copied"); }
    catch { toast("Clipboard access was blocked", true); }
  });
  $("#performanceQuickIdentifier").addEventListener("input", () => { const value = $("#performanceQuickIdentifier").value; $("#sqlIdentifier").value = value; $("#runtimeTraceIdentifier").value = value; state.performanceWorkspace.identifiers[state.performanceWorkspace.engine] = value.trim(); if (state.performanceWorkspace.engine === "oracle" && /^[a-z0-9]{13}$/i.test(value.trim())) { $("#oracleXrayIdentifier").value = value.trim().toLowerCase(); $("#oracleBottleneckSqlId").value = value.trim().toLowerCase(); } if (state.performanceWorkspace.engine === "postgres" && /^-?\d{1,20}$/.test(value.trim())) $("#postgresQueryId").value = value.trim(); });
  $("#sqlIdentifier").addEventListener("input", () => { const value = $("#sqlIdentifier").value; $("#performanceQuickIdentifier").value = value; $("#runtimeTraceIdentifier").value = value; state.performanceWorkspace.identifiers[state.performanceWorkspace.engine] = value.trim(); if (state.performanceWorkspace.engine === "oracle" && /^[a-z0-9]{13}$/i.test(value.trim())) { $("#oracleXrayIdentifier").value = value.trim().toLowerCase(); $("#oracleBottleneckSqlId").value = value.trim().toLowerCase(); } if (state.performanceWorkspace.engine === "postgres" && /^-?\d{1,20}$/.test(value.trim())) $("#postgresQueryId").value = value.trim(); });
  $("#diagnoseSql").addEventListener("click", diagnoseSql);
  $("#recommendSql").addEventListener("click", recommendSql);
  $("#copyDiagnosis").addEventListener("click", () => copyFrom("#performanceOutput"));
  $("#copyRecommendations").addEventListener("click", async () => { if (!state.sqlRecommendationText) return toast("Run recommendations first", true); try { await navigator.clipboard.writeText(state.sqlRecommendationText); toast("Recommendation report copied"); } catch { toast("Clipboard access was blocked", true); } });
  $$("[data-investigation-tab]").forEach((button) => button.addEventListener("click", () => switchInvestigationTab(button.dataset.investigationTab)));
  $("#flightEngine").addEventListener("change", () => syncPerformanceEngine($("#flightEngine").value));
  $("#directPlanEngine").addEventListener("change", () => syncPerformanceEngine($("#directPlanEngine").value));
  $("#blockingEngine").addEventListener("change", () => syncPerformanceEngine($("#blockingEngine").value));
  $("#startFlight").addEventListener("click", startFlightRecording);
  $("#stopFlight").addEventListener("click", () => stopFlightRecording());
  $("#saveFlight").addEventListener("click", saveFlightRecording);
  $("#compareRecordings").addEventListener("click", compareSavedRecordings);
  $("#captureDirectPlan").addEventListener("click", captureDirectPlan);
  $("#capturePlanHistory").addEventListener("click", capturePlanHistory);
  $("#captureBlockingMap").addEventListener("click", captureBlockingMap);
  $("#runIndexAdvisor").addEventListener("click", runPlanIndexAdvisor);
  $("#refreshAdapters").addEventListener("click", loadAdapterReadiness);
  $("#validateConnection").addEventListener("click", validateCurrentConnection);
  $("#planEngine").addEventListener("change", () => { $("#regressionEngine").value = ["oracle", "postgres", "mongodb", "mysql", "sqlserver"].includes($("#planEngine").value) ? $("#planEngine").value : "generic"; });
  $("#planFile").addEventListener("change", () => readPlanFile($("#planFile"), "#planText"));
  $("#loadPlanSample").addEventListener("click", loadPlanExample);
  $("#analyzePlan").addEventListener("click", analyzeVisualPlan);
  $("#copyPlanFindings").addEventListener("click", copyCurrentPlanFindings);
  $("#savePlanBaseline").addEventListener("click", savePlanBaseline);
  $("#regressionBeforeFile").addEventListener("change", () => readPlanFile($("#regressionBeforeFile"), "#regressionBefore"));
  $("#regressionAfterFile").addEventListener("change", () => readPlanFile($("#regressionAfterFile"), "#regressionAfter"));
  $("#comparePlans").addEventListener("click", runPlanRegression);
  $("#addIncidentEvent").addEventListener("click", addManualIncidentEvent);
  $("#capturePlanEvent").addEventListener("click", captureCurrentPlanEvent);
  $("#captureDevopsEvent").addEventListener("click", captureLastDevopsEvent);
  $("#clearTimelineFilter").addEventListener("click", renderIncidentTimeline);
  $("#resetTuningRules").addEventListener("click", resetTuningRules);
  $("#saveTuningRules").addEventListener("click", saveTuningRules);
  $("#exportEvidenceJson").addEventListener("click", exportInvestigationJson);
  $("#exportEvidenceHtml").addEventListener("click", exportInvestigationHtml);
  $("#tuningEngine").addEventListener("change", () => setPerformanceWorkspaceEngine($("#tuningEngine").value));
  $("#runTuningCheck").addEventListener("click", runTuningCheck);
  $("#copyTuningOutput").addEventListener("click", () => copyFrom("#tuningOutput"));
  $("#snapshotEngine").addEventListener("change", () => setPerformanceWorkspaceEngine($("#snapshotEngine").value));
  ["sqlHost", "sqlPort", "sqlDatabase", "sqlUsername"].forEach((id) => $(`#${id}`).addEventListener("input", () => { updateSnapshotTarget(); updateOracleXrayTarget(); updatePerformanceContextTarget(); disconnectSqlStudio(false); scheduleConnectionSessionSave(); }));
  $("#sqlPassword").addEventListener("input", () => disconnectSqlStudio(false));
  $("#runDbSnapshot").addEventListener("click", runDatabaseSnapshot);
  $("#stopDbSnapshot").addEventListener("click", () => { state.dbSnapshotStop = true; $("#dbSnapshotProgressText").textContent = "Stop requested · waiting for the current check"; });
  $("#runOracleXray").addEventListener("click", runOracleXray);
  $("#stopOracleXray").addEventListener("click", () => { state.oracleXray.stop = true; $("#oracleXrayProgressText").textContent = "Stop requested · waiting for the current check"; });
  $("#clearOracleXray").addEventListener("click", clearOracleXray);
  $("#copyOracleXrayOutput").addEventListener("click", () => copyFrom("#oracleXrayOutput"));
  $("#oracleXrayIdentifier").addEventListener("input", () => { $("#oracleXrayIdentifier").value = $("#oracleXrayIdentifier").value.replace(/[^a-z0-9]/gi, "").slice(0, 13).toLowerCase(); });
  $$("[data-oracle-trace-mode]").forEach((button) => button.addEventListener("click", () => switchOracleTraceMode(button.dataset.oracleTraceMode)));
  $("#oracleTraceFile").addEventListener("change", () => { importOracleTrace($("#oracleTraceFile").files[0]); $("#oracleTraceFile").value = ""; });
  $("#oracleTraceText").addEventListener("input", () => { state.oracleTraceSource = "Pasted or edited Oracle trace"; });
  $("#loadTraceSample").addEventListener("click", loadOracleTraceSample);
  $("#clearOracleTrace").addEventListener("click", clearOracleTrace);
  $("#analyzeOracleTrace").addEventListener("click", analyzeOracleTrace);
  $("#copyOracleAnalysis").addEventListener("click", async () => { if (!state.oracleAnalysisText) return toast("Analyze a trace first", true); try { await navigator.clipboard.writeText(state.oracleAnalysisText); toast("Oracle trace summary copied"); } catch { toast("Clipboard access was blocked", true); } });
  $("#copyOracleSql").addEventListener("click", async () => { const analysis = state.oracleTraceAnalysis; const sql = analysis ? [analysis.optimizer.sqlText, ...analysis.sqlTexts].filter(Boolean).join("\n\n---\n\n") : ""; if (!sql) return toast("No SQL text was detected in this trace", true); try { await navigator.clipboard.writeText(sql); toast("Captured SQL copied"); } catch { toast("Clipboard access was blocked", true); } });
  $("#runTkprof").addEventListener("click", runTkprof);
  $("#tkprofFilter").addEventListener("input", renderTkprofReport);
  $("#copyTkprof").addEventListener("click", async () => { if (!state.tkprofReport) return toast("Run TKPROF first", true); try { await navigator.clipboard.writeText(state.tkprofReport); toast("TKPROF report copied"); } catch { toast("Clipboard access was blocked", true); } });
  $("#sourceSearch").addEventListener("input", renderLogCatalog);
  $("#sourceGroup").addEventListener("change", renderLogCatalog);
  $("#logTransport").addEventListener("change", () => { stopLogFollow(); state.logText = ""; state.lastTelemetry = ""; updateLogAccess(true); renderLog(); });
  $("#resetSourcePath").addEventListener("click", () => { stopLogFollow(); updateLogAccess(true); });
  $("#logPath").addEventListener("change", () => {
    const source = currentSource(); const transport = currentTransport();
    $("#logFileName").textContent = transport === "ssh" ? `${source.name} · remote` : transport === "native" ? `${source.name} · native view` : transport === "telemetry" ? `${source.name} telemetry` : ($("#logPath").value.split(/[\\/]/).pop() || source.log);
    stopLogFollow();
  });
  ["sshHost", "sshUser", "sshPort", "sshOs", "sshKey"].forEach((id) => $(`#${id}`).addEventListener("change", stopLogFollow));
  $("#toggleLog").addEventListener("click", toggleLogFollow);
  $("#logFilter").addEventListener("input", renderLog);
  $("#clearLog").addEventListener("click", () => { state.logText = ""; renderLog(); });
  $("#copyLog").addEventListener("click", () => copyFrom("#logOutput"));
  $$("[data-log-insight-tab]").forEach((button) => button.addEventListener("click", () => setLogInsightTab(button.dataset.logInsightTab)));
  $("#refreshLogInsights").addEventListener("click", () => { renderLog(); toast("Log findings refreshed"); });
  $("#copyLogFindings").addEventListener("click", copyLogInsightReport);
  $("#logWindowHours").addEventListener("change", () => {
    const following = $("#streamStatus").classList.contains("live");
    if (following) {
      state.logOffset = 0;
      state.lastTelemetry = "";
      state.logText = "";
    }
    renderLog();
    if (following) $("#logMeta").textContent = "Reloading the selected history window";
  });
  $("#analyzeTrace").addEventListener("click", analyzeTrace);
  $("#scanTools").addEventListener("click", scanTools);
  $("#refreshStatus").addEventListener("click", scanTools);
  $("#overviewScan").addEventListener("click", scanTools);
  $$('[data-container-dashboard]').forEach((button) => button.addEventListener("click", () => setContainerDashboardMode(button.dataset.containerDashboard)));
  $$('[data-container-access]').forEach((button) => button.addEventListener("click", () => setContainerAccessMode(button.dataset.containerAccess)));
  $("#refreshContainerDashboard").addEventListener("click", refreshContainerDashboard);
  $("#containerWriteAction").addEventListener("change", renderContainerWriteControls);
  $("#previewContainerWriteAction").addEventListener("click", previewContainerWriteAction);
  $("#applyContainerWriteAction").addEventListener("click", applyContainerWriteAction);
  $("#refreshContainerAudit").addEventListener("click", loadContainerAudit);
  ["containerWriteTarget", "containerWriteValue", "containerChangeReference"].forEach((id) => $(`#${id}`).addEventListener("input", () => resetContainerPreflight("Inputs changed. Run Preview & preflight again.")));
  ["containerDashboardContext", "containerDashboardNamespace"].forEach((id) => $(`#${id}`).addEventListener("input", () => { if (state.containerDashboard.mode === "kubernetes") $("#containerDashboardScope").textContent = `Kubernetes · ${$("#containerDashboardContext").value.trim() || "active context"} · ${$("#containerDashboardNamespace").value.trim() || "all namespaces"}`; if (state.containerDashboard.accessMode === "write") resetContainerPreflight("Scope changed. Run Preview & preflight again."); }));
  $("#refreshVersions").addEventListener("click", loadVersionComparison);
  $("#captureVersions").addEventListener("click", captureVersionBaseline);
  $("#evaluateDeploymentGate").addEventListener("click", evaluateDeploymentHealth);
  $("#captureTopology").addEventListener("click", captureKubernetesTopology);
  $("#capturePipelineRuns").addEventListener("click", capturePipelineRuns);
  $("#savePipelineSnapshot").addEventListener("click", savePipelineSnapshot);
  $("#comparePipelineRuns").addEventListener("click", comparePipelineRuns);
  $("#driftBaselineFile").addEventListener("change", () => loadDriftFile("baseline"));
  $("#driftCurrentFile").addEventListener("change", () => loadDriftFile("current"));
  $("#saveDriftSnapshot").addEventListener("click", saveDriftSnapshot);
  $("#compareConfigurationDrift").addEventListener("click", compareConfigurationDrift);
  $("#captureKafkaLag").addEventListener("click", captureKafkaLag);
  $("#saveKafkaSnapshot").addEventListener("click", saveKafkaSnapshot);
  $("#runbookTool").addEventListener("change", updateRunbookActions);
  $("#saveRunbook").addEventListener("click", saveRunbook);
  $("#oggArchitecture").addEventListener("change", updateGoldenGateArchitecture);
  $("#oggAction").addEventListener("change", () => { if (["extract", "replicat", "checkpoints"].includes($("#oggAction").value)) $("#oggGroup").focus(); });
  $("#oggRun").addEventListener("click", () => runGoldenGateDiagnostic(false));
  $("#oggMonitor").addEventListener("click", toggleGoldenGateMonitor);
  $("#oggLogKind").addEventListener("change", updateGoldenGateLogPath);
  $("#oggHome").addEventListener("change", updateGoldenGateLogPath);
  $("#oggGroup").addEventListener("change", updateGoldenGateLogPath);
  $("#oggStartLog").addEventListener("click", toggleGoldenGateLog);
  $("#oggOpenLogs").addEventListener("click", openGoldenGateInLogCenter);
  $("#oggCopyDiagnostic").addEventListener("click", () => copyFrom("#oggDiagnosticOutput"));
  $("#oggCopyLog").addEventListener("click", () => copyFrom("#oggLogOutput"));
  $("#devopsAuditTool").addEventListener("change", () => selectDevopsTool($("#devopsAuditTool").value));
  $("#runDevopsAudit").addEventListener("click", runDevopsAudit);
  $("#stopDevopsAudit").addEventListener("click", () => { state.devopsAuditStop = true; $("#devopsAuditProgressText").textContent = "Stop requested · waiting for the current method"; });
  $("#copyDevopsAudit").addEventListener("click", copyDevopsAudit);
  bindCompareDropZone("before");
  bindCompareDropZone("after");
  $("#compareFiles").addEventListener("click", runFileComparison);
  $("#swapFiles").addEventListener("click", swapComparisonFiles);
  $("#clearFileDiff").addEventListener("click", clearFileComparison);
  $("#copyFileDiff").addEventListener("click", copyComparisonPatch);
  $("#downloadFileDiff").addEventListener("click", downloadComparisonPatch);
  ["diffIgnoreWhitespace", "diffIgnoreCase"].forEach((id) => $(`#${id}`).addEventListener("change", () => { if (state.fileCompare.before && state.fileCompare.after) runFileComparison(); }));
  ["diffOnlyChanges", "diffContext"].forEach((id) => $(`#${id}`).addEventListener("change", renderFileComparison));
  $("#diffSearch").addEventListener("input", renderFileComparison);
  $("#devopsTool").addEventListener("change", () => selectDevopsTool($("#devopsTool").value));
  $("#devopsAction").addEventListener("change", updateCommandLabel);
  ["devopsEndpoint", "devopsSecondary", "devopsScope", "devopsCwd"].forEach((id) => $(`#${id}`).addEventListener("input", () => { updateCommandLabel(); updateDevopsAuditContext(); }));
  $("#runDevops").addEventListener("click", runDevops);
  $("#copyDevops").addEventListener("click", () => copyFrom("#devopsOutput"));
  $("#devopsOutputFilter").addEventListener("input", renderDevopsOutput);
  $("#clearDevops").addEventListener("click", () => { state.devopsOutput = ""; $("#devopsOutputFilter").value = ""; $("#devopsRunMeta").textContent = "Output cleared"; renderDevopsOutput(); });
  restoreUiPreferences();
  const restoredConnectionEngine = restoreConnectionSession();
  renderConnectionProfiles();
  if (performanceWorkspaceCatalog[restoredConnectionEngine]) { $("#perfEngine").value = restoredConnectionEngine; $("#tuningEngine").value = restoredConnectionEngine; $("#snapshotEngine").value = restoredConnectionEngine; }
  updateDevopsActions(); updateDevopsAuditContext(); updateRunbookActions(); updateGoldenGateArchitecture(); updateGoldenGateLogPath(); updateTuningChecks(false); setPerformanceWorkspaceEngine($("#perfEngine").value, false); setPerformanceMode(state.performanceWorkspace.mode, false); updateSnapshotTarget(); updateOracleXrayTarget(); updateConnectionAdapterUi(); updateLines(); renderFlightRecorder(); renderLogCatalog(); chooseLogSource("oracle"); setContainerDashboardMode("kubernetes");
  window.addEventListener("beforeunload", () => { if (!state.connectionSession.suspendAutoSave) persistConnectionSession($("#sqlEngine").value, true, false); });
  window.addEventListener("resize", drawFlightChart);
  const incidentNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16); $("#incidentTime").value = incidentNow;
  loadEditorSession().catch((error) => toast(error.message, true));
  loadOracleXrayCatalog();
  setInterval(() => $("#clock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), 1000);
}

bind();
scanTools();
loadDbStudioAdapters();
