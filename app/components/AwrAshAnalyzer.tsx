"use client";

import { useMemo, useRef, useState } from "react";

type Severity="critical"|"high"|"medium"|"info";
type ReportKind="AWR"|"ASH"|"AWR Compare"|"Unknown";
type EvidenceView="findings"|"waits"|"sql"|"ash"|"coverage";
type ReportTable={title:string;headers:string[];rows:string[][]};
type WaitEvidence={event:string;waitClass:string;waits:number|null;timeSeconds:number|null;avgMs:number|null;dbTimePct:number|null;source:string};
type SqlEvidence={sqlId:string;metric:number|null;metricLabel:string;elapsedSeconds:number|null;cpuSeconds:number|null;executions:number|null;gets:number|null;reads:number|null;module:string;text:string;source:string};
type AshEvidence={dimension:string;value:string;activityPct:number|null;samples:number|null;source:string};
type Finding={id:string;severity:Severity;score:number;category:string;title:string;evidence:string;cause:string;action:string;verify:string;confidence:"high"|"medium"|"low";source:string};
type Coverage={key:string;label:string;present:boolean;why:string};
type Analysis={kind:ReportKind;name:string;dbName:string;instance:string;elapsedMinutes:number|null;dbTimeMinutes:number|null;aas:number|null;cpuCount:number|null;dbCpuPct:number|null;findings:Finding[];waits:WaitEvidence[];sql:SqlEvidence[];ash:AshEvidence[];coverage:Coverage[];gaps:string[];confidence:number;posture:string;dominant:string;generatedAt:string};

const severityRank:Record<Severity,number>={critical:4,high:3,medium:2,info:1};
const numberValue=(value:string|undefined|null)=>{if(!value)return null;const cleaned=value.replace(/[,%<>]/g,"").replace(/\([^)]*\)/g,"").trim();const match=cleaned.match(/-?\d+(?:\.\d+)?/);return match?Number(match[0]):null};
const compact=(value:string)=>value.replace(/\u00a0/g," ").replace(/[ \t]+/g," ").trim();
const escapeRegExp=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const firstNumber=(values:string[])=>{for(const value of values){const parsed=numberValue(value);if(parsed!==null)return parsed}return null};
const findHeader=(headers:string[],patterns:RegExp[])=>headers.findIndex(header=>patterns.some(pattern=>pattern.test(header)));
const cellByHeader=(row:string[],headers:string[],patterns:RegExp[])=>{const index=findHeader(headers,patterns);return index>=0?row[index]||"":""};
const valueAfterLabel=(tables:ReportTable[],labels:RegExp[])=>{for(const table of tables)for(const row of table.rows)for(let index=0;index<row.length-1;index++)if(labels.some(label=>label.test(row[index])))for(let next=index+1;next<row.length;next++)if(compact(row[next]))return compact(row[next]);return ""};

function htmlTables(raw:string):ReportTable[]{
  if(!/<(?:html|table|tr|td|th)\b/i.test(raw)||typeof DOMParser==="undefined")return [];
  const documentHtml=new DOMParser().parseFromString(raw,"text/html");
  return Array.from(documentHtml.querySelectorAll("table")).map((table,index)=>{
    let title=compact(table.querySelector("caption")?.textContent||"");
    let cursor:Element|null=table.previousElementSibling;
    for(let step=0;!title&&cursor&&step<8;step++,cursor=cursor.previousElementSibling){
      const candidate=compact(cursor.textContent||"");
      if(candidate&&candidate.length<180&&!/^(back to|main report|html)$/i.test(candidate))title=candidate;
    }
    const sourceRows=Array.from(table.querySelectorAll("tr")).map(row=>Array.from(row.querySelectorAll(":scope > th, :scope > td")).map(cell=>compact(cell.textContent||""))).filter(row=>row.some(Boolean));
    let headerIndex=sourceRows.findIndex((row,rowIndex)=>rowIndex<5&&row.length>1&&row.some(cell=>/event|sql id|statistic|per second|% db|session|module|object|wait class|elapsed/i.test(cell)));
    if(headerIndex<0)headerIndex=0;
    return {title:title||`Report table ${index+1}`,headers:sourceRows[headerIndex]||[],rows:sourceRows.slice(headerIndex+1)};
  }).filter(table=>table.rows.length>0);
}

const knownHeadings=[/Top \d+ Timed Foreground Events/i,/Foreground Wait Events/i,/Time Model Statistics/i,/Load Profile/i,/Instance Efficiency Percentages/i,/SQL ordered by/i,/Segments by/i,/Top User Events/i,/Top SQL/i,/Top Sessions/i,/Top Blocking Sessions/i,/Top DB Objects/i,/Top Service\/Module/i,/ASH Report/i];
function textTables(raw:string):ReportTable[]{
  const lines=raw.split(/\r?\n/).map(compact);
  const tables:ReportTable[]=[];
  lines.forEach((line,index)=>{
    const heading=knownHeadings.find(pattern=>pattern.test(line));
    if(!heading)return;
    const rows:string[][]=[];
    for(let cursor=index+1;cursor<Math.min(lines.length,index+85);cursor++){
      const candidate=lines[cursor];
      if(cursor>index+3&&knownHeadings.some(pattern=>pattern.test(candidate)))break;
      if(!candidate||/^[-=]{4,}$/.test(candidate))continue;
      const cells=candidate.includes("|")?candidate.split("|").map(compact).filter(Boolean):candidate.split(/\s{2,}/).map(compact).filter(Boolean);
      if(cells.length>1)rows.push(cells);
    }
    if(rows.length){const headerIndex=rows.findIndex((row,rowIndex)=>rowIndex<5&&row.some(cell=>/event|sql id|statistic|per second|% db|session|module|object|wait class|elapsed/i.test(cell)));tables.push({title:line,headers:rows[Math.max(0,headerIndex)]||[],rows:rows.slice(Math.max(0,headerIndex)+1)});}
  });
  return tables;
}

