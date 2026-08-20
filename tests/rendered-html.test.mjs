import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(){
  const workerUrl=new URL("../dist/server/index.js",import.meta.url);
  workerUrl.searchParams.set("test",`${process.pid}-${Date.now()}`);
  const{default:worker}=await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/",{headers:{accept:"text/html"}}),{ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});
}

test("server-renders the integrated environment-scoped DB Operations Studio",async()=>{
  const response=await render();
  assert.equal(response.status,200);
  assert.match(response.headers.get("content-type")??"",/^text\/html\b/i);
  const html=await response.text();
  assert.match(html,/<title>DB Operations Studio<\/title>/i);
  assert.match(html,/DB Studio/);
  for(const workspace of ["SQL Workspace","MongoDB Studio","SQL Diagnostics","Logs &amp; Traces","Engine Intelligence","DevOps &amp; Remote","Investigation"])assert.match(html,new RegExp(workspace));
  for(const environment of ["Production","SIT","UAT-Test","DEV"])assert.match(html,new RegExp(environment));
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const connector of ["Oracle","PostgreSQL","MongoDB","SQL Server","Snowflake","Teradata"])assert.match(source,new RegExp(connector));
  assert.match(source,/Autofill adapter defaults/);
  assert.match(html,/Run SQL/);
  assert.match(html,/Autocomplete/);
  assert.doesNotMatch(html,/window\.location\.replace|codex-preview|Your site is taking shape/i);
});

test("includes the secure pairing, catalog, validation, and SQL APIs",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const endpoint of ["/api/studio/pair","/api/adapters","/api/connections/check","/api/sql/catalog","/api/sql/run","/api/editor/session","/api/performance/sample","/api/performance/diagnostic-studio/catalog","/api/performance/diagnostic-studio/analyze","/api/performance/check","/api/performance/recommend","/api/performance/runtime-trace/capture","/api/performance/oracle-bottleneck/analyze","/api/performance/postgres-bottleneck/analyze","/api/performance/mongodb-bottleneck/analyze","/api/performance/relational-bottleneck/analyze","/api/performance/oracle-sql-id/check","/api/performance/plan-capture","/api/performance/plan-history","/api/logs/native","/api/logs/migration-compare","/api/logs/remote-tail","/api/logs/telemetry","/api/traces/analyze","/api/oracle/tkprof","/api/goldengate/diagnose","/api/mongodb/studio","/api/mongodb/mongosync","/api/devops/kubernetes-dashboard","/api/devops/docker-dashboard","/api/devops/kubernetes-topology","/api/devops/pipeline-runs","/api/devops/kafka-lag","/api/devops/run","/api/devops/container-action/preview","/api/terminal/ssh/open","/api/terminal/ssh/stream","/api/investigation/recordings","/api/investigation/events","/api/investigation/runbooks","/api/investigation/rules","/api/investigation/autofill-profiles"])assert.match(source,new RegExp(endpoint.replaceAll("/","\\/")));
  for(const capability of ["Unlock writes","CSV","JSON","Catalog browser","Environment autofill","Health snapshot","Tuning check","Controlled changes","Compare versions","Complete diagnostic evidence","Oracle SQL_ID X-Ray","GoldenGate","Flight recorder","Incident timeline","Cloud telemetry","Oracle TKPROF","SSH terminals"])assert.match(source,new RegExp(capability));
  assert.match(source,/localStorage\.setItem/);
  assert.match(source,/type Profile = Omit<DbForm,"password">/);
});

test("consolidates the advanced DBridge performance workflows inside SQL Diagnostics",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const capability of ["Advanced SQL Diagnostics & Incident Command","Run full performance suite","Resource pressure map","Ranked findings","Likely cause","Safe next action","Engine deep dive","Oracle SQL_ID X-Ray","Plans & regression","Flight recorder","Tuning thresholds","Export report"])assert.match(source,new RegExp(capability.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  for(const methodology of ["Oracle SQL Monitoring","PostgreSQL EXPLAIN","MongoDB Explain Results","MySQL EXPLAIN ANALYZE","MariaDB Performance Schema","SQL Server Query Store"])assert.match(source,new RegExp(methodology));
  assert.match(source,/const runPerformanceSuite=async/);
  assert.match(source,/suiteSteps/);
});

