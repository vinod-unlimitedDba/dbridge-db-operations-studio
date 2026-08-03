"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SshWorkspace from "./components/SshWorkspace";

type View = "overview" | "studio" | "infrastructure" | "performance" | "runbooks";
type StudioTool = "sql" | "mongodb" | "diagnostics" | "observability" | "intelligence" | "devops" | "investigation";
type DiagnosticMode = "incident" | "health" | "check" | "statement" | "recommend" | "runtime" | "deepdive" | "engines" | "xray" | "plans" | "recorder" | "rules";
type ObserveMode = "compare" | "native" | "local" | "remote" | "trace" | "telemetry" | "tkprof";
type DevopsMode = "kubernetes" | "docker" | "github" | "ansible" | "tooling" | "delivery" | "ssh" | "changes";
type IntelligenceMode = "overview" | "bottleneck" | "xray" | "plans" | "resilience" | "goldengate";
type InvestigationMode = "recorder" | "timeline" | "runbooks" | "rules" | "library";
type DeliveryMode = "pipeline" | "kafka" | "topology";
type KubeGuiView = "overview" | "workloads" | "compute" | "network" | "events";
type DockerGuiView = "overview" | "containers" | "images" | "storage" | "network" | "logs";
type GitGuiView = "overview" | "repositories" | "pullRequests" | "workflows" | "issues" | "status" | "branches" | "commits" | "diff";
type AnsibleGuiView = "overview" | "inventory" | "topology" | "configuration" | "runtime";
type MongoMode = "explorer" | "documents" | "aggregations" | "schema" | "indexes" | "validation" | "explain" | "performance" | "sync";
type SshSession = { sessionId:string; host:string; port:number; username:string; authMethod:string; openedAt:string; output:string; connected:boolean };
type AnyResult = Record<string,any> | null;
type Environment = "Production" | "SIT" | "UAT-Test" | "DEV";
type Adapter = { name:string; port:number; tier:string; family:string; auth:string; driver?:string; client?:string; available:boolean; directAvailable:boolean; clientAvailable:boolean; preferredAccess:string };
type DbForm = { environment:Environment; engine:string; authMode:"password"|"context"; tlsMode:"prefer"|"require"|"disable"; host:string; port:string; database:string; username:string; password:string };
type Profile = Omit<DbForm,"password"> & { id:string; name:string };
type CatalogObject = { type:string; schema:string; name:string };
type GridResult = { columns:string[]; rows:(string|number|boolean|null)[][]; raw:string; stderr:string; durationMs:number };
type Completion = { label:string; detail:string; insert:string };
type SqlWorksheet = { id:string; name:string; engine:string; content:string; dirty:boolean; cursor:number };
type SqlHistoryEntry = { id:string; worksheetId:string; sql:string; status:"success"|"failed"; durationMs:number; rowCount:number; executedAt:string; engine:string; environment:Environment };
type SavedSqlScript = { id:string; name:string; sql:string; engine:string; savedAt:string };
type SqlInspectorMode = "history" | "scripts" | "context";

const AGENT_URL="http://127.0.0.1:17865";
const environments:Environment[]=["Production","SIT","UAT-Test","DEV"];
const nav:{id:View;label:string;mark:string}[]=[
  {id:"studio",label:"Operations Studio",mark:"DB"},
  {id:"runbooks",label:"Runbooks",mark:"R"},
];
const adapterDefaults:Record<string,{name:string;port:string;database:string;authMode:"password"|"context"}>={
  oracle:{name:"Oracle",port:"1521",database:"ORCL",authMode:"password"},postgres:{name:"PostgreSQL",port:"5432",database:"postgres",authMode:"password"},
  mongodb:{name:"MongoDB",port:"27017",database:"admin",authMode:"password"},mysql:{name:"MySQL",port:"3306",database:"mysql",authMode:"password"},
  sqlserver:{name:"SQL Server",port:"1433",database:"master",authMode:"password"},mariadb:{name:"MariaDB",port:"3306",database:"mysql",authMode:"password"},
  redshift:{name:"Amazon Redshift",port:"5439",database:"dev",authMode:"password"},synapse:{name:"Azure Synapse",port:"1433",database:"master",authMode:"password"},
  snowflake:{name:"Snowflake",port:"443",database:"",authMode:"password"},bigquery:{name:"Google BigQuery",port:"443",database:"",authMode:"context"},
  databricks:{name:"Databricks SQL",port:"443",database:"",authMode:"context"},db2:{name:"IBM Db2",port:"50000",database:"",authMode:"password"},
  hana:{name:"SAP HANA",port:"30015",database:"",authMode:"context"},clickhouse:{name:"ClickHouse",port:"9000",database:"default",authMode:"password"},
  teradata:{name:"Teradata",port:"1025",database:"",authMode:"password"},
};
const engineOrder=Object.keys(adapterDefaults);
const sqlSamples:Record<string,string>={
  oracle:"SELECT owner, table_name, num_rows\nFROM all_tables\nWHERE ROWNUM <= 50\nORDER BY owner, table_name;",
  postgres:"SELECT pid, usename, state, wait_event_type, query_start\nFROM pg_stat_activity\nORDER BY query_start DESC NULLS LAST\nLIMIT 50;",
  mongodb:"db.getCollectionNames()",
  mysql:"SELECT id, user, host, db, command, time, state\nFROM information_schema.processlist\nORDER BY time DESC\nLIMIT 50;",
  sqlserver:"SELECT TOP (50) session_id, status, command, cpu_time, total_elapsed_time\nFROM sys.dm_exec_requests\nORDER BY total_elapsed_time DESC;",
  mariadb:"SELECT id, user, host, db, command, time, state\nFROM information_schema.processlist\nORDER BY time DESC\nLIMIT 50;",
};
const sqlKeywords=["SELECT","FROM","WHERE","JOIN","LEFT JOIN","GROUP BY","ORDER BY","HAVING","WITH","UNION ALL","DISTINCT","CASE","COUNT(*)","CURRENT_TIMESTAMP","EXPLAIN","LIMIT 50"];
const diagnosticEngines=new Set(["oracle","postgres","mongodb","mysql","mariadb","sqlserver"]);
const diagnosticLabels:Record<DiagnosticMode,string>={incident:"Incident command",health:"Health snapshot",check:"Tuning check",statement:"Statement evidence",recommend:"Recommendations",runtime:"Runtime workbench",deepdive:"Engine deep dive",engines:"Database packs",xray:"Oracle SQL_ID X-Ray",plans:"Plans & regression",recorder:"Flight recorder",rules:"Tuning thresholds"};
const performanceReferences:Record<string,{label:string;url:string;method:string}>={
  oracle:{label:"Oracle SQL Monitoring",url:"https://docs.oracle.com/en/database/oracle/oracle-database/23/tgsql/monitoring-database-operations.html",method:"Correlate DB time, CPU, waits, reads/writes and plan-line activity. Licensed sources require explicit scope."},
  postgres:{label:"PostgreSQL EXPLAIN",url:"https://www.postgresql.org/docs/current/using-explain.html",method:"Compare estimates with actual rows, loops, buffers, sort/hash spill and planning versus execution time."},
  mongodb:{label:"MongoDB Explain Results",url:"https://www.mongodb.com/docs/manual/reference/explain-results/index.html",method:"Compare returned documents with examined documents and keys, stage shape, cache, locks and live operations."},
  mysql:{label:"MySQL EXPLAIN ANALYZE",url:"https://dev.mysql.com/doc/refman/8.4/en/explain.html",method:"Use digest workload, iterator timing, estimated versus actual rows, loops, index choice and Performance Schema evidence."},
  mariadb:{label:"MariaDB Performance Schema",url:"https://mariadb.com/docs/server/reference/system-tables/performance-schema",method:"Correlate normalized digests, waits, InnoDB cache and locks, temporary work, table I/O and replication evidence."},
  sqlserver:{label:"SQL Server Query Store",url:"https://learn.microsoft.com/en-us/sql/relational-databases/performance/monitoring-performance-by-using-the-query-store",method:"Compare retained plans, runtime resource use, wait categories and regression intervals before considering plan action."},
};
const enginePackDefinitions:Record<string,{mark:string;checks:number;focus:string;boundary:string;capabilities:string[]}>= {
  oracle:{mark:"ORA",checks:30,focus:"SQL_ID",boundary:"Core by default · licensed AWR, ASH and SQL Monitor only after explicit scope",capabilities:["RAC & services","Waits & time model","PGA, SGA & temp","Redo & undo","Cursor plans","ADR reliability"]},
  postgres:{mark:"PG",checks:26,focus:"queryid",boundary:"Statistics views only · no extension, setting, vacuum or session change",capabilities:["Waits & blockers","WAL & replication","Vacuum health","Buffer & I/O","Plans & JIT","Checkpoint pressure"]},
  mongodb:{mark:"MDB",checks:19,focus:"operation/comment",boundary:"Direct read-only driver · profiler and plan cache are never changed",capabilities:["WiredTiger cache","Current operations","Replication","Sharding","Query shapes","Storage pressure"]},
  mysql:{mark:"MY",checks:18,focus:"64-char digest",boundary:"Performance Schema and InnoDB evidence · no instrument or variable change",capabilities:["Wait events","Digest workload","InnoDB cache","Row & metadata locks","File/table I/O","Replica channels"]},
  mariadb:{mark:"MAR",checks:18,focus:"64-char digest",boundary:"MariaDB-specific status, InnoDB and replication compatibility",capabilities:["Performance Schema","InnoDB pressure","Temp & sorts","Metadata locks","Table/index I/O","Multi-source replicas"]},
  sqlserver:{mark:"MSS",checks:21,focus:"0x query hash",boundary:"DMVs and existing Query Store only · no session kill, plan force or setting change",capabilities:["Schedulers & waits","Memory clerks","TempDB & log","Query Store regression","Index signals","HADR health"]},
};
const deepDiveRoutes:Record<string,string>={
  oracle:"/api/performance/oracle-bottleneck/analyze",
  postgres:"/api/performance/postgres-bottleneck/analyze",
  mongodb:"/api/performance/mongodb-bottleneck/analyze",
  mysql:"/api/performance/relational-bottleneck/analyze",
  mariadb:"/api/performance/relational-bottleneck/analyze",
  sqlserver:"/api/performance/relational-bottleneck/analyze",
};
const devopsActionMap:Record<string,string[]>={
  kubernetes:["cluster","namespaces","nodes","pods","deployments","services","events","topPods","topNodes","describe"],
  docker:["info","containers","images","networks","volumes","diskUsage","stats","logs","inspect","processes"],
  github:["status","repositories","pullRequests","workflows","issues","releases"],
  kafka:["topics","describeTopic","groups","describeGroup"],terraform:["version","providers","validate","outputs","state","workspace"],
  helm:["releases","repositories","charts","status","history","values"],git:["version","status","branches","remotes","commits","diff"],
  aws:["identity","regions","eksClusters","ecsClusters"],azure:["account","subscriptions","resourceGroups","aksClusters"],
  gcloud:["account","project","config","clusters","sqlInstances"],databricks:["profiles","clusters","jobs","warehouses"],
  snowflake:["version","context","recentQueries","warehouses"],ssh:["version","configuration","connectivity"],
  ansible:["version","config","inventory","graph"],podman:["info","containers","images","networks","volumes","diskUsage","stats","logs","inspect","processes"],
  argocd:["version","applications","clusters","repositories","projects"],vault:["status","secrets","auth","policies"],
  tofu:["version","providers","validate","outputs","state","workspace"],nomad:["status","nodes","jobs","servers","allocations"],
  goldengate:["version","overview","lag","messages","extract","replicat","checkpoints","versions"],
};