function reportText(raw:string){
  if(!/<(?:html|body|table|tr|td|th)\b/i.test(raw)||typeof DOMParser==="undefined")return raw;
  const documentHtml=new DOMParser().parseFromString(raw,"text/html");
  documentHtml.querySelectorAll("script,style,svg").forEach(node=>node.remove());
  documentHtml.querySelectorAll("br,h1,h2,h3,h4,tr,p,li").forEach(node=>node.append("\n"));
  return (documentHtml.body.textContent||"").replace(/\n\s*\n\s*\n/g,"\n\n");
}

function detectKind(text:string):ReportKind{
  if(/AWR Compare Periods|WORKLOAD REPOSITORY COMPARE|AWR RAC Compare/i.test(text))return "AWR Compare";
  if(/Active Session History \(ASH\) Report|ASH Report For|ASH Report/i.test(text))return "ASH";
  if(/WORKLOAD REPOSITORY report|AWR Report|Automatic Workload Repository/i.test(text))return "AWR";
  return "Unknown";
}

function findScalar(text:string,label:string,unit?:string){
  const suffix=unit?`\\s*${unit}`:"";
  return numberValue(text.match(new RegExp(`${escapeRegExp(label)}\\s*:?\\s*([\\d,.]+)${suffix}`,"i"))?.[1]);
}

function eventAdvice(event:string){
  const value=event.toLowerCase();
  if(/cpu time|db cpu|resmgr:cpu quantum/.test(value))return {category:"CPU",cause:"Foreground demand or Resource Manager scheduling is consuming the available CPU window.",action:"Correlate SQL by CPU with host run queue and service workload; tune the largest verified CPU consumer before adding capacity.",verify:"Compare DB CPU, AAS per CPU, executions and response time in an equivalent post-change interval."};
  if(/db file sequential read/.test(value))return {category:"I/O",cause:"Single-block reads are dominating, commonly from index-driven access or repeated table lookups.",action:"Inspect SQL by reads, plan row-source actuals, object latency and cache residency; validate the access path before changing storage or cache.",verify:"Confirm lower single-block read time and fewer physical reads per execution for the same workload."};
  if(/db file scattered read|direct path read(?! temp)|cell single block physical read/.test(value))return {category:"I/O",cause:"Scan-oriented physical I/O is a major response-time component.",action:"Rank SQL and segments by physical reads, then validate pruning, partition access and estimated-versus-actual rows.",verify:"Re-run the same workload and compare read bytes, scan rows and DB time."};
  if(/direct path (read|write) temp|temp file read|temp/.test(value))return {category:"Memory / TEMP",cause:"Work areas are spilling to TEMP or large temporary operations dominate the sample.",action:"Find the SQL and plan operators producing sorts or hashes, verify PGA pressure, cardinality estimates and data volume.",verify:"Confirm fewer TEMP reads/writes and lower elapsed time without unsafe instance-wide memory changes."};
  if(/log file sync/.test(value))return {category:"Commit",cause:"Foreground commits are waiting for redo durability; frequency and redo-path latency both matter.",action:"Compare user commits, redo size per transaction and log file parallel write latency; inspect commit batching and redo storage.",verify:"Confirm reduced commit latency while preserving durability and transaction semantics."};
  if(/log file parallel write|log buffer space/.test(value))return {category:"Redo",cause:"LGWR throughput or redo allocation is limiting commit progress.",action:"Inspect redo write latency, log switches, redo generation bursts and storage queueing before resizing anything.",verify:"Confirm lower redo write latency, fewer stalls and stable recovery requirements."};
  if(/enq: tx|row lock|blocking/.test(value))return {category:"Concurrency",cause:"Sessions are blocked by transaction locks or hot-row serialization.",action:"Build the blocking tree, identify the root blocker and application transaction boundary, then coordinate the least disruptive resolution.",verify:"Confirm the blocking chain clears and does not recur under equivalent concurrency."};
  if(/cursor: pin|library cache|mutex|latch: shared pool/.test(value))return {category:"Parsing / concurrency",cause:"Cursor or shared-pool serialization is limiting throughput.",action:"Correlate hard parses, versions, invalidations and SQL text; fix literal churn or invalidation source before considering cache changes.",verify:"Confirm lower parse rate, mutex time and child-cursor growth."};
  if(/gc |global cache/.test(value))return {category:"RAC",cause:"Global-cache traffic or block contention is material in this RAC interval.",action:"Find the hot objects and SQL, compare instance affinity and interconnect latency, then review service placement.",verify:"Confirm lower global-cache time and stable service distribution across instances."};
  if(/buffer busy|read by other session/.test(value))return {category:"Hot blocks",cause:"Concurrent sessions are contending for the same blocks or block population.",action:"Identify the segment, block class and SQL; test sequence, index, freelist/ASSM or workload-sharding causes as applicable.",verify:"Confirm fewer waits per transaction on the same object and workload."};
  if(/enq: hw|enq: st|space/.test(value))return {category:"Space",cause:"Segment extension or high-water-mark serialization is contributing to DB time.",action:"Identify the affected segment and growth pattern; validate extent allocation, concurrent load design and free space.",verify:"Confirm extension waits disappear during the same load phase."};
  if(/sql\*net message to client|sql\*net more data to client/.test(value))return {category:"Network / client",cause:"Result transfer or client fetch behavior is visible; this is not automatically a database fault.",action:"Correlate rows returned, fetch count, packet latency and client think time before tuning the database.",verify:"Compare end-to-end response time and database DB time separately."};
  return {category:"Wait event",cause:"This event is a material part of DB time but needs SQL, object and time-model correlation.",action:"Correlate the event with top SQL, ASH dimensions and the same report interval before selecting a fix.",verify:"Capture an equivalent interval and confirm both event share and user response time improve."};
}