test("adds an evidence-driven SQL X-Ray troubleshooting runbook",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const capability of ["SQL X-Ray Troubleshooting Runbook","Incident window","Workload and regression","Runtime, waits and blocking","Plan, binds and cursors","Optimizer, parallel and I/O","Verify the outcome","Evidence gaps are never treated as healthy","Decision path","Operator verification checklist","Run full troubleshooting sequence","Automatic assessment","Raw Oracle evidence"])assert.equal(source.includes(capability),true,capability);
  for(const implementation of ["SqlXrayTroubleshooter","xrayMarkerPlaybook","summarizeXrayEvidence","xrayProgress","XRAY_BLOCKED_SESSION","XRAY_HIGH_IO_LATENCY"])assert.equal(source.includes(implementation),true,implementation);
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  for(const selector of [".xray-troubleshooter",".xray-runbook",".xray-decision-path",".xray-phase-grid",".xray-evidence-browser",".xray-operator-checklist"])assert.equal(css.includes(selector),true,selector);
});

test("adds visual DevOps operations workspaces based on official product patterns",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const capability of ["Kubernetes GUI","Docker GUI","Git & GitHub","Ansible GUI","Lens-style cluster explorer","Docker Desktop-style visibility","GitKraken-inspired operations workspace","AWX-style read-only explorer","Logs & inspect","Commit graph and working-tree evidence","Refresh visual workspace"])assert.match(source,new RegExp(capability.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  for(const action of ["topPods","topNodes","pullRequests","workflows","commits","inventory","graph","inspect","processes"])assert.match(source,new RegExp(action));
  assert.match(source,/const collectToolWorkspace=async/);
  assert.match(source,/devopsWorkspaceReferences/);
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  for(const selector of [".ops-visual-workspace",".ops-resource-rail",".ops-kpi-grid",".ops-commit-graph",".ops-inventory-tree"])assert.match(css,new RegExp(selector.replace(".","\\.")));
});
test("adds the advanced MongoDB Compass, mongosync, and mirror workspace",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const tab of ["Advanced MongoDB Studio","Collections","Documents","Pipeline Builder","Schema","Indexes","Validation","Explain","Performance","Sync & Mirror"])assert.match(source,new RegExp(tab,"i"));
  for(const capability of ["Find documents","Save locally","Analyze schema","Inspect indexes","Inspect validation","Explain query","Refresh performance","mongosync Controller","Mirror Verification","Commit cutover","Compare source and destination","mongomirror compatibility"])assert.match(source,new RegExp(capability.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i"));
  for(const safety of ["LOOPBACK ONLY","EXPLICIT CONFIRMATION","APPLY MONGOSYNC","change-stream stages are blocked","read-only index metadata"])assert.match(source,new RegExp(safety,"i"));
  const server=await readFile(new URL("../portable/server.mjs",import.meta.url),"utf8");
  for(const implementation of ["runMongoStudioAction","compareMongoStudioMirror","runMongosyncController","callLocalMongosync","127.0.0.1","canCommit=false","embedded verifier"])assert.match(server,new RegExp(implementation.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i"));
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  for(const selector of [".mongo-studio",".mongo-collection-grid",".mongo-schema-grid",".mongo-plan-tree",".mongo-sync-controls",".mongo-sync-status"])assert.match(css,new RegExp(selector.replace(".","\\.")));
});
test("adds six engine-native database intelligence packs",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const engine of ["Oracle","PostgreSQL","MongoDB","MySQL","MariaDB","SQL Server"])assert.match(source,new RegExp(engine));
  for(const capability of ["Database packs","Database intelligence packs","Run selected database pack","Six engine-native analysis packs","Statement X-Ray","HA & replication","Oracle GoldenGate","RAC & services","WAL & replication","WiredTiger cache","Row & metadata locks","Multi-source replicas","Query Store regression","HADR health"])assert.match(source,new RegExp(capability.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i"));
  assert.match(source,/deepDiveRoutes/);
  assert.match(source,/relational-bottleneck\/analyze/);
  const agent=await readFile(new URL("../portable/server.mjs",import.meta.url),"utf8");
  for(const route of ["/api/performance/relational-bottleneck/catalog","/api/performance/relational-bottleneck/analyze"])assert.match(agent,new RegExp(route.replaceAll("/","\\/")));
  for(const guard of ["64 hexadecimal characters","0x prefix followed by exactly 16 hexadecimal characters","Fixed read-only database evidence"])assert.match(agent,new RegExp(guard,"i"));
  const pack=await readFile(new URL("../portable/relational-bottleneck.mjs",import.meta.url),"utf8");
  for(const implementation of ["mysqlBottleneckCatalog","mariadbBottleneckCatalog","sqlserverBottleneckCatalog","analyzeRelationalBottlenecks","Query Store reports recent runtime regressions","Connection capacity has limited headroom","Availability-group replica health"])assert.match(pack,new RegExp(implementation.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i"));
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  for(const selector of [".engine-pack-workspace",".engine-pack-grid",".engine-pack-controls",".engine-intelligence-studio",".intelligence-engine-strip"])assert.match(css,new RegExp(selector.replace(".","\\.")));
});
test("adds the DBA migration log comparison and redline workspace",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const capability of ["Migration Log Compare","EXPORT / SOURCE LOG","IMPORT / TARGET LOG","DDL and data object reconciliation","Export object CSV","Copy verification SQL","Export ↔ import log redline","Silence is labeled unverified"])assert.equal(source.includes(capability),true,capability);
  for(const engine of ["Oracle Data Pump","pg_dump / pg_restore","mysqldump / mysql","mariadb-dump / mariadb","SqlPackage / BACPAC / bcp","mongodump / mongorestore"])assert.equal(source.includes(engine),true,engine);
  assert.equal(source.includes("/api/logs/migration-compare"),true);
  const server=await readFile(new URL("../portable/server.mjs",import.meta.url),"utf8");
  for(const route of ["/api/logs/migration-compare/catalog","/api/logs/migration-compare"])assert.equal(server.includes(route),true,route);
  const parser=await readFile(new URL("../portable/migration-log-compare.mjs",import.meta.url),"utf8");
  for(const implementation of ["compareMigrationLogs","parseOracle","parsePostgres","parseMySql","parseSqlServer","parseMongo","buildRedline","verificationScript","Each pasted migration log is limited to 3.5 MB"])assert.equal(parser.includes(implementation),true,implementation);
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  for(const selector of [".migration-compare-builder",".migration-log-panes",".migration-object-table",".migration-redline",".redline-row",".migration-verification"])assert.equal(css.includes(selector),true,selector);
});
test("adds the symptom-driven SQL Diagnostic Incident Command",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  assert.equal(source.includes('const [incidentCatalog,setIncidentCatalog]=useState'),true,"Incident Command state declarations are missing");
  assert.equal(source.includes('const [incidentPlaybook,setIncidentPlaybook]=useState'),true,"Incident playbook state declaration is missing");
  for(const capability of ["Incident command","Choose the incident symptom","Run targeted incident diagnostic","One symptom, one correlated DBA report","Prioritized DBA action plan","Evidence gaps","Unavailable is never interpreted as healthy","Official diagnostic method"])assert.equal(source.includes(capability),true,capability);
  for(const playbook of ["Slow SQL / operation","Blocking / lock incident","CPU / concurrency pressure","I/O / storage latency","Memory / temp pressure","Replication / HA health","Capacity / maintenance risk","Errors / reliability"])assert.equal((await readFile(new URL("../portable/diagnostic-studio.mjs",import.meta.url),"utf8")).includes(playbook),true,playbook);
  const server=await readFile(new URL("../portable/server.mjs",import.meta.url),"utf8");
  for(const implementation of ["/api/performance/diagnostic-studio/catalog","/api/performance/diagnostic-studio/analyze","collectDiagnosticStudioEvidence","validateDiagnosticStudioIdentifier","requestedCheckIds"])assert.equal(server.includes(implementation),true,implementation);
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  for(const selector of [".incident-command-center",".incident-playbook-grid",".incident-verdict",".incident-phases",".incident-triage-grid",".incident-actions",".incident-gaps"])assert.equal(css.includes(selector),true,selector);
});
test("auto-hides the database Connection panel and removes it from DevOps",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const behavior of ["connectionPanelOpen","scheduleConnectionPanelHide","connection-launcher",'studioTool!=="devops"'])assert.equal(source.includes(behavior),true,behavior);
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  for(const selector of [".studio-grid.connection-collapsed",".studio-grid.without-connection",".connection-launcher",".connection-collapse"])assert.equal(css.includes(selector),true,selector);
});
test("adds the advanced DBGate and Snowflake-style SQL worksheet workspace",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const capability of ["Run selected","Run all","Explain","Format SQL","Save workspace","Save script","Import SQL","Worksheet inspector","Query history","Statistics","Filter loaded rows","Advanced worksheet ready","Ctrl+Shift+Enter"])assert.equal(source.includes(capability),true,capability);
  for(const implementation of ["SqlWorksheet","SqlHistoryEntry","SavedSqlScript","addSqlTab","switchSqlTab","selectedStatement","dbops.sql.history.v1","dbops.sql.scripts.v1","filteredResultRows","resultStats"])assert.equal(source.includes(implementation),true,implementation);
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  for(const selector of [".worksheet-tabs",".sql-workbench",".sql-inspector",".sql-history",".sql-scripts",".result-filter",".result-statistics"])assert.equal(css.includes(selector),true,selector);
});
test("routes database connections and safe DevOps URLs into their workspaces",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const behavior of ["connectToWorkspace","Connect → SQL Workspace","Connect → MongoDB Studio","DEVOPS URL / DEEP LINK","passDevopsUrl","Credential values are blocked in DevOps URLs","sshConnectionRequest"])assert.equal(source.includes(behavior),true,behavior);
  const ssh=await readFile(new URL("../app/components/SshWorkspace.tsx",import.meta.url),"utf8");
  for(const behavior of ["ConnectionRequest","connectionRequest?.requestId","target.protocol!==\"ssh:\"","setConnectionOpen(true)"])assert.equal(ssh.includes(behavior),true,behavior);
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  assert.equal(css.includes(".devops-url-pass"),true,"DevOps URL control styling");
});