const mongoWorkspaceReferences:Record<MongoMode,{label:string;url:string;method:string}>={
  explorer:{label:"Compass collections",url:"https://www.mongodb.com/docs/compass/collections/",method:"Collection inventory, document counts, storage, indexes, deployment role and database capacity."},
  documents:{label:"Compass documents",url:"https://www.mongodb.com/docs/compass/documents/",method:"Read-only document browsing with filter, projection, sort and bounded result limits."},
  aggregations:{label:"Compass pipeline builder",url:"https://www.mongodb.com/docs/compass/create-agg-pipeline/",method:"JSON pipeline builder with local saved pipelines; mutating output and change-stream stages are blocked."},
  schema:{label:"Compass schema analysis",url:"https://www.mongodb.com/docs/compass/schema/",method:"Sampled field coverage, BSON type distribution, cardinality examples and numeric ranges."},
  indexes:{label:"Compass indexes",url:"https://www.mongodb.com/docs/compass/indexes/",method:"Index keys, uniqueness, partial filters, collation, TTL, sparse and hidden index metadata."},
  validation:{label:"Compass validation",url:"https://www.mongodb.com/docs/compass/validation/",method:"Collection validator, validation level, validation action, collation and collection type."},
  explain:{label:"Compass explain plan",url:"https://www.mongodb.com/docs/compass/query-plan/",method:"Visual execution tree with execution time, documents returned/examined, keys examined and scan ratio."},
  performance:{label:"MongoDB diagnostics",url:"https://www.mongodb.com/docs/manual/administration/analyzing-mongodb-performance/",method:"Connections, queues, WiredTiger cache, operations, storage, active operations and replication health."},
  sync:{label:"MongoDB mongosync",url:"https://www.mongodb.com/docs/mongosync/current/quickstart/",method:"Local state-aware mongosync control plus source/destination mirror verification before cutover."},
};
const devopsWorkspaceReferences:Record<string,{label:string;url:string;method:string}>={
  kubernetes:{label:"Lens cluster views",url:"https://docs.k8slens.dev/k8slens/using-lens/overview/",method:"Resource navigation, cluster health, workloads, CPU and memory pressure, and warning events in one context-aware view."},
  docker:{label:"Docker Desktop dashboard",url:"https://docs.docker.com/desktop/use-desktop/",method:"Containers, images, volumes, networks, engine capacity, live stats, and logs presented as searchable resource inventories."},
  github:{label:"GitHub Actions monitoring",url:"https://docs.github.com/en/actions/how-tos/monitor-workflows",method:"Repositories, pull requests, issues, releases, and workflow-run status collected through the authenticated GitHub CLI."},
  git:{label:"GitKraken commit graph",url:"https://help.gitkraken.com/gitkraken-desktop/interface/",method:"Local status, branches, remotes, commit history, and diff summary stay on this laptop and use the selected working tree."},
  ansible:{label:"AWX resource model",url:"https://docs.ansible.com/projects/awx/en/24.6.1/userguide/main_menu.html",method:"Inventory, host-group topology, effective configuration, and runtime readiness use the local Ansible project context."},
};
const opsWorkspaceViews:Record<string,Record<string,string[]>>={
  kubernetes:{overview:["cluster","namespaces","nodes","pods","deployments","services","events","topPods","topNodes"],workloads:["deployments","pods"],compute:["nodes","topNodes","topPods"],network:["services"],events:["events"]},
  docker:{overview:["info","containers","stats","images","networks","volumes","diskUsage"],containers:["containers","stats"],images:["images","diskUsage"],storage:["volumes","diskUsage"],network:["networks"],logs:["logs","inspect","processes"]},
  github:{overview:["status","repositories","pullRequests","workflows","issues","releases"],repositories:["repositories"],pullRequests:["pullRequests"],workflows:["workflows"],issues:["issues"]},
  git:{overview:["status","branches","remotes","commits","diff"],status:["status","remotes"],branches:["branches","remotes"],commits:["commits"],diff:["diff","status"]},
  ansible:{overview:["version","config","inventory","graph"],inventory:["inventory"],topology:["graph"],configuration:["config"],runtime:["version"]},
};
function defaultForm():DbForm{return {environment:"Production",engine:"postgres",authMode:"password",tlsMode:"require",host:"",port:"5432",database:"postgres",username:"",password:""}}
function parseOutput(stdout:string,stderr:string,durationMs:number):GridResult{
  const raw=stdout||"";
  try{
    const parsed=JSON.parse(raw); const source=Array.isArray(parsed)?parsed:[parsed];
    if(source.length&&source.every(item=>item&&typeof item==="object"&&!Array.isArray(item))){
      const columns=[...new Set(source.flatMap(item=>Object.keys(item as Record<string,unknown>)))];
      const rows=source.map(item=>columns.map(column=>{const value=(item as Record<string,unknown>)[column];return value==null?null:typeof value==="object"?JSON.stringify(value):value as string|number|boolean}));
      return {columns,rows,raw,stderr,durationMs};
    }
  }catch{/* client output may not be JSON */}
  const lines=raw.split(/\r?\n/).filter(Boolean);
  if(lines.length>1&&lines[0].includes(",")){
    const columns=lines[0].split(",").map(value=>value.replace(/^"|"$/g,""));
    const rows=lines.slice(1).map(line=>line.split(",").map(value=>value.replace(/^"|"$/g,"")));
    return {columns,rows,raw,stderr,durationMs};
  }
  return {columns:[],rows:[],raw,stderr,durationMs};
}
function csvCell(value:unknown){const text=value==null?"":String(value);return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text}
function download(name:string,content:string,type:string){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
function asText(value:unknown){return typeof value==="string"?value:JSON.stringify(value,null,2)}
function GenericEvidence({data,label="Evidence"}:{data:AnyResult;label?:string}){
  if(!data)return <div className="module-empty"><span>DB</span><b>No evidence collected yet</b><small>Choose an operation above. Results stay on this laptop and can be exported when needed.</small></div>;
  const findings=(data.findings||data.analysis?.findings||[]) as any[];
  const results=(data.results||[]) as any[];
  return <div className="evidence-view"><header><div><i className={data.ok===false?"bad":"good"}/><p><b>{data.ok===false?label+" needs attention":label+" ready"}</b><small>{data.error||data.safety||data.licensingNote||data.collectedAt||data.capturedAt||"Local operation complete"}</small></p></div><span>{data.durationMs||0} ms</span></header>{findings.length>0&&<div className="finding-list">{findings.slice(0,24).map((item:any,index:number)=><article key={index}><em className={String(item.severity||"info").toLowerCase()}>{item.severity||"INFO"}</em><div><b>{item.title||item.finding||item.label||"Finding"}</b><span>{item.evidence||item.detail||item.summary||""}</span><small>{item.recommendation||item.guidance||""}</small></div></article>)}</div>}{results.length>0&&<div className="check-grid">{results.slice(0,60).map((item:any,index:number)=><article key={item.id||item.check||index} className={item.ok?"ok":item.skipped?"skip":"fail"}><header><b>{item.label||item.id||item.check||"Check"}</b><em>{item.ok?"PASS":item.skipped?"SKIP":"CHECK"}</em></header><span>{item.guidance||item.error||item.source||((item.rowCount||0)+" evidence rows")}</span><small>{item.durationMs||0} ms</small></article>)}</div>}{(data.stdout||data.stderr||data.planText)&&<pre className="command-output">{[data.planText,data.stdout,data.stderr].filter(Boolean).join("\n\n")}</pre>}<details className="raw-evidence"><summary>Raw {label.toLowerCase()}</summary><pre>{asText(data)}</pre></details></div>
}

function PerformanceEvidence({data,engine}:{data:AnyResult;engine:string}){
  if(!data)return null;
  const analysis=(data.analysis||data.deepDive?.analysis||{}) as any;
  const findings=(data.findings||analysis.findings||data.recommendations?.findings||[]) as any[];
  const checks=(data.results||data.checks||[]) as any[];
  const pressure=(analysis.pressureMap||data.pressureMap||[]) as any[];
  const metrics=(data.metrics||analysis.metrics||{}) as Record<string,unknown>;
  const critical=findings.filter(item=>String(item.severity).toUpperCase()==="CRITICAL").length;
  const high=findings.filter(item=>String(item.severity).toUpperCase()==="HIGH").length;
  const medium=findings.filter(item=>String(item.severity).toUpperCase()==="MEDIUM").length;
  const failed=checks.filter(item=>item.ok===false&&!item.skipped).length;
  const pressureScore=Number(analysis.pressureScore??data.pressureScore??Math.min(100,critical*28+high*16+medium*7+failed*2));
  const health=Math.max(0,Math.min(100,100-pressureScore));
  const reference=performanceReferences[engine];
  return <div className="performance-evidence">
    <section className="performance-cockpit"><article className="health-dial" style={{"--health":health} as React.CSSProperties}><div><b>{health}</b><small>HEALTH INDEX</small></div></article><article><small>CRITICAL / HIGH</small><b>{critical} / {high}</b><span>{analysis.primary||data.primary||"Ranked evidence"}</span></article><article><small>EVIDENCE COVERAGE</small><b>{checks.length?checks.filter(item=>item.ok||item.skipped).length+" / "+checks.length:Object.keys(metrics).length+" metrics"}</b><span>{data.suiteSteps?.length?data.suiteSteps.filter((item:any)=>item.ok).length+" suite stages completed":"Read-only snapshot"}</span></article><article><small>DOMINANT MODE</small><b>{analysis.dominantMode||data.dominantMode||engine.toUpperCase()}</b><span>{analysis.primaryEvidence||"Verify against the active incident window"}</span></article></section>
    {pressure.length>0&&<section className="pressure-map"><header><div><b>Resource pressure map</b><small>Relative evidence severity, not automatic root-cause proof</small></div><span>{pressureScore}% pressure</span></header><div>{pressure.slice(0,12).map((item:any)=><article key={item.area}><label><b>{item.area}</b><small>{item.count||0} signals</small></label><div><i style={{width:Math.max(2,Number(item.score||0))+"%"}}/></div><em className={String(item.severity||"clear").toLowerCase()}>{item.severity||"CLEAR"}</em></article>)}</div></section>}
    {Object.keys(metrics).length>0&&<section className="metric-cards performance-metrics">{Object.entries(metrics).slice(0,12).map(([key,value])=><article key={key}><small>{key.replaceAll("_"," ")}</small><b>{typeof value==="number"?Number(value).toLocaleString():String(value)}</b></article>)}</section>}
    {findings.length>0&&<section className="advanced-findings"><header><div><b>Ranked findings</b><small>Cause, evidence, impact, verification and safe next action</small></div><span>{findings.length} findings</span></header>{findings.slice(0,30).map((item:any,index:number)=><article key={item.id||index} className={String(item.severity||"info").toLowerCase()}><aside><em>{item.severity||"INFO"}</em><small>{item.area||"SQL"}</small></aside><div><h3>{item.title||item.finding||item.label||"Finding"}</h3>{item.cause&&<p><b>Likely cause</b>{item.cause}</p>}<p><b>Evidence</b>{item.evidence||item.detail||item.summary||"See raw evidence."}</p>{item.impact&&<p><b>Impact</b>{item.impact}</p>}{item.verify&&<p><b>Verify</b>{item.verify}</p>}<p className="next-action"><b>Safe next action</b>{item.action||item.recommendation||item.guidance||"Validate the plan and workload window before applying a change."}</p>{item.doc&&<a href={item.doc} target="_blank" rel="noreferrer">Official engine guidance ↗</a>}</div></article>)}</section>}
    {checks.length>0&&<section className="suite-checks"><header><div><b>Evidence checks</b><small>Each query is fixed, read-only, timed and independently reported</small></div><span>{checks.filter(item=>item.ok).length} passed · {failed} need review</span></header><div className="check-grid">{checks.slice(0,80).map((item:any,index:number)=><article key={item.id||item.check||index} className={item.ok?"ok":item.skipped?"skip":"fail"}><header><b>{item.label||item.id||item.check||"Check"}</b><em>{item.ok?"PASS":item.skipped?"SKIP":"CHECK"}</em></header><span>{item.guidance||item.error||item.source||((item.rowCount||0)+" evidence rows")}</span><small>{item.phase||item.group||"Evidence"} · {item.durationMs||0} ms</small></article>)}</div></section>}
    {reference&&<section className="methodology-card"><div><span>METHOD</span><p><b>{reference.label}</b><small>{reference.method}</small></p></div><a href={reference.url} target="_blank" rel="noreferrer">Open official documentation ↗</a></section>}
    <details className="raw-evidence"><summary>Complete diagnostic evidence and suite stages</summary><pre>{JSON.stringify(data,null,2)}</pre></details>
  </div>
}
function IncidentDiagnosticEvidence({data,engine}:{data:AnyResult;engine:string}){
  if(!data)return null;
  const incident=data.incident||{};
  const playbook=data.playbook||{};
  const phases=(incident.phases||[]) as any[];
  const gaps=(incident.evidenceGaps||[]) as any[];
  const actions=(incident.actionPlan||[]) as any[];
  return <div className="incident-diagnostic-evidence">
    <section className="incident-verdict">
      <div className={"incident-priority "+String(incident.priority||"monitor").toLowerCase()}><small>INCIDENT PRIORITY</small><b>{incident.priority||"MONITOR"}</b><span>{incident.highestSeverity||"INFO"} evidence</span></div>
      <div><span>{playbook.mark||"DX"}</span><p><b>{playbook.label||"Advanced diagnostic"}</b><small>{incident.summary||playbook.description}</small></p></div>
      <div className="incident-score"><b>{incident.coverage||0}%</b><small>EVIDENCE COVERAGE</small><span>{incident.completed||0} completed / {incident.total||0} selected</span></div>
      {data.officialReference&&<a href={data.officialReference} target="_blank" rel="noreferrer">Official diagnostic method ↗</a>}
    </section>
    {phases.length>0&&<section className="incident-phases"><header><b>Evidence path</b><small>Each phase continues independently when an optional view or permission is unavailable.</small></header><div>{phases.map((phase:any,index:number)=><article key={phase.phase}><span>{String(index+1).padStart(2,"0")}</span><p><b>{phase.phase}</b><small>{phase.completed} of {phase.total} checks completed</small></p><i className={phase.completed===phase.total?"complete":phase.completed?"partial":"missing"}/></article>)}</div></section>}
    <section className="incident-triage-grid">
      <article className="incident-actions"><header><div><b>Prioritized DBA action plan</b><small>Verification first; no change is executed by diagnostics.</small></div><span>{actions.length} STEPS</span></header>{actions.map((action:any)=><section key={action.order}><em className={String(action.severity||"info").toLowerCase()}>{action.order}</em><div><b>{action.title}</b><p><strong>Verify</strong>{action.verify}</p><p><strong>Safe next action</strong>{action.action}</p></div></section>)}</article>
      <article className="incident-gaps"><header><div><b>Evidence gaps</b><small>Unavailable is never interpreted as healthy.</small></div><span>{gaps.length}</span></header>{gaps.length?gaps.map((gap:any)=><section key={gap.id}><em className={gap.status==="FAILED"?"failed":"unavailable"}>{gap.status}</em><div><b>{gap.label}</b><small>{gap.reason}</small></div></section>):<div className="incident-no-gaps"><span>OK</span><b>All selected checks completed</b><small>Correlate with host, application and platform evidence for the same incident window.</small></div>}</article>
    </section>
    <PerformanceEvidence data={data} engine={engine}/>
  </div>
}
function MigrationComparisonEvidence({data,showMatches,onShowMatches,onExportJson,onExportCsv,onCopyVerification}:{data:AnyResult;showMatches:boolean;onShowMatches:(value:boolean)=>void;onExportJson:()=>void;onExportCsv:()=>void;onCopyVerification:()=>void}){
  if(!data)return null;
  const summary=data.summary||{};
  const objects=(data.objectDiffs||[]) as any[];
  const visibleObjects=objects.filter(item=>showMatches||!["matched","matched-unverified-rows"].includes(item.status));
  const redline=((data.redline||[]) as any[]).filter(item=>showMatches||item.type!=="same");
  return <div className="migration-comparison-evidence">
    <header className="migration-report-head"><div><span className={summary.verdict==="MATCHED"?"matched":summary.verdict==="VERIFY"?"verify":"attention"}>{summary.score??0}</span><p><b>{summary.verdict||"VERIFY"} · {data.format?.label||data.engine}</b><small>{summary.targetErrors||0} import errors · {summary.missingObjects||0} missing · {summary.rowMismatches||0} row mismatches · {summary.unverified||0} unverified</small></p></div><div><button className="secondary" onClick={onCopyVerification}>Copy verification SQL</button><button className="secondary" onClick={onExportCsv}>Export object CSV</button><button className="secondary" onClick={onExportJson}>Export full report</button></div></header>
    <section className="migration-kpis">{[
      ["MATCHED OBJECTS",summary.matchedObjects||0,"DDL or named data evidence"],
      ["MISSING",summary.missingObjects||0,"Present in export, absent from import evidence"],
      ["ROW DIFFERENCES",summary.rowMismatches||0,"Exact counts differ where both logs expose them"],
      ["IMPORT ERRORS",summary.targetErrors||0,"Parsed target-side errors"],
      ["UNVERIFIED",summary.unverified||0,"Requires generated database verification"],
      ["REDLINE CHANGES",summary.changedLines||0,"After timestamp normalization"],
    ].map(([label,value,note])=><article key={String(label)} className={Number(value)>0&&["MISSING","ROW DIFFERENCES","IMPORT ERRORS"].includes(String(label))?"bad":Number(value)>0&&label==="UNVERIFIED"?"warn":""}><small>{label}</small><b>{String(value)}</b><span>{note}</span></article>)}</section>
    <section className="migration-coverage"><article><span>EXPORT</span><p><b>{data.source?.lineCount||0} lines · {data.source?.objectCount||0} objects</b><small>Named tables {data.source?.evidence?.namedTables?"YES":"NO"} · DDL {data.source?.evidence?.namedDdl?"YES":"NO"} · exact rows {data.source?.evidence?.rowCounts?"YES":"NO"}</small></p><em className={data.source?.completed?"ok":"check"}>{data.source?.completed?"COMPLETED":"NO FINAL MARKER"}</em></article><i/><article><span>IMPORT</span><p><b>{data.target?.lineCount||0} lines · {data.target?.objectCount||0} objects</b><small>Named tables {data.target?.evidence?.namedTables?"YES":"NO"} · DDL {data.target?.evidence?.namedDdl?"YES":"NO"} · exact rows {data.target?.evidence?.rowCounts?"YES":"NO"}</small></p><em className={data.target?.completed?"ok":"check"}>{data.target?.completed?"COMPLETED":"VERIFY COMPLETION"}</em></article></section>
    <section className="migration-findings"><header><div><b>DBA findings</b><small>Ranked from import errors through missing DDL and row parity</small></div><span>{data.findings?.length||0} findings</span></header>{(data.findings||[]).map((item:any,index:number)=><article key={index} className={String(item.severity||"info").toLowerCase()}><em>{item.severity}</em><div><b>{item.title}</b><p>{item.evidence}</p><small>{item.recommendation}</small></div></article>)}</section>
    <section className="migration-object-section"><header><div><b>DDL and data object reconciliation</b><small>Red rows need attention; gray rows need database verification because the utility log is silent.</small></div><label><input type="checkbox" checked={showMatches} onChange={event=>onShowMatches(event.target.checked)}/> Show matched evidence</label></header><div className="migration-object-table" role="table"><div className="head" role="row"><span>STATUS</span><span>TYPE</span><span>OBJECT</span><span>EXPORT ROWS</span><span>IMPORT ROWS</span><span>DELTA</span></div>{visibleObjects.length?visibleObjects.slice(0,1000).map((item:any)=><div key={item.key} className={item.status} role="row"><em>{item.status.replaceAll("-"," ")}</em><span>{item.type}</span><b title={item.name}>{item.name}</b><code>{item.sourceRows==null?"—":Number(item.sourceRows).toLocaleString()}</code><code>{item.targetRows==null?"—":Number(item.targetRows).toLocaleString()}</code><code>{item.rowDelta==null?"—":Number(item.rowDelta).toLocaleString()}</code></div>):<p>No attention items. Enable matched evidence to review the complete inventory.</p>}</div></section>
    {(data.errors?.length||data.warnings?.length)>0&&<section className="migration-errors"><header><b>Errors and warnings</b><span>{(data.errors?.length||0)+(data.warnings?.length||0)} messages</span></header>{[...(data.errors||[]),...(data.warnings||[])].slice(0,250).map((item:any,index:number)=><article key={index} className={item.severity}><em>{item.side} · line {item.lineNumber}</em><b>{item.code}</b><span>{item.message}</span></article>)}</section>}
    <section className="migration-redline"><header><div><b>Export ↔ import log redline</b><small>Timestamps and durations are normalized when requested. Removed and changed evidence is highlighted red.</small></div><label><input type="checkbox" checked={showMatches} onChange={event=>onShowMatches(event.target.checked)}/> Include unchanged lines</label></header><div className="redline-columns"><b>EXPORT / SOURCE LOG</b><b>IMPORT / TARGET LOG</b></div><div className="redline-body">{redline.length?redline.map((row:any,index:number)=><div key={index} className={"redline-row "+row.type}><span className="line-no">{row.sourceNumber??""}</span><code>{row.sourceLine||" "}</code><span className="line-no">{row.targetNumber??""}</span><code>{row.targetLine||" "}</code></div>):<p>No line differences remain after normalization.</p>}</div>{data.redlineTruncated&&<small className="redline-limit">Large-log redline was bounded for browser performance; all object and error parsing still used the complete pasted logs.</small>}</section>
    <section className="migration-verification"><header><div><b>Generated destination verification</b><small>Read-only templates for the objects whose DDL or row parity the logs cannot prove.</small></div><button className="secondary" onClick={onCopyVerification}>Copy SQL / script</button></header><pre>{data.verificationScript}</pre></section>
    <section className="methodology-card migration-method"><div><span>METHOD</span><p><b>{data.reference?.label||"Official database utility guidance"}</b><small>{(data.limitations||[]).join(" ")}</small></p></div>{data.reference?.url&&<a href={data.reference.url} target="_blank" rel="noreferrer">Open official documentation →</a>}</section>
    <details className="raw-evidence"><summary>Complete migration comparison JSON</summary><pre>{JSON.stringify(data,null,2)}</pre></details>
  </div>
}
function mongoExplainNodes(root:any){
  const rows:{stage:string;depth:number;details:string}[]=[];
  const visit=(node:any,depth=0)=>{
    if(!node||typeof node!=="object"||depth>12)return;
    const stage=node.stage||node.nodeType||node.queryPlan?.stage;
    if(stage)rows.push({stage:String(stage),depth,details:[node.indexName&&`index ${node.indexName}`,node.nReturned!=null&&`${node.nReturned} returned`,node.docsExamined!=null&&`${node.docsExamined} docs`,node.keysExamined!=null&&`${node.keysExamined} keys`,node.executionTimeMillisEstimate!=null&&`${node.executionTimeMillisEstimate} ms`].filter(Boolean).join(" · ")});
    [node.inputStage,node.outerStage,node.innerStage,node.thenStage,node.elseStage,node.queryPlan].forEach(child=>visit(child,depth+1));
    [node.inputStages,node.children,node.shards].forEach(children=>Array.isArray(children)&&children.forEach(child=>visit(child,depth+1)));
  };
  visit(root);return rows;
}

function EnginePackMatrix({engine}:{engine:string}){
  const active=enginePackDefinitions[engine];
  return <section className="engine-pack-workspace">
    <header><div><span>DBX</span><p><b>Database intelligence packs</b><small>One workflow, engine-native evidence and safety boundaries</small></p></div><em>{Object.keys(enginePackDefinitions).length} ENGINES</em></header>
    <div className="engine-pack-grid">{Object.entries(enginePackDefinitions).map(([id,pack])=><article key={id} className={engine===id?"active":""}>
      <header><i>{pack.mark}</i><p><b>{adapterDefaults[id].name}</b><small>{pack.checks} read-only checks</small></p>{engine===id&&<em>SELECTED</em>}</header>
      <div>{pack.capabilities.map(item=><span key={item}>{item}</span>)}</div>
      <footer><b>Focus: {pack.focus}</b><small>{pack.boundary}</small></footer>
    </article>)}</div>
    <aside><span>{active?.mark||"—"}</span><p><b>{active?`${adapterDefaults[engine].name} pack follows the active connection`:`${adapterDefaults[engine]?.name||engine} has SQL workspace support but no full incident pack yet`}</b><small>{active?`${active.checks} checks continue independently when optional views or permissions are unavailable.`:"Choose Oracle, PostgreSQL, MongoDB, MySQL, MariaDB, or SQL Server for full engine intelligence."}</small></p></aside>
  </section>;
}function MongoStudioEvidence({mode,data,onSelectCollection}:{mode:MongoMode;data:AnyResult;onSelectCollection:(name:string)=>void}){
  const reference=mongoWorkspaceReferences[mode];
  if(data?.ok===false)return <div className="mongo-empty error"><span>!</span><b>MongoDB operation needs attention</b><small>{data.error||data.stderr||"The requested MongoDB operation did not complete."}</small></div>;
  if(!data)return <div className="mongo-empty"><span>MDB</span><b>{mode==="sync"?"MongoDB migration control is ready":"MongoDB Studio is ready"}</b><small>{reference.method} Connect with the bundled driver, choose a collection when required, then run the read-only analysis.</small><a href={reference.url} target="_blank" rel="noreferrer">Open official MongoDB guidance ↗</a></div>;
  const documents=(data.documents||[]) as any[];
  const explainRows=mongoExplainNodes(data.explain?.executionStats?.executionStages||data.explain?.queryPlanner?.winningPlan);
  const syncProgress=data.progress||data.before||{};
  if(data.mode==="mirror")return <div className="mongo-evidence"><section className="mongo-metric-grid">{Object.entries(data.summary||{}).map(([key,value])=><article key={key}><small>{key.replaceAll("_"," ")}</small><b>{String(value)}</b></article>)}</section><section className="mongo-list"><header><div><b>Mirror verification manifest</b><small>{data.source?.host}/{data.source?.database} → {data.destination?.host}/{data.destination?.database}</small></div><em>{data.comparedAt}</em></header>{(data.collections||[]).map((item:any)=><article key={item.collection} className={item.status}><i>{item.status==="matched"?"✓":"!"}</i><div><b>{item.collection}</b><span>source {item.source?.count??"—"} docs / {item.source?.indexes??"—"} indexes · destination {item.destination?.count??"—"} docs / {item.destination?.indexes??"—"} indexes</span></div><em>{item.status}</em></article>)}</section><p className="mongo-note">{data.note}</p></div>;
  if(mode==="sync")return <div className="mongo-evidence"><section className="mongo-sync-status"><article><small>CURRENT STATE</small><b>{syncProgress.state||data.response?.state||"REQUEST ACCEPTED"}</b><span>{data.endpoint}</span></article><article><small>CAN COMMIT</small><b>{syncProgress.canCommit===true?"YES":syncProgress.canCommit===false?"NO":"—"}</b><span>Verifier and lag gate</span></article><article><small>LAG</small><b>{syncProgress.lagTimeSeconds??syncProgress.lag?.lagTimeSeconds??"—"}</b><span>seconds</span></article><article><small>COLLECTION COPY</small><b>{syncProgress.collectionCopy?.estimatedCopiedBytes!=null?Math.round(syncProgress.collectionCopy.estimatedCopiedBytes/Math.max(1,syncProgress.collectionCopy.estimatedTotalBytes)*100)+"%":"—"}</b><span>{syncProgress.collectionCopy?.estimatedCopiedBytes?.toLocaleString?.()||"No progress sample"}</span></article></section>{(data.note||data.errorDescription)&&<p className="mongo-note">{data.note||data.errorDescription}</p>}<details className="raw-evidence" open><summary>mongosync lifecycle evidence</summary><pre>{JSON.stringify(data,null,2)}</pre></details></div>;
  return <div className="mongo-evidence">
    {(data.metrics||data.summary||data.collectionMetrics)&&<section className="mongo-metric-grid">{Object.entries({...data.metrics,...data.summary,...data.collectionMetrics}).filter(([,value])=>value==null||["string","number","boolean"].includes(typeof value)).slice(0,12).map(([key,value])=><article key={key}><small>{key.replace(/([A-Z])/g," $1").replaceAll("_"," ")}</small><b>{value==null?"—":typeof value==="number"?Number(value).toLocaleString():String(value)}</b></article>)}</section>}
    {mode==="explorer"&&<section className="mongo-collection-grid">{(data.collections||[]).map((item:any)=><button key={item.collection} onDoubleClick={()=>onSelectCollection(item.collection)}><header><i>COL</i><span><b>{item.collection}</b><small>{item.ok===false?item.error:"Double-click to browse documents"}</small></span></header><div><span><b>{item.count??"—"}</b><small>documents</small></span><span><b>{item.indexes??"—"}</b><small>indexes</small></span><span><b>{item.storageMB==null?"—":Number(item.storageMB).toFixed(1)}</b><small>storage MB</small></span></div></button>)}</section>}
    {["documents","aggregations"].includes(mode)&&<section className="mongo-documents"><header><b>{documents.length} BSON documents</b><span>{data.collection}</span></header>{documents.map((document:any,index:number)=><details key={index} open={index<3}><summary><i>{String(index+1).padStart(2,"0")}</i><b>{document?._id!=null?String(document._id):`Document ${index+1}`}</b><span>{Object.keys(document||{}).length} fields</span></summary><pre>{JSON.stringify(document,null,2)}</pre></details>)}</section>}
    {mode==="schema"&&<section className="mongo-schema-grid">{(data.fields||[]).map((field:any)=><article key={field.path}><header><b>{field.path}</b><em>{field.presencePercent}% present</em></header><div>{Object.entries(field.types||{}).map(([type,detail]:[string,any])=><span key={type}><i style={{width:detail.percent+"%"}}/><b>{type}</b><small>{detail.percent}%</small></span>)}</div><footer><span>{field.cardinalityInSample} sample values</span>{field.minimum!=null&&<span>{field.minimum} → {field.maximum}</span>}</footer></article>)}</section>}
    {mode==="indexes"&&<section className="mongo-list"><header><div><b>Index inventory</b><small>Read-only metadata for {data.collection}</small></div><em>{(data.indexes||[]).length} indexes</em></header>{(data.indexes||[]).map((item:any)=><article key={item.name}><i>IDX</i><div><b>{item.name}</b><span>{JSON.stringify(item.key)}</span><small>{[item.unique&&"unique",item.sparse&&"sparse",item.hidden&&"hidden",item.expireAfterSeconds!=null&&`TTL ${item.expireAfterSeconds}s`,item.partialFilterExpression&&"partial"].filter(Boolean).join(" · ")||"standard index"}</small></div></article>)}</section>}
    {mode==="validation"&&<section className="mongo-validation"><article><small>VALIDATION LEVEL</small><b>{data.validation?.validationLevel}</b></article><article><small>VALIDATION ACTION</small><b>{data.validation?.validationAction}</b></article><article><small>COLLECTION TYPE</small><b>{data.validation?.type}</b></article><pre>{JSON.stringify(data.validation?.validator||{},null,2)}</pre></section>}
    {mode==="explain"&&<><section className="mongo-plan-tree">{explainRows.map((row,index)=><article key={index} style={{marginLeft:row.depth*24}}><i>{index===0?"ROOT":"↓"}</i><div><b>{row.stage}</b><small>{row.details||"Execution stage"}</small></div></article>)}</section><details className="raw-evidence"><summary>Raw explain output</summary><pre>{JSON.stringify(data.explain,null,2)}</pre></details></>}
    {mode==="performance"&&<><section className="mongo-list"><header><div><b>Active operations</b><small>Bounded currentOp snapshot</small></div><em>{(data.currentOperations||[]).length}</em></header>{(data.currentOperations||[]).map((item:any,index:number)=><article key={item.opid||index} className={item.waitingForLock?"drift":"matched"}><i>{item.operation?.slice(0,3)?.toUpperCase()||"OP"}</i><div><b>{item.namespace||item.description||"active operation"}</b><span>{item.plan||"No plan summary"} · {item.seconds||0}s · {item.client||"internal"}</span></div><em>{item.waitingForLock?"WAITING":"ACTIVE"}</em></article>)}</section>{data.replication&&<section className="mongo-replica"><header><b>Replica set {data.replication.set}</b><span>state {data.replication.myState}</span></header>{(data.replication.members||[]).map((member:any)=><article key={member.name}><i className={member.health===1?"good":"bad"}/><b>{member.name}</b><span>{member.state}</span><em>{member.pingMs??"—"} ms</em></article>)}</section>}</>}
    <section className="methodology-card mongo-methodology"><div><span>MDB</span><p><b>{reference.label}</b><small>{reference.method}</small></p></div><a href={reference.url} target="_blank" rel="noreferrer">Official documentation ↗</a></section>
  </div>;
}
function DevopsVisualWorkspace({kind,activeView,data,search,available}:{kind:"kubernetes"|"docker"|"github"|"git"|"ansible";activeView:string;data:AnyResult;search:string;available:boolean}){
  const definitions={
    kubernetes:{mark:"K8S",title:"Kubernetes Operations",subtitle:"Lens-style cluster explorer",noun:"resources"},
    docker:{mark:"CTR",title:"Docker Operations",subtitle:"Container and image explorer",noun:"objects"},
    github:{mark:"GH",title:"GitHub Workspace",subtitle:"Repositories, PRs and workflow health",noun:"records"},
    git:{mark:"GIT",title:"Local Git Workspace",subtitle:"Commit graph and working-tree evidence",noun:"records"},
    ansible:{mark:"ANS",title:"Ansible Automation",subtitle:"AWX-style inventory and configuration explorer",noun:"records"},
  } as const;
  const definition=definitions[kind];
  const reference=devopsWorkspaceReferences[kind];
  const allSections=(Object.entries(data?.sections||{}) as [string,any][]).map(([id,section])=>{
    const text=[section.stdout,section.stderr,section.error].filter(Boolean).join("\n");
    return {id,section,text,lines:text.split(/\r?\n/).filter((line:string)=>line.trim())};
  });
  const activeIds=opsWorkspaceViews[kind]?.[activeView]||opsWorkspaceViews[kind]?.overview||[];
  const query=search.trim().toLowerCase();
  const selected=allSections.filter(item=>activeIds.includes(item.id)).map(item=>{
    const matching=query&&!item.id.toLowerCase().includes(query)?item.lines.filter((line:string)=>line.toLowerCase().includes(query)):item.lines;
    return {...item,displayLines:matching.slice(0,80)};
  }).filter(item=>!query||item.id.toLowerCase().includes(query)||item.displayLines.length);
  const rowCount=allSections.reduce((total,item)=>total+Math.max(0,item.lines.length-1),0);
  const healthy=allSections.filter(item=>item.section.code===0||item.section.ok!==false&&!item.section.error).length;
  const warningCount=allSections.reduce((total,item)=>total+item.lines.filter((line:string)=>/(error|failed|crashloop|notready|oom|unhealthy|warning)/i.test(line)).length,0);
  return <div className={`ops-visual-workspace ops-${kind}`}>
    <aside className="ops-resource-rail"><header><span>{definition.mark}</span><p><b>{definition.title}</b><small>{definition.subtitle}</small></p></header><nav>{Object.keys(opsWorkspaceViews[kind]||{}).map(view=><div key={view} className={activeView===view?"active":""}><i>{view.slice(0,2).toUpperCase()}</i><span>{view.replace(/([A-Z])/g," $1")}</span><em>{(opsWorkspaceViews[kind]?.[view]||[]).length}</em></div>)}</nav><footer><i className={available?"online":"offline"}/><span><b>{available?"CLI connected":"CLI not detected"}</b><small>{available?"Read-only inspections enabled":"Install the CLI or use offline guidance"}</small></span></footer></aside>
    <section className="ops-resource-canvas">
      <header className="ops-canvas-head"><div><span>VISUAL OPERATIONS</span><h2>{definition.title}</h2><p>{definition.subtitle} · allowlisted commands only</p></div><em className={data?.ok===false?"attention":data?"live":"idle"}>{data?.ok===false?"ATTENTION":data?"EVIDENCE READY":"AWAITING REFRESH"}</em></header>
      <div className="ops-kpi-grid"><article><small>RESOURCE SETS</small><b>{allSections.length||"—"}</b><span>{activeView} view</span></article><article><small>{definition.noun.toUpperCase()}</small><b>{data?rowCount:"—"}</b><span>searchable evidence rows</span></article><article><small>READY SOURCES</small><b>{data?healthy+" / "+allSections.length:"—"}</b><span>successful inspections</span></article><article><small>WARNING SIGNALS</small><b className={warningCount?"warn":""}>{data?warningCount:"—"}</b><span>verify before action</span></article></div>
      {!data&&<div className="ops-visual-empty"><div><span>01</span><b>Select the resource view</b><small>Use the view bar above to focus the evidence set.</small></div><i/><div><span>02</span><b>Set the approved context</b><small>Context, repository, or working folder remains local.</small></div><i/><div><span>03</span><b>Refresh visual evidence</b><small>The agent runs fixed read-only commands and structures the output.</small></div></div>}
      {data&&selected.length===0&&<div className="module-empty"><span>0</span><b>No matching resource evidence</b><small>Clear the search or refresh this workspace after the required CLI is available.</small></div>}
      {selected.length>0&&<div className="ops-section-list">{selected.map(({id,section,displayLines})=><article key={id} className={section.code===0||section.ok!==false&&!section.error?"ready":"attention"}><header><div><i/>
        <p><b>{id.replace(/([A-Z])/g," $1").replaceAll("_"," ")}</b><small>{section.displayCommand||"Approved local inspection"}</small></p></div><em>{section.code===0||section.ok!==false&&!section.error?"READY":"CHECK"}</em></header>
        <div className={kind==="git"&&id==="commits"?"ops-commit-graph":kind==="ansible"&&id==="graph"?"ops-inventory-tree":"ops-resource-table"}>{displayLines.length?displayLines.map((line:string,index:number)=><div key={index}><i>{kind==="git"&&id==="commits"?"●":String(index+1).padStart(2,"0")}</i><code>{line}</code></div>):<p>No output returned for this resource set.</p>}</div>
      </article>)}</div>}
      <section className="methodology-card ops-methodology"><div><span>WEB</span><p><b>{reference.label}</b><small>{reference.method} Offline mode keeps navigation and guidance available; live evidence needs the local CLI and target access.</small></p></div><a href={reference.url} target="_blank" rel="noreferrer">Open official reference ↗</a></section>
      {data&&<details className="raw-evidence"><summary>Raw visual workspace evidence</summary><pre>{JSON.stringify(data,null,2)}</pre></details>}
    </section>
  </div>;
}
export default function Home(){
  const [view,setView]=useState<View>("studio");
  const [environment,setEnvironment]=useState<Environment>("Production");
  const [agentToken,setAgentToken]=useState("");
  const [agentState,setAgentState]=useState<"pairing"|"online"|"offline">("pairing");
  const [agentVersion,setAgentVersion]=useState("");
  const [adapters,setAdapters]=useState<Record<string,Adapter>>({});
  const [form,setForm]=useState<DbForm>(defaultForm());
  const [profiles,setProfiles]=useState<Profile[]>([]);
  const [profileId,setProfileId]=useState("");
  const [profileName,setProfileName]=useState("");
  const [connectionState,setConnectionState]=useState<"idle"|"connecting"|"connected"|"failed">("idle");
  const [connectionPanelOpen,setConnectionPanelOpen]=useState(false);
  const [connectionMessage,setConnectionMessage]=useState("Enter an approved target and validate access.");
  const [connectionFingerprint,setConnectionFingerprint]=useState("");
  const [catalog,setCatalog]=useState<CatalogObject[]>([]);
  const [catalogFilter,setCatalogFilter]=useState("");
  const [catalogLoading,setCatalogLoading]=useState(false);
  const [sql,setSql]=useState(sqlSamples.postgres);
  const [sqlTabs,setSqlTabs]=useState<SqlWorksheet[]>([{id:"tab-studio-main",name:"query_01.sql",engine:"postgres",content:sqlSamples.postgres,dirty:false,cursor:0}]);
  const [activeSqlTabId,setActiveSqlTabId]=useState("tab-studio-main");
  const [sqlInspector,setSqlInspector]=useState<SqlInspectorMode>("history");
  const [sqlInspectorOpen,setSqlInspectorOpen]=useState(true);
  const [queryHistory,setQueryHistory]=useState<SqlHistoryEntry[]>([]);
  const [savedSqlScripts,setSavedSqlScripts]=useState<SavedSqlScript[]>([]);
  const [resultFilter,setResultFilter]=useState("");
  const [queryRunning,setQueryRunning]=useState(false);
  const [allowWrites,setAllowWrites]=useState(false);
  const [result,setResult]=useState<GridResult|null>(null);
  const [resultTab,setResultTab]=useState<"results"|"messages"|"statistics">("results");
  const [toast,setToast]=useState("");
  const [completion,setCompletion]=useState<{items:Completion[];start:number;end:number}>({items:[],start:0,end:0});
  const [commandOpen,setCommandOpen]=useState(false);
  const [studioTool,setStudioTool]=useState<StudioTool>("sql");
  const [diagnosticMode,setDiagnosticMode]=useState<DiagnosticMode>("incident");
  const [diagnosticIdentifier,setDiagnosticIdentifier]=useState("");
  const [diagnosticData,setDiagnosticData]=useState<AnyResult>(null);
  const [diagnosticBusy,setDiagnosticBusy]=useState(false);
  const [suiteBusy,setSuiteBusy]=useState(false);
  const [suiteProgress,setSuiteProgress]=useState("Ready for a full evidence suite");
  const [diagnosticCatalog,setDiagnosticCatalog]=useState<Record<string,Record<string,{label:string;guidance:string}>>>({});
  const [diagnosticCheck,setDiagnosticCheck]=useState("");
  const [incidentCatalog,setIncidentCatalog]=useState<any>({engines:{},playbooks:[]});
  const [incidentPlaybook,setIncidentPlaybook]=useState("slow-sql");
  const [observeMode,setObserveMode]=useState<ObserveMode>("native");
  const [observePath,setObservePath]=useState("");
  const [observeHours,setObserveHours]=useState("24");
  const [remoteHost,setRemoteHost]=useState("");
  const [remoteUser,setRemoteUser]=useState("");
  const [remotePort,setRemotePort]=useState("22");
  const [remotePath,setRemotePath]=useState("/var/log/postgresql/postgresql.log");
  const [traceText,setTraceText]=useState("");
  const [traceName,setTraceName]=useState("pasted-oracle-trace.trc");
  const [migrationEngine,setMigrationEngine]=useState("auto");
  const [migrationExportLog,setMigrationExportLog]=useState("");
  const [migrationImportLog,setMigrationImportLog]=useState("");
  const [migrationIgnoreTimestamps,setMigrationIgnoreTimestamps]=useState(true);
  const [migrationShowMatches,setMigrationShowMatches]=useState(false);
  const [observeData,setObserveData]=useState<AnyResult>(null);
  const [observeBusy,setObserveBusy]=useState(false);
  const [mongoMode,setMongoMode]=useState<MongoMode>("explorer");
  const [mongoCollection,setMongoCollection]=useState("");
  const [mongoFilter,setMongoFilter]=useState("{}");
  const [mongoProjection,setMongoProjection]=useState("{}");
  const [mongoSort,setMongoSort]=useState("{}");
  const [mongoLimit,setMongoLimit]=useState("50");
  const [mongoPipeline,setMongoPipeline]=useState('[\n  { "$match": {} },\n  { "$limit": 50 }\n]');
  const [mongoSampleSize,setMongoSampleSize]=useState("200");
  const [mongoData,setMongoData]=useState<AnyResult>(null);
  const [mongoBusy,setMongoBusy]=useState(false);
  const [mongoPipelineName,setMongoPipelineName]=useState("");
  const [mongoPipelineId,setMongoPipelineId]=useState("");
  const [mongoPipelines,setMongoPipelines]=useState<{id:string;name:string;collection:string;pipeline:string;createdAt:string}[]>([]);
  const [mongosyncPort,setMongosyncPort]=useState("27182");
  const [mongosyncSource,setMongosyncSource]=useState("cluster0");
  const [mongosyncDestination,setMongosyncDestination]=useState("cluster1");
  const [mongosyncReversible,setMongosyncReversible]=useState(true);
  const [mongosyncBuildIndexes,setMongosyncBuildIndexes]=useState("");
  const [mongosyncConfirmation,setMongosyncConfirmation]=useState("");
  const [mirrorHost,setMirrorHost]=useState("");
  const [mirrorPort,setMirrorPort]=useState("27017");
  const [mirrorDatabase,setMirrorDatabase]=useState("");
  const [mirrorUsername,setMirrorUsername]=useState("");
  const [mirrorPassword,setMirrorPassword]=useState("");
  const [mirrorTlsMode,setMirrorTlsMode]=useState<DbForm["tlsMode"]>("require");
  const [devopsMode,setDevopsMode]=useState<DevopsMode>("kubernetes");
  const [kubeContext,setKubeContext]=useState("");
  const [kubeNamespace,setKubeNamespace]=useState("default");
  const [kubeView,setKubeView]=useState<KubeGuiView>("overview");
  const [dockerView,setDockerView]=useState<DockerGuiView>("overview");
  const [dockerTarget,setDockerTarget]=useState("");
  const [gitSource,setGitSource]=useState<"github"|"git">("github");
  const [gitView,setGitView]=useState<GitGuiView>("overview");
  const [gitRepository,setGitRepository]=useState("");
  const [gitCwd,setGitCwd]=useState("");
  const [ansibleView,setAnsibleView]=useState<AnsibleGuiView>("overview");
  const [ansibleCwd,setAnsibleCwd]=useState("");
  const [devopsSearch,setDevopsSearch]=useState("");
  const [devopsTool,setDevopsTool]=useState("kubernetes");
  const [devopsAction,setDevopsAction]=useState("cluster");
  const [devopsTarget,setDevopsTarget]=useState("");
  const [devopsSecondary,setDevopsSecondary]=useState("");
  const [devopsScope,setDevopsScope]=useState("");
  const [devopsCwd,setDevopsCwd]=useState("");
  const [changePlatform,setChangePlatform]=useState<"kubernetes"|"docker">("kubernetes");
  const [changeAction,setChangeAction]=useState("restartDeployment");
  const [changeTarget,setChangeTarget]=useState("");
  const [changeValue,setChangeValue]=useState("2");
  const [changeReference,setChangeReference]=useState("");
  const [devopsData,setDevopsData]=useState<AnyResult>(null);
  const [devopsBusy,setDevopsBusy]=useState(false);
  const [toolInventory,setToolInventory]=useState<Record<string,{available:boolean;version:string;command:string}>>({});
  const [intelligenceMode,setIntelligenceMode]=useState<IntelligenceMode>("overview");
  const [intelligenceIdentifier,setIntelligenceIdentifier]=useState("");
  const [packScope,setPackScope]=useState<"core"|"diagnostics"|"tuning">("core");
  const [intelligenceData,setIntelligenceData]=useState<AnyResult>(null);
  const [intelligenceBusy,setIntelligenceBusy]=useState(false);
  const [xrayCatalog,setXrayCatalog]=useState<any[]>([]);
  const [xrayCheck,setXrayCheck]=useState("");
  const [baselineName,setBaselineName]=useState("");
  const [goldenArchitecture,setGoldenArchitecture]=useState<"microservices"|"classic">("microservices");
  const [goldenAction,setGoldenAction]=useState("overview");
  const [goldenEndpoint,setGoldenEndpoint]=useState("https://ogg-server:9001");
  const [goldenCredential,setGoldenCredential]=useState("");
  const [goldenDeployment,setGoldenDeployment]=useState("");
  const [goldenHost,setGoldenHost]=useState("");
  const [goldenUser,setGoldenUser]=useState("");
  const [goldenPort,setGoldenPort]=useState("22");
  const [goldenHome,setGoldenHome]=useState("/u01/app/ogg");
  const [goldenGroup,setGoldenGroup]=useState("");
  const [telemetrySource,setTelemetrySource]=useState("snowflake");
  const [telemetryTarget,setTelemetryTarget]=useState("");
  const [tkprofSort,setTkprofSort]=useState("exeela");
  const [tkprofPrint,setTkprofPrint]=useState("100");
  const [deliveryMode,setDeliveryMode]=useState<DeliveryMode>("pipeline");
  const [deliveryRepository,setDeliveryRepository]=useState("");
  const [kafkaEndpoint,setKafkaEndpoint]=useState("");
  const [kafkaGroup,setKafkaGroup]=useState("");
  const [snapshotName,setSnapshotName]=useState("");
  const [sshHost,setSshHost]=useState("");
  const [sshPort,setSshPort]=useState("22");
  const [sshUser,setSshUser]=useState("");
  const [sshAuth,setSshAuth]=useState<"agent"|"key"|"password">("agent");
  const [sshKeyPath,setSshKeyPath]=useState("");
  const [sshPassword,setSshPassword]=useState("");
  const [sshPassphrase,setSshPassphrase]=useState("");
  const [sshSessions,setSshSessions]=useState<SshSession[]>([]);
  const [activeSsh,setActiveSsh]=useState("");
  const [sshInput,setSshInput]=useState("");
  const [sshBusy,setSshBusy]=useState(false);
  const [investigationMode,setInvestigationMode]=useState<InvestigationMode>("recorder");
  const [investigationStore,setInvestigationStore]=useState<any>({baselines:[],events:[],recordings:[],devopsSnapshots:[],runbooks:[],autofillProfiles:[],rules:[]});
  const [recordingName,setRecordingName]=useState("Performance flight recording");
  const [recordingSamples,setRecordingSamples]=useState<any[]>([]);
  const [recordingActive,setRecordingActive]=useState(false);
  const [eventType,setEventType]=useState("note");
  const [eventTitle,setEventTitle]=useState("");
  const [eventDetails,setEventDetails]=useState("");
  const [runbookName,setRunbookName]=useState("");
  const [runbookTool,setRunbookTool]=useState("kubernetes");
  const [runbookActions,setRunbookActions]=useState<string[]>(["cluster"]);
  const [investigationBusy,setInvestigationBusy]=useState(false);
  const editorRef=useRef<HTMLTextAreaElement>(null);
  const recorderTimer=useRef<number|null>(null);
  const connectionPanelTimer=useRef<number|null>(null);
  const sshStreams=useRef<Record<string,AbortController>>({});

  const notify=(message:string)=>{setToast("");window.setTimeout(()=>setToast(message),10)};
  const fingerprint=(value=form)=>JSON.stringify(value);
  const readyCount=Object.values(adapters).filter(adapter=>adapter.available).length;
  const activeAdapter=adapters[form.engine];
  const scopedProfiles=profiles.filter(profile=>profile.environment===environment&&profile.engine===form.engine);
  const filteredCatalog=useMemo(()=>catalog.filter(item=>`${item.schema} ${item.name} ${item.type}`.toLowerCase().includes(catalogFilter.toLowerCase())).slice(0,500),[catalog,catalogFilter]);
  const filteredResultRows=useMemo(()=>{if(!result?.columns.length)return[];const needle=resultFilter.trim().toLowerCase();return (needle?result.rows.filter(row=>row.some(cell=>String(cell??"").toLowerCase().includes(needle))):result.rows).slice(0,1000)},[result,resultFilter]);
  const resultStats=useMemo(()=>{if(!result?.columns.length)return{rows:0,columns:0,cells:0,nulls:0};const nulls=result.rows.reduce((total,row)=>total+row.filter(cell=>cell===null).length,0);return{rows:result.rows.length,columns:result.columns.length,cells:result.rows.length*result.columns.length,nulls}},[result]);
  const cancelConnectionPanelHide=()=>{if(connectionPanelTimer.current!==null){window.clearTimeout(connectionPanelTimer.current);connectionPanelTimer.current=null}};
  const openConnectionPanel=()=>{cancelConnectionPanelHide();setConnectionPanelOpen(true)};
  const scheduleConnectionPanelHide=()=>{cancelConnectionPanelHide();connectionPanelTimer.current=window.setTimeout(()=>setConnectionPanelOpen(false),700)};

  const agentCall=async(path:string,init:RequestInit={})=>{
    if(!agentToken)throw new Error("Local database agent is not paired");
    const response=await fetch(`${AGENT_URL}${path}`,{...init,headers:{"Content-Type":"application/json","X-DBridge-Token":agentToken}});
    const data=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
    if(!response.ok||data.ok===false)throw new Error(data.error||data.stderr||`Request failed (${response.status})`);
    return data;
  };

  useEffect(()=>{
    try{const stored=JSON.parse(localStorage.getItem("dbops.connection.profiles.v1")||"[]");if(Array.isArray(stored))setProfiles(stored)}catch{/* local preference only */}
    const pair=async()=>{
      try{
        const response=await fetch(`${AGENT_URL}/api/studio/pair`,{cache:"no-store"});
        if(!response.ok)throw new Error("Pairing rejected");
        const data=await response.json(); setAgentToken(data.token); setAgentVersion(data.agent?.version||""); setAgentState("online");
      }catch{setAgentState("offline")}
    };
    pair();
  },[]);
useEffect(()=>{if(!agentToken)return;agentCall("/api/adapters").then(data=>setAdapters(data.adapters||{})).catch(()=>setAgentState("offline"))},[agentToken]);
useEffect(()=>{if(!agentToken)return;agentCall("/api/tools/status").then(data=>setToolInventory(data.tools||{})).catch(()=>setToolInventory({}))},[agentToken]);
  useEffect(()=>{if(!agentToken)return;agentCall("/api/performance/catalog").then(data=>{setDiagnosticCatalog(data.catalog||{});setDiagnosticCheck(Object.keys(data.catalog?.[form.engine]||{})[0]||"")}).catch(()=>setDiagnosticCatalog({}))},[agentToken]);
  useEffect(()=>{if(!agentToken)return;agentCall("/api/performance/diagnostic-studio/catalog").then(data=>setIncidentCatalog(data)).catch(()=>setIncidentCatalog({engines:{},playbooks:[]}))},[agentToken]);
  useEffect(()=>{if(!agentToken)return;agentCall("/api/performance/oracle-sql-id/catalog").then(data=>{setXrayCatalog(data.catalog||[]);setXrayCheck(data.catalog?.[0]?.id||"")}).catch(()=>setXrayCatalog([]))},[agentToken]);
  useEffect(()=>{if(!agentToken)return;agentCall("/api/investigation").then(data=>setInvestigationStore(data.store||{})).catch(()=>{})},[agentToken]);
  useEffect(()=>{if(!agentToken)return;agentCall("/api/editor/session").then(data=>{const restored:SqlWorksheet[]=(data.session?.tabs||[]).map((tab:any,index:number)=>({id:String(tab.id||`tab-restored-${index}`),name:String(tab.name||`query_${index+1}.sql`),engine:String(tab.engine||form.engine),content:String(tab.content||""),dirty:false,cursor:Number(tab.cursor||0)}));if(!restored.length)return;const active=restored.find(tab=>tab.id===data.session.activeId)||restored[0];setSqlTabs(restored);setActiveSqlTabId(active.id);setSql(active.content)}).catch(()=>{})},[agentToken]);
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem("dbops.mongodb.pipelines.v1")||"[]");if(Array.isArray(saved))setMongoPipelines(saved.slice(0,30))}catch{/* local pipeline library only */}},[]);
  useEffect(()=>{try{const history=JSON.parse(localStorage.getItem("dbops.sql.history.v1")||"[]");if(Array.isArray(history))setQueryHistory(history.slice(0,25));const scripts=JSON.parse(localStorage.getItem("dbops.sql.scripts.v1")||"[]");if(Array.isArray(scripts))setSavedSqlScripts(scripts.slice(0,50))}catch{/* device-local SQL library remains empty */}},[]);
  useEffect(()=>{localStorage.setItem("dbops.sql.history.v1",JSON.stringify(queryHistory.slice(0,25)))},[queryHistory]);
  useEffect(()=>{localStorage.setItem("dbops.sql.scripts.v1",JSON.stringify(savedSqlScripts.slice(0,50)))},[savedSqlScripts]);
  useEffect(()=>()=>{if(recorderTimer.current)window.clearInterval(recorderTimer.current);if(connectionPanelTimer.current)window.clearTimeout(connectionPanelTimer.current);Object.values(sshStreams.current).forEach(controller=>controller.abort())},[]);
  useEffect(()=>{if(!toast)return;const timer=window.setTimeout(()=>setToast(""),3800);return()=>window.clearTimeout(timer)},[toast]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setCommandOpen(value=>!value)}if(event.key==="Escape")setCommandOpen(false)};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[]);

  const updateSqlText=(value:string,engine=form.engine)=>{setSql(value);setSqlTabs(items=>items.map(tab=>tab.id===activeSqlTabId?{...tab,content:value,engine,dirty:true,cursor:editorRef.current?.selectionStart||0}:tab))};
  const switchSqlTab=(id:string)=>{const tab=sqlTabs.find(item=>item.id===id);if(!tab)return;if(tab.engine!==form.engine&&adapterDefaults[tab.engine]){const defaults=adapterDefaults[tab.engine];setForm(value=>({...value,engine:tab.engine,port:defaults.port,database:defaults.database,authMode:defaults.authMode,password:""}));setConnectionState("idle");setConnectionFingerprint("");setCatalog([])}setActiveSqlTabId(id);setSql(tab.content);setCompletion({items:[],start:0,end:0});setResult(null);setResultFilter("")};
  const addSqlTab=()=>{const id=`tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;const next:SqlWorksheet={id,name:`query_${String(sqlTabs.length+1).padStart(2,"0")}.sql`,engine:form.engine,content:sqlSamples[form.engine]||"SELECT *\nFROM table_name\nLIMIT 50;",dirty:true,cursor:0};setSqlTabs(items=>[...items,next].slice(0,20));setActiveSqlTabId(id);setSql(next.content);setResult(null);setResultFilter("")};
  const closeSqlTab=(id:string)=>{if(sqlTabs.length===1)return notify("Keep at least one SQL worksheet open");const index=sqlTabs.findIndex(item=>item.id===id);const next=sqlTabs.filter(item=>item.id!==id);setSqlTabs(next);if(activeSqlTabId===id){const fallback=next[Math.max(0,index-1)]||next[0];setActiveSqlTabId(fallback.id);setSql(fallback.content)}};
  const renameSqlTab=(id:string)=>{const current=sqlTabs.find(item=>item.id===id);if(!current)return;const name=window.prompt("Worksheet name",current.name)?.trim();if(name)setSqlTabs(items=>items.map(item=>item.id===id?{...item,name:name.slice(0,100),dirty:true}:item))};
  const saveCurrentScript=()=>{const active=sqlTabs.find(item=>item.id===activeSqlTabId);const name=window.prompt("Save SQL script as",active?.name||"query.sql")?.trim();if(!name)return;const script:SavedSqlScript={id:`script-${Date.now().toString(36)}`,name:name.slice(0,100),sql,engine:form.engine,savedAt:new Date().toISOString()};setSavedSqlScripts(items=>[script,...items].slice(0,50));notify("SQL script saved in this browser")};
  const loadSqlScript=(script:SavedSqlScript)=>{updateSqlText(script.sql);setSqlInspectorOpen(false);notify(`${script.name} loaded into the active worksheet`)};
  const selectedStatement=()=>{const editor=editorRef.current;if(!editor)return sql.trim();const selected=sql.slice(editor.selectionStart,editor.selectionEnd).trim();return selected||sql.trim()};
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.altKey&&event.key.toLowerCase()==="n"){event.preventDefault();addSqlTab()}};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler)},[sqlTabs.length,form.engine]);
  const patchForm=(patch:Partial<DbForm>)=>{setForm(value=>({...value,...patch}));setConnectionState("idle");setConnectionFingerprint("")};
  const selectEnvironment=(next:Environment)=>{setEnvironment(next);patchForm({environment:next,tlsMode:next==="DEV"?"prefer":"require"});setProfileId("")};
  const selectEngine=(engine:string)=>{const defaults=adapterDefaults[engine];patchForm({engine,port:defaults.port,database:defaults.database,authMode:defaults.authMode,password:""});updateSqlText(sqlSamples[engine]||"SELECT *\nFROM table_name\nLIMIT 50;",engine);setCatalog([]);setProfileId("");setResult(null)};
  const applyDefaults=()=>{const defaults=adapterDefaults[form.engine];patchForm({port:defaults.port,database:defaults.database,authMode:defaults.authMode,tlsMode:environment==="DEV"?"prefer":"require",host:environment==="DEV"&&!form.host?"localhost":form.host==="localhost"&&environment!=="DEV"?"":form.host,password:""});notify(`${environment} ${defaults.name} defaults applied without secrets`)};
  const applyProfile=(id:string)=>{setProfileId(id);const profile=profiles.find(item=>item.id===id);if(!profile)return;const {id:ignoredId,name:ignoredName,...profileData}=profile;setForm({...profileData,password:""});setEnvironment(profile.environment);setConnectionState("idle");setCatalog([]);notify(`${profile.name} autofilled; enter the password to connect`)};
  const saveProfile=()=>{
    if(!form.host&&!(["bigquery","databricks","hana"].includes(form.engine)))return notify("Enter the database host before saving a profile");
    const name=(profileName||`${adapterDefaults[form.engine].name} · ${form.database||form.host||environment}`).trim();
    const id=profileId||`profile-${Date.now().toString(36)}`; const profile:Profile={id,name,environment:form.environment,engine:form.engine,authMode:form.authMode,tlsMode:form.tlsMode,host:form.host,port:form.port,database:form.database,username:form.username};
    const next=[profile,...profiles.filter(item=>item.id!==id)].slice(0,50);setProfiles(next);setProfileId(id);setProfileName("");localStorage.setItem("dbops.connection.profiles.v1",JSON.stringify(next));notify("Connection profile saved locally without the password");
  };
  const deleteProfile=()=>{if(!profileId)return;const next=profiles.filter(item=>item.id!==profileId);setProfiles(next);setProfileId("");localStorage.setItem("dbops.connection.profiles.v1",JSON.stringify(next));notify("Saved profile deleted")};
  const payload=()=>({environment,engine:form.engine,connection:{host:form.host.trim(),port:form.port.trim(),database:form.database.trim(),username:form.username.trim(),password:form.password,authMode:form.authMode,tlsMode:form.tlsMode}});

  const loadCatalog=async(silent=false)=>{
    setCatalogLoading(true);
    try{const data=await agentCall("/api/sql/catalog",{method:"POST",body:JSON.stringify({...payload(),timeoutMs:45000})});setCatalog(data.objects||[]);if(!silent)notify(`${(data.objects||[]).length} database objects loaded`)}
    catch(error){if(!silent)notify(error instanceof Error?error.message:"Catalog load failed")}
    finally{setCatalogLoading(false)}
  };
  const connect=async(loadObjects=true)=>{
    if(agentState!=="online"){notify("Start the local database agent before connecting");return false}
    setConnectionState("connecting");setConnectionMessage("Validating driver, network, TLS, identity, and permissions…");
    try{const data=await agentCall("/api/connections/check",{method:"POST",body:JSON.stringify({...payload(),timeoutMs:30000})});setConnectionState("connected");setConnectionFingerprint(fingerprint());setConnectionMessage(`${data.adapter?.name||adapterDefaults[form.engine].name} ready · ${data.durationMs} ms · ${data.access} access`);notify("Database connection validated");if(loadObjects)await loadCatalog(true);return true}
    catch(error){const message=error instanceof Error?error.message:"Connection failed";setConnectionState("failed");setConnectionMessage(message);notify(message);return false}
  };
  const runSql=async(mode:"selected"|"all"|"explain"="selected",overrideSql="")=>{
    let statement=(overrideSql.trim()||(mode==="all"?sql.trim():selectedStatement())).replace(/\s+$/,"");
    if(!statement)return notify("Enter a SQL statement first");
    if(mode==="explain"){
      if(!/^(select|with|values|show)\b/i.test(statement))return notify("Explain is limited to read-only SELECT, WITH, VALUES, or SHOW statements");
      const prefixes:Record<string,string>={postgres:"EXPLAIN (FORMAT TEXT) ",redshift:"EXPLAIN ",mysql:"EXPLAIN FORMAT=JSON ",mariadb:"EXPLAIN FORMAT=JSON ",snowflake:"EXPLAIN USING TEXT ",clickhouse:"EXPLAIN PLAN ",oracle:"EXPLAIN PLAN FOR ",sqlserver:"EXPLAIN "};
      statement=(prefixes[form.engine]||"EXPLAIN ")+statement.replace(/;\s*$/,"");
    }
    if(allowWrites&&!window.confirm("Write mode is unlocked. Continue only if you are authorized to modify this database."))return;
    if(connectionState!=="connected"||connectionFingerprint!==fingerprint()){const connected=await connect(false);if(!connected)return}
    setQueryRunning(true);setResult(null);setResultFilter("");setResultTab("results");const started=Date.now();
    try{const data=await agentCall("/api/sql/run",{method:"POST",body:JSON.stringify({...payload(),sql:statement,allowWrites,timeoutMs:60000})});const parsed=parseOutput(data.stdout||"",data.stderr||"",data.durationMs||0);setResult(parsed);setQueryHistory(items=>[{id:`run-${Date.now().toString(36)}`,worksheetId:activeSqlTabId,sql:statement,status:"success",durationMs:data.durationMs||Date.now()-started,rowCount:parsed.rows.length,executedAt:new Date().toISOString(),engine:form.engine,environment},...items].slice(0,25));setSqlTabs(items=>items.map(tab=>tab.id===activeSqlTabId?{...tab,dirty:false}:tab));notify(`${mode==="explain"?"Explain":"SQL"} completed in ${data.durationMs||0} ms`)}
    catch(error){const message=error instanceof Error?error.message:"SQL execution failed";const durationMs=Date.now()-started;setResult({columns:[],rows:[],raw:"",stderr:message,durationMs});setResultTab("messages");setQueryHistory(items=>[{id:`run-${Date.now().toString(36)}`,worksheetId:activeSqlTabId,sql:statement,status:"failed",durationMs,rowCount:0,executedAt:new Date().toISOString(),engine:form.engine,environment},...items].slice(0,25));notify(message)}
    finally{setQueryRunning(false)}
  };
  const formatSql=()=>{const keys=["select","from","where","join","left join","group by","order by","having","limit","with","union all"];let text=sql.trim().replace(/\s+/g," ");keys.forEach(key=>{text=text.replace(new RegExp(`\\b${key.replace(" ","\\s+")}\\b`,"gi"),match=>`\n${match.toUpperCase()}`)});updateSqlText(text.trim())};
  const updateCompletion=(value:string,cursor:number)=>{updateSqlText(value);const token=value.slice(0,cursor).match(/[A-Za-z0-9_.$]+$/)?.[0]||"";if(token.length<2)return setCompletion({items:[],start:cursor,end:cursor});const live=catalog.map(item=>({label:item.schema?`${item.schema}.${item.name}`:item.name,detail:`${item.type} · live catalog`,insert:item.schema?`${item.schema}.${item.name}`:item.name}));const base=[...sqlKeywords.map(word=>({label:word,detail:"SQL keyword",insert:`${word} `})),...live];const items=base.filter(item=>item.label.toLowerCase().includes(token.toLowerCase())).slice(0,8);setCompletion({items,start:cursor-token.length,end:cursor})};
  const acceptCompletion=(item:Completion)=>{const next=sql.slice(0,completion.start)+item.insert+sql.slice(completion.end);updateSqlText(next);setCompletion({items:[],start:0,end:0});requestAnimationFrame(()=>{const cursor=completion.start+item.insert.length;editorRef.current?.focus();editorRef.current?.setSelectionRange(cursor,cursor)})};
  const exportResult=(kind:"csv"|"json")=>{if(!result)return;const objects=result.rows.map(row=>Object.fromEntries(result.columns.map((column,index)=>[column,row[index]])));const content=kind==="csv"?[result.columns.map(csvCell).join(","),...result.rows.map(row=>row.map(csvCell).join(","))].join("\r\n"):JSON.stringify(objects.length?objects:{output:result.raw,messages:result.stderr},null,2);download(`dbops-${environment.toLowerCase()}-${form.engine}.${kind}`,content,kind==="csv"?"text/csv":"application/json")};
const copyResult=async()=>{if(!result)return;const content=result.columns.length?[result.columns.join("\t"),...result.rows.map(row=>row.join("\t"))].join("\n"):result.raw||result.stderr;try{await navigator.clipboard.writeText(content);notify("Result copied")}catch{notify("Clipboard access was blocked by the browser")}};
  const ensureDatabaseConnection=async()=>connectionState==="connected"&&connectionFingerprint===fingerprint()?true:await connect(false);
  const runIncidentDiagnostic=async()=>{
    if(!diagnosticEngines.has(form.engine))return notify("Incident diagnostics support Oracle, PostgreSQL, MongoDB, MySQL, MariaDB, and SQL Server");
    if(!await ensureDatabaseConnection())return;
    setDiagnosticBusy(true);setDiagnosticData(null);setSuiteProgress("Running targeted "+diagnosticLabels.incident.toLowerCase()+" checks…");
    try{
      const data=await agentCall("/api/performance/diagnostic-studio/analyze",{method:"POST",body:JSON.stringify({...payload(),playbook:incidentPlaybook,identifier:diagnosticIdentifier.trim(),collection:form.engine==="mongodb"?mongoCollection.trim():"",packScope,timeoutMs:60000})});
      setDiagnosticData(data);setSuiteProgress((data.playbook?.label||"Incident diagnostic")+" complete · "+(data.incident?.completed||0)+" of "+(data.incident?.total||0)+" checks");notify("Advanced incident diagnostic completed");
    }catch(error){const message=error instanceof Error?error.message:"Incident diagnostic failed";setDiagnosticData({ok:false,error:message});setSuiteProgress(message);notify(message)}
    finally{setDiagnosticBusy(false)}
  };  const runDiagnostic=async()=>{
    if(!diagnosticEngines.has(form.engine))return notify("Advanced diagnostics support Oracle, PostgreSQL, MongoDB, MySQL, MariaDB, and SQL Server");
    if(!["health","check"].includes(diagnosticMode)&&!diagnosticIdentifier.trim())return notify("Enter the statement or operation identifier");
    if(!await ensureDatabaseConnection())return;
    setDiagnosticBusy(true);setDiagnosticData(null);
    const routes:Record<string,string>={health:"/api/performance/sample",check:"/api/performance/check",statement:"/api/performance/diagnose",recommend:"/api/performance/recommend",runtime:"/api/performance/runtime-trace/capture"};
    try{
      const data=await agentCall(routes[diagnosticMode],{method:"POST",body:JSON.stringify({...payload(),identifier:diagnosticIdentifier.trim(),check:diagnosticCheck||Object.keys(diagnosticCatalog[form.engine]||{})[0],collection:form.database,timeoutMs:60000})});
      setDiagnosticData(data);notify(diagnosticLabels[diagnosticMode]+" completed");
    }catch(error){const message=error instanceof Error?error.message:"Diagnostic failed";setDiagnosticData({ok:false,error:message});notify(message)}
    finally{setDiagnosticBusy(false)}
  };
  const runPerformanceSuite=async()=>{
    if(!diagnosticEngines.has(form.engine))return notify("Full performance diagnostics support Oracle, PostgreSQL, MongoDB, MySQL, MariaDB, and SQL Server");
    if(!await ensureDatabaseConnection())return;
    setSuiteBusy(true);setDiagnosticBusy(true);setDiagnosticData(null);setSuiteProgress("Starting read-only performance suite…");
    const started=Date.now();const suiteSteps:any[]=[];const checks:any[]=[];const identifier=diagnosticIdentifier.trim();const shared={...payload(),identifier,collection:form.database,timeoutMs:60000};
    const collect=async(label:string,path:string,body:any)=>{setSuiteProgress(label);try{const data=await agentCall(path,{method:"POST",body:JSON.stringify(body)});suiteSteps.push({label,path,ok:true,data});return data}catch(error){const message=error instanceof Error?error.message:"Step failed";suiteSteps.push({label,path,ok:false,error:message});return null}};
    try{
      const health=await collect("1/6 · Capturing workload health","/api/performance/sample",shared);
      const catalogEntries=Object.entries(diagnosticCatalog[form.engine]||{});let checkIndex=0;
      for(const [check,item] of catalogEntries){checkIndex+=1;setSuiteProgress("2/6 · Tuning check "+checkIndex+" of "+catalogEntries.length+" · "+item.label);const data=await collect("Tuning · "+item.label,"/api/performance/check",{...shared,check});checks.push(data?{...data,id:check,label:item.label,guidance:item.guidance,group:"Tuning"}:{id:check,label:item.label,guidance:item.guidance,group:"Tuning",ok:false,error:suiteSteps.at(-1)?.error})}
      let deepDive:any=null;
      if(diagnosticEngines.has(form.engine)){const route=deepDiveRoutes[form.engine];deepDive=await collect("3/6 · Running engine-wide bottleneck intelligence",route,{...shared,sqlId:form.engine==="oracle"?identifier:undefined,queryId:form.engine==="postgres"?identifier:undefined,operationId:form.engine==="mongodb"?identifier:undefined,packScope});if(deepDive?.results)checks.push(...deepDive.results.map((item:any)=>({...item,group:"Deep dive"})))}
      let statement:any=null,recommendations:any=null,runtime:any=null,history:any=null,plan:any=null;
      if(identifier){statement=await collect("4/6 · Capturing statement evidence","/api/performance/diagnose",shared);recommendations=await collect("4/6 · Ranking SQL recommendations","/api/performance/recommend",shared);runtime=await collect("5/6 · Building retained runtime timeline","/api/performance/runtime-trace/capture",shared);history=await collect("6/6 · Comparing plan history","/api/performance/plan-history",shared);plan=await collect("6/6 · Capturing current plan","/api/performance/plan-capture",shared);if(runtime?.results)checks.push(...runtime.results.map((item:any)=>({...item,group:"Runtime"})))}else setSuiteProgress("No identifier supplied · statement and plan stages skipped");
      const findings=[...(deepDive?.analysis?.findings||[]),...(recommendations?.findings||[]),...(runtime?.analysis?.findings||[])];
      const analysis=deepDive?.analysis||{pressureScore:Math.min(100,findings.filter((item:any)=>["CRITICAL","HIGH","MEDIUM"].includes(String(item.severity).toUpperCase())).length*10),dominantMode:health?.metrics?.waiting_sessions>health?.metrics?.active_sessions/2?"WAITING":"WORKLOAD",primary:findings[0]?.title||findings[0]?.finding||"No dominant signal",primaryEvidence:findings[0]?.evidence||""};
      const result={ok:suiteSteps.some(item=>item.ok),suite:true,engine:form.engine,identifier,collectedAt:new Date().toISOString(),durationMs:Date.now()-started,metrics:health?.metrics||analysis.metrics||{},analysis:{...analysis,findings},findings,results:checks,suiteSteps,deepDive,statement,recommendations,runtime,planHistory:history,plan};
      setDiagnosticData(result);setSuiteProgress("Complete · "+suiteSteps.filter(item=>item.ok).length+" of "+suiteSteps.length+" stages succeeded");notify("Advanced SQL performance suite completed");
    }catch(error){const message=error instanceof Error?error.message:"Performance suite failed";setDiagnosticData({ok:false,error:message,suiteSteps,durationMs:Date.now()-started});setSuiteProgress(message);notify(message)}
    finally{setSuiteBusy(false);setDiagnosticBusy(false)}
  };
  const exportDiagnosticReport=()=>{const data=diagnosticData||intelligenceData;if(!data)return notify("Run a diagnostic before exporting a report");download("db-studio-performance-"+environment.toLowerCase()+"-"+form.engine+".json",JSON.stringify({environment,engine:form.engine,identifier:diagnosticIdentifier,exportedAt:new Date().toISOString(),evidence:data},null,2),"application/json")};
  const runObservability=async()=>{
    setObserveBusy(true);setObserveData(null);
    try{
      let data;
      if(observeMode==="compare"){
        if(!migrationExportLog.trim()||!migrationImportLog.trim())throw new Error("Paste both the export/source log and import/target log");
        data=await agentCall("/api/logs/migration-compare",{method:"POST",body:JSON.stringify({engine:migrationEngine,exportLog:migrationExportLog,importLog:migrationImportLog,ignoreTimestamps:migrationIgnoreTimestamps})});
      }else if(observeMode==="native"){
        if(!await ensureDatabaseConnection())return;
        data=await agentCall("/api/logs/native",{method:"POST",body:JSON.stringify({...payload(),windowHours:Number(observeHours)})});
      }else if(observeMode==="local"){
        if(!observePath.trim())throw new Error("Enter a local log file path");
        data=await agentCall("/api/logs/tail",{method:"POST",body:JSON.stringify({path:observePath.trim(),historyBytes:2097152})});
      }else if(observeMode==="remote"){
        data=await agentCall("/api/logs/remote-tail",{method:"POST",body:JSON.stringify({host:remoteHost.trim(),user:remoteUser.trim(),port:remotePort,path:remotePath.trim(),serverOs:"linux",lines:1000})});
      }else if(observeMode==="telemetry"){
        data=await agentCall("/api/logs/telemetry",{method:"POST",body:JSON.stringify({source:telemetrySource,target:telemetryTarget.trim()})});
      }else if(observeMode==="tkprof"){
        if(!observePath.trim())throw new Error("Enter the Oracle trace file path");
        data=await agentCall("/api/oracle/tkprof",{method:"POST",body:JSON.stringify({path:observePath.trim(),sort:tkprofSort,print:Number(tkprofPrint),includeSys:false,aggregate:true,includeWaits:true})});
      }else if(form.engine==="oracle"&&traceText.trim()){
        data=await agentCall("/api/oracle/trace/analyze",{method:"POST",body:JSON.stringify({sourceName:traceName.trim()||"pasted-oracle-trace.trc",text:traceText})});
      }else{
        if(!observePath.trim())throw new Error("Enter a trace file path or paste an Oracle trace");
        data=await agentCall("/api/traces/analyze",{method:"POST",body:JSON.stringify({path:observePath.trim()})});
      }
      setObserveData(data);notify("Evidence collected");
    }catch(error){const message=error instanceof Error?error.message:"Evidence collection failed";setObserveData({ok:false,error:message});notify(message)}
    finally{setObserveBusy(false)}
  };
  const exportMigrationComparison=()=>{if(!observeData?.summary)return notify("Compare both logs before exporting");download("migration-log-comparison-"+(observeData.engine||migrationEngine)+"-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify(observeData,null,2),"application/json")};
  const exportMigrationObjectCsv=()=>{if(!observeData?.objectDiffs)return notify("Compare both logs before exporting");const columns=["status","type","object","export_rows","import_rows","row_delta","export_evidence","import_evidence"];const rows=observeData.objectDiffs.map((item:any)=>[item.status,item.type,item.name,item.sourceRows,item.targetRows,item.rowDelta,(item.sourceEvidence||[]).join(" | "),(item.targetEvidence||[]).join(" | ")]);download("migration-object-differences-"+(observeData.engine||migrationEngine)+".csv",[columns,...rows].map(row=>row.map(csvCell).join(",")).join(String.fromCharCode(13,10)),"text/csv;charset=utf-8")};
  const copyMigrationVerification=async()=>{const script=String(observeData?.verificationScript||"");if(!script)return notify("Compare both logs before copying verification SQL");try{await navigator.clipboard.writeText(script);notify("Read-only verification SQL copied")}catch{notify("Clipboard access was blocked; use the verification panel to copy manually")}};
  const mongoActionForMode=(mode:MongoMode)=>mode==="explorer"?"overview":mode==="aggregations"?"aggregation":mode;
  const ensureMongoConnection=async()=>{
    if(form.engine!=="mongodb"){notify("MongoDB Studio requires the MongoDB adapter. Select it in Connection first.");return false}
    if(connectionState!=="connected"||connectionFingerprint!==fingerprint())return connect(false);
    return true;
  };
  const runMongoStudio=async(mode=mongoMode)=>{
    if(mode==="sync")return runMongosync("progress");
    if(!await ensureMongoConnection())return;
    const action=mongoActionForMode(mode);
    if(!["overview","performance"].includes(action)&&!mongoCollection.trim())return notify("Select a MongoDB collection");
    setMongoBusy(true);setMongoData(null);
    try{
      const data=await agentCall("/api/mongodb/studio",{method:"POST",body:JSON.stringify({...payload(),action,collection:mongoCollection.trim(),filter:mongoFilter,projection:mongoProjection,sort:mongoSort,pipeline:mongoPipeline,limit:Number(mongoLimit),sampleSize:Number(mongoSampleSize),timeoutMs:60000})});
      setMongoData(data);notify(`MongoDB ${mode} evidence ready`);
    }catch(error){const message=error instanceof Error?error.message:"MongoDB Studio operation failed";setMongoData({ok:false,error:message});notify(message)}
    finally{setMongoBusy(false)}
  };
  const selectMongoCollection=(name:string)=>{setMongoCollection(name);setMongoMode("documents");setMongoData(null)};
  const saveMongoPipeline=()=>{
    if(!mongoPipeline.trim())return notify("Enter an aggregation pipeline first");
    const id=mongoPipelineId||`mongo-pipeline-${Date.now().toString(36)}`;
    const item={id,name:(mongoPipelineName.trim()||`${mongoCollection||"collection"} pipeline`),collection:mongoCollection,pipeline:mongoPipeline,createdAt:new Date().toISOString()};
    const next=[item,...mongoPipelines.filter(entry=>entry.id!==id)].slice(0,30);setMongoPipelines(next);setMongoPipelineId(id);localStorage.setItem("dbops.mongodb.pipelines.v1",JSON.stringify(next));notify("Aggregation pipeline saved locally");
  };
  const loadMongoPipeline=(id:string)=>{setMongoPipelineId(id);const item=mongoPipelines.find(entry=>entry.id===id);if(!item)return;setMongoPipeline(item.pipeline);setMongoPipelineName(item.name);if(item.collection)setMongoCollection(item.collection)};
  const deleteMongoPipeline=()=>{if(!mongoPipelineId)return;const next=mongoPipelines.filter(item=>item.id!==mongoPipelineId);setMongoPipelines(next);setMongoPipelineId("");setMongoPipelineName("");localStorage.setItem("dbops.mongodb.pipelines.v1",JSON.stringify(next));notify("Saved pipeline deleted")};
  const runMongosync=async(action:"progress"|"start"|"pause"|"resume"|"commit"|"reverse")=>{
    if(action!=="progress"&&!window.confirm(`${action.toUpperCase()} the local mongosync migration? The agent will verify the current state first.`))return;
    setMongoBusy(true);setMongoData(null);
    try{
      const data=await agentCall("/api/mongodb/mongosync",{method:"POST",body:JSON.stringify({action,port:Number(mongosyncPort),source:mongosyncSource.trim(),destination:mongosyncDestination.trim(),reversible:mongosyncReversible,buildIndexes:mongosyncBuildIndexes,confirmation:mongosyncConfirmation.trim()})});
      setMongoData(data);if(action!=="progress")setMongosyncConfirmation("");notify(`mongosync ${action} completed`);
    }catch(error){const message=error instanceof Error?error.message:"mongosync request failed";setMongoData({ok:false,error:message});notify(message)}
    finally{setMongoBusy(false)}
  };
  const runMongoMirror=async()=>{
    if(!await ensureMongoConnection())return;
    if(!mirrorHost.trim())return notify("Enter the mirror destination host");
    setMongoBusy(true);setMongoData(null);
    try{
      const data=await agentCall("/api/mongodb/studio",{method:"POST",body:JSON.stringify({...payload(),action:"mirror",destination:{host:mirrorHost.trim(),port:mirrorPort.trim(),database:mirrorDatabase.trim()||form.database.trim(),username:mirrorUsername.trim(),password:mirrorPassword,authMode:"password",tlsMode:mirrorTlsMode},timeoutMs:60000})});
      setMongoData(data);notify("MongoDB mirror verification completed");
    }catch(error){const message=error instanceof Error?error.message:"Mirror verification failed";setMongoData({ok:false,error:message});notify(message)}
    finally{setMongoBusy(false)}
  };
  const selectDevopsTool=(tool:string)=>{setDevopsTool(tool);setDevopsAction(devopsActionMap[tool]?.[0]||"status");setDevopsTarget("");setDevopsSecondary("");setDevopsScope("")};
  const compareToolVersions=async(save=false)=>{
    setDevopsBusy(true);setDevopsData(null);
    try{const data=await agentCall("/api/devops/"+(save?"version-baseline":"version-comparison"),save?{method:"POST",body:"{}"}:{});setDevopsData(data);notify(save?"DevOps version baseline saved":"Tool versions compared")}
    catch(error){const message=error instanceof Error?error.message:"Version comparison failed";setDevopsData({ok:false,error:message});notify(message)}
    finally{setDevopsBusy(false)}
  };
  const collectToolWorkspace=async(tool:"docker"|"github"|"git"|"ansible",actions:string[],target="",cwd="")=>{
    const entries=await Promise.all(actions.map(async action=>{
      try{
        const section:any=await agentCall("/api/devops/run",{method:"POST",body:JSON.stringify({tool,action,target:target.trim(),secondary:"",scope:"",cwd:cwd.trim()})});
        return [action,{...section,code:section.code??(section.ok===false?1:0)}] as [string,any];
      }catch(error){
        const message=error instanceof Error?error.message:"Inspection failed";
        return [action,{ok:false,code:1,error:message,stderr:message,displayCommand:"Approved "+tool+" "+action+" inspection"}] as [string,any];
      }
    }));
    const sections=Object.fromEntries(entries);
    return {ok:entries.every(([,section])=>section.ok!==false&&section.code!==1),workspace:tool,sections,collectedAt:new Date().toISOString()};
  };
  const runDevops=async()=>{
    setDevopsBusy(true);setDevopsData(null);
    try{
      const data=devopsMode==="kubernetes"
        ?await agentCall("/api/devops/kubernetes-dashboard",{method:"POST",body:JSON.stringify({context:kubeContext.trim(),namespace:kubeNamespace.trim()})})
        :devopsMode==="docker"
          ?dockerView==="logs"&&dockerTarget.trim()
            ?await collectToolWorkspace("docker",["logs","inspect","processes"],dockerTarget)
            :await agentCall("/api/devops/docker-dashboard",{method:"POST",body:"{}"})
          :devopsMode==="github"
            ?await collectToolWorkspace(gitSource,devopsActionMap[gitSource],gitSource==="github"?gitRepository:"",gitSource==="git"?gitCwd:"")
            :devopsMode==="ansible"
              ?await collectToolWorkspace("ansible",devopsActionMap.ansible,"",ansibleCwd)
              :await agentCall("/api/devops/run",{method:"POST",body:JSON.stringify({tool:devopsTool,action:devopsAction,target:devopsTarget.trim(),secondary:devopsSecondary.trim(),scope:devopsScope.trim(),cwd:devopsCwd.trim()})});
      setDevopsData(data);notify("DevOps evidence refreshed");
    }catch(error){const message=error instanceof Error?error.message:"DevOps inspection failed";setDevopsData({ok:false,error:message});notify(message)}
    finally{setDevopsBusy(false)}
  };
  const runContainerChange=async(preview:boolean)=>{
    if(!changeTarget.trim())return notify("Enter the deployment, pod, or container target");
    if(!preview&&!changeReference.trim())return notify("Enter an approved change or incident reference");
    if(!preview&&!window.confirm("Apply "+changeAction+" to "+changeTarget+"? This change is audited."))return;
    setDevopsBusy(true);setDevopsData(null);
    try{
      const data=await agentCall(preview?"/api/devops/container-action/preview":"/api/devops/container-action",{method:"POST",body:JSON.stringify({platform:changePlatform,action:changeAction,target:changeTarget.trim(),value:changeValue,context:kubeContext.trim(),namespace:kubeNamespace.trim(),changeReference:changeReference.trim(),accessMode:"read-write",confirmation:"APPLY CONTAINER CHANGE"})});
      setDevopsData(data);notify(preview?"Permission preflight completed":"Audited container change completed");
    }catch(error){const message=error instanceof Error?error.message:"Container action failed";setDevopsData({ok:false,error:message});notify(message)}
    finally{setDevopsBusy(false)}
  };

  const saveEditorSession=async()=>{
    const tabs=sqlTabs.map(tab=>tab.id===activeSqlTabId?{...tab,content:sql,engine:form.engine,cursor:editorRef.current?.selectionStart||0,dirty:false}:{...tab,dirty:false});
    try{await agentCall("/api/editor/session",{method:"POST",body:JSON.stringify({tabs,activeId:activeSqlTabId,settings:{wordWrap:false,fontSize:11,autocompleteScope:"all"}})});setSqlTabs(tabs);notify(`${tabs.length} SQL worksheet${tabs.length===1?"":"s"} saved locally`)}
    catch(error){notify(error instanceof Error?error.message:"Editor session could not be saved")}
  };
  const runIntelligence=async(action="run")=>{
    setIntelligenceBusy(true);setIntelligenceData(null);
    try{
      let data:any;
      if(["bottleneck","resilience"].includes(intelligenceMode)){
        if(!diagnosticEngines.has(form.engine))throw new Error("Deep bottleneck intelligence supports Oracle, PostgreSQL, MongoDB, MySQL, MariaDB, and SQL Server");
        if(!await ensureDatabaseConnection())return;
        const route=deepDiveRoutes[form.engine];
        data=await agentCall(route,{method:"POST",body:JSON.stringify({...payload(),identifier:intelligenceIdentifier.trim(),sqlId:form.engine==="oracle"?intelligenceIdentifier.trim():undefined,queryId:form.engine==="postgres"?intelligenceIdentifier.trim():undefined,operationId:form.engine==="mongodb"?intelligenceIdentifier.trim():undefined,collection:form.database,packScope,timeoutMs:60000})});
      }else if(intelligenceMode==="xray"){
        if(!diagnosticEngines.has(form.engine))throw new Error("Statement X-Ray supports Oracle, PostgreSQL, MongoDB, MySQL, MariaDB, and SQL Server");
        if(!intelligenceIdentifier.trim())throw new Error("Enter the engine-specific statement or operation identifier");
        if(!await ensureDatabaseConnection())return;
        data=form.engine==="oracle"
          ?await agentCall("/api/performance/oracle-sql-id/check",{method:"POST",body:JSON.stringify({...payload(),identifier:intelligenceIdentifier.trim(),check:xrayCheck,packScope,timeoutMs:60000})})
          :await agentCall("/api/performance/runtime-trace/capture",{method:"POST",body:JSON.stringify({...payload(),identifier:intelligenceIdentifier.trim(),collection:form.database,timeoutMs:60000})});
      }else if(intelligenceMode==="plans"){
        if(!intelligenceIdentifier.trim())throw new Error("Enter the statement or operation identifier");
        if(!await ensureDatabaseConnection())return;
        data=await agentCall(action==="history"?"/api/performance/plan-history":"/api/performance/plan-capture",{method:"POST",body:JSON.stringify({...payload(),identifier:intelligenceIdentifier.trim(),timeoutMs:60000})});
      }else{
        const goldenPayload=goldenArchitecture==="microservices"?{architecture:"microservices",endpoint:goldenEndpoint.trim(),credential:goldenCredential.trim(),deployment:goldenDeployment.trim(),group:goldenGroup.trim(),action:goldenAction}:{architecture:"classic",host:goldenHost.trim(),user:goldenUser.trim(),port:goldenPort,home:goldenHome.trim(),group:goldenGroup.trim(),action:goldenAction};
        data=await agentCall("/api/goldengate/diagnose",{method:"POST",body:JSON.stringify(goldenPayload)});
      }
      setIntelligenceData(data);notify("Engine intelligence evidence ready");
    }catch(error){const message=error instanceof Error?error.message:"Engine intelligence failed";setIntelligenceData({ok:false,error:message});notify(message)}
    finally{setIntelligenceBusy(false)}
  };
  const runXraySequence=async()=>{
    if(form.engine!=="oracle"||!intelligenceIdentifier.trim())return notify("Connect to Oracle and enter a SQL_ID first");
    if(!await ensureDatabaseConnection())return;
    setIntelligenceBusy(true);setIntelligenceData(null);const results:any[]=[];
    for(const item of xrayCatalog){
      try{const data=await agentCall("/api/performance/oracle-sql-id/check",{method:"POST",body:JSON.stringify({...payload(),identifier:intelligenceIdentifier.trim(),check:item.id,packScope,timeoutMs:60000})});results.push({...data,id:item.id,label:item.label})}
      catch(error){results.push({id:item.id,label:item.label,ok:false,error:error instanceof Error?error.message:"Check failed"})}
    }
    setIntelligenceData({ok:true,engine:"oracle",identifier:intelligenceIdentifier.trim(),packScope,results,collectedAt:new Date().toISOString()});setIntelligenceBusy(false);notify("Oracle SQL_ID licensed sequence completed");
  };
  const savePlanBaseline=async()=>{
    if(!intelligenceData?.planText)return notify("Capture a plan before saving a baseline");
    const operators=String(intelligenceData.planText).split(/\r?\n/).filter(Boolean).slice(0,200).map((line,index)=>({depth:Math.min((line.match(/^\s*/)?.[0].length||0),30),operation:line.trim().slice(0,160)||"Plan operator",object:"",cost:0,estimatedRows:0,actualRows:0,timeMs:0,status:/full scan|spill|cartesian|error/i.test(line)?"high":"normal"}));
    try{const data=await agentCall("/api/investigation/baselines",{method:"POST",body:JSON.stringify({name:(baselineName||adapterDefaults[form.engine].name+" plan baseline").trim(),engine:form.engine,identifier:intelligenceIdentifier.trim(),plan:{score:100,totalCost:0,estimatedRows:0,actualRows:0,warnings:operators.filter(item=>item.status!=="normal").length,fingerprint:intelligenceData.identifier||intelligenceIdentifier,operators}})});setInvestigationStore(data.store);notify("Plan baseline saved to Investigation")}
    catch(error){notify(error instanceof Error?error.message:"Baseline could not be saved")}
  };
  const saveDevopsSnapshot=async()=>{
    if(!devopsData)return notify("Collect delivery or platform evidence first");
    const type=deliveryMode==="kafka"?"kafka":deliveryMode==="pipeline"?"pipeline":"configuration";
    try{const data=await agentCall("/api/investigation/devops-snapshots",{method:"POST",body:JSON.stringify({type,name:(snapshotName||type+" snapshot").trim(),data:JSON.stringify(devopsData),metadata:{environment,tool:deliveryMode}})});setInvestigationStore(data.store);notify("Evidence snapshot saved")}
    catch(error){notify(error instanceof Error?error.message:"Snapshot could not be saved")}
  };  const captureRecorderSample=async(showToast=true)=>{
    if(!diagnosticEngines.has(form.engine))throw new Error("Flight recording supports Oracle, PostgreSQL, MongoDB, MySQL, and SQL Server");
    const data=await agentCall("/api/performance/sample",{method:"POST",body:JSON.stringify({...payload(),timeoutMs:30000})});
    setRecordingSamples(items=>[...items,{collectedAt:data.collectedAt||new Date().toISOString(),metrics:data.metrics||{}}].slice(-720));if(showToast)notify("Performance sample captured");return data;
  };
  const startRecorder=async()=>{
    if(recordingActive)return;if(!await ensureDatabaseConnection())return;
    try{setRecordingSamples([]);await captureRecorderSample(false);setRecordingActive(true);recorderTimer.current=window.setInterval(()=>{captureRecorderSample(false).catch(()=>{})},10000);notify("Flight recorder started at 10-second intervals")}
    catch(error){notify(error instanceof Error?error.message:"Flight recorder could not start")}
  };
  const stopRecorder=()=>{if(recorderTimer.current)window.clearInterval(recorderTimer.current);recorderTimer.current=null;setRecordingActive(false);notify("Flight recorder stopped")};
  const saveRecording=async()=>{
    if(!recordingSamples.length)return notify("Capture at least one sample first");stopRecorder();
    try{const data=await agentCall("/api/investigation/recordings",{method:"POST",body:JSON.stringify({name:recordingName.trim()||"Performance flight recording",engine:form.engine,samples:recordingSamples})});setInvestigationStore(data.store);notify("Flight recording saved locally")}
    catch(error){notify(error instanceof Error?error.message:"Recording could not be saved")}
  };
  const addIncidentEvent=async()=>{
    if(!eventTitle.trim())return notify("Enter an incident event title");setInvestigationBusy(true);
    try{const data=await agentCall("/api/investigation/events",{method:"POST",body:JSON.stringify({type:eventType,title:eventTitle.trim(),details:eventDetails.trim(),occurredAt:new Date().toISOString()})});setInvestigationStore(data.store);setEventTitle("");setEventDetails("");notify("Timeline event added")}
    catch(error){notify(error instanceof Error?error.message:"Timeline event could not be added")}
    finally{setInvestigationBusy(false)}
  };
  const saveRunbook=async()=>{
    if(!runbookName.trim()||!runbookActions.length)return notify("Enter a name and select at least one approved action");
    try{const data=await agentCall("/api/investigation/runbooks",{method:"POST",body:JSON.stringify({name:runbookName.trim(),tool:runbookTool,actions:runbookActions})});setInvestigationStore(data.store);setRunbookName("");notify("Allowlisted runbook saved")}
    catch(error){notify(error instanceof Error?error.message:"Runbook could not be saved")}
  };
  const executeRunbook=async(runbook:any)=>{
    if(!window.confirm("Run "+runbook.actions.length+" read-only inspections from "+runbook.name+"?"))return;setInvestigationBusy(true);const results:any[]=[];
    for(const action of runbook.actions){try{const data=await agentCall("/api/devops/run",{method:"POST",body:JSON.stringify({tool:runbook.tool,action,target:"",secondary:"",scope:"",cwd:devopsCwd.trim()})});results.push({action,...data})}catch(error){results.push({action,ok:false,error:error instanceof Error?error.message:"Failed"})}}
    setDevopsData({ok:results.every(item=>item.ok!==false),runbook:runbook.name,results,collectedAt:new Date().toISOString()});setStudioTool("devops");setDevopsMode("tooling");setInvestigationBusy(false);notify("Runbook inspection sequence completed");
  };
  const saveCurrentAutofill=async()=>{
    const name=(profileName||environment+" "+adapterDefaults[form.engine].name).trim();
    try{const data=await agentCall("/api/investigation/autofill-profiles",{method:"POST",body:JSON.stringify({name,kind:"database",data:{engine:form.engine,host:form.host.trim(),port:form.port.trim(),database:form.database.trim(),username:form.username.trim()}})});setInvestigationStore(data.store);notify("Agent autofill profile saved without secrets")}
    catch(error){notify(error instanceof Error?error.message:"Autofill profile could not be saved")}
  };
  const deleteInvestigationItem=async(kind:string,id:string)=>{
    if(!window.confirm("Delete this local "+kind+" item?"))return;
    try{const data=await agentCall("/api/investigation/"+kind+"/delete",{method:"POST",body:JSON.stringify({id})});setInvestigationStore(data.store);notify("Investigation item deleted")}
    catch(error){notify(error instanceof Error?error.message:"Item could not be deleted")}
  };
  const runDelivery=async()=>{
    setDevopsBusy(true);setDevopsData(null);
    try{let data;if(deliveryMode==="pipeline")data=await agentCall("/api/devops/pipeline-runs",{method:"POST",body:JSON.stringify({repository:deliveryRepository.trim()})});else if(deliveryMode==="kafka")data=await agentCall("/api/devops/kafka-lag",{method:"POST",body:JSON.stringify({endpoint:kafkaEndpoint.trim(),group:kafkaGroup.trim()})});else data=await agentCall("/api/devops/kubernetes-topology",{method:"POST",body:JSON.stringify({context:kubeContext.trim(),namespace:kubeNamespace.trim()})});setDevopsData(data);notify("Delivery evidence collected")}
    catch(error){const message=error instanceof Error?error.message:"Delivery evidence failed";setDevopsData({ok:false,error:message});notify(message)}
    finally{setDevopsBusy(false)}
  };
  const loadContainerAudit=async()=>{setDevopsBusy(true);try{const data=await agentCall("/api/devops/container-actions/audit");setDevopsData(data);notify("Container audit history loaded")}catch(error){notify(error instanceof Error?error.message:"Audit history failed")}finally{setDevopsBusy(false)}};  const appendSshOutput=(sessionId:string,text:string,connected?:boolean)=>setSshSessions(items=>items.map(item=>item.sessionId===sessionId?{...item,output:(item.output+text).slice(-260000),connected:connected===undefined?item.connected:connected}:item));
  const consumeSshStream=async(sessionId:string)=>{
    const controller=new AbortController();sshStreams.current[sessionId]=controller;
    const response=await fetch(AGENT_URL+"/api/terminal/ssh/stream?session="+encodeURIComponent(sessionId),{headers:{"X-DBridge-Token":agentToken},signal:controller.signal});
    if(!response.ok||!response.body)throw new Error("SSH output stream could not be opened");
    const reader=response.body.getReader();const decoder=new TextDecoder();let buffer="";
    while(true){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});let boundary=buffer.indexOf("\n\n");while(boundary>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);for(const line of block.split(/\r?\n/)){if(!line.startsWith("data: "))continue;try{const event=JSON.parse(line.slice(6));if(event.type==="output"&&event.data){const raw=atob(event.data);const bytes=Uint8Array.from(raw,char=>char.charCodeAt(0));appendSshOutput(sessionId,new TextDecoder().decode(bytes))}else if(event.type==="closed")appendSshOutput(sessionId,"\r\n[session closed] "+(event.reason||"")+"\r\n",false)}catch{/* ignore keep-alive fragments */}}boundary=buffer.indexOf("\n\n")}}
  };
  const sshPayload=()=>({environment,host:sshHost.trim(),port:sshPort,username:sshUser.trim(),authMethod:sshAuth,privateKeyPath:sshKeyPath.trim(),password:sshPassword,passphrase:sshPassphrase});
  const preflightSsh=async()=>{setSshBusy(true);try{const data=await agentCall("/api/terminal/ssh/preflight",{method:"POST",body:JSON.stringify(sshPayload())});setDevopsData(data);notify("SSH host key inspected")}catch(error){const message=error instanceof Error?error.message:"SSH preflight failed";setDevopsData({ok:false,error:message});notify(message)}finally{setSshBusy(false)}};
  const openSsh=async()=>{
    if(sshSessions.filter(item=>item.connected).length>=4)return notify("Close a terminal tab before opening more than four sessions");setSshBusy(true);
    try{const opened=await agentCall("/api/terminal/ssh/open",{method:"POST",body:JSON.stringify(sshPayload())});const session:SshSession={sessionId:opened.sessionId,host:opened.host,port:opened.port,username:opened.username,authMethod:opened.authMethod,openedAt:opened.openedAt,output:"Connected to "+opened.username+"@"+opened.host+"\r\n",connected:true};setSshSessions(items=>[...items,session]);setActiveSsh(opened.sessionId);setSshPassword("");setSshPassphrase("");consumeSshStream(opened.sessionId).catch(error=>{if(error?.name!=="AbortError")appendSshOutput(opened.sessionId,"\r\n[stream error] "+String(error?.message||error)+"\r\n",false)});notify("SSH terminal connected")}
    catch(error){notify(error instanceof Error?error.message:"SSH connection failed")}
    finally{setSshBusy(false)}
  };
  const sendSshInput=async()=>{
    const session=sshSessions.find(item=>item.sessionId===activeSsh);if(!session?.connected||!sshInput)return;
    try{await agentCall("/api/terminal/ssh/input",{method:"POST",body:JSON.stringify({sessionId:session.sessionId,data:sshInput+"\r"})});setSshInput("")}
    catch(error){notify(error instanceof Error?error.message:"SSH input failed")}
  };
  const closeSsh=async(sessionId:string)=>{
    try{await agentCall("/api/terminal/ssh/close",{method:"POST",body:JSON.stringify({sessionId})})}catch{/* session may already be closed */}sshStreams.current[sessionId]?.abort();delete sshStreams.current[sessionId];setSshSessions(items=>items.filter(item=>item.sessionId!==sessionId));setActiveSsh(current=>current===sessionId?(sshSessions.find(item=>item.sessionId!==sessionId)?.sessionId||""):current);notify("SSH terminal tab closed");
  };  const saveTuningRules=async()=>{
    try{const data=await agentCall("/api/investigation/rules",{method:"POST",body:JSON.stringify({rules:investigationStore.rules||[]})});setInvestigationStore(data.store);notify("Recommendation thresholds saved")}
    catch(error){notify(error instanceof Error?error.message:"Tuning rules could not be saved")}
  };  return <main className="ops-shell">
    <aside className="ops-rail">
      <div className="ops-brand"><span>DB</span><div><b>DB Operations</b><small>Studio</small></div></div>
      <label className="environment-picker"><span>ENVIRONMENT</span><select value={environment} onChange={event=>selectEnvironment(event.target.value as Environment)}>{environments.map(item=><option key={item}>{item}</option>)}</select></label>
      <nav><p>WORKSPACE</p>{nav.map(item=><button key={item.id} className={view===item.id?"active":""} onClick={()=>{if(item.id==="runbooks"){setView("studio");setStudioTool("investigation");setInvestigationMode("runbooks")}else setView(item.id)}}><i>{item.mark}</i>{item.label}{item.id==="studio"&&<em>{readyCount||15}</em>}</button>)}</nav>
      <section className={`agent-card ${agentState}`}><header><i/><div><b>Local DB agent</b><small>{agentState==="online"?`Paired · v${agentVersion}`:agentState==="pairing"?"Pairing…":"Not available"}</small></div></header><footer><span>Loopback only</span><span>Secrets in memory</span></footer></section>
      <div className="rail-foot"><span>RO</span><p><b>Read-only default</b><small>Writes require explicit unlock</small></p></div>
    </aside>

    <section className="ops-app">
      <header className="ops-topbar"><div><span>DB Operations Studio</span><b>/</b><strong>{nav.find(item=>item.id===view)?.label}</strong></div><button onClick={()=>setCommandOpen(true)}>⌕ <span>Search workspace</span><kbd>Ctrl K</kbd></button><aside><span className={agentState}><i/>{agentState==="online"?"Agent online":"Agent offline"}</span></aside></header>
      <div className="ops-scroll">
        {view==="studio"&&<div className="ops-view">
          <header className="studio-heading"><div><p>UNIFIED DATABASE + DEVOPS OPERATIONS</p><h1>DB Studio</h1><span>Run SQL, diagnose performance, analyze logs and traces, and inspect delivery platforms from one shared environment context.</span></div><div><span><b>{readyCount||"—"}</b><small>connectors ready</small></span><span><b>50</b><small>tuning checks</small></span><span><b>{Object.values(toolInventory).filter(tool=>tool.available).length}</b><small>DevOps tools ready</small></span></div></header>
          {agentState!=="online"&&<section className="agent-warning"><b>Local database agent is not paired.</b><span>Start the local database agent on port 17865, then reload this page. Hosted copies cannot access laptop databases.</span></section>}
          <nav className="studio-tool-tabs" aria-label="Studio tools">
            <button className={studioTool==="sql"?"active":""} onClick={()=>setStudioTool("sql")}><i>SQL</i><span><b>SQL Workspace</b><small>Editor, catalog, results</small></span></button>
            <button className={studioTool==="mongodb"?"active":""} onClick={()=>{setStudioTool("mongodb");if(form.engine!=="mongodb")selectEngine("mongodb")}}><i>MDB</i><span><b>MongoDB Studio</b><small>Compass, Sync, Mirror</small></span></button>
            <button className={studioTool==="diagnostics"?"active":""} onClick={()=>setStudioTool("diagnostics")}><i>DX</i><span><b>SQL Diagnostics</b><small>Full suite, plans, X-Ray</small></span></button>
            <button className={studioTool==="observability"?"active":""} onClick={()=>setStudioTool("observability")}><i>LG</i><span><b>Logs & Traces</b><small>Logs, telemetry, TKPROF</small></span></button>
            <button className={studioTool==="intelligence"?"active":""} onClick={()=>{setStudioTool("intelligence");setIntelligenceMode("overview");setIntelligenceData(null)}}><i>AI</i><span><b>Engine Intelligence</b><small>Six engines, X-Ray, plans, HA</small></span></button>
            <button className={studioTool==="devops"?"active":""} onClick={()=>setStudioTool("devops")}><i>DO</i><span><b>DevOps & Remote</b><small>Platform, delivery, SSH</small></span></button>
            <button className={studioTool==="investigation"?"active":""} onClick={()=>setStudioTool("investigation")}><i>IR</i><span><b>Investigation</b><small>Recorder, timeline, runbooks</small></span></button>
          </nav>
          <section className={`studio-grid ${studioTool==="devops"?"without-connection":connectionPanelOpen?"connection-open":"connection-collapsed"}`}>
            {studioTool!=="devops"&&(connectionPanelOpen?<aside className="db-connector panel-dark" onMouseEnter={cancelConnectionPanelHide} onMouseLeave={scheduleConnectionPanelHide} onFocusCapture={cancelConnectionPanelHide} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))scheduleConnectionPanelHide()}}>
              <header><div><span>01</span><p><b>Connection</b><small>Adapter-aware secure target</small></p></div><aside><em className={connectionState}>{connectionState}</em><button className="connection-collapse" onClick={()=>setConnectionPanelOpen(false)} aria-label="Auto-hide Connection panel">Hide</button></aside></header>
              <div className="connector-form">
                <label>ADAPTER<select value={form.engine} onChange={event=>selectEngine(event.target.value)}>{engineOrder.map(engine=><option key={engine} value={engine}>{adapters[engine]?.name||adapterDefaults[engine].name}</option>)}</select></label>
                <label>SAVED PROFILE<select value={profileId} onChange={event=>applyProfile(event.target.value)}><option value="">Select profile…</option>{scopedProfiles.map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
                <div className="profile-actions"><input aria-label="Profile name" value={profileName} onChange={event=>setProfileName(event.target.value)} placeholder="Profile name (optional)"/><button onClick={saveProfile}>Save</button><button onClick={deleteProfile} disabled={!profileId}>Delete</button></div>
                <div className="autofill-row"><button onClick={applyDefaults}>Autofill adapter defaults</button><span>Password excluded</span></div>
                <label>AUTHENTICATION<select value={form.authMode} onChange={event=>patchForm({authMode:event.target.value as DbForm["authMode"],password:""})}><option value="password">Username + password</option><option value="context">Existing CLI / integrated context</option></select></label>
                <label>TLS POLICY<select value={form.tlsMode} onChange={event=>patchForm({tlsMode:event.target.value as DbForm["tlsMode"]})}><option value="require">Require trusted TLS</option><option value="prefer">Driver default / prefer TLS</option><option value="disable">Disable TLS (approved internal)</option></select></label>
                <div className="field-pair"><label>HOST<input value={form.host} onChange={event=>patchForm({host:event.target.value})} placeholder={form.engine==="snowflake"?"account identifier":"db.company.net"}/></label><label>PORT<input value={form.port} onChange={event=>patchForm({port:event.target.value})}/></label></div>
                <label>DATABASE / SERVICE<input value={form.database} onChange={event=>patchForm({database:event.target.value})} placeholder="Database, service, project, or warehouse"/></label>
                <label>USERNAME / PROFILE<input autoComplete="username" value={form.username} onChange={event=>patchForm({username:event.target.value})}/></label>
                {form.authMode==="password"&&<label>PASSWORD<input type="password" autoComplete="current-password" value={form.password} onChange={event=>patchForm({password:event.target.value})}/></label>}
                <div className="connector-buttons"><button className="secondary" onClick={applyDefaults}>Reset defaults</button><button className="primary" onClick={()=>connect(true)} disabled={connectionState==="connecting"}>{connectionState==="connecting"?"Validating…":"Connect & browse"}</button></div>
                <div className={`connection-message ${connectionState}`}><i/><span><b>{activeAdapter?.name||adapterDefaults[form.engine].name}</b><small>{connectionMessage}</small></span></div>
                <div className="capability-list"><span>{activeAdapter?.directAvailable?"Bundled direct driver":activeAdapter?.clientAvailable?"Approved local client":"Client readiness pending"}</span><span>Catalog browser</span><span>SQL + diagnostics</span><span>Environment autofill</span></div>
              </div>
              <section className="catalog-browser"><header><div><span>02</span><p><b>Database objects</b><small>{catalogLoading?"Loading…":`${catalog.length} available`}</small></p></div><button onClick={()=>loadCatalog(false)} disabled={catalogLoading}>↻</button></header><label>⌕ <input value={catalogFilter} onChange={event=>setCatalogFilter(event.target.value)} placeholder="schema, table, view…"/></label><div>{filteredCatalog.length?filteredCatalog.map((item,index)=><button key={`${item.schema}-${item.name}-${index}`} onDoubleClick={()=>{if(form.engine==="mongodb"){setMongoCollection(item.name);setStudioTool("mongodb");setMongoMode("documents");setMongoData(null)}else updateSqlText(`SELECT *\nFROM ${item.schema?`${item.schema}.`:""}${item.name}\nLIMIT 100;`)}}><i>{item.type.slice(0,1)}</i><span><b>{item.name}</b><small>{item.schema||"default"} · {item.type}</small></span></button>):<p className="catalog-empty">Connect to load schemas, tables, views, and programmable objects.</p>}</div></section>
             </aside>:<button className={`connection-launcher ${connectionState}`} onClick={openConnectionPanel} onMouseEnter={openConnectionPanel} aria-expanded={false} aria-label="Open database Connection panel"><span>01</span><b>Connection</b><small>{connectionState==="connected"?adapterDefaults[form.engine].name:"Auto-hide"}</small><i/></button>)}

             {studioTool==="sql"&&<section className="sql-ide panel-dark">
              <header className="ide-tabs"><div className="worksheet-tabs">{sqlTabs.map(tab=><div key={tab.id} className={`worksheet-tab ${activeSqlTabId===tab.id?"active":""}`}><button className="worksheet-select" onClick={()=>switchSqlTab(tab.id)} onDoubleClick={()=>renameSqlTab(tab.id)} title="Double-click to rename"><i/><span>{tab.name}</span>{tab.dirty&&<em>●</em>}</button><button className="worksheet-close" onClick={()=>closeSqlTab(tab.id)} aria-label={`Close ${tab.name}`}>×</button></div>)}<button className="worksheet-add" onClick={addSqlTab} title="New worksheet (Ctrl+Alt+N)">+</button></div><aside><span className={connectionState}><i/>{connectionState==="connected"?`${environment} · ${adapterDefaults[form.engine].name}`:"Not connected"}</span><b>{allowWrites?"Writes unlocked":"Read only"}</b><button className={sqlInspectorOpen?"inspector-toggle active":"inspector-toggle"} onClick={()=>setSqlInspectorOpen(value=>!value)}>Inspector</button></aside></header>
              <div className="ide-toolbar"><button className="run" onClick={()=>runSql("selected")} disabled={queryRunning}>{queryRunning?"Running…":"▶ Run selected"}</button><button onClick={()=>runSql("all")} disabled={queryRunning}>Run all</button><button onClick={()=>runSql("explain")} disabled={queryRunning}>Explain</button><span className="toolbar-separator"/><button onClick={formatSql}>Format SQL</button><button onClick={saveEditorSession}>Save workspace</button><button onClick={saveCurrentScript}>Save script</button><label className="sql-import">Import SQL<input type="file" accept=".sql,text/sql,text/plain" onChange={async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>500000)return notify("SQL import is limited to 500 KB");updateSqlText(await file.text());event.target.value=""}}/></label><button onClick={()=>updateSqlText(sqlSamples[form.engine]||"SELECT *\nFROM table_name\nLIMIT 50;")}>Sample</button><span className="autocomplete-status">Autocomplete <i className="switch-on"/></span><label className={allowWrites?"write-unlock active":"write-unlock"}><input type="checkbox" checked={allowWrites} onChange={event=>setAllowWrites(event.target.checked)}/><i/>Unlock writes</label></div>
              <div className={`sql-workbench ${sqlInspectorOpen?"inspector-open":""}`}><div className="sql-workbench-main">
                <div className="worksheet-context"><span><b>{adapterDefaults[form.engine].name}</b><small>{environment} · {form.database||"database not set"}</small></span><span><b>{sql.split(/\s+/).filter(Boolean).length}</b><small>tokens</small></span><span><b>{sql.split(/\r?\n/).length}</b><small>lines</small></span><em>Ctrl+Enter selection · Ctrl+Shift+Enter all</em></div>
                <div className="code-editor"><pre>{sql.split("\n").map((_,index)=>index+1).join("\n")}</pre><textarea ref={editorRef} spellCheck={false} value={sql} onChange={event=>updateCompletion(event.target.value,event.target.selectionStart)} onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){event.preventDefault();runSql(event.shiftKey?"all":"selected")}else if((event.ctrlKey||event.metaKey)&&event.altKey&&event.key.toLowerCase()==="o"){event.preventDefault();formatSql()}}} aria-label="Advanced SQL worksheet editor"/>{completion.items.length>0&&<div className="completion-menu">{completion.items.map(item=><button key={`${item.detail}-${item.label}`} onMouseDown={event=>event.preventDefault()} onClick={()=>acceptCompletion(item)}><i>{item.detail.startsWith("SQL")?"SQL":"DB"}</i><span><b>{item.label}</b><small>{item.detail}</small></span></button>)}</div>}</div>
                <section className="result-panel"><header><div><button className={resultTab==="results"?"active":""} onClick={()=>setResultTab("results")}>Results {result&&<em>{result.rows.length}</em>}</button><button className={resultTab==="statistics"?"active":""} onClick={()=>setResultTab("statistics")}>Statistics</button><button className={resultTab==="messages"?"active":""} onClick={()=>setResultTab("messages")}>Messages</button></div><aside><label className="result-filter">⌕<input value={resultFilter} onChange={event=>setResultFilter(event.target.value)} placeholder="Filter loaded rows"/></label><button disabled={!result} onClick={()=>exportResult("csv")}>CSV</button><button disabled={!result} onClick={()=>exportResult("json")}>JSON</button><button disabled={!result} onClick={copyResult}>Copy</button><span>{result?`${result.durationMs} ms`:"Ready"}</span></aside></header>{resultTab==="statistics"?<div className="result-statistics">{[["Rows",resultStats.rows],["Columns",resultStats.columns],["Cells",resultStats.cells],["NULL values",resultStats.nulls]].map(([label,value])=><article key={String(label)}><b>{Number(value).toLocaleString()}</b><small>{label}</small></article>)}<section><b>Loaded-result scope</b><small>Statistics and filters operate on the bounded result returned by the local agent. No extra database compute is triggered.</small></section></div>:resultTab==="messages"?<pre className="message-output">{result?[result.stderr,result.raw].filter(Boolean).join("\n\n")||"Statement completed with no messages.":"Connection and execution messages appear here."}</pre>:result?.columns.length?<div className="dynamic-grid"><table><thead><tr><th>#</th>{result.columns.map(column=><th key={column}>{column}</th>)}</tr></thead><tbody>{filteredResultRows.map((row,rowIndex)=><tr key={rowIndex}><td>{rowIndex+1}</td>{row.map((cell,index)=><td key={index} title={cell==null?"NULL":String(cell)}>{cell==null?<em>NULL</em>:String(cell)}</td>)}</tr>)}</tbody></table>{resultFilter&&filteredResultRows.length===0&&<p className="grid-empty">No loaded rows match this filter.</p>}</div>:result?<pre className="message-output">{result.raw||result.stderr||"Statement completed with no output."}</pre>:<div className="result-placeholder"><span>SQL</span><b>Advanced worksheet ready</b><small>Select a statement or run the full worksheet. History, scripts, statistics, explain, export, and autocomplete are available.</small></div>}</section>
              </div>{sqlInspectorOpen&&<aside className="sql-inspector"><header><span><b>Worksheet inspector</b><small>Local workspace evidence</small></span><button onClick={()=>setSqlInspectorOpen(false)} aria-label="Close SQL inspector">×</button></header><nav>{(["history","scripts","context"] as SqlInspectorMode[]).map(mode=><button key={mode} className={sqlInspector===mode?"active":""} onClick={()=>setSqlInspector(mode)}>{mode==="history"?"Query history":mode==="scripts"?"Saved scripts":"Context"}</button>)}</nav>{sqlInspector==="history"&&<div className="sql-history">{queryHistory.length?queryHistory.map(entry=><article key={entry.id}><header><i className={entry.status}/><b>{entry.engine} · {entry.durationMs} ms</b><small>{new Date(entry.executedAt).toLocaleTimeString()}</small></header><code>{entry.sql}</code><footer><span>{entry.rowCount} rows · {entry.environment}</span><button onClick={()=>updateSqlText(entry.sql)}>Load</button><button onClick={()=>runSql("all",entry.sql)}>Run</button></footer></article>):<div className="sql-inspector-empty"><span>H</span><b>No query history</b><small>The last 25 executions stay on this browser.</small></div>}</div>}{sqlInspector==="scripts"&&<div className="sql-scripts"><button className="save-script" onClick={saveCurrentScript}>+ Save active worksheet</button>{savedSqlScripts.length?savedSqlScripts.map(script=><article key={script.id}><span><b>{script.name}</b><small>{script.engine} · {new Date(script.savedAt).toLocaleDateString()}</small></span><button onClick={()=>loadSqlScript(script)}>Open</button><button onClick={()=>setSavedSqlScripts(items=>items.filter(item=>item.id!==script.id))}>×</button></article>):<div className="sql-inspector-empty"><span>S</span><b>No saved scripts</b><small>Save reusable SQL without credentials or result data.</small></div>}</div>}{sqlInspector==="context"&&<div className="sql-context-card"><section><small>Environment</small><b>{environment}</b></section><section><small>Adapter</small><b>{adapterDefaults[form.engine].name}</b></section><section><small>Database / service</small><b>{form.database||"Not set"}</b></section><section><small>Identity</small><b>{form.username||"Not set"}</b></section><section><small>Access policy</small><b>{allowWrites?"Writes explicitly unlocked":"Read-only default"}</b></section><section><small>Connection</small><b>{connectionState}</b></section><div><b>Keyboard</b><span>Ctrl+Enter · Run selection</span><span>Ctrl+Shift+Enter · Run all</span><span>Ctrl+Alt+O · Format SQL</span><span>Double-click tab · Rename</span></div></div>}</aside>}</div>
             </section>}

             {studioTool==="mongodb"&&<section className="studio-module panel-dark mongo-studio">
              <header className="module-head mongo-head"><div><i>MDB</i><p><b>Advanced MongoDB Studio</b><small>Compass-style data workbench · mongosync controller · mirror verification</small></p></div><aside><span>{environment} · {form.database||"admin"}</span><button className="secondary" disabled={!mongoData} onClick={()=>download(`mongodb-${mongoMode}-evidence.json`,JSON.stringify(mongoData,null,2),"application/json")}>Export evidence</button></aside></header>
              <nav className="module-tabs mongo-tabs">{(["explorer","documents","aggregations","schema","indexes","validation","explain","performance","sync"] as MongoMode[]).map(mode=><button key={mode} className={mongoMode===mode?"active":""} onClick={()=>{setMongoMode(mode);setMongoData(null)}}>{mode==="explorer"?"Collections":mode==="aggregations"?"Pipeline Builder":mode==="sync"?"Sync & Mirror":mode}</button>)}</nav>
              <div className="mongo-context"><span><i className={connectionState==="connected"&&form.engine==="mongodb"?"online":""}/>BUNDLED MONGODB DRIVER</span><b>{form.engine==="mongodb"?(form.host||"host not set"):"Select MongoDB adapter"}</b><small>{form.database||"admin"}</small>{!["explorer","sync"].includes(mongoMode)&&<label>COLLECTION<input list="mongo-collections" value={mongoCollection} onChange={event=>setMongoCollection(event.target.value)} placeholder="Select or enter collection"/></label>}<datalist id="mongo-collections">{catalog.filter(item=>item.type.includes("COLLECTION")||form.engine==="mongodb").map(item=><option key={`${item.schema}-${item.name}`} value={item.name}/>)}</datalist></div>
              {mongoMode==="explorer"&&<div className="module-controls mongo-controls"><div><label>DATABASE EXPLORER<strong>Collections, storage, indexes and deployment role</strong><small>Loads bounded collection metadata, database capacity, MongoDB version, replica-set or mongos role, and per-collection storage.</small></label></div><button className="primary" onClick={()=>runMongoStudio("explorer")} disabled={mongoBusy}>{mongoBusy?"Scanning database…":"Refresh collection explorer"}</button></div>}
              {mongoMode==="documents"&&<div className="module-controls mongo-controls"><div className="mongo-query-grid"><label>FILTER JSON<textarea value={mongoFilter} onChange={event=>setMongoFilter(event.target.value)} spellCheck={false}/></label><label>PROJECTION JSON<textarea value={mongoProjection} onChange={event=>setMongoProjection(event.target.value)} spellCheck={false}/></label><label>SORT JSON<textarea value={mongoSort} onChange={event=>setMongoSort(event.target.value)} spellCheck={false}/></label><label>LIMIT<input type="number" min="1" max="1000" value={mongoLimit} onChange={event=>setMongoLimit(event.target.value)}/><small>Maximum 1,000 BSON documents</small></label></div><button className="primary" onClick={()=>runMongoStudio("documents")} disabled={mongoBusy}>{mongoBusy?"Finding…":"Find documents"}</button></div>}
              {mongoMode==="aggregations"&&<div className="module-controls mongo-controls mongo-pipeline-controls"><div className="mongo-pipeline-library"><label>SAVED PIPELINE<select value={mongoPipelineId} onChange={event=>loadMongoPipeline(event.target.value)}><option value="">New pipeline…</option>{mongoPipelines.map(item=><option key={item.id} value={item.id}>{item.name} · {item.collection||"any collection"}</option>)}</select></label><label>PIPELINE NAME<input value={mongoPipelineName} onChange={event=>setMongoPipelineName(event.target.value)} placeholder="Operational workload summary"/></label><div><button className="secondary" onClick={saveMongoPipeline}>Save locally</button><button className="secondary" onClick={deleteMongoPipeline} disabled={!mongoPipelineId}>Delete</button></div></div><label className="mongo-pipeline-editor">AGGREGATION PIPELINE JSON<textarea value={mongoPipeline} onChange={event=>setMongoPipeline(event.target.value)} spellCheck={false}/><small>$out, $merge and change-stream stages are blocked. Disk use is disabled and output is bounded.</small></label><div className="mongo-pipeline-actions"><label>RESULT LIMIT<input type="number" min="1" max="1000" value={mongoLimit} onChange={event=>setMongoLimit(event.target.value)}/></label><button className="primary" onClick={()=>runMongoStudio("aggregations")} disabled={mongoBusy}>{mongoBusy?"Running pipeline…":"Run pipeline"}</button></div></div>}
              {mongoMode==="schema"&&<div className="module-controls mongo-controls"><div className="double-fields"><label>FILTER JSON<textarea value={mongoFilter} onChange={event=>setMongoFilter(event.target.value)} spellCheck={false}/></label><label>SAMPLE SIZE<input type="number" min="20" max="1000" value={mongoSampleSize} onChange={event=>setMongoSampleSize(event.target.value)}/><small>Reports field presence, BSON types, cardinality examples and numeric ranges.</small></label></div><button className="primary" onClick={()=>runMongoStudio("schema")} disabled={mongoBusy}>{mongoBusy?"Sampling schema…":"Analyze schema"}</button></div>}
              {mongoMode==="indexes"&&<div className="module-controls mongo-controls"><div><label>INDEX AUDIT<strong>Keys, uniqueness, TTL, partial, sparse, hidden and collation</strong><small>Read-only index metadata helps validate query plans and migration parity without creating or dropping indexes.</small></label></div><button className="primary" onClick={()=>runMongoStudio("indexes")} disabled={mongoBusy}>{mongoBusy?"Loading indexes…":"Inspect indexes"}</button></div>}
              {mongoMode==="validation"&&<div className="module-controls mongo-controls"><div><label>SCHEMA GOVERNANCE<strong>Validator, level, action, type and collation</strong><small>Displays the effective collection validation policy. Editing or bypassing validation is not exposed.</small></label></div><button className="primary" onClick={()=>runMongoStudio("validation")} disabled={mongoBusy}>{mongoBusy?"Reading validation…":"Inspect validation"}</button></div>}
              {mongoMode==="explain"&&<div className="module-controls mongo-controls"><div className="mongo-query-grid"><label>FILTER JSON<textarea value={mongoFilter} onChange={event=>setMongoFilter(event.target.value)} spellCheck={false}/></label><label>PROJECTION JSON<textarea value={mongoProjection} onChange={event=>setMongoProjection(event.target.value)} spellCheck={false}/></label><label>SORT JSON<textarea value={mongoSort} onChange={event=>setMongoSort(event.target.value)} spellCheck={false}/></label><label>LIMIT<input type="number" min="1" max="1000" value={mongoLimit} onChange={event=>setMongoLimit(event.target.value)}/><small>Uses executionStats verbosity.</small></label></div><button className="primary" onClick={()=>runMongoStudio("explain")} disabled={mongoBusy}>{mongoBusy?"Explaining…":"Explain query"}</button></div>}
              {mongoMode==="performance"&&<div className="module-controls mongo-controls"><div><label>LIVE PERFORMANCE COCKPIT<strong>Connections, queues, cache, active operations and replication</strong><small>The optional collection adds collStats context. No profiler, diagnostic parameter, or server setting is changed.</small></label></div><button className="primary" onClick={()=>runMongoStudio("performance")} disabled={mongoBusy}>{mongoBusy?"Collecting metrics…":"Refresh performance"}</button></div>}
              {mongoMode==="sync"&&<div className="mongo-sync-controls">
                <section><header><div><span>SYNC</span><p><b>mongosync Controller</b><small>State-aware local API lifecycle and progress</small></p></div><em>LOOPBACK ONLY</em></header><div className="mongo-sync-fields"><label>LOCAL API PORT<input value={mongosyncPort} onChange={event=>setMongosyncPort(event.target.value)}/></label><label>SOURCE ALIAS<input value={mongosyncSource} onChange={event=>setMongosyncSource(event.target.value)}/></label><label>DESTINATION ALIAS<input value={mongosyncDestination} onChange={event=>setMongosyncDestination(event.target.value)}/></label><label>INDEX BUILD<select value={mongosyncBuildIndexes} onChange={event=>setMongosyncBuildIndexes(event.target.value)}><option value="">mongosync default</option><option value="beforeDataCopy">Before data copy</option><option value="afterDataCopy">After data copy</option><option value="excludeHashedAfterCopy">Exclude hashed after copy</option><option value="never">Never</option></select></label></div><label className="mongo-toggle"><input type="checkbox" checked={mongosyncReversible} onChange={event=>setMongosyncReversible(event.target.checked)}/><i/>Create reversible migration when starting</label><label>EXPLICIT CONFIRMATION<input value={mongosyncConfirmation} onChange={event=>setMongosyncConfirmation(event.target.value)} placeholder="APPLY MONGOSYNC START / PAUSE / RESUME / COMMIT / REVERSE"/></label><div className="mongo-lifecycle"><button className="primary" onClick={()=>runMongosync("progress")} disabled={mongoBusy}>Refresh progress</button><button onClick={()=>runMongosync("start")} disabled={mongoBusy}>Start</button><button onClick={()=>runMongosync("pause")} disabled={mongoBusy}>Pause</button><button onClick={()=>runMongosync("resume")} disabled={mongoBusy}>Resume</button><button className="cutover" onClick={()=>runMongosync("commit")} disabled={mongoBusy}>Commit cutover</button><button className="cutover" onClick={()=>runMongosync("reverse")} disabled={mongoBusy}>Reverse</button></div><small className="safety-note">The controller reaches only 127.0.0.1. mongosync cluster URIs remain in the separately launched process and never enter this browser.</small></section>
                <section><header><div><span>MIR</span><p><b>Mirror Verification</b><small>Compare source and destination manifests</small></p></div><em>READ ONLY</em></header><div className="mongo-sync-fields"><label>DESTINATION HOST<input value={mirrorHost} onChange={event=>setMirrorHost(event.target.value)} placeholder="mongo-target.company.net"/></label><label>PORT<input value={mirrorPort} onChange={event=>setMirrorPort(event.target.value)}/></label><label>DATABASE<input value={mirrorDatabase} onChange={event=>setMirrorDatabase(event.target.value)} placeholder={form.database||"database"}/></label><label>TLS POLICY<select value={mirrorTlsMode} onChange={event=>setMirrorTlsMode(event.target.value as DbForm["tlsMode"])}><option value="require">Require trusted TLS</option><option value="prefer">Driver default</option><option value="disable">Disable TLS</option></select></label><label>USERNAME<input value={mirrorUsername} onChange={event=>setMirrorUsername(event.target.value)}/></label><label>PASSWORD<input type="password" autoComplete="off" value={mirrorPassword} onChange={event=>setMirrorPassword(event.target.value)}/></label></div><button className="primary" onClick={runMongoMirror} disabled={mongoBusy}>{mongoBusy?"Comparing manifests…":"Compare source and destination"}</button><div className="mongo-deprecation"><b>mongomirror compatibility</b><span>MongoDB ended mongomirror support on July 31, 2025. This workspace uses supported mongosync control and non-mutating mirror verification instead.</span></div></section>
              </div>}
              <section className="module-body mongo-body"><MongoStudioEvidence mode={mongoMode} data={mongoData} onSelectCollection={selectMongoCollection}/></section>
            </section>}
            {studioTool==="diagnostics"&&<section className="studio-module panel-dark advanced-diagnostics">
              <header className="module-head diagnostic-head"><div><i>DX</i><p><b>Advanced SQL Diagnostics & Incident Command</b><small>Symptom → engine-native evidence → correlation → prioritized DBA action plan</small></p></div><aside><span>{suiteProgress}</span><button className="secondary" onClick={exportDiagnosticReport} disabled={!diagnosticData&&!intelligenceData}>Export report</button><button className="primary" onClick={runPerformanceSuite} disabled={suiteBusy}>{suiteBusy?"Running full suite…":"Run full performance suite"}</button></aside></header>
              <nav className="module-tabs diagnostic-tabs">{(["incident","health","check","statement","recommend","runtime","deepdive","engines","xray","plans","recorder","rules"] as DiagnosticMode[]).map(mode=><button key={mode} className={diagnosticMode===mode?"active":""} onClick={()=>{setDiagnosticMode(mode);if(["deepdive","engines"].includes(mode))setIntelligenceMode("bottleneck");if(mode==="xray")setIntelligenceMode("xray");if(mode==="plans")setIntelligenceMode("plans");if(["deepdive","engines","xray","plans"].includes(mode))setIntelligenceData(null);else if(!["recorder","rules"].includes(mode))setDiagnosticData(null)}}>{diagnosticLabels[mode]}</button>)}</nav>
              <div className="diagnostic-context"><span><i/>READ-ONLY DEFAULT</span><b>{adapterDefaults[form.engine].name}</b><small>{environment}</small>{form.engine==="oracle"&&<label>ORACLE SCOPE<select value={packScope} onChange={event=>setPackScope(event.target.value as any)}><option value="core">Core only</option><option value="diagnostics">Diagnostics Pack</option><option value="tuning">Diagnostics + Tuning</option></select></label>}<label className="diagnostic-id">STATEMENT / OPERATION IDENTIFIER<input value={diagnosticIdentifier} onChange={event=>{setDiagnosticIdentifier(event.target.value);setIntelligenceIdentifier(event.target.value)}} placeholder={form.engine==="oracle"?"13-character SQL_ID":form.engine==="postgres"?"queryid":form.engine==="mongodb"?"operation id or comment":["mysql","mariadb"].includes(form.engine)?"64-character statement digest":"0x query hash"}/></label></div>
              {diagnosticMode==="incident"&&<section className="incident-command-center">
                <header><div><span>DBA</span><p><b>Choose the incident symptom</b><small>DBridge selects the smallest useful engine-native evidence pack. Optional identifiers sharpen statement-level checks.</small></p></div><em>{adapterDefaults[form.engine].name} · {environment}</em></header>
                <div className="incident-playbook-grid">{(incidentCatalog.playbooks||[]).map((playbook:any)=><button key={playbook.id} className={incidentPlaybook===playbook.id?"active":""} onClick={()=>{setIncidentPlaybook(playbook.id);setDiagnosticData(null)}}><i>{playbook.mark}</i><span><b>{playbook.label}</b><small>{playbook.description}</small></span><em>{playbook.engineCounts?.[form.engine]||0} checks</em></button>)}</div>
                {form.engine==="mongodb"&&<label className="incident-collection">OPTIONAL COLLECTION<input value={mongoCollection} onChange={event=>setMongoCollection(event.target.value)} placeholder="orders"/><small>Collection-specific index and plan-cache checks are skipped when empty.</small></label>}
                {(()=>{const active=(incidentCatalog.playbooks||[]).find((item:any)=>item.id===incidentPlaybook);return <footer><div><span>VERIFY-FIRST</span><p><b>{active?.label||"Select a playbook"}</b><small>{active?.verify||incidentCatalog.safety}</small></p></div><button className="primary" onClick={runIncidentDiagnostic} disabled={diagnosticBusy||!active}>{diagnosticBusy?"Correlating evidence…":"Run targeted incident diagnostic"}</button></footer>})()}
              </section>}              {["health","check","statement","recommend","runtime"].includes(diagnosticMode)&&<div className="module-controls diagnostic-controls"><div><label>FOCUSED OPERATION<strong>{diagnosticLabels[diagnosticMode]}</strong><small>{diagnosticMode==="health"?"Capture sessions, waits, throughput, average elapsed time, logical/physical reads and errors.":diagnosticMode==="check"?"Run one fixed engine-specific wait, I/O, memory, capacity, maintenance or plan check.":diagnosticMode==="statement"?"Retrieve raw evidence for the selected SQL_ID, queryid, digest, operation ID or query hash.":diagnosticMode==="recommend"?"Rank workload metrics using local environment-specific thresholds and produce verification-first actions.":"Collect retained statement, wait, plan-history and timeline evidence without enabling database tracing."}</small></label></div>{diagnosticMode==="check"&&<label>TUNING CHECK<select value={diagnosticCheck} onChange={event=>setDiagnosticCheck(event.target.value)}>{Object.entries(diagnosticCatalog[form.engine]||{}).map(([id,item])=><option key={id} value={id}>{item.label}</option>)}</select><small>{diagnosticCatalog[form.engine]?.[diagnosticCheck]?.guidance}</small></label>}<button className="primary" onClick={runDiagnostic} disabled={diagnosticBusy}>{diagnosticBusy?"Collecting evidence…":"Run focused diagnostic"}</button></div>}
              {diagnosticMode==="deepdive"&&<div className="module-controls diagnostic-controls"><div><label>ENGINE-WIDE ANALYSIS<strong>{enginePackDefinitions[form.engine]?`${enginePackDefinitions[form.engine].checks}-check ${adapterDefaults[form.engine].name} intelligence`:"Choose a full diagnostic engine"}</strong><small>Correlates concurrency, waits, CPU, memory, I/O, plans, statistics, maintenance, replication and reliability into a pressure map and cause chain.</small></label></div><button className="primary" onClick={()=>runIntelligence()} disabled={intelligenceBusy}>{intelligenceBusy?"Analyzing…":"Run engine deep dive"}</button></div>}
              {diagnosticMode==="engines"&&<div className="module-controls diagnostic-controls engine-pack-controls"><div><label>SELECTED DATABASE PACK<strong>{enginePackDefinitions[form.engine]?`${adapterDefaults[form.engine].name} · ${enginePackDefinitions[form.engine].checks} checks`:"SQL workspace only"}</strong><small>{enginePackDefinitions[form.engine]?.boundary||"Choose a full-diagnostics adapter to use engine-native incident evidence."}</small></label></div><button className="primary" onClick={()=>runIntelligence()} disabled={intelligenceBusy||!diagnosticEngines.has(form.engine)}>{intelligenceBusy?"Analyzing…":"Run selected database pack"}</button></div>}
              {diagnosticMode==="xray"&&<div className="module-controls diagnostic-controls"><label>ORACLE SQL_ID CHECK<select value={xrayCheck} onChange={event=>setXrayCheck(event.target.value)}>{xrayCatalog.map(item=><option key={item.id} value={item.id}>{item.label} · {item.phase}</option>)}</select><small>{xrayCatalog.find(item=>item.id===xrayCheck)?.guidance}</small></label><div><label>LICENSE BOUNDARY<strong>{packScope==="core"?"Core fixed views":packScope==="diagnostics"?"Diagnostics Pack explicitly selected":"Diagnostics + Tuning explicitly selected"}</strong><small>AWR, ASH and SQL Monitor checks are skipped unless their required scope is selected.</small></label></div><div className="version-actions"><button className="secondary" onClick={()=>runIntelligence()} disabled={intelligenceBusy}>Run selected check</button><button className="primary" onClick={runXraySequence} disabled={intelligenceBusy}>Run licensed sequence ({xrayCatalog.length||22})</button></div></div>}
              {diagnosticMode==="plans"&&<div className="module-controls diagnostic-controls"><label>BASELINE NAME<input value={baselineName} onChange={event=>setBaselineName(event.target.value)} placeholder="Approved plan baseline"/><small>Stored locally with normalized operators; passwords and SQL bind values are not included.</small></label><div><label>PLAN WORKFLOW<strong>Capture, history and regression evidence</strong><small>Oracle cursor plans, PostgreSQL pg_stat_statements, MongoDB profiler, MySQL/MariaDB Performance Schema and SQL Server Query Store.</small></label></div><div className="version-actions"><button className="primary" onClick={()=>runIntelligence("capture")} disabled={intelligenceBusy}>Capture current plan</button><button className="secondary" onClick={()=>runIntelligence("history")} disabled={intelligenceBusy}>Plan history</button><button className="secondary" onClick={savePlanBaseline} disabled={!intelligenceData?.planText}>Save baseline</button></div></div>}
              {diagnosticMode==="recorder"&&<div className="module-controls diagnostic-controls"><label>RECORDING NAME<input value={recordingName} onChange={event=>setRecordingName(event.target.value)}/></label><div><label>10-SECOND FLIGHT RECORDER<strong>{recordingSamples.length} samples captured</strong><small>Tracks active/waiting sessions, executions, latency, reads, throughput and errors without enabling tracing.</small></label></div><div className="version-actions"><button className="secondary" onClick={()=>captureRecorderSample(true).catch(error=>notify(error.message))} disabled={recordingActive}>Capture once</button><button className="primary" onClick={startRecorder} disabled={recordingActive}>Start</button><button className="secondary" onClick={stopRecorder} disabled={!recordingActive}>Stop</button><button className="secondary" onClick={saveRecording} disabled={!recordingSamples.length}>Save</button></div></div>}
              {diagnosticMode==="rules"&&<div className="module-controls diagnostic-controls"><div><label>ENVIRONMENT-SPECIFIC THRESHOLDS<strong>{(investigationStore.rules||[]).length} recommendation signals</strong><small>Warning and high thresholds directly control recommendation severity for the current local evidence store.</small></label></div><button className="primary" onClick={saveTuningRules}>Save thresholds</button></div>}
              <section className="module-body diagnostic-body">
                {diagnosticMode==="incident"&&(!diagnosticData?<div className="incident-empty"><span>360</span><b>One symptom, one correlated DBA report</b><small>Select slow SQL, blocking, CPU, I/O, memory, replication, capacity, or reliability. Checks that need an identifier, license, version, collection, or privilege are marked unavailable—not healthy.</small><div><em>READ-ONLY</em><em>ENGINE-NATIVE</em><em>EVIDENCE GAPS</em><em>SAFE ACTION PLAN</em></div></div>:<IncidentDiagnosticEvidence data={diagnosticData} engine={form.engine}/>)}
                {["health","check","statement","recommend","runtime"].includes(diagnosticMode)&&(!diagnosticData?<div className="diagnostic-empty"><section><span>01</span><b>Observe workload</b><small>Sessions, CPU, waits and throughput</small></section><i/><section><span>02</span><b>Focus statement</b><small>SQL_ID, queryid, digest or hash</small></section><i/><section><span>03</span><b>Compare plans</b><small>Estimates, actual work and history</small></section><i/><section><span>04</span><b>Verify safely</b><small>Evidence-backed next action</small></section><p>Run one focused diagnostic or use the full suite. All collectors are fixed and read-only; recommendations never apply a database change.</p></div>:<PerformanceEvidence data={diagnosticData} engine={form.engine}/>) }
                {diagnosticMode==="engines"&&<><EnginePackMatrix engine={form.engine}/>{intelligenceData&&<PerformanceEvidence data={intelligenceData} engine={form.engine}/>}</>}
                {["deepdive","xray","plans"].includes(diagnosticMode)&&(!intelligenceData?<div className="module-empty"><span>{diagnosticMode==="xray"?"XRY":diagnosticMode==="plans"?"PLAN":"360"}</span><b>{diagnosticLabels[diagnosticMode]} is ready</b><small>{diagnosticMode==="deepdive"?"Run the complete engine analyzer to build a pressure map, dominant mode and cause/impact/verification chain.":diagnosticMode==="xray"?"Enter an Oracle SQL_ID, select the licensed scope, then run one check or the complete permitted sequence.":"Enter a statement identifier to capture the current retained plan or compare its plan history."}</small></div>:<PerformanceEvidence data={intelligenceData} engine={form.engine}/>) }
                {diagnosticMode==="recorder"&&(recordingSamples.length?<><div className="metric-cards performance-metrics">{Object.entries(recordingSamples.at(-1)?.metrics||{}).map(([key,value])=><article key={key}><small>{key.replaceAll("_"," ")}</small><b>{String(value)}</b></article>)}</div><div className="recording-strip">{recordingSamples.slice(-60).map((sample,index)=><span key={index} style={{height:Math.max(4,Math.min(70,Number(sample.metrics?.active_sessions||0)*3+4))}} title={sample.collectedAt}/>)}</div><div className="methodology-card"><div><span>{recordingActive?"LIVE":"REC"}</span><p><b>{recordingActive?"Flight recorder active":"Recording ready to save"}</b><small>{recordingSamples.length} samples · latest {recordingSamples.at(-1)?.collectedAt}</small></p></div></div></>:<div className="module-empty"><span>REC</span><b>No performance samples yet</b><small>Capture once or start the timed recorder while the slowdown is active.</small></div>)}
                {diagnosticMode==="rules"&&<div className="rule-grid performance-rules">{(investigationStore.rules||[]).map((rule:any,index:number)=><article key={rule.id}><div><b>{rule.name}</b><small>{rule.metric} · {rule.unit}</small></div><label>WARNING<input type="number" value={rule.warning} onChange={event=>setInvestigationStore((store:any)=>({...store,rules:store.rules.map((item:any,i:number)=>i===index?{...item,warning:Number(event.target.value)}:item)}))}/></label><label>HIGH<input type="number" value={rule.high} onChange={event=>setInvestigationStore((store:any)=>({...store,rules:store.rules.map((item:any,i:number)=>i===index?{...item,high:Number(event.target.value)}:item)}))}/></label></article>)}</div>}
              </section>
            </section>}

            {studioTool==="intelligence"&&<section className="studio-module panel-dark engine-intelligence-studio">
              <header className="module-head"><div><i>AI</i><p><b>Engine Intelligence</b><small>Six engine-native analysis packs · statement X-Ray · plans · resilience</small></p></div><span>{adapterDefaults[form.engine].name} · {environment}</span></header>
              <nav className="module-tabs">{(["overview","bottleneck","xray","plans","resilience","goldengate"] as IntelligenceMode[]).map(mode=><button key={mode} className={intelligenceMode===mode?"active":""} onClick={()=>{setIntelligenceMode(mode);setIntelligenceData(null)}}>{mode==="overview"?"Database packs":mode==="bottleneck"?"Bottleneck deep dive":mode==="xray"?"Statement X-Ray":mode==="plans"?"Plans & regression":mode==="resilience"?"HA & replication":"Oracle GoldenGate"}</button>)}</nav>
              <div className="intelligence-engine-strip">{Object.entries(enginePackDefinitions).map(([id,pack])=><button key={id} className={form.engine===id?"active":""} onClick={()=>{selectEngine(id);setIntelligenceData(null)}}><i>{pack.mark}</i><span><b>{adapterDefaults[id].name}</b><small>{pack.checks} checks · {pack.focus}</small></span></button>)}</div>
              <div className="module-controls intelligence-controls">
                {intelligenceMode==="overview"&&<div className="intelligence-overview-note"><span>{enginePackDefinitions[form.engine]?.mark||"DBX"}</span><p><b>{enginePackDefinitions[form.engine]?adapterDefaults[form.engine].name+" intelligence is selected":"Select one of the six database packs"}</b><small>{enginePackDefinitions[form.engine]?.boundary||"Each pack uses engine-native, fixed read-only collectors and keeps its own identifier, evidence, and safety boundary."}</small></p></div>}
                {intelligenceMode==="bottleneck"&&<><label>OPTIONAL {enginePackDefinitions[form.engine]?.focus?.toUpperCase()||"IDENTIFIER"}<input value={intelligenceIdentifier} onChange={event=>setIntelligenceIdentifier(event.target.value)} placeholder={form.engine==="oracle"?"13-character SQL_ID":form.engine==="postgres"?"queryid":form.engine==="mongodb"?"operation id or comment":form.engine==="mysql"||form.engine==="mariadb"?"64-character digest":form.engine==="sqlserver"?"0x + 16-character query hash":"Select a database pack"}/></label>{form.engine==="oracle"&&<label>ORACLE LICENSE SCOPE<select value={packScope} onChange={event=>setPackScope(event.target.value as any)}><option value="core">Core views only</option><option value="diagnostics">Diagnostics Pack</option><option value="tuning">Diagnostics + Tuning Pack</option></select></label>}<p>{enginePackDefinitions[form.engine]?"Runs "+enginePackDefinitions[form.engine].checks+" engine-native checks. "+enginePackDefinitions[form.engine].boundary:"Choose Oracle, PostgreSQL, MongoDB, MySQL, MariaDB, or SQL Server above."}</p><button className="primary" onClick={()=>runIntelligence()} disabled={intelligenceBusy||!diagnosticEngines.has(form.engine)}>Run deep dive</button></>}
                {intelligenceMode==="xray"&&form.engine==="oracle"&&<><label>ORACLE SQL_ID<input value={intelligenceIdentifier} onChange={event=>setIntelligenceIdentifier(event.target.value)} placeholder="8m5j1t2y4n6p9"/></label><label>LICENSE SCOPE<select value={packScope} onChange={event=>setPackScope(event.target.value as any)}><option value="core">Core views only</option><option value="diagnostics">Diagnostics Pack</option><option value="tuning">Diagnostics + Tuning Pack</option></select></label><label>INVESTIGATION CHECK<select value={xrayCheck} onChange={event=>setXrayCheck(event.target.value)}>{xrayCatalog.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div className="version-actions"><button className="secondary" onClick={()=>runIntelligence()} disabled={intelligenceBusy}>Run selected</button><button className="primary" onClick={runXraySequence} disabled={intelligenceBusy}>Run licensed sequence ({xrayCatalog.length||22})</button></div></>}
                {intelligenceMode==="xray"&&form.engine!=="oracle"&&<><label>{enginePackDefinitions[form.engine]?.focus?.toUpperCase()||"STATEMENT IDENTIFIER"}<input value={intelligenceIdentifier} onChange={event=>setIntelligenceIdentifier(event.target.value)} placeholder={form.engine==="postgres"?"queryid":form.engine==="mongodb"?"operation id or comment":form.engine==="mysql"||form.engine==="mariadb"?"64-character statement digest":form.engine==="sqlserver"?"0x + 16-character query hash":"Select a database pack"}/></label><p>{enginePackDefinitions[form.engine]?"Captures one focused "+adapterDefaults[form.engine].name+" runtime window and correlates retained statement, wait, I/O, lock, plan, and workload evidence.":"Choose one of the six supported engines above."}</p><button className="primary" onClick={()=>runIntelligence()} disabled={intelligenceBusy||!diagnosticEngines.has(form.engine)}>Run statement X-Ray</button></>}
                {intelligenceMode==="plans"&&<><label>{enginePackDefinitions[form.engine]?.focus?.toUpperCase()||"STATEMENT IDENTIFIER"}<input value={intelligenceIdentifier} onChange={event=>setIntelligenceIdentifier(event.target.value)} placeholder="SQL_ID, queryid, digest, operation ID, or query hash"/></label><label>BASELINE NAME<input value={baselineName} onChange={event=>setBaselineName(event.target.value)} placeholder="Approved plan baseline"/></label><p>Capture the plan representation supported by {adapterDefaults[form.engine].name}, compare retained history, and save a local approved reference. The studio never forces a plan.</p><div className="version-actions"><button className="primary" onClick={()=>runIntelligence("capture")} disabled={intelligenceBusy||!diagnosticEngines.has(form.engine)}>Capture plan</button><button className="secondary" onClick={()=>runIntelligence("history")} disabled={intelligenceBusy||!diagnosticEngines.has(form.engine)}>Plan history</button><button className="secondary" onClick={savePlanBaseline} disabled={!intelligenceData?.planText}>Save baseline</button></div></>}
                {intelligenceMode==="resilience"&&<><div><label>{adapterDefaults[form.engine].name.toUpperCase()} RESILIENCE<strong>{enginePackDefinitions[form.engine]?.capabilities.filter(item=>/RAC|replica|replication|WAL|HADR|shard|redo|checkpoint/i.test(item)).join(" · ")||"Select a database pack"}</strong><small>Reviews only the high-availability, replication, checkpoint, redo/WAL, and recovery signals already exposed by the selected engine.</small></label></div><p>{enginePackDefinitions[form.engine]?.boundary||"Choose one of the six supported engines above."}</p><button className="primary" onClick={()=>runIntelligence()} disabled={intelligenceBusy||!diagnosticEngines.has(form.engine)}>Run resilience analysis</button></>}
                {intelligenceMode==="goldengate"&&<><div className="goldengate-boundary"><span>ORA</span><p><b>Oracle replication tooling</b><small>GoldenGate remains an Oracle-specific workflow while the engine strip stays available for immediate context switching.</small></p></div><div className="triple-fields"><label>ARCHITECTURE<select value={goldenArchitecture} onChange={event=>setGoldenArchitecture(event.target.value as any)}><option value="microservices">Microservices / Admin Client</option><option value="classic">Classic / GGSCI over SSH</option></select></label><label>DIAGNOSTIC<select value={goldenAction} onChange={event=>setGoldenAction(event.target.value)}>{["overview","lag","messages","extract","replicat","checkpoints","versions"].map(action=><option key={action}>{action}</option>)}</select></label><label>PROCESS GROUP<input value={goldenGroup} onChange={event=>setGoldenGroup(event.target.value)} placeholder="Optional, e.g. EXTORD"/></label></div>{goldenArchitecture==="microservices"?<div className="triple-fields"><label>ADMIN SERVICE URL<input value={goldenEndpoint} onChange={event=>setGoldenEndpoint(event.target.value)}/></label><label>WALLET ALIAS<input value={goldenCredential} onChange={event=>setGoldenCredential(event.target.value)} placeholder="admin"/></label><label>DEPLOYMENT<input value={goldenDeployment} onChange={event=>setGoldenDeployment(event.target.value)} placeholder="Optional"/></label></div>:<><div className="triple-fields"><label>SSH HOST<input value={goldenHost} onChange={event=>setGoldenHost(event.target.value)}/></label><label>SSH USER<input value={goldenUser} onChange={event=>setGoldenUser(event.target.value)}/></label><label>PORT<input value={goldenPort} onChange={event=>setGoldenPort(event.target.value)}/></label></div><label>OGG HOME<input value={goldenHome} onChange={event=>setGoldenHome(event.target.value)}/></label></>}<button className="primary" onClick={()=>runIntelligence()} disabled={intelligenceBusy}>Run GoldenGate diagnostic</button><small className="safety-note">Read-only diagnostics only. Wallet secrets remain in the Oracle wallet; process start, stop and alter commands are not exposed.</small></>}
              </div>
              <section className="module-body">{intelligenceMode==="overview"?<EnginePackMatrix engine={form.engine}/>:!intelligenceData?<div className="module-empty"><span>{enginePackDefinitions[form.engine]?.mark||"AI"}</span><b>{intelligenceMode==="goldengate"?"Oracle GoldenGate evidence":adapterDefaults[form.engine].name+" "+intelligenceMode+" intelligence"}</b><small>{intelligenceMode==="goldengate"?"Run a read-only GoldenGate diagnostic. Process control is intentionally not exposed.":"The selected "+adapterDefaults[form.engine].name+" pack keeps engine-native evidence, identifiers, and safety boundaries. No trace, database setting, plan, session, or instrumentation is changed."}</small></div>:["bottleneck","resilience"].includes(intelligenceMode)?<PerformanceEvidence data={intelligenceData} engine={form.engine}/>:<GenericEvidence data={intelligenceData} label={intelligenceMode==="goldengate"?"GoldenGate evidence":"Engine intelligence"}/>}</section>
            </section>}
            {studioTool==="observability"&&<section className="studio-module panel-dark observability-studio">
              <header className="module-head"><div><i>LG</i><p><b>Logs, Traces & Migration Evidence</b><small>Export/import reconciliation, database logs, remote Linux evidence and trace analysis</small></p></div><span>Local-only · 3.5 MB per pasted log</span></header>
              <nav className="module-tabs observe-tabs">{(["compare","native","local","remote","trace","telemetry","tkprof"] as ObserveMode[]).map(mode=><button key={mode} className={observeMode===mode?"active":""} onClick={()=>{setObserveMode(mode);setObserveData(null)}}>{mode==="compare"?"Migration Log Compare":mode==="native"?"Database logs":mode==="local"?"Local file":mode==="remote"?"Remote Linux":mode==="trace"?"Trace analyzer":mode==="telemetry"?"Cloud telemetry":"Oracle TKPROF"}</button>)}</nav>
              <div className={"module-controls observe-controls "+(observeMode==="compare"?"migration-compare-controls":"")}>
                {observeMode==="compare"&&<div className="migration-compare-builder">
                  <header><label>DATABASE / TOOL FORMAT<select value={migrationEngine} onChange={event=>setMigrationEngine(event.target.value)}><option value="auto">Auto-detect tool format</option><option value="oracle">Oracle Data Pump · expdp / impdp</option><option value="postgres">PostgreSQL · pg_dump / pg_restore</option><option value="mysql">MySQL · mysqldump / mysql</option><option value="mariadb">MariaDB · mariadb-dump / mariadb</option><option value="sqlserver">SQL Server · SqlPackage / BACPAC / bcp</option><option value="mongodb">MongoDB · mongodump / mongorestore</option></select></label><label className="migration-check"><input type="checkbox" checked={migrationIgnoreTimestamps} onChange={event=>setMigrationIgnoreTimestamps(event.target.checked)}/><span><b>Normalize timestamps</b><small>Compare useful evidence instead of run times and durations.</small></span></label><div className="version-actions"><button className="secondary" onClick={()=>{const left=migrationExportLog;setMigrationExportLog(migrationImportLog);setMigrationImportLog(left);setObserveData(null)}}>Swap logs</button><button className="secondary" onClick={()=>{setMigrationExportLog("");setMigrationImportLog("");setObserveData(null)}}>Clear</button></div></header>
                  <div className="migration-log-panes"><label><span><b>01 · EXPORT / SOURCE LOG</b><small>expdp, pg_dump, mysqldump, SqlPackage export, mongodump</small></span><textarea value={migrationExportLog} onChange={event=>setMigrationExportLog(event.target.value)} maxLength={3500000} spellCheck={false} placeholder={'Paste the complete export log here. Data Pump row example: . . exported "HR"."EMPLOYEES" 17.31 KB 107 rows'}/><em>{migrationExportLog.length.toLocaleString()} characters</em></label><label><span><b>02 · IMPORT / TARGET LOG</b><small>impdp, pg_restore, mysql/mariadb client, SqlPackage import, mongorestore</small></span><textarea value={migrationImportLog} onChange={event=>setMigrationImportLog(event.target.value)} maxLength={3500000} spellCheck={false} placeholder={'Paste the complete import log here. Data Pump row example: . . imported "HR"."EMPLOYEES" 17.31 KB 107 rows'}/><em>{migrationImportLog.length.toLocaleString()} characters</em></label></div>                  <footer><div><span>DDL</span><p><b>Object reconciliation</b><small>Tables, indexes, constraints, views, routines and utility-specific object evidence.</small></p></div><i/><div><span>ROWS</span><p><b>Exact count comparison</b><small>Shown only when both logs expose trustworthy per-object counts.</small></p></div><i/><div><span>DIFF</span><p><b>Side-by-side redline</b><small>Missing, changed and unexpected log lines with source line numbers.</small></p></div><i/><div><span>SQL</span><p><b>Verification generator</b><small>Read-only destination checks for anything the logs cannot prove.</small></p></div></footer>
                </div>}
                {observeMode==="native"&&<><label>HISTORY WINDOW<select value={observeHours} onChange={event=>setObserveHours(event.target.value)}>{["1","6","12","24","48","72"].map(hour=><option key={hour} value={hour}>{hour} hours</option>)}</select></label><p>Reads Oracle alert, PostgreSQL current log, MongoDB global log, MySQL error log, or SQL Server error log using the active connection.</p></>}
                {observeMode==="local"&&<label>LOCAL LOG PATH<input value={observePath} onChange={event=>setObservePath(event.target.value)} placeholder="C:/logs/database/alert.log"/></label>}
                {observeMode==="remote"&&<><div className="triple-fields"><label>LINUX HOST<input value={remoteHost} onChange={event=>setRemoteHost(event.target.value)} placeholder="db-server.company.net"/></label><label>SSH USER<input value={remoteUser} onChange={event=>setRemoteUser(event.target.value)} placeholder="logreader"/></label><label>PORT<input value={remotePort} onChange={event=>setRemotePort(event.target.value)}/></label></div><label>REMOTE LOG PATH<input value={remotePath} onChange={event=>setRemotePath(event.target.value)} placeholder="/var/log/postgresql/postgresql.log"/></label></>}
                {observeMode==="trace"&&<><label>TRACE FILE PATH<input value={observePath} onChange={event=>setObservePath(event.target.value)} placeholder="C:/traces/database.trc"/></label>{form.engine==="oracle"&&<><label>PASTED TRACE NAME<input value={traceName} onChange={event=>setTraceName(event.target.value)}/></label><label>ORACLE 10046 / 10053 TRACE<textarea value={traceText} onChange={event=>setTraceText(event.target.value)} placeholder="Paste trace text here, or leave empty to analyze the local trace path…"/></label></>}</>}
                {observeMode==="telemetry"&&<><label>TELEMETRY SOURCE<select value={telemetrySource} onChange={event=>setTelemetrySource(event.target.value)}>{["snowflake","bigquery","redshift","synapse","databricks","fabric","athena","cloudsql","rds","aurora","alloydb"].map(source=><option key={source}>{source}</option>)}</select></label><label>RESOURCE / LOG GROUP<input value={telemetryTarget} onChange={event=>setTelemetryTarget(event.target.value)} placeholder="Warehouse, cluster, project, or log group"/></label><p>Uses the approved local cloud CLI and its existing authenticated context.</p></>}
                {observeMode==="tkprof"&&<><label>ORACLE TRACE FILE<input value={observePath} onChange={event=>setObservePath(event.target.value)} placeholder="C:/oracle/diag/trace/session.trc"/></label><label>SORT<select value={tkprofSort} onChange={event=>setTkprofSort(event.target.value)}>{["exeela","execpu","exedsk","exequery","exerow","fchela","fchrow","prsela"].map(item=><option key={item}>{item}</option>)}</select></label><label>STATEMENT LIMIT<input value={tkprofPrint} onChange={event=>setTkprofPrint(event.target.value)}/></label></>}
                <button className="primary" onClick={runObservability} disabled={observeBusy||(observeMode==="compare"&&(!migrationExportLog.trim()||!migrationImportLog.trim()))}>{observeBusy?"Analyzing…":observeMode==="compare"?"Compare migration logs":observeMode==="trace"?"Analyze trace":observeMode==="tkprof"?"Run TKPROF":observeMode==="telemetry"?"Collect telemetry":"Collect logs"}</button>
              </div>
              <section className="module-body">
                {observeMode==="compare"?(!observeData?<div className="migration-empty"><span>LOG Δ</span><b>Paste export and import logs to reconcile the migration</b><small>The local analyzer finds errors, missing DDL evidence, row-count differences, and line-level changes without storing or uploading either log.</small><div><em>1</em><p><b>Paste both logs</b><small>Complete verbose output gives the strongest evidence.</small></p><i/><em>2</em><p><b>Compare objects and rows</b><small>Silence is labeled unverified, never assumed successful.</small></p><i/><em>3</em><p><b>Run generated checks</b><small>Use read-only SQL for final database proof.</small></p></div></div>:observeData.summary?<MigrationComparisonEvidence data={observeData} showMatches={migrationShowMatches} onShowMatches={setMigrationShowMatches} onExportJson={exportMigrationComparison} onExportCsv={exportMigrationObjectCsv} onCopyVerification={copyMigrationVerification}/>:<GenericEvidence data={observeData} label="Migration log comparison"/>):<>
                  {!observeData&&<div className="module-empty"><span>LOG</span><b>One evidence surface for database and host logs</b><small>Remote collection uses strict host-key checking. Local files never leave this laptop, and pasted Oracle traces are processed only by the loopback agent.</small></div>}
                  {observeData&&<div className="evidence-view log-output">
                    <header><div><i className={observeData.ok===false?"bad":"good"}/><p><b>{observeData.ok===false?"Collection failed":"Evidence ready"}</b><small>{observeData.error||observeData.path||observeData.server||observeData.analyzedAt||observeData.collectedAt||"Local analysis complete"}</small></p></div><span>{observeData.rotated?"rotated":"current"}</span></header>
                    {(observeData.text||observeData.stdout||observeData.stderr)&&<pre>{[observeData.text,observeData.stdout,observeData.stderr].filter(Boolean).join(String.fromCharCode(10,10))}</pre>}
                    {observeData.analysis&&<div className="trace-summary"><div>{Object.entries(observeData.analysis).filter(([,value])=>typeof value!=="object").slice(0,12).map(([key,value])=><article key={key}><small>{key.replaceAll("_"," ")}</small><b>{String(value)}</b></article>)}</div><details className="raw-evidence" open><summary>Trace analysis</summary><pre>{JSON.stringify(observeData.analysis,null,2)}</pre></details></div>}
                  </div>}
                </>}
              </section>
            </section>}
            {studioTool==="devops"&&<section className="studio-module panel-dark devops-studio">
              <header className="module-head"><div><i>DO</i><p><b>DevOps & Remote Operations</b><small>Visual Kubernetes, Docker, Git/GitHub, Ansible, delivery evidence and verified SSH</small></p></div><span>{Object.values(toolInventory).filter(tool=>tool.available).length}/{Object.keys(toolInventory).length||20} tools ready</span></header>
              <nav className="module-tabs devops-tabs">{(["kubernetes","docker","github","ansible","tooling","delivery","ssh","changes"] as DevopsMode[]).map(mode=><button key={mode} className={devopsMode===mode?"active":""} onClick={()=>{setDevopsMode(mode);setDevopsData(null);setDevopsSearch("")}}>{mode==="kubernetes"?"Kubernetes GUI":mode==="docker"?"Docker GUI":mode==="github"?"Git & GitHub":mode==="ansible"?"Ansible GUI":mode==="tooling"?"Toolbox":mode==="delivery"?"Delivery & Kafka":mode==="ssh"?"SSH terminals":"Controlled changes"}</button>)}</nav>
              <div className="module-controls devops-controls">
                {devopsMode==="kubernetes"&&<><div className="double-fields"><label>KUBE CONTEXT<input value={kubeContext} onChange={event=>setKubeContext(event.target.value)} placeholder="Current context when empty"/></label><label>NAMESPACE<input value={kubeNamespace} onChange={event=>setKubeNamespace(event.target.value)} placeholder="default"/></label></div><div className="ops-view-toolbar"><nav className="ops-view-switcher">{(["overview","workloads","compute","network","events"] as KubeGuiView[]).map(view=><button key={view} className={kubeView===view?"active":""} onClick={()=>setKubeView(view)}>{view}</button>)}</nav><label>SEARCH RESOURCES<input value={devopsSearch} onChange={event=>setDevopsSearch(event.target.value)} placeholder="pod, node, warning…"/></label></div><p>A Lens-style resource explorer for cluster health, workloads, services, metrics, and warning events.</p></>}
                {devopsMode==="docker"&&<><div className="double-fields"><label>CONTAINER FOR DETAILS<input value={dockerTarget} onChange={event=>setDockerTarget(event.target.value)} placeholder="Required only for Logs & inspect"/></label><label>SEARCH RESOURCES<input value={devopsSearch} onChange={event=>setDevopsSearch(event.target.value)} placeholder="container, image, port…"/></label></div><div className="ops-view-toolbar"><nav className="ops-view-switcher">{(["overview","containers","images","storage","network","logs"] as DockerGuiView[]).map(view=><button key={view} className={dockerView===view?"active":""} onClick={()=>setDockerView(view)}>{view==="logs"?"Logs & inspect":view}</button>)}</nav></div><p>Docker Desktop-style visibility for containers, images, volumes, networks, capacity, stats, logs, inspect data, and processes.</p></>}
                {devopsMode==="github"&&<><div className="double-fields"><label>WORKSPACE SOURCE<select value={gitSource} onChange={event=>{setGitSource(event.target.value as "github"|"git");setGitView("overview");setDevopsData(null)}}><option value="github">GitHub cloud via gh</option><option value="git">Local Git working tree</option></select></label>{gitSource==="github"?<label>GITHUB REPOSITORY<input value={gitRepository} onChange={event=>setGitRepository(event.target.value)} placeholder="owner/repository (optional)"/></label>:<label>WORKING FOLDER<input value={gitCwd} onChange={event=>setGitCwd(event.target.value)} placeholder="C:\work\repository"/></label>}</div><div className="ops-view-toolbar"><nav className="ops-view-switcher">{(gitSource==="github"?["overview","repositories","pullRequests","workflows","issues"]:["overview","status","branches","commits","diff"]).map(view=><button key={view} className={gitView===view?"active":""} onClick={()=>setGitView(view as GitGuiView)}>{view.replace(/([A-Z])/g," $1")}</button>)}</nav><label>SEARCH GIT EVIDENCE<input value={devopsSearch} onChange={event=>setDevopsSearch(event.target.value)} placeholder="branch, author, PR…"/></label></div><p>A GitKraken-inspired operations workspace for local history plus authenticated GitHub repositories, PRs, issues, and workflow runs.</p></>}
                {devopsMode==="ansible"&&<><div className="double-fields"><label>ANSIBLE PROJECT FOLDER<input value={ansibleCwd} onChange={event=>setAnsibleCwd(event.target.value)} placeholder="Folder containing ansible.cfg or inventory"/></label><label>SEARCH INVENTORY<input value={devopsSearch} onChange={event=>setDevopsSearch(event.target.value)} placeholder="host, group, variable…"/></label></div><div className="ops-view-toolbar"><nav className="ops-view-switcher">{(["overview","inventory","topology","configuration","runtime"] as AnsibleGuiView[]).map(view=><button key={view} className={ansibleView===view?"active":""} onClick={()=>setAnsibleView(view)}>{view}</button>)}</nav></div><p>An AWX-style read-only explorer for inventory, group topology, effective configuration, and local runtime readiness.</p></>}
                {devopsMode==="tooling"&&<><div className="double-fields"><label>TOOL<select value={devopsTool} onChange={event=>selectDevopsTool(event.target.value)}>{Object.keys(devopsActionMap).map(tool=><option key={tool} value={tool}>{tool}</option>)}</select></label><label>INSPECTION<select value={devopsAction} onChange={event=>setDevopsAction(event.target.value)}>{(devopsActionMap[devopsTool]||[]).map(action=><option key={action} value={action}>{action}</option>)}</select></label></div><div className="triple-fields"><label>TARGET / CONTEXT<input value={devopsTarget} onChange={event=>setDevopsTarget(event.target.value)} placeholder="Optional or method-specific"/></label><label>NAMESPACE / SECONDARY<input value={devopsSecondary} onChange={event=>setDevopsSecondary(event.target.value)} placeholder="Optional"/></label><label>RESOURCE / SCOPE<input value={devopsScope} onChange={event=>setDevopsScope(event.target.value)} placeholder="Optional"/></label></div><label>WORKING FOLDER<input value={devopsCwd} onChange={event=>setDevopsCwd(event.target.value)} placeholder="Optional for Git, Terraform, Ansible and IaC tools"/></label><div className="version-actions"><button className="secondary" onClick={()=>compareToolVersions(false)}>Compare versions</button><button className="secondary" onClick={()=>compareToolVersions(true)}>Save baseline</button></div></>}
                {devopsMode==="delivery"&&<><div className="delivery-picker">{(["pipeline","kafka","topology"] as DeliveryMode[]).map(item=><button key={item} className={deliveryMode===item?"active":""} onClick={()=>setDeliveryMode(item)}>{item==="pipeline"?"Pipeline runs":item==="kafka"?"Kafka lag":"K8s topology"}</button>)}</div>{deliveryMode==="pipeline"&&<label>GITHUB REPOSITORY<input value={deliveryRepository} onChange={event=>setDeliveryRepository(event.target.value)} placeholder="owner/repository (optional current repo)"/></label>}{deliveryMode==="kafka"&&<div className="double-fields"><label>BOOTSTRAP SERVER<input value={kafkaEndpoint} onChange={event=>setKafkaEndpoint(event.target.value)} placeholder="kafka.company.net:9092"/></label><label>CONSUMER GROUP<input value={kafkaGroup} onChange={event=>setKafkaGroup(event.target.value)} placeholder="orders-consumer"/></label></div>}{deliveryMode==="topology"&&<div className="double-fields"><label>KUBE CONTEXT<input value={kubeContext} onChange={event=>setKubeContext(event.target.value)}/></label><label>NAMESPACE<input value={kubeNamespace} onChange={event=>setKubeNamespace(event.target.value)}/></label></div>}<label>SNAPSHOT NAME<input value={snapshotName} onChange={event=>setSnapshotName(event.target.value)} placeholder="Optional evidence snapshot name"/></label><div className="version-actions"><button className="primary" onClick={runDelivery} disabled={devopsBusy}>Collect evidence</button><button className="secondary" onClick={saveDevopsSnapshot} disabled={!devopsData}>Save snapshot</button></div></>}
                {devopsMode==="ssh"&&<><div className="ssh-control-summary"><span>&gt;_</span><p><b>Advanced SSH workspace</b><small>Trusted host profiles, real terminal emulation, tabs, splits, SFTP, local tunnels, search, broadcast input, shortcuts, and exported transcripts.</small></p></div><small className="safety-note">Remote commands run with the connected Linux account. Hostname, IPv4, and bracketed IPv6 connect without an external known_hosts file; first-seen keys are approved in Studio and pinned locally.</small></>}
                {devopsMode==="changes"&&<><div className="double-fields"><label>PLATFORM<select value={changePlatform} onChange={event=>{const platform=event.target.value as "kubernetes"|"docker";setChangePlatform(platform);setChangeAction(platform==="kubernetes"?"restartDeployment":"restartContainer")}}><option value="kubernetes">Kubernetes</option><option value="docker">Docker</option></select></label><label>ACTION<select value={changeAction} onChange={event=>setChangeAction(event.target.value)}>{(changePlatform==="kubernetes"?["restartDeployment","scaleDeployment","deletePod"]:["startContainer","stopContainer","restartContainer","pauseContainer","unpauseContainer"]).map(action=><option key={action}>{action}</option>)}</select></label></div><div className="triple-fields"><label>TARGET<input value={changeTarget} onChange={event=>setChangeTarget(event.target.value)} placeholder={changePlatform==="kubernetes"?"deployment or pod":"container"}/></label><label>REPLICAS<input value={changeValue} onChange={event=>setChangeValue(event.target.value)} disabled={changeAction!=="scaleDeployment"}/></label><label>CHANGE / INCIDENT REFERENCE<input value={changeReference} onChange={event=>setChangeReference(event.target.value)} placeholder="CHG-12345"/></label></div><div className="change-actions"><button className="secondary" onClick={()=>runContainerChange(true)} disabled={devopsBusy}>Preview permission</button><button className="secondary" onClick={loadContainerAudit} disabled={devopsBusy}>Audit history</button><button className="danger-action" onClick={()=>runContainerChange(false)} disabled={devopsBusy}>Apply audited change</button></div><small className="safety-note">Changes require read-write mode, an explicit confirmation, permission preflight, and an audit record. Kubernetes also uses the context and namespace above.</small></>}
                {(["kubernetes","docker","github","ansible","tooling"] as DevopsMode[]).includes(devopsMode)&&<button className="primary refresh-visual" onClick={runDevops} disabled={devopsBusy}>{devopsBusy?"Refreshing…":devopsMode==="tooling"?"Run inspection":"Refresh visual workspace"}</button>}
              </div>
              <section className="module-body devops-body">{devopsMode==="ssh"?<SshWorkspace environment={environment} agentToken={agentToken} agentCall={agentCall} notify={notify}/>:(["kubernetes","docker","github","ansible"] as DevopsMode[]).includes(devopsMode)?<DevopsVisualWorkspace kind={(devopsMode==="github"?gitSource:devopsMode) as "kubernetes"|"docker"|"github"|"git"|"ansible"} activeView={devopsMode==="kubernetes"?kubeView:devopsMode==="docker"?dockerView:devopsMode==="github"?gitView:ansibleView} data={devopsData} search={devopsSearch} available={toolInventory[devopsMode==="github"?gitSource:devopsMode]?.available===true}/>:<>
                <div className="tool-inventory">{Object.entries(toolInventory).map(([id,tool])=><article key={id} className={tool.available?"ready":"missing"}><i/><span><b>{id}</b><small>{tool.version}</small></span></article>)}</div>
                {!devopsData&&<div className="module-empty"><span>OPS</span><b>Safe operations from one shared context</b><small>All commands are built from server-side allowlists. Free-form shell execution is not exposed.</small></div>}
                {devopsData&&<div className="evidence-view">
                  <header><div><i className={devopsData.ok===false?"bad":"good"}/><p><b>{devopsData.ok===false?"Inspection needs attention":"Platform evidence ready"}</b><small>{devopsData.error||devopsData.displayCommand||devopsData.collectedAt||"Allowlisted operation completed"}</small></p></div><span>{devopsData.durationMs||0} ms</span></header>
                  {devopsData.sections&&<div className="platform-sections">{Object.entries(devopsData.sections).map(([id,section]:[string,any])=><article key={id} className={section.code===0?"ok":"fail"}><header><b>{id.replaceAll("_"," ")}</b><em>{section.code===0?"READY":"CHECK"}</em></header><small>{section.displayCommand}</small><pre>{section.stdout||section.stderr||"No output"}</pre></article>)}</div>}
                  {!devopsData.sections&&(devopsData.stdout||devopsData.stderr||devopsData.evidence)&&<pre className="command-output">{[devopsData.stdout,devopsData.stderr,devopsData.evidence].filter(Boolean).join("\n\n")}</pre>}
                  <details className="raw-evidence"><summary>Raw DevOps evidence</summary><pre>{JSON.stringify(devopsData,null,2)}</pre></details>
                </div>}
              </>}
              </section>
            </section>}
            {studioTool==="investigation"&&<section className="studio-module panel-dark">
              <header className="module-head"><div><i>IR</i><p><b>Investigation Center</b><small>Flight recorder, incident timeline, runbooks, rules and retained evidence</small></p></div><span>Local evidence store</span></header>
              <nav className="module-tabs">{(["recorder","timeline","runbooks","rules","library"] as InvestigationMode[]).map(mode=><button key={mode} className={investigationMode===mode?"active":""} onClick={()=>setInvestigationMode(mode)}>{mode==="recorder"?"Flight recorder":mode==="timeline"?"Incident timeline":mode==="runbooks"?"Runbooks":mode==="rules"?"Recommendation rules":"Evidence library"}</button>)}</nav>
              {investigationMode==="recorder"&&<><div className="module-controls"><label>RECORDING NAME<input value={recordingName} onChange={event=>setRecordingName(event.target.value)}/></label><p>Captures active and waiting sessions, executions, elapsed time, logical/physical reads, throughput and errors every 10 seconds.</p><div className="version-actions"><button className="secondary" onClick={()=>captureRecorderSample(true).catch(error=>notify(error.message))} disabled={recordingActive}>Capture once</button><button className="primary" onClick={startRecorder} disabled={recordingActive}>Start recorder</button><button className="secondary" onClick={stopRecorder} disabled={!recordingActive}>Stop</button><button className="secondary" onClick={saveRecording} disabled={!recordingSamples.length}>Save</button></div></div><section className="module-body">{recordingSamples.length?<><div className="metric-cards">{Object.entries(recordingSamples.at(-1)?.metrics||{}).map(([key,value])=><article key={key}><small>{key.replaceAll("_"," ")}</small><b>{String(value)}</b></article>)}</div><div className="recording-strip">{recordingSamples.slice(-60).map((sample,index)=><span key={index} style={{height:Math.max(4,Math.min(70,Number(sample.metrics?.active_sessions||0)*3+4))}} title={sample.collectedAt}/>)}</div><div className="evidence-list"><article><div><b>{recordingActive?"Recording live":"Recording paused"}</b><small>{recordingSamples.length} samples · latest {recordingSamples.at(-1)?.collectedAt}</small></div><em>{recordingActive?"LIVE":"READY"}</em></article></div></>:<div className="module-empty"><span>REC</span><b>No flight samples yet</b><small>Connect to one of the six full-diagnostics engines, then capture once or start the timed recorder.</small></div>}</section></>}
              {investigationMode==="timeline"&&<><div className="module-controls"><label>EVENT TYPE<select value={eventType} onChange={event=>setEventType(event.target.value)}>{["database","deployment","kubernetes","container","log","trace","git","note"].map(type=><option key={type}>{type}</option>)}</select></label><label>EVENT TITLE<input value={eventTitle} onChange={event=>setEventTitle(event.target.value)} placeholder="What changed or was observed?"/></label><label>DETAILS<textarea value={eventDetails} onChange={event=>setEventDetails(event.target.value)} placeholder="Evidence, reference, outcome, or hypothesis"/></label><button className="primary" onClick={addIncidentEvent} disabled={investigationBusy}>Add event</button></div><section className="module-body"><div className="evidence-list">{(investigationStore.events||[]).length?(investigationStore.events||[]).slice().reverse().map((item:any)=><article key={item.id}><i>{item.type.slice(0,2).toUpperCase()}</i><div><b>{item.title}</b><span>{item.details}</span><small>{item.occurredAt}</small></div><button onClick={()=>deleteInvestigationItem("events",item.id)}>Delete</button></article>):<div className="module-empty"><span>TIME</span><b>Build an incident timeline</b><small>Correlate database symptoms with deployments, Kubernetes, containers, logs, traces, Git and operator notes.</small></div>}</div></section></>}
              {investigationMode==="runbooks"&&<><div className="module-controls"><label>RUNBOOK NAME<input value={runbookName} onChange={event=>setRunbookName(event.target.value)} placeholder="Database incident first response"/></label><label>APPROVED TOOL<select value={runbookTool} onChange={event=>{const tool=event.target.value;setRunbookTool(tool);setRunbookActions([devopsActionMap[tool]?.[0]].filter(Boolean))}}>{Object.keys(devopsActionMap).map(tool=><option key={tool}>{tool}</option>)}</select></label><div className="action-checks">{(devopsActionMap[runbookTool]||[]).map(action=><label key={action}><input type="checkbox" checked={runbookActions.includes(action)} onChange={event=>setRunbookActions(items=>event.target.checked?[...new Set([...items,action])]:items.filter(item=>item!==action))}/>{action}</label>)}</div><button className="primary" onClick={saveRunbook}>Save runbook</button></div><section className="module-body"><div className="evidence-list">{(investigationStore.runbooks||[]).length?(investigationStore.runbooks||[]).map((item:any)=><article key={item.id}><i>RB</i><div><b>{item.name}</b><span>{item.tool} · {item.actions.join(" → ")}</span><small>{item.createdAt}</small></div><button onClick={()=>executeRunbook(item)}>Run</button><button onClick={()=>deleteInvestigationItem("runbooks",item.id)}>Delete</button></article>):<div className="module-empty"><span>RB</span><b>No saved runbooks</b><small>Combine up to 20 approved read-only actions for one supported tool. Free-form shell commands cannot be saved.</small></div>}</div></section></>}
              {investigationMode==="rules"&&<><div className="module-controls"><p>Customize evidence thresholds used by SQL recommendations. Every high threshold must remain greater than its warning threshold.</p><button className="primary" onClick={saveTuningRules}>Save thresholds</button></div><section className="module-body"><div className="rule-grid">{(investigationStore.rules||[]).map((rule:any,index:number)=><article key={rule.id}><div><b>{rule.name}</b><small>{rule.unit}</small></div><label>WARNING<input type="number" value={rule.warning} onChange={event=>setInvestigationStore((store:any)=>({...store,rules:store.rules.map((item:any,i:number)=>i===index?{...item,warning:Number(event.target.value)}:item)}))}/></label><label>HIGH<input type="number" value={rule.high} onChange={event=>setInvestigationStore((store:any)=>({...store,rules:store.rules.map((item:any,i:number)=>i===index?{...item,high:Number(event.target.value)}:item)}))}/></label></article>)}</div></section></>}
              {investigationMode==="library"&&<><div className="module-controls"><p>Baselines, flight recordings, delivery snapshots, autofill profiles and incident evidence are kept in the local agent data store.</p><div className="version-actions"><button className="secondary" onClick={saveCurrentAutofill}>Save current DB autofill</button><button className="primary" onClick={()=>download("db-studio-investigation.json",JSON.stringify(investigationStore,null,2),"application/json")}>Export evidence</button></div></div><section className="module-body"><div className="library-summary">{[["Plan baselines",investigationStore.baselines],["Flight recordings",investigationStore.recordings],["DevOps snapshots",investigationStore.devopsSnapshots],["Autofill profiles",investigationStore.autofillProfiles],["Timeline events",investigationStore.events]].map(([label,items]:any)=><article key={label}><b>{items?.length||0}</b><small>{label}</small></article>)}</div><div className="evidence-list">{[...(investigationStore.baselines||[]).map((item:any)=>({...item,kind:"baselines",label:item.name,detail:item.engine+" · "+item.identifier})),...(investigationStore.recordings||[]).map((item:any)=>({...item,kind:"recordings",label:item.name,detail:item.engine+" · "+item.samples.length+" samples"})),...(investigationStore.devopsSnapshots||[]).map((item:any)=>({...item,kind:"devops-snapshots",label:item.name,detail:item.type})),...(investigationStore.autofillProfiles||[]).map((item:any)=>({...item,kind:"autofill-profiles",label:item.name,detail:item.kind}))].map((item:any)=><article key={item.id}><i>{item.kind.slice(0,2).toUpperCase()}</i><div><b>{item.label}</b><span>{item.detail}</span><small>{item.capturedAt||item.createdAt}</small></div><button onClick={()=>deleteInvestigationItem(item.kind,item.id)}>Delete</button></article>)}</div></section></>}
            </section>}
          </section>
        </div>}

        {view!=="studio"&&<div className="ops-view"><header className="simple-heading"><p>{view.toUpperCase()}</p><h1>{nav.find(item=>item.id===view)?.label}</h1><span>Operations Studio keeps database, platform, performance, and troubleshooting evidence in one local-first workspace.</span></header><section className="feature-cards">{view==="overview"&&[["15","Database connectors","Oracle, PostgreSQL, SQL Server, MongoDB and warehouses"],[String(readyCount||"—"),"Ready locally","Bundled drivers and approved local clients"],[String(profiles.length),"Saved profiles","Environment-scoped metadata without passwords"],["RO","Safety policy","Read-only SQL unless explicitly unlocked"]].map(card=><article key={card[1]}><span>{card[0]}</span><b>{card[1]}</b><small>{card[2]}</small></article>)}{view==="infrastructure"&&[["K8s","Cluster inventory","Nodes, workloads, services, events and resource pressure"],["Docker","Container visibility","Containers, images, networks, volumes, logs and inspect"],["SSH","Remote hosts","Verified host keys and environment-aware Linux profiles"]].map(card=><article key={card[0]}><span>{card[0]}</span><b>{card[1]}</b><small>{card[2]}</small></article>)}{view==="performance"&&[["CPU","Host signals","CPU, memory, I/O and anomaly hints"],["SQL","Statement analysis","Plans, waits, blockers and plan history"],["Trace","Runtime evidence","Database and application trace correlation"]].map(card=><article key={card[0]}><span>{card[0]}</span><b>{card[1]}</b><small>{card[2]}</small></article>)}{view==="runbooks"&&[["PG-014","PostgreSQL memory pressure","Guided evidence collection and safe response"],["ORA-022","Oracle redo waits","Wait, I/O and transport verification"],["HOST-003","Linux CPU saturation","Process, load, deployment and scaling checks"]].map(card=><article key={card[0]}><span>{card[0]}</span><b>{card[1]}</b><small>{card[2]}</small></article>)}</section><button className="primary" onClick={()=>setView("studio")}>Open DB Studio</button></div>}
      </div>
    </section>

    {commandOpen&&<div className="command-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setCommandOpen(false)}><section className="command-palette"><label>⌕ <input autoFocus placeholder="Search workspace…"/></label>{nav.map(item=><button key={item.id} onClick={()=>{if(item.id==="runbooks"){setView("studio");setStudioTool("investigation");setInvestigationMode("runbooks")}else setView(item.id);setCommandOpen(false)}}><i>{item.mark}</i><span><b>Open {item.label}</b><small>Navigate to {item.label.toLowerCase()}</small></span><kbd>↵</kbd></button>)}</section></div>}
    {toast&&<div className="ops-toast"><i>✓</i>{toast}</div>}
  </main>
}