function parseWaits(tables:ReportTable[]):WaitEvidence[]{
  const result:WaitEvidence[]=[];
  for(const table of tables.filter(item=>/Timed Foreground Events|Foreground Wait Events|Top User Events|Top Events/i.test(item.title))){
    for(const row of table.rows){
      const event=compact(cellByHeader(row,table.headers,[/^event$/i,/event name/i])||row[0]||"");
      if(!event||/^-+$|event|wait class/i.test(event))continue;
      const numeric=row.map(numberValue).filter((value):value is number=>value!==null);
      const dbTimePct=numberValue(cellByHeader(row,table.headers,[/%\s*db\s*time/i,/%\s*activity/i,/%\s*event/i]))??(numeric.length>=4?numeric.at(-1)??null:null);
      result.push({event,waitClass:cellByHeader(row,table.headers,[/wait class/i])||row.find(cell=>/^(User I\/O|System I\/O|Concurrency|Commit|Application|Cluster|Network|Configuration|Scheduler|CPU)$/i.test(cell))||"",waits:numberValue(cellByHeader(row,table.headers,[/^waits$/i,/wait count/i]))??numeric[0]??null,timeSeconds:numberValue(cellByHeader(row,table.headers,[/time.*\(s\)|total wait time|wait time.*sec/i]))??numeric[1]??null,avgMs:numberValue(cellByHeader(row,table.headers,[/avg.*ms|average wait/i]))??numeric[2]??null,dbTimePct,source:table.title});
    }
  }
  const unique=new Map<string,WaitEvidence>();for(const item of result.sort((a,b)=>(b.dbTimePct??b.timeSeconds??0)-(a.dbTimePct??a.timeSeconds??0)))if(!unique.has(item.event.toLowerCase()))unique.set(item.event.toLowerCase(),item);return [...unique.values()].slice(0,30);
}

function parseSql(tables:ReportTable[]):SqlEvidence[]{
  const result:SqlEvidence[]=[];
  for(const table of tables.filter(item=>/SQL ordered by|SQL with Top Events|Top SQL/i.test(item.title))){
    const metricLabel=table.title.match(/SQL ordered by\s+([^\n]+)/i)?.[1]||(/ASH|Top SQL/i.test(table.title)?"ASH activity":"load");
    for(const row of table.rows){
      const joined=row.join(" ");const sqlId=cellByHeader(row,table.headers,[/sql id/i])||joined.match(/\b[0-9a-z]{13}\b/i)?.[0]||"";
      if(!sqlId||!/^[0-9a-z]{13}$/i.test(sqlId))continue;
      const metric=firstNumber(row);
      result.push({sqlId,metric,metricLabel,elapsedSeconds:numberValue(cellByHeader(row,table.headers,[/elapsed.*\(s\)|elapsed time/i]))??(/elapsed/i.test(metricLabel)?metric:null),cpuSeconds:numberValue(cellByHeader(row,table.headers,[/cpu.*\(s\)|cpu time/i]))??(/cpu/i.test(metricLabel)?metric:null),executions:numberValue(cellByHeader(row,table.headers,[/^executions$/i,/execs/i])),gets:numberValue(cellByHeader(row,table.headers,[/buffer gets|logical reads/i]))??(/gets/i.test(metricLabel)?metric:null),reads:numberValue(cellByHeader(row,table.headers,[/physical reads|disk reads/i]))??(/reads/i.test(metricLabel)?metric:null),module:cellByHeader(row,table.headers,[/module/i]),text:cellByHeader(row,table.headers,[/sql text/i,/statement/i]).slice(0,240),source:table.title});
    }
  }
  const merged=new Map<string,SqlEvidence>();
  for(const item of result){const old=merged.get(item.sqlId);if(!old)merged.set(item.sqlId,item);else merged.set(item.sqlId,{...old,metric:Math.max(old.metric??0,item.metric??0),elapsedSeconds:old.elapsedSeconds??item.elapsedSeconds,cpuSeconds:old.cpuSeconds??item.cpuSeconds,executions:old.executions??item.executions,gets:old.gets??item.gets,reads:old.reads??item.reads,module:old.module||item.module,text:old.text||item.text,source:`${old.source} · ${item.source}`});}
  return [...merged.values()].sort((a,b)=>(b.elapsedSeconds??b.metric??0)-(a.elapsedSeconds??a.metric??0)).slice(0,40);
}

function parseAsh(tables:ReportTable[],kind:ReportKind):AshEvidence[]{
  if(kind!=="ASH")return [];
  const result:AshEvidence[]=[];
  for(const table of tables.filter(item=>/Top (User Events|SQL|Sessions|Blocking Sessions|DB Objects|Service\/Module|Modules|Client|PL\/SQL)|Activity Over Time/i.test(item.title))){
    const dimension=table.title.replace(/^.*?Top\s*/i,"").replace(/Activity Over Time/i,"Timeline").slice(0,52);
    for(const row of table.rows.slice(0,20)){
      const value=compact(row.find(cell=>cell&&!/^\d+(?:\.\d+)?%?$/.test(cell)&&!/^(samples|% activity|event|sql id|session|module|object)$/i.test(cell))||"");
      if(!value)continue;
      const activityPct=numberValue(cellByHeader(row,table.headers,[/%\s*activity/i,/%\s*event/i,/%\s*this/i]))??row.map(numberValue).filter((entry):entry is number=>entry!==null).find(entry=>entry>=0&&entry<=100)??null;
      result.push({dimension,value,activityPct,samples:numberValue(cellByHeader(row,table.headers,[/samples/i])),source:table.title});
    }
  }
  return result.sort((a,b)=>(b.activityPct??b.samples??0)-(a.activityPct??a.samples??0)).slice(0,50);
}