test("expands the canvas and adds advanced SQL guard and guided DevOps packs",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const capability of ["Wide canvas","SQL GUARD","Add 100-row guard","SQL diagnostics","READ-ONLY RESPONSE PACKS","Cluster triage","Container pressure","Delivery failure","Inventory drift"])assert.equal(source.includes(capability),true,capability);
  for(const implementation of ["workspaceWide","dbops.workspace-wide.v1","sqlReview","applySafeRowLimit","runGuidedOps","GuidedOpsPack"])assert.equal(source.includes(implementation),true,implementation);
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  for(const selector of [".workspace-wide",".workspace-wide-toggle",".sql-review-strip",".guided-ops-deck"])assert.equal(css.includes(selector),true,selector);
});

test("adds a visual multi-engine execution plan investigator",async()=>{
  const source=await readFile(new URL("../app/components/ExecutionPlanInvestigator.tsx",import.meta.url),"utf8");
  for(const capability of ["Execution Plan Investigator","Upload baseline plan","Upload candidate plan","Side-by-side trees","Candidate heatmap","Operator delta table","Culprit ranking","Cardinality estimate failure","Dominant elapsed-time operator","Nested-loop amplification","Runtime warning or spill","Operator runtime regressed","Actuals outrank estimates","LOCAL FILE PARSING"])assert.equal(source.includes(capability),true,capability);
  for(const engine of ["Oracle DBMS_XPLAN","PostgreSQL EXPLAIN","SQL Server Showplan","MySQL EXPLAIN","MariaDB ANALYZE","MongoDB explain"])assert.equal(source.includes(engine),true,engine);
  for(const implementation of ["detectEngine","parseJson","parseXml","parseText","parsePlan","matchPlans","investigate","actualCoverage","matched","execution-plan-investigation.json"])assert.equal(source.includes(implementation),true,implementation);
  const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  assert.equal(page.includes("<ExecutionPlanInvestigator"),true,"Plan investigator is not mounted in SQL Diagnostics");
  const css=await readFile(new URL("../app/execution-plan-investigator.css",import.meta.url),"utf8");
  for(const selector of [".execution-plan-investigator",".epi-input-grid",".epi-tree",".epi-scoreboard",".epi-analysis-grid",".epi-finding-list",".epi-finding-detail",".epi-delta-table"])assert.equal(css.includes(selector),true,selector);
});

test("adds an advanced Kargo GitOps promotion workspace",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const capability of ["Kargo GitOps Promotion Control","Freight timeline","Promotion pipeline","Artifact matrix","Promotions","verifications","Freight history","settings","Live manifest","Controlled Freight promotion","Preview permission","Promote verified Freight","NO BYPASS APPROVALS","Kargo progressive delivery"])assert.equal(source.includes(capability),true,capability);
  for(const implementation of ["KargoWorkspace","refreshKargoDashboard","runKargoPromotion","kargoAutoRefresh","/api/devops/kargo-dashboard","/api/devops/kargo-promote/preview","/api/devops/kargo-promote"])assert.equal(source.includes(implementation),true,implementation);
  const server=await readFile(new URL("../portable/server.mjs",import.meta.url),"utf8");
  for(const implementation of ["kargoDashboardSpecs","buildKargoDashboard","kargoPromotionSpec","kargoPromotionPreflightSpec","warehouses.kargo.akuity.io","freight.kargo.akuity.io","stages.kargo.akuity.io","PROMOTE KARGO FREIGHT"])assert.equal(server.includes(implementation),true,implementation);
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  for(const selector of [".kargo-controls",".kargo-workspace",".kargo-freight-timeline",".kargo-pipeline-canvas",".kargo-artifact-matrix",".kargo-stage-detail",".kargo-promotion-console"])assert.equal(css.includes(selector),true,selector);
});