const coverageDefinitions=[
  {key:"summary",label:"Snapshot & host summary",match:/snapshot|report summary|database instance/i,why:"Defines scope, duration, database, instance and capacity."},
  {key:"load",label:"Load profile",match:/load profile/i,why:"Normalizes work by second, transaction and execution."},
  {key:"time",label:"Time model",match:/time model/i,why:"Separates DB CPU, SQL execution, parse and background time."},
  {key:"waits",label:"Foreground waits",match:/timed foreground|foreground wait|top user events/i,why:"Ranks the response-time consumers that are actionable."},
  {key:"sql",label:"SQL statistics",match:/sql ordered by|top sql/i,why:"Links resource demand to statement identifiers."},
  {key:"segments",label:"Segment hotspots",match:/segments by|top db objects/i,why:"Links I/O and contention to objects."},
  {key:"io",label:"I/O statistics",match:/i\/o stat|io stat|tablespace io/i,why:"Distinguishes SQL demand from storage latency."},
  {key:"memory",label:"Memory & advisory",match:/pga|sga|memory stat|advisory/i,why:"Shows spill, cache and memory-pressure evidence."},
  {key:"efficiency",label:"Parsing & efficiency",match:/instance efficiency|library cache|parse/i,why:"Surfaces parsing and cursor pressure as supporting evidence."},
  {key:"ash",label:"ASH dimensions",match:/top sessions|blocking sessions|top service\/module|activity over time|ash report/i,why:"Finds transient SQL, session, module and blocker concentration."},
];

function addFinding(findings:Finding[],finding:Omit<Finding,"id">){findings.push({...finding,id:`F-${String(findings.length+1).padStart(2,"0")}`})}