test("adds an advanced read-only Lens-style Kubernetes operations cockpit",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const capability of ["Lens-style cluster cockpit","Resource inspector","Live 15s","SECRETS EXCLUDED","Rollout status","KubernetesLensWorkspace","kubeAutoRefresh","runKubeInspection","storage","configuration","access"])assert.equal(source.includes(capability),true,capability);
  const server=await readFile(new URL("../portable/server.mjs",import.meta.url),"utf8");
  for(const implementation of ["Secret manifests are excluded from the Studio inspector","--tail=300","api-resources","persistentVolumeClaims","clusterRoleBindings","customResources"])assert.equal(server.includes(implementation),true,implementation);
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  for(const selector of [".kube-lens-controls",".kube-view-strip",".kube-lens-shell",".kube-detail-panel",".kube-inspector-launcher"])assert.equal(css.includes(selector),true,selector);
});

test("adds Tabby and mRemoteNG-style remote operations features",async()=>{
  const source=await readFile(new URL("../app/components/SshWorkspace.tsx",import.meta.url),"utf8");
  for(const capability of ["Tabby-style Quick Connect","Remote connection manager","mRemoteNG-style folders","Inherit folder defaults","Careful paste","Startup command","Export JSON","Import JSON","Favorites","Connection tree"])assert.equal(source.includes(capability),true,capability);
  for(const implementation of ["GROUP_KEY","quickConnectNow","resolvedProfile","applyGroupToForm","exportConnectionLibrary","importConnectionLibrary","dbops-remote-library-v1","startupCommand.trim()"])assert.equal(source.includes(implementation),true,implementation);
  for(const safety of ["without credentials","Passwords, passphrases, host pins and live sessions are never included","host key is inspected before login"])assert.equal(source.includes(safety),true,safety);
  const css=await readFile(new URL("../app/ssh-workspace.css",import.meta.url),"utf8");
  for(const selector of [".ssh-quickbar",".ssh-tool-content.library",".ssh-library-toolbar",".ssh-folder-editor",".ssh-connection-tree",".ssh-inherit-defaults",".ssh-setting-toggle"])assert.equal(css.includes(selector),true,selector);
});