function analyzeSingle(raw:string,name:string):Analysis{
  const text=reportText(raw),tables=[...htmlTables(raw),...textTables(text)],kind=detectKind(text);
  const elapsedMinutes=findScalar(text,"Elapsed","\\(mins\\)")??numberValue(valueAfterLabel(tables,[/^elapsed:?$/i]));
  const dbTimeMinutes=findScalar(text,"DB Time","\\(mins\\)")??numberValue(valueAfterLabel(tables,[/^db time:?$/i]));
  const loadTable=tables.find(table=>/load profile/i.test(table.title));
  const loadDbTime=loadTable?.rows.find(row=>/^db time/i.test(row[0]))?.slice(1).map(numberValue).find((value):value is number=>value!==null)??null;
  const aas=loadDbTime??(elapsedMinutes&&dbTimeMinutes!==null?dbTimeMinutes/elapsedMinutes:null);
  const cpuCount=numberValue(valueAfterLabel(tables,[/^cpus?$/i,/^cores?$/i]))??findScalar(text,"CPUs");
  const timeModel=tables.find(table=>/time model/i.test(table.title));
  const dbCpuRow=timeModel?.rows.find(row=>/^db cpu$/i.test(row[0]));
  const dbCpuPct=dbCpuRow?numberValue(cellByHeader(dbCpuRow,timeModel?.headers||[],[/%\s*db\s*time/i]))??dbCpuRow.map(numberValue).filter((value):value is number=>value!==null).at(-1)??null:null;
  const waits=parseWaits(tables),sql=parseSql(tables),ash=parseAsh(tables,kind);
  const coverage=coverageDefinitions.map(item=>({key:item.key,label:item.label,present:tables.some(table=>item.match.test(table.title))||item.match.test(text),why:item.why}));
  const gaps=coverage.filter(item=>!item.present).map(item=>`${item.label}: ${item.why}`);
  const findings:Finding[]=[];
  if(kind==="Unknown")addFinding(findings,{severity:"high",score:82,category:"Evidence quality",title:"Report format was not recognized",evidence:"No Oracle AWR, AWR Compare, or ASH signature was detected.",cause:"The pasted content may be truncated, copied from a PDF image, or use an unsupported export layout.",action:"Upload the original HTML or text report generated by Oracle; do not use screenshots.",verify:"The analyzer should identify the report type and populate snapshot, wait, SQL and coverage evidence.",confidence:"high",source:"Report header"});
  if(elapsedMinutes!==null&&elapsedMinutes<10)addFinding(findings,{severity:"medium",score:58,category:"Evidence quality",title:"Short capture window may overstate a transient spike",evidence:`The report interval is ${elapsedMinutes.toFixed(1)} minutes.`,cause:"A brief interval can be valid for an incident, but it may not represent the normal workload mix.",action:"Keep this interval for incident detail and compare it with a representative baseline window.",verify:"Check whether the same dominant wait or SQL remains material in the baseline.",confidence:"high",source:"Snapshot summary"});
  if(aas!==null&&cpuCount!==null&&cpuCount>0&&aas/cpuCount>=.8)addFinding(findings,{severity:aas/cpuCount>=1.2?"critical":"high",score:Math.min(99,72+Math.round(aas/cpuCount*12)),category:"CPU / concurrency",title:"Average active demand is at or above CPU capacity",evidence:`AAS ${aas.toFixed(2)} across ${cpuCount} CPUs (${(aas/cpuCount).toFixed(2)} active sessions per CPU).`,cause:"CPU saturation or non-CPU waits are stacking active sessions faster than the system can complete work.",action:"Split DB CPU from wait time, then rank SQL by CPU and ASH activity before changing capacity or initialization parameters.",verify:"Target sustained AAS per CPU below the tested capacity while response time and throughput meet the service objective.",confidence:"high",source:"Load Profile + Host CPU"});
  if(dbCpuPct!==null&&dbCpuPct>=65)addFinding(findings,{severity:dbCpuPct>=85?"high":"medium",score:Math.min(92,55+Math.round(dbCpuPct/3)),category:"CPU",title:"DB CPU dominates database time",evidence:`DB CPU accounts for ${dbCpuPct.toFixed(1)}% of DB time.`,cause:"The interval is primarily compute-bound or has runnable sessions waiting for CPU scheduling.",action:"Start with SQL ordered by CPU, execution count and plan efficiency; validate host CPU saturation before recommending capacity.",verify:"Compare CPU seconds per execution and user response time for the same workload.",confidence:"high",source:"Time Model Statistics"});
  waits.slice(0,8).forEach((wait,index)=>{
    const share=wait.dbTimePct??0;if(share<10&&index>2)return;const advice=eventAdvice(wait.event);const severity:Severity=share>=40?"high":share>=20?"medium":"info";
    addFinding(findings,{severity,score:Math.min(94,35+Math.round(share)),category:advice.category,title:`${wait.event} is a ${share?share.toFixed(1)+"% DB-time":"top"} consumer`,evidence:`${wait.waitClass||"Unclassified"} · ${wait.timeSeconds===null?"time unavailable":wait.timeSeconds.toLocaleString()+" seconds"}${wait.avgMs===null?"":` · ${wait.avgMs.toFixed(2)} ms average`}.`,cause:advice.cause,action:advice.action,verify:advice.verify,confidence:share?"high":"medium",source:wait.source});
  });
  const sqlSources=new Map<string,number>();for(const table of tables.filter(item=>/SQL ordered by/i.test(item.title)))for(const item of parseSql([table]))sqlSources.set(item.sqlId,(sqlSources.get(item.sqlId)||0)+1);
  sql.slice(0,8).forEach((statement,index)=>{
    const repeat=sqlSources.get(statement.sqlId)||1;if(index>2&&repeat<2)return;
    const severity:Severity=repeat>=3?"high":index===0?"medium":"info";
    addFinding(findings,{severity,score:repeat>=3?84:62-index*3,category:"SQL",title:`SQL ${statement.sqlId} is a ${repeat>=2?"cross-category":"leading"} resource culprit`,evidence:`Appears in ${repeat} ranked SQL section${repeat===1?"":"s"}${statement.elapsedSeconds!==null?` · ${statement.elapsedSeconds.toLocaleString()} elapsed seconds`:""}${statement.executions!==null?` · ${statement.executions.toLocaleString()} executions`:""}.`,cause:repeat>=2?"The statement is material across multiple resource dimensions, increasing confidence that it contributes to the incident.":"The statement ranks highly in at least one resource dimension and needs plan and per-execution validation.",action:"Compare its plan hash, rows per execution, gets, reads, CPU and elapsed time with a known-good interval; inspect actual row-source evidence.",verify:"Measure the same SQL_ID by per-execution metrics and total DB-time contribution after the controlled change.",confidence:repeat>=2?"high":"medium",source:statement.source});
  });
  ash.filter(item=>(item.activityPct??0)>=20).slice(0,8).forEach(item=>addFinding(findings,{severity:(item.activityPct??0)>=40?"high":"medium",score:Math.min(90,45+Math.round(item.activityPct??0)),category:"ASH concentration",title:`${item.dimension}: ${item.value} dominates sampled activity`,evidence:`${item.activityPct?.toFixed(1)}% of sampled active-session activity${item.samples===null?"":` · ${item.samples.toLocaleString()} samples`}.`,cause:"A concentrated ASH dimension can identify a transient SQL, session, module, object, or blocker responsible for the spike.",action:"Pivot the same time window by SQL_ID, event, session, module and object; confirm the concentration is not an artifact of a very small sample.",verify:"Confirm the dimension share falls and the service-level symptom clears in the next equivalent sample.",confidence:(item.samples??0)>=20?"high":"medium",source:item.source}));
  const efficiency=tables.find(table=>/instance efficiency/i.test(table.title));
  if(efficiency){const rows=efficiency.rows.flat();const softIndex=rows.findIndex(cell=>/soft parse/i.test(cell));const soft=softIndex>=0?numberValue(rows[softIndex+1]):null;if(soft!==null&&soft<95)addFinding(findings,{severity:soft<85?"high":"medium",score:soft<85?78:61,category:"Parsing",title:"Soft-parse efficiency is below the review threshold",evidence:`Soft Parse % is ${soft.toFixed(1)}%.`,cause:"Hard parsing, literal SQL, invalidations or child-cursor churn may be consuming CPU and serialization time.",action:"Correlate parse calls, hard parses, cursor versions and top SQL before changing shared-pool settings; hit ratios alone are not a diagnosis.",verify:"Confirm lower hard parses per second and parse CPU with stable execution throughput.",confidence:"medium",source:efficiency.title});}
  if(!findings.length)addFinding(findings,{severity:"info",score:30,category:"Triage",title:"No dominant bottleneck crossed the local ranking thresholds",evidence:`${coverage.filter(item=>item.present).length} of ${coverage.length} evidence areas were detected.`,cause:"The report may represent a balanced interval, or the decisive sections may be absent from the pasted content.",action:"Review the coverage gaps and compare with a known-bad or known-good interval before declaring the system healthy.",verify:"Validate against user response time, throughput and an equivalent workload window.",confidence:gaps.length<=3?"medium":"low",source:"Cross-section correlation"});
  findings.sort((a,b)=>severityRank[b.severity]-severityRank[a.severity]||b.score-a.score);
  const confidence=Math.round(25+coverage.filter(item=>item.present).length/coverage.length*65+(kind!=="Unknown"?10:0));
  const top=findings[0];const posture=top.severity==="critical"?"Immediate triage":top.severity==="high"?"Material bottleneck":top.severity==="medium"?"Performance risk":"No dominant signal";
  return {kind,name,dbName:valueAfterLabel(tables,[/^db name$/i])||text.match(/DB Name\s*:?\s*([A-Z0-9_$#-]+)/i)?.[1]||"Oracle database",instance:valueAfterLabel(tables,[/^instance$/i,/^inst name$/i])||"All instances",elapsedMinutes,dbTimeMinutes,aas,cpuCount,dbCpuPct,findings,waits,sql,ash,coverage,gaps,confidence,posture,dominant:top.category,generatedAt:new Date().toISOString()};
}

function applyBaseline(incident:Analysis,baseline:Analysis):Analysis{
  const findings=[...incident.findings];
  if(incident.aas!==null&&baseline.aas!==null&&baseline.aas>0){const delta=(incident.aas-baseline.aas)/baseline.aas*100;if(delta>=30)addFinding(findings,{severity:delta>=100?"high":"medium",score:Math.min(94,58+Math.round(delta/4)),category:"Regression",title:"Active workload increased versus baseline",evidence:`AAS rose from ${baseline.aas.toFixed(2)} to ${incident.aas.toFixed(2)} (${delta.toFixed(0)}%).`,cause:"The incident interval contains more concurrent database demand, longer response time, or both.",action:"Normalize load per transaction/execution and compare the waits and SQL that grew most before attributing the change to infrastructure.",verify:"Use an equivalent-duration, equivalent-workload follow-up interval and confirm AAS plus response time return toward baseline.",confidence:"high",source:"Incident ↔ baseline comparison"});}
  const baseWaits=new Map(baseline.waits.map(item=>[item.event.toLowerCase(),item]));
  incident.waits.slice(0,8).forEach(wait=>{const before=baseWaits.get(wait.event.toLowerCase())?.dbTimePct??0,after=wait.dbTimePct??0;if(after>=15&&after-before>=10)addFinding(findings,{severity:after-before>=25?"high":"medium",score:Math.min(92,55+Math.round(after-before)),category:"Wait regression",title:`${wait.event} regressed against baseline`,evidence:`DB-time share changed from ${before.toFixed(1)}% to ${after.toFixed(1)}% (+${(after-before).toFixed(1)} points).`,cause:eventAdvice(wait.event).cause,action:eventAdvice(wait.event).action,verify:eventAdvice(wait.event).verify,confidence:"high",source:"Incident ↔ baseline wait comparison"});});
  const baselineSql=new Set(baseline.sql.slice(0,15).map(item=>item.sqlId));const newSql=incident.sql.slice(0,10).filter(item=>!baselineSql.has(item.sqlId));if(newSql.length)addFinding(findings,{severity:"medium",score:69,category:"SQL regression",title:`${newSql.length} leading SQL_ID${newSql.length===1?" is":"s are"} new versus baseline`,evidence:newSql.slice(0,5).map(item=>item.sqlId).join(", "),cause:"A changed workload mix or new execution plan may explain the regression.",action:"Compare SQL text, module, plan hash and per-execution resource use; confirm the baseline had equivalent business workload.",verify:"Verify the candidate SQL no longer enters the top resource set under the same workload.",confidence:"medium",source:"Incident ↔ baseline SQL comparison"});
  findings.sort((a,b)=>severityRank[b.severity]-severityRank[a.severity]||b.score-a.score);return {...incident,findings,posture:findings[0]?.severity==="critical"?"Immediate triage":findings[0]?.severity==="high"?"Material regression":incident.posture,dominant:findings[0]?.category||incident.dominant};
}

const demoReport=`WORKLOAD REPOSITORY report for\nDB Name: ORDERS\nInstance: orders1\nElapsed: 60.0 (mins)\nDB Time: 1,080.0 (mins)\nCPUs: 16\n\nLoad Profile\nMetric  Per Second  Per Transaction\nDB Time(s)  18.0  0.36\nExecutions (SQL)  820.0  16.4\nHard parses  18.2  0.36\nPhysical reads  24500  490\n\nTime Model Statistics\nStatistic Name  Time (s)  % of DB Time\nDB CPU  29160  45.0\nsql execute elapsed time  62200  96.0\n\nTop 5 Timed Foreground Events\nEvent  Wait Class  Waits  Time (s)  Avg wait (ms)  % DB time\ndb file sequential read  User I/O  1200000  16800  14.0  25.9\nlog file sync  Commit  440000  7200  16.4  11.1\nenq: TX - row lock contention  Application  8800  5100  579.5  7.9\ndirect path read temp  User I/O  62000  3900  62.9  6.0\n\nSQL ordered by Elapsed Time\nElapsed Time (s)  Executions  CPU Time (s)  Physical Reads  SQL Id  SQL Text\n12400  450  2800  800000  8m5j1t2y4n6p9  SELECT order lines by customer\n8900  440000  5100  25000  2cz7h4q9r1abc  COMMIT\n\nSQL ordered by CPU Time\nCPU Time (s)  Executions  Buffer Gets  SQL Id  SQL Text\n2800  450  980000000  8m5j1t2y4n6p9  SELECT order lines by customer\n\nSQL ordered by Reads\nPhysical Reads  Executions  Elapsed Time (s)  SQL Id  SQL Text\n800000  450  12400  8m5j1t2y4n6p9  SELECT order lines by customer\n\nSegments by Physical Reads\nOwner  Tablespace  Object Name  Reads\nAPP  DATA  ORDER_LINES  740000\n\nPGA Aggr Summary\nMetric  Value\nextra bytes read/written  82000000000\n`;

const formatMetric=(value:number|null,digits=1)=>value===null?"—":value.toLocaleString(undefined,{maximumFractionDigits:digits});

export default function AwrAshAnalyzer({onNotify}:{onNotify?:(message:string)=>void}){
  const [incidentText,setIncidentText]=useState("");const [baselineText,setBaselineText]=useState("");const [incidentName,setIncidentName]=useState("incident-report.html");const [baselineName,setBaselineName]=useState("known-good-report.html");const [analysis,setAnalysis]=useState<Analysis|null>(null);const [view,setView]=useState<EvidenceView>("findings");const [severity,setSeverity]=useState<"all"|Severity>("all");const [query,setQuery]=useState("");const incidentFile=useRef<HTMLInputElement>(null),baselineFile=useRef<HTMLInputElement>(null);
  const readFile=async(file:File|undefined,target:"incident"|"baseline")=>{if(!file)return;if(file.size>12_000_000){onNotify?.("Report is larger than the 12 MB local safety limit");return}const text=await file.text();if(target==="incident"){setIncidentText(text);setIncidentName(file.name)}else{setBaselineText(text);setBaselineName(file.name)}onNotify?.(`${file.name} loaded locally; nothing was uploaded`)};
  const run=()=>{if(!incidentText.trim()){onNotify?.("Paste or upload an AWR or ASH report first");return}const incident=analyzeSingle(incidentText,incidentName);const result=baselineText.trim()?applyBaseline(incident,analyzeSingle(baselineText,baselineName)):incident;setAnalysis(result);setView("findings");onNotify?.(`${result.findings.length} evidence-backed findings ranked`)};
  const filtered=useMemo(()=>analysis?.findings.filter(item=>(severity==="all"||item.severity===severity)&&(!query.trim()||`${item.title} ${item.category} ${item.evidence} ${item.cause}`.toLowerCase().includes(query.toLowerCase())))||[],[analysis,severity,query]);
  const exportAnalysis=()=>{if(!analysis)return;const payload=JSON.stringify({...analysis,baselineUsed:Boolean(baselineText.trim())},null,2),url=URL.createObjectURL(new Blob([payload],{type:"application/json"})),anchor=document.createElement("a");anchor.href=url;anchor.download=`awr-ash-analysis-${new Date().toISOString().slice(0,10)}.json`;anchor.click();URL.revokeObjectURL(url)};
  const copySummary=async()=>{if(!analysis)return;const text=[`${analysis.posture} · ${analysis.kind}`,`Dominant: ${analysis.dominant}`,`Confidence: ${analysis.confidence}%`,...analysis.findings.slice(0,5).map((item,index)=>`${index+1}. [${item.severity.toUpperCase()}] ${item.title} — ${item.action}`)].join("\n");await navigator.clipboard.writeText(text);onNotify?.("DBA triage summary copied")};
  return <section className="awr-analyzer">
    <header className="awr-hero"><div><span>AWR</span><p><b>Oracle AWR + ASH Performance Investigator</b><small>Local report parsing · response-time correlation · DBA-safe findings</small></p></div><aside><em>ORACLE DIAGNOSTICS PACK</em><strong>NO REPORT UPLOAD</strong></aside></header>
    <div className="awr-method-strip"><p><b>Performance method</b><small>Scope the interval → rank DB time → correlate waits, SQL, sessions and objects → compare baseline → verify outcome.</small></p><a href="https://docs.oracle.com/en/database/oracle/oracle-database/19/tgdba/gathering-database-statistics.html" target="_blank" rel="noreferrer">Oracle AWR method</a><a href="https://docs.oracle.com/en/database/oracle/oracle-database/26/tdppt/active-session-history-reports.html" target="_blank" rel="noreferrer">Oracle ASH guide</a></div>
    <div className="awr-input-grid">
      <article><header><div><span>01</span><p><b>Incident report</b><small>AWR, AWR Compare, or ASH · HTML / TXT / CSV</small></p></div><em>REQUIRED</em></header><input ref={incidentFile} hidden type="file" accept=".html,.htm,.txt,.csv" onChange={event=>readFile(event.target.files?.[0],"incident")}/><div className="awr-filebar"><button onClick={()=>incidentFile.current?.click()}>Upload report</button><span>{incidentName}</span><small>{incidentText?`${(new Blob([incidentText]).size/1024).toFixed(0)} KB loaded`:"Paste or select a report"}</small></div><textarea value={incidentText} onChange={event=>setIncidentText(event.target.value)} placeholder="Paste the complete Oracle AWR or ASH report here…" spellCheck={false}/></article>
      <article className="baseline"><header><div><span>02</span><p><b>Known-good baseline</b><small>Optional AWR or ASH for regression comparison</small></p></div><em>OPTIONAL</em></header><input ref={baselineFile} hidden type="file" accept=".html,.htm,.txt,.csv" onChange={event=>readFile(event.target.files?.[0],"baseline")}/><div className="awr-filebar"><button onClick={()=>baselineFile.current?.click()}>Upload baseline</button><span>{baselineName}</span><small>{baselineText?`${(new Blob([baselineText]).size/1024).toFixed(0)} KB loaded`:"Adds normalized deltas"}</small></div><textarea value={baselineText} onChange={event=>setBaselineText(event.target.value)} placeholder="Paste a representative known-good report to find regressions…" spellCheck={false}/></article>
    </div>
    <div className="awr-actions"><button className="secondary" onClick={()=>{setIncidentText(demoReport);setIncidentName("orders-incident-demo.txt");setAnalysis(null)}}>Load realistic demo</button><button className="secondary" onClick={()=>{setIncidentText("");setBaselineText("");setAnalysis(null)}}>Clear</button><p><b>Private by design</b><small>Parsing and ranking stay inside this browser tab. SQL text is never sent to the Studio agent.</small></p><button className="primary" onClick={run}>Analyze performance report</button></div>
    {!analysis?<div className="awr-empty"><span>DB</span><p><b>Turn a long Oracle report into an ordered DBA investigation</b><small>The analyzer detects report coverage, computes AAS, ranks DB-time consumers, correlates repeated SQL_IDs, finds ASH concentration, flags evidence gaps, and produces a verification-first action plan.</small></p><div>{["DB TIME","WAIT EVENTS","TOP SQL","ASH PIVOTS","OBJECTS","MEMORY / TEMP","RAC","BASELINE DELTAS"].map(item=><em key={item}>{item}</em>)}</div></div>:<>
      <section className="awr-verdict"><div className={`signal ${analysis.findings[0]?.severity||"info"}`}><span>{analysis.findings[0]?.severity.toUpperCase()}</span><b>{analysis.posture}</b><small>{analysis.dominant} is the leading evidence path</small></div><div className="awr-kpis"><article><small>REPORT</small><b>{analysis.kind}</b><em>{analysis.dbName} · {analysis.instance}</em></article><article><small>AVERAGE ACTIVE</small><b>{formatMetric(analysis.aas,2)}</b><em>{analysis.cpuCount===null?"CPU count unavailable":`${formatMetric(analysis.cpuCount,0)} CPUs`}</em></article><article><small>DB TIME</small><b>{analysis.dbTimeMinutes===null?"—":`${formatMetric(analysis.dbTimeMinutes)}m`}</b><em>{analysis.elapsedMinutes===null?"Interval unavailable":`${formatMetric(analysis.elapsedMinutes)}m interval`}</em></article><article><small>DB CPU SHARE</small><b>{analysis.dbCpuPct===null?"—":`${formatMetric(analysis.dbCpuPct)}%`}</b><em>of captured DB time</em></article><article><small>CONFIDENCE</small><b>{analysis.confidence}%</b><em>{analysis.coverage.filter(item=>item.present).length}/{analysis.coverage.length} evidence areas</em></article><article><small>FINDINGS</small><b>{analysis.findings.length}</b><em>{analysis.findings.filter(item=>severityRank[item.severity]>=3).length} high priority</em></article></div></section>
      <nav className="awr-tabs">{(["findings","waits","sql","ash","coverage"] as EvidenceView[]).map(item=><button key={item} className={view===item?"active":""} onClick={()=>setView(item)}>{item==="ash"?"ASH pivots":item}</button>)}<span/><button onClick={copySummary}>Copy triage</button><button onClick={exportAnalysis}>Export JSON</button></nav>
      {view==="findings"&&<section className="awr-findings"><header><div><b>Ranked findings and verification plan</b><small>Evidence is separated from inference; missing sections reduce confidence instead of becoming “healthy”.</small></div><label>SEVERITY<select value={severity} onChange={event=>setSeverity(event.target.value as typeof severity)}><option value="all">All</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="info">Info</option></select></label><label>FILTER<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="wait, SQL_ID, parsing…"/></label></header><div>{filtered.map((item,index)=><article key={item.id} className={item.severity}><aside><span>{String(index+1).padStart(2,"0")}</span><em>{item.severity}</em><strong>{item.score}</strong></aside><main><header><p><small>{item.category}</small><b>{item.title}</b></p><em>{item.confidence} confidence</em></header><section><div><small>EVIDENCE</small><p>{item.evidence}</p><code>{item.source}</code></div><div><small>LIKELY CAUSE</small><p>{item.cause}</p></div><div><small>SAFE NEXT ACTION</small><p>{item.action}</p></div><div><small>VERIFY OUTCOME</small><p>{item.verify}</p></div></section></main></article>)}</div></section>}
      {view==="waits"&&<section className="awr-table-view"><header><div><b>Wait-event response-time map</b><small>Foreground events ranked by DB-time share or captured time.</small></div><em>{analysis.waits.length} EVENTS</em></header><div className="awr-data-table"><table><thead><tr><th>Event</th><th>Class</th><th>Waits</th><th>Time (s)</th><th>Avg ms</th><th>% DB time</th><th>DBA interpretation</th></tr></thead><tbody>{analysis.waits.map(item=><tr key={item.event}><td><b>{item.event}</b><small>{item.source}</small></td><td>{item.waitClass||"—"}</td><td>{formatMetric(item.waits,0)}</td><td>{formatMetric(item.timeSeconds)}</td><td>{formatMetric(item.avgMs,2)}</td><td><span className={(item.dbTimePct??0)>=30?"hot":""}>{item.dbTimePct===null?"—":`${formatMetric(item.dbTimePct)}%`}</span></td><td>{eventAdvice(item.event).cause}</td></tr>)}</tbody></table>{!analysis.waits.length&&<p className="awr-no-data">No foreground wait table was detected. Upload the complete report instead of a screenshot or partial copy.</p>}</div></section>}
      {view==="sql"&&<section className="awr-table-view"><header><div><b>SQL culprit correlation</b><small>Repeated appearances across elapsed, CPU, reads, gets and ASH increase confidence.</small></div><em>{analysis.sql.length} SQL IDS</em></header><div className="awr-data-table"><table><thead><tr><th>SQL_ID</th><th>Rank metric</th><th>Elapsed s</th><th>CPU s</th><th>Executions</th><th>Gets</th><th>Reads</th><th>Module / SQL text</th></tr></thead><tbody>{analysis.sql.map(item=><tr key={item.sqlId}><td><b className="sql-id">{item.sqlId}</b><small>{item.source}</small></td><td>{formatMetric(item.metric)}<small>{item.metricLabel}</small></td><td>{formatMetric(item.elapsedSeconds)}</td><td>{formatMetric(item.cpuSeconds)}</td><td>{formatMetric(item.executions,0)}</td><td>{formatMetric(item.gets,0)}</td><td>{formatMetric(item.reads,0)}</td><td>{item.module||item.text||"—"}</td></tr>)}</tbody></table>{!analysis.sql.length&&<p className="awr-no-data">No SQL ranking section was detected. Include “SQL ordered by” or ASH Top SQL sections.</p>}</div></section>}
      {view==="ash"&&<section className="awr-table-view"><header><div><b>ASH concentration pivots</b><small>Sessions, blockers, modules, SQL, objects and events from sampled active activity.</small></div><em>{analysis.ash.length} DIMENSIONS</em></header><div className="awr-ash-grid">{analysis.ash.map((item,index)=><article key={`${item.dimension}-${item.value}-${index}`}><header><small>{item.dimension}</small><b>{item.activityPct===null?"—":`${formatMetric(item.activityPct)}%`}</b></header><p>{item.value}</p><footer><span style={{width:`${Math.min(100,item.activityPct??0)}%`}}/><small>{item.samples===null?"sample count unavailable":`${formatMetric(item.samples,0)} samples`}</small></footer></article>)}</div>{!analysis.ash.length&&<p className="awr-no-data">This is not an ASH report, or no ASH dimension tables were detected. Upload a focused ASH report to identify transient session, module and blocker concentration.</p>}</section>}
      {view==="coverage"&&<section className="awr-coverage"><header><div><b>Evidence coverage and blind spots</b><small>Evidence gaps lower confidence; a recommendation requires more than a single ratio or wait event.</small></div><em>{analysis.coverage.filter(item=>item.present).length}/{analysis.coverage.length} PRESENT</em></header><div>{analysis.coverage.map(item=><article key={item.key} className={item.present?"present":"missing"}><span>{item.present?"✓":"!"}</span><p><b>{item.label}</b><small>{item.why}</small></p><em>{item.present?"DETECTED":"EVIDENCE GAP"}</em></article>)}</div><section><b>Recommended capture order</b><ol><li>Use an incident interval that exactly overlaps the user-visible slowdown.</li><li>Compare with an equivalent known-good business workload, normalized by time and executions.</li><li>Correlate time model, foreground waits, SQL, segments and ASH before choosing a remedy.</li><li>Change one controlled variable, then verify response time, throughput and DB-time contribution.</li></ol></section></section>}
    </>}
    <footer className="awr-license-note"><b>License boundary</b><span>AWR and ASH require the appropriate Oracle Diagnostics Pack license. DBridge only analyzes a report you already possess and never enables licensed collection.</span></footer>
  </section>;
}