test("adds a unified command center and guided workflow to every Studio tab",async()=>{
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  for(const capability of ["Studio Command Center","Guided workflow","Search pages, Studio tabs and tools","FASTEST SAFE PATH","JUMP TO A TOOL","Alt 1-7","Paste mode available","Read-only by default"])assert.equal(source.includes(capability),true,capability);
  for(const implementation of ["studioToolMeta","studioToolOrder","openStudioLocation","studioCommandQuery","studioRecents","dbops.studio.recents.v1","paletteResults","studioStatusTone"])assert.equal(source.includes(implementation),true,implementation);
  for(const tool of ["Worksheet editor","Pipeline Builder","Incident command","Migration compare","Bottleneck analysis","Kubernetes GUI","Incident timeline"])assert.equal(source.includes(tool),true,tool);
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  for(const selector of [".studio-context-strip",".studio-readiness",".command-palette.advanced",".command-results",".studio-guide-backdrop",".guide-steps",".guide-modes"])assert.equal(css.includes(selector),true,selector);
});

test("adds MIT-attributed Oracle plan visualization compatibility",async()=>{
  const source=await readFile(new URL("../app/components/ExecutionPlanInvestigator.tsx",import.meta.url),"utf8");
  for(const capability of ["ORACLE INPUT LAB","Five DBA plan formats, one investigation model","Oracle row-flow map","Monitor & resources","ORACLE PLAN MAP","ORACLE RUNTIME EVIDENCE","Load Oracle regression","PREDICATE EVIDENCE","ora-explain-plan-viz formats - MIT"])assert.equal(source.includes(capability),true,capability);
  for(const format of ["DBMS_XPLAN","SQL Monitor text","SQL Monitor XML","V$SQL_PLAN JSON","XBI / eXplain Better"])assert.equal(source.includes(format),true,format);
  const parser=await readFile(new URL("../app/components/oracle-plan.ts",import.meta.url),"utf8");
  for(const implementation of ["detectOraclePlanFormat","parseOraclePlan","parseDbmsXplan","parseSqlMonitorText","parseSqlMonitorXml","parseOracleJson","parseXbi","parent_id","actual_cr_buffer_gets","plan_monitor"])assert.equal(parser.includes(implementation),true,implementation);
  const css=await readFile(new URL("../app/execution-plan-investigator.css",import.meta.url),"utf8");
  for(const selector of [".epi-oracle-formats",".oracle-flow-view",".oracle-flow-canvas",".oracle-node-inspector",".oracle-monitor-kpis",".oracle-evidence-table"])assert.equal(css.includes(selector),true,selector);
  const notice=await readFile(new URL("../THIRD_PARTY_NOTICES.md",import.meta.url),"utf8");
  assert.equal(notice.includes("davidbudac/ora-explain-plan-viz"),true,"upstream attribution");
  assert.equal(notice.includes("MIT License"),false,"notice uses the full MIT grant rather than an incomplete label");
  assert.equal(notice.includes("Permission is hereby granted"),true,"MIT permission text");
});
