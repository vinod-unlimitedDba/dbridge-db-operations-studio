"use client";
import {useEffect,useMemo,useRef,useState} from "react";

type Engine="auto"|"oracle"|"postgres"|"sqlserver"|"mysql"|"mariadb"|"mongodb";
type Severity="critical"|"high"|"medium"|"info";
type Node={id:string;parentId:string|null;depth:number;operation:string;object:string;estimatedRows:number|null;actualRows:number|null;cost:number|null;actualTimeMs:number|null;loops:number|null;buffers:number|null;warning:string;predicate:string};
type Plan={engine:Engine;nodes:Node[];kind:string;actual:boolean;warning:string};
type Finding={id:string;severity:Severity;score:number;node:Node;title:string;evidence:string;action:string};

const engineOptions:{id:Engine;label:string;accept:string}[]=[
  {id:"auto",label:"Auto detect",accept:".txt,.log,.json,.xml,.sqlplan,.plan"},{id:"oracle",label:"Oracle DBMS_XPLAN",accept:".txt,.log,.plan"},{id:"postgres",label:"PostgreSQL EXPLAIN",accept:".txt,.json,.plan"},{id:"sqlserver",label:"SQL Server Showplan",accept:".sqlplan,.xml"},{id:"mysql",label:"MySQL EXPLAIN",accept:".txt,.json,.plan"},{id:"mariadb",label:"MariaDB ANALYZE",accept:".txt,.json,.plan"},{id:"mongodb",label:"MongoDB explain",accept:".json,.txt"}];
const uploadLabels={baseline:"Upload baseline plan",candidate:"Upload candidate plan"};
const severityRank:Record<Severity,number>={critical:4,high:3,medium:2,info:1};
const toNumber=(value:unknown)=>{const match=String(value??"").replaceAll(",","").match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);const parsed=match?Number(match[0]):NaN;return Number.isFinite(parsed)?parsed:null};
const durationMs=(value:unknown)=>{const text=String(value??"").trim();if(!text)return null;if(!text.includes(":"))return toNumber(text);const parts=text.split(":").map(Number);if(parts.some(item=>!Number.isFinite(item)))return null;return parts.reduce((total,item)=>total*60+item,0)*1000};
const pick=(object:any,keys:string[])=>{for(const key of keys)if(object?.[key]!==undefined&&object?.[key]!==null)return object[key];return null};
const format=(value:number|null,unit="")=>value===null?"—":`${Intl.NumberFormat("en",{notation:Math.abs(value)>=10000?"compact":"standard",maximumFractionDigits:2}).format(value)}${unit}`;
const factor=(actual:number|null,estimated:number|null)=>actual===null||estimated===null?null:Math.max((actual||.0001)/(estimated||.0001),(estimated||.0001)/(actual||.0001));
const signature=(node:Node)=>`${node.operation.replace(/\s+/g," ").toLowerCase()}|${node.object.toLowerCase()}`;
const shorten=(value:string,max=68)=>value.length>max?value.slice(0,max-1)+"…":value;

function detectEngine(text:string):Engine{
  if(/ShowPlanXML|<RelOp|StatementSubTreeCost/i.test(text))return "sqlserver";
  if(/Plan hash value|DBMS_XPLAN|E-Rows|A-Rows|TABLE ACCESS/i.test(text))return "oracle";
  if(/"queryPlanner"|"executionStats"|COLLSCAN|IXSCAN/i.test(text))return "mongodb";
  if(/Node Type|Shared Hit Blocks|Planning Time|actual time=.*rows=.*loops=/i.test(text))return "postgres";
  if(/query_block|nested_loop|cost=.*actual time=/i.test(text))return "mysql";
  return "auto";
}

function parseJson(value:any):Node[]{
  const nodes:Node[]=[];let sequence=0;
  const childKeys=["Plan","Plans","inputs","input","inputStage","inputStages","executionStages","thenStage","elseStage","outerStage","innerStage","children","query_block","nested_loop","table","ordering_operation","grouping_operation","duplicates_removal","materialized_from_subquery"];
  const visit=(item:any,parentId:string|null,depth:number,key="root")=>{
    if(Array.isArray(item)){item.forEach(child=>visit(child,parentId,depth,key));return}
    if(!item||typeof item!=="object")return;
    const operation=String(pick(item,["Node Type","operation","stage","PhysicalOp","LogicalOp","access_type","select_type"])||(["table","query_block"].includes(key)?key.replaceAll("_"," "):""));
    const isNode=Boolean(operation)||["table","nested_loop","ordering_operation","grouping_operation","duplicates_removal","materialized_from_subquery"].includes(key);
    let childParent=parentId,childDepth=depth;
    if(isNode){
      const id=`j${++sequence}`,object=String(pick(item,["Relation Name","Alias","table_name","collection","indexName","key","Index Name","Object"])||pick(item.table,["table_name","access_type"])||"");
      const warning=[pick(item,["Warnings","warning"]),item.usedDisk?"Used disk":"",Number(item.spills||0)>0?`${item.spills} spill(s)`:""].filter(Boolean).join(" · ");
      nodes.push({id,parentId,depth,operation:operation||key.replaceAll("_"," "),object,estimatedRows:toNumber(pick(item,["Plan Rows","estimated_rows","rows_examined_per_scan","rows_estimate","EstimatedRows"])),actualRows:toNumber(pick(item,["Actual Rows","actual_rows","nReturned","n_returned","rows_produced_per_join"])),cost:toNumber(pick(item,["Total Cost","estimated_total_cost","cost_info.query_cost","EstimatedTotalSubtreeCost"])),actualTimeMs:toNumber(pick(item,["Actual Total Time","actual_last_row_ms","executionTimeMillisEstimate","executionTimeMillis","time_inclusive"])),loops:toNumber(pick(item,["Actual Loops","actual_loops","loops","opens"])),buffers:toNumber(pick(item,["Shared Read Blocks","Shared Hit Blocks","totalDocsExamined","docsExamined","keysExamined","numReads"])),warning,predicate:String(pick(item,["Filter","Index Cond","Hash Cond","Join Filter","filter_condition","attached_condition","indexBounds","lookup_condition"])||"")});
      childParent=id;childDepth=depth+1;
    }
    const handled=new Set<string>();for(const childKey of childKeys)if(item[childKey]!==undefined){handled.add(childKey);visit(item[childKey],childParent,childDepth,childKey)}
    if(!isNode)for(const [childKey,child] of Object.entries(item))if(!handled.has(childKey)&&(Array.isArray(child)||typeof child==="object"))visit(child,childParent,childDepth,childKey);
  };
  visit(value,null,0);return nodes;
}

function parseXml(text:string):Node[]{
  const documentXml=new DOMParser().parseFromString(text,"application/xml");if(documentXml.querySelector("parsererror"))return [];
  const elements=[...documentXml.querySelectorAll("RelOp")];
  const flat=elements.map((element,index)=>{
    const parent=element.parentElement?.closest("RelOp"),runtime=[...element.querySelectorAll(":scope > RunTimeInformation > RunTimeCountersPerThread")];
    const sum=(attribute:string)=>runtime.reduce((total,item)=>total+(toNumber(item.getAttribute(attribute))||0),0),max=(attribute:string)=>runtime.reduce((value,item)=>Math.max(value,toNumber(item.getAttribute(attribute))||0),0);
    const object=element.querySelector(":scope > * Object, :scope > * IndexScan Object, :scope > * TableScan Object");
    return {id:`x${element.getAttribute("NodeId")||index+1}`,parentId:parent?`x${parent.getAttribute("NodeId")||elements.indexOf(parent)+1}`:null,depth:0,operation:element.getAttribute("PhysicalOp")||element.getAttribute("LogicalOp")||"RelOp",object:[object?.getAttribute("Database"),object?.getAttribute("Schema"),object?.getAttribute("Table"),object?.getAttribute("Index")].filter(Boolean).join("."),estimatedRows:toNumber(element.getAttribute("EstimateRows")),actualRows:runtime.length?sum("ActualRows"):null,cost:toNumber(element.getAttribute("EstimatedTotalSubtreeCost")),actualTimeMs:runtime.length?max("ActualElapsedms"):null,loops:runtime.length?sum("ActualExecutions"):null,buffers:runtime.length?sum("ActualLogicalReads"):null,warning:element.querySelector(":scope > Warnings")?.textContent?.trim()||"",predicate:element.querySelector(":scope ScalarOperator")?.getAttribute("ScalarString")||""} as Node;
  });
  return flat.map(node=>{let depth=0,parent=node.parentId;const seen=new Set<string>();while(parent&&!seen.has(parent)){seen.add(parent);depth++;parent=flat.find(item=>item.id===parent)?.parentId||null}return {...node,depth}});
}

function parseText(text:string,engine:Engine):Node[]{
  const nodes:Node[]=[],parents:string[]=[];let oracleHeaders:string[]=[];
  for(const raw of text.split(/\r?\n/)){
    if(/^\|.*Id.*Operation/i.test(raw)){oracleHeaders=raw.split("|").map(item=>item.trim().toLowerCase());continue}
    if(engine==="oracle"&&/^\|\s*\*?\s*\d+\s*\|/.test(raw)){
      const parts=raw.split("|").map(item=>item.trim()),get=(names:string[])=>{const index=oracleHeaders.findIndex(header=>names.includes(header));return index>=0?parts[index]:null};
      const source=String(get(["operation"])||"Row source"),id=`o${String(get(["id"])||nodes.length+1).replace(/\D/g,"")}`,depth=Math.max(0,Math.floor((source.match(/^\s*/)?.[0].length||0)/2));while(parents.length>depth)parents.pop();
      nodes.push({id,parentId:depth?parents[depth-1]||null:null,depth,operation:source.trim(),object:String(get(["name"])||""),estimatedRows:toNumber(get(["e-rows","rows"])),actualRows:toNumber(get(["a-rows"])),cost:toNumber(get(["cost (%cpu)","cost"])),actualTimeMs:durationMs(get(["a-time","actual time"])),loops:toNumber(get(["starts"])),buffers:toNumber(get(["buffers","reads"])),warning:/TEMP|FULL|CARTESIAN/i.test(source)?"Review operator":"",predicate:""});parents[depth]=id;continue;
    }
    if(/Sort Method:.*(?:external|disk)|spill/i.test(raw)&&nodes.length){nodes[nodes.length-1].warning=raw.trim();continue}
    const match=raw.match(/^(\s*)(?:->\s*)?(.+?)(?:\s+\(cost=([\d.e+-]+)(?:\.\.([\d.e+-]+))?\s+rows=([\d.e+-]+)[^)]*\))?(?:\s+\(actual time=([\d.e+-]+)(?:\.\.([\d.e+-]+))?\s+rows=([\d.e+-]+)\s+loops=([\d.e+-]+)\))?\s*$/i);
    if(!match||!match[2]||!/(scan|join|sort|aggregate|filter|loop|lookup|fetch|limit|materialize|gather|result|group|union|append|search|collscan|ixscan)/i.test(match[2]))continue;
    const depth=Math.max(0,Math.floor((match[1].length+(raw.includes("->")?2:0))/2));while(parents.length>depth)parents.pop();
    const id=`t${nodes.length+1}`,operation=match[2].trim().replace(/\s{2,}.*/,""),object=operation.match(/(?: on | using | lookup on | scan on )([\w.$"-]+)/i)?.[1]||"";
    nodes.push({id,parentId:depth?parents[depth-1]||null:null,depth,operation,object,estimatedRows:toNumber(match[5]),actualRows:toNumber(match[8]),cost:toNumber(match[4]||match[3]),actualTimeMs:toNumber(match[7]||match[6]),loops:toNumber(match[9]),buffers:null,warning:/spill|disk|external|temp/i.test(raw)?"Disk or temporary work reported":"",predicate:""});parents[depth]=id;
  }
  return nodes;
}

function parsePlan(text:string,requested:Engine):Plan{
  const trimmed=text.trim(),engine=requested==="auto"?detectEngine(trimmed):requested;let nodes:Node[]=[],kind="Text plan";
  if(!trimmed)return {engine,nodes,kind,actual:false,warning:"No plan supplied"};
  if(trimmed.startsWith("<")){nodes=parseXml(trimmed);kind="Showplan XML"}
  else if(trimmed.startsWith("{")||trimmed.startsWith("[")){try{nodes=parseJson(JSON.parse(trimmed));kind="Structured JSON"}catch{nodes=[]}}
  if(!nodes.length)nodes=parseText(trimmed,engine);
  return {engine,nodes,kind,actual:nodes.some(node=>node.actualRows!==null||node.actualTimeMs!==null),warning:nodes.length?"":"No recognizable operators found. Use engine-native text, JSON, XML, or .sqlplan output."};
}

function matchPlans(baseline:Plan,candidate:Plan){
  const buckets=new Map<string,Node[]>();baseline.nodes.forEach(node=>buckets.set(signature(node),[...(buckets.get(signature(node))||[]),node]));const used=new Set<string>();
  return candidate.nodes.map(node=>{const match=(buckets.get(signature(node))||[]).find(item=>!used.has(item.id))||null;if(match)used.add(match.id);return {node,match}});
}

function investigate(baseline:Plan,candidate:Plan):Finding[]{
  const matches=matchPlans(baseline,candidate),totalTime=Math.max(...candidate.nodes.map(node=>node.actualTimeMs||0),0),findings:Finding[]=[];
  const add=(severity:Severity,score:number,node:Node,title:string,evidence:string,action:string)=>findings.push({id:`${node.id}-${title}`,severity,score,node,title,evidence,action});
  for(const {node,match} of matches){
    const error=factor(node.actualRows,node.estimatedRows),share=totalTime&&node.actualTimeMs!==null?node.actualTimeMs/totalTime:0,work=(node.actualRows||node.estimatedRows||0)*(node.loops||1),operator=node.operation.toLowerCase();
    if(error!==null&&error>=10)add(error>=100?"critical":"high",Math.min(100,45+Math.log10(error)*20),node,"Cardinality estimate failure",`Actual rows differ from estimated rows by ${format(error,"×")} (${format(node.estimatedRows)} estimated vs ${format(node.actualRows)} actual).`,"Refresh representative statistics and histograms; verify predicates, bind values, and column correlation, then retest.");
    if(share>=.2)add(share>=.5?"critical":"high",Math.min(100,50+share*45),node,"Dominant elapsed-time operator",`${format(node.actualTimeMs," ms")} is about ${Math.round(share*100)}% of the largest observed operator time.`,"Inspect this operator's inputs, waits, access path, and row flow; optimize the first expensive child rather than the root label alone.");
    if(/seq scan|table access full|table scan|collscan|clustered index scan/.test(operator)&&work>=10000)add(work>=1000000?"critical":"high",Math.min(96,55+Math.log10(work)*6),node,"High-volume full scan",`${format(work)} row-visits across ${format(node.loops||1)} loop(s) use ${node.operation}.`,"Confirm selectivity and partition pruning. Evaluate a covering or selective index only after checking its write cost.");
    if(node.warning||/external merge|disk|temp/.test(operator))add("high",82,node,"Runtime warning or spill",node.warning||`${node.operation} reports disk or temporary work.`,"Check memory grant or work-area sizing, row-estimate accuracy, and input cardinality; remove the spill cause before increasing memory globally.");
    if((/nested loop/.test(operator)||/lookup|index scan/.test(operator))&&(node.loops||0)>=1000)add("high",78,node,"Nested-loop amplification",`${format(node.loops)} executions multiply inner-side work; observed row-visits are ${format(work)}.`,"Review the outer-row estimate, join predicate, and inner index. Compare hash or merge alternatives in non-production.");
    if((node.buffers||0)>=10000)add((node.buffers||0)>=100000?"critical":"high",86,node,"Heavy read footprint",`${format(node.buffers)} buffers, pages, documents, or keys were examined.`,"Separate cache hits from physical reads where available, then reduce scanned rows before tuning storage.");
    if(match&&node.actualTimeMs!==null&&match.actualTimeMs!==null&&node.actualTimeMs>match.actualTimeMs*2&&node.actualTimeMs-match.actualTimeMs>=5)add(node.actualTimeMs>match.actualTimeMs*5?"critical":"high",88,node,"Operator runtime regressed",`${format(match.actualTimeMs," ms")} → ${format(node.actualTimeMs," ms")} (${format(node.actualTimeMs/Math.max(match.actualTimeMs,.001),"×")}).`,"Compare row counts, predicates, parameters, statistics, memory, and upstream plan changes between captures.");
    if(!match&&(node.actualTimeMs||0)>0)add("medium",55,node,"New operator in candidate",`${node.operation}${node.object?` on ${node.object}`:""} has no matched baseline operator.`,"Verify whether this plan-shape change explains the regression; do not force the old plan before workload validation.");
  }
  if(!candidate.actual&&candidate.nodes[0])add("info",20,candidate.nodes[0],"Runtime evidence is missing","This appears to be an estimated plan; actual rows, elapsed time, loops, buffers, and spills may be unavailable.","Capture an authorized runtime plan. For mutating SQL, use a safe non-production method or rollback transaction.");
  return findings.sort((a,b)=>severityRank[b.severity]-severityRank[a.severity]||b.score-a.score).slice(0,30);
}

const demoA=`Hash Join  (cost=120.00..480.00 rows=1200 width=64) (actual time=1.20..44.00 rows=1180 loops=1)
  -> Seq Scan on orders  (cost=0.00..280.00 rows=1200 width=32) (actual time=0.20..18.00 rows=1180 loops=1)
  -> Seq Scan on customers  (cost=0.00..90.00 rows=2200 width=32) (actual time=0.10..0.50 rows=2200 loops=1)`;
const demoB=`Nested Loop  (cost=0.85..920.00 rows=22 width=64) (actual time=0.40..2840.00 rows=184220 loops=1)
  -> Seq Scan on orders  (cost=0.00..480.00 rows=20 width=32) (actual time=0.15..840.00 rows=184220 loops=1)
  -> Index lookup on customers using customers_pk  (cost=0.85..1.10 rows=1 width=32) (actual time=0.008..0.011 rows=1 loops=184220)`;

function PlanTree({plan,matchedIds,search}:{plan:Plan;matchedIds?:Set<string>;search:string}){
  const maxTime=Math.max(...plan.nodes.map(node=>node.actualTimeMs||0),1),needle=search.trim().toLowerCase();
  return <div className="epi-tree">{plan.nodes.map((node,index)=>{const error=factor(node.actualRows,node.estimatedRows),heat=(node.actualTimeMs||0)/maxTime,culprit=(error||0)>=10||heat>=.4||Boolean(node.warning),hidden=Boolean(needle&&!`${node.operation} ${node.object} ${node.predicate}`.toLowerCase().includes(needle));return <article key={node.id} className={`${culprit?"culprit":""} ${matchedIds&&!matchedIds.has(node.id)?"changed":""} ${hidden?"dimmed":""}`} style={{"--depth":Math.min(node.depth,8),"--heat":`${Math.max(4,heat*100)}%`} as React.CSSProperties}><span className="epi-line">{String(index+1).padStart(2,"0")}</span><div className="epi-node-main"><header><i>{culprit?"!":"OP"}</i><p><b>{node.operation}</b><small>{node.object||node.predicate||"operator"}</small></p><em>{error&&error>=2?`${format(error)}× error`:node.warning?"warning":""}</em></header><div className="epi-node-metrics"><span><small>EST ROWS</small><b>{format(node.estimatedRows)}</b></span><span><small>ACT ROWS</small><b>{format(node.actualRows)}</b></span><span><small>TIME</small><b>{format(node.actualTimeMs," ms")}</b></span><span><small>LOOPS</small><b>{format(node.loops)}</b></span></div><div className="epi-heat"><i/></div></div></article>})}{!plan.nodes.length&&<div className="epi-no-plan"><b>Waiting for a readable plan</b><span>{plan.warning}</span></div>}</div>;
}

export default function ExecutionPlanInvestigator({engine,capturedPlan,onNotify}:{engine:string;capturedPlan?:string;onNotify:(message:string)=>void}){
  const initial=(engineOptions.some(item=>item.id===engine)?engine:"auto") as Engine;
  const [selectedEngine,setSelectedEngine]=useState<Engine>(initial),[baselineText,setBaselineText]=useState(""),[candidateText,setCandidateText]=useState(""),[baselineName,setBaselineName]=useState("Known-good plan"),[candidateName,setCandidateName]=useState("Candidate plan"),[baselineFile,setBaselineFile]=useState(""),[candidateFile,setCandidateFile]=useState(""),[view,setView]=useState<"compare"|"candidate"|"table"|"raw">("compare"),[search,setSearch]=useState(""),[severity,setSeverity]=useState<"all"|Severity>("all"),[selectedFinding,setSelectedFinding]=useState(0);
  const baselineInput=useRef<HTMLInputElement>(null),candidateInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(capturedPlan&&!candidateText){setCandidateText(capturedPlan);setCandidateName("Live captured plan");setCandidateFile("Agent capture")}},[capturedPlan,candidateText]);
  const baseline=useMemo(()=>parsePlan(baselineText,selectedEngine),[baselineText,selectedEngine]),candidate=useMemo(()=>parsePlan(candidateText,selectedEngine),[candidateText,selectedEngine]),pairs=useMemo(()=>matchPlans(baseline,candidate),[baseline,candidate]),findings=useMemo(()=>investigate(baseline,candidate),[baseline,candidate]),visible=findings.filter(item=>severity==="all"||item.severity===severity),active=visible[Math.min(selectedFinding,Math.max(0,visible.length-1))]||null;
  const baselineMatched=new Set(pairs.map(item=>item.match?.id).filter(Boolean) as string[]),candidateMatched=new Set(pairs.filter(item=>item.match).map(item=>item.node.id)),actualCoverage=candidate.nodes.length?Math.round(candidate.nodes.filter(node=>node.actualRows!==null||node.actualTimeMs!==null).length/candidate.nodes.length*100):0,matched=Math.round(pairs.filter(item=>item.match).length/Math.max(candidate.nodes.length,1)*100),baselineTime=Math.max(...baseline.nodes.map(node=>node.actualTimeMs||0),0),candidateTime=Math.max(...candidate.nodes.map(node=>node.actualTimeMs||0),0),timeDelta=baselineTime?(candidateTime-baselineTime)/baselineTime*100:null;
  const readFile=async(file:File|undefined,target:"baseline"|"candidate")=>{if(!file)return;if(file.size>4*1024*1024)return onNotify("Plan files are limited to 4 MB each");const text=await file.text();if(target==="baseline"){setBaselineText(text);setBaselineFile(file.name);setBaselineName(file.name)}else{setCandidateText(text);setCandidateFile(file.name);setCandidateName(file.name)}onNotify(`${file.name} loaded and parsed locally`)};
  const exportReport=()=>{const payload={generatedAt:new Date().toISOString(),engine:candidate.engine,baseline:{name:baselineName,file:baselineFile,plan:baseline},candidate:{name:candidateName,file:candidateFile,plan:candidate},comparison:{matchedPercent:matched,actualCoveragePercent:actualCoverage,elapsedDeltaPercent:timeDelta},findings};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="execution-plan-investigation.json";link.click();URL.revokeObjectURL(url);onNotify("Plan investigation report exported")};
  const loadDemo=()=>{setSelectedEngine("postgres");setBaselineText(demoA);setCandidateText(demoB);setBaselineName("Known-good 44 ms");setCandidateName("Regressed 2.84 s");setBaselineFile("DBA demo");setCandidateFile("DBA demo");onNotify("Loaded a demo with cardinality failure and nested-loop amplification")};
  const swap=()=>{setBaselineText(candidateText);setCandidateText(baselineText);setBaselineName(candidateName);setCandidateName(baselineName);setBaselineFile(candidateFile);setCandidateFile(baselineFile)};
  return <section className="execution-plan-investigator">
    <header className="epi-hero"><div><span>PLAN</span><p><small>DBA EXECUTION INTELLIGENCE</small><b>Execution Plan Investigator</b><em>Compare plans, visualize row flow, and isolate the operator that caused the regression.</em></p></div><aside><em>LOCAL FILE PARSING</em><button onClick={loadDemo}>Load DBA demo</button><button className="primary" onClick={exportReport} disabled={!candidate.nodes.length}>Export findings</button></aside></header>
    <div className="epi-toolbar"><label>PLAN ENGINE<select value={selectedEngine} onChange={event=>setSelectedEngine(event.target.value as Engine)}>{engineOptions.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label>SEARCH OPERATORS<input value={search} onChange={event=>setSearch(event.target.value)} placeholder="scan, join, table, index…"/></label><div><button onClick={swap} disabled={!baselineText&&!candidateText}>⇄ Swap plans</button><span>Uploads stay in this browser and are not sent to cloud storage.</span></div></div>
    <div className="epi-input-grid">{(["baseline","candidate"] as const).map(target=>{const left=target==="baseline",text=left?baselineText:candidateText,parsed=left?baseline:candidate,file=left?baselineFile:candidateFile,input=left?baselineInput:candidateInput;return <section key={target} className={target}><header><span>{left?"A":"B"}</span><label>{left?"BASELINE / KNOWN GOOD":"CANDIDATE / SLOW"}<input value={left?baselineName:candidateName} onChange={event=>left?setBaselineName(event.target.value):setCandidateName(event.target.value)}/></label><em className={parsed.nodes.length?"ready":"waiting"}>{parsed.nodes.length?`${parsed.nodes.length} operators`:"waiting"}</em></header><div className="epi-drop"><input ref={input} type="file" hidden accept={engineOptions.find(item=>item.id===selectedEngine)?.accept} onChange={event=>readFile(event.target.files?.[0],target)}/><button onClick={()=>input.current?.click()}>{uploadLabels[target]}</button><span>{file||".txt · .json · .xml · .sqlplan"}</span></div><textarea value={text} onChange={event=>left?setBaselineText(event.target.value):setCandidateText(event.target.value)} placeholder={left?"Paste the earlier known-good plan here…":"Paste the slow or changed plan here…"} spellCheck={false}/><footer><span>{parsed.engine.toUpperCase()}</span><span>{parsed.kind}</span><span className={parsed.actual?"actual":"estimated"}>{parsed.actual?"RUNTIME EVIDENCE":"ESTIMATED ONLY"}</span></footer></section>})}</div>
    <div className="epi-scoreboard"><article><small>CANDIDATE ELAPSED</small><b>{format(candidateTime," ms")}</b><em className={timeDelta!==null&&timeDelta>20?"bad":""}>{timeDelta===null?"Need both runtime plans":`${timeDelta>=0?"+":""}${Math.round(timeDelta)}% vs baseline`}</em></article><article><small>ACTUAL COVERAGE</small><b>{actualCoverage}%</b><em>{candidate.actual?"runtime rows/time found":"estimated plan only"}</em></article><article><small>PLAN SHAPE MATCH</small><b>{matched}%</b><em>{candidate.nodes.length-pairs.filter(item=>item.match).length} changed operators</em></article><article className={findings[0]?.severity||"info"}><small>TOP CULPRIT</small><b>{findings[0]?shorten(findings[0].node.operation,24):"No evidence"}</b><em>{findings[0]?.title||"Load a candidate plan"}</em></article></div>
    <nav className="epi-view-tabs"><div>{(["compare","candidate","table","raw"] as const).map(item=><button key={item} className={view===item?"active":""} onClick={()=>setView(item)}>{item==="compare"?"Side-by-side trees":item==="candidate"?"Candidate heatmap":item==="table"?"Operator delta table":"Raw plans"}</button>)}</div><span>Red = likely culprit · amber = changed shape · dimmed = search mismatch</span></nav>
    <div className="epi-analysis-grid"><section className="epi-plan-canvas">
      {view==="compare"&&<div className="epi-compare"><section><header><b>{baselineName}</b><span>{baseline.nodes.length} operators</span></header><PlanTree plan={baseline} matchedIds={baselineMatched} search={search}/></section><section><header><b>{candidateName}</b><span>{candidate.nodes.length} operators</span></header><PlanTree plan={candidate} matchedIds={candidateMatched} search={search}/></section></div>}
      {view==="candidate"&&<PlanTree plan={candidate} search={search}/>}
      {view==="table"&&<div className="epi-delta-table"><header><span>OPERATOR</span><span>EST → ACT ROWS</span><span>TIME A → B</span><span>LOOPS</span><span>CHANGE</span></header>{pairs.map(({node,match})=><article key={node.id} className={(factor(node.actualRows,node.estimatedRows)||0)>=10?"culprit":""}><span><b>{node.operation}</b><small>{node.object||"—"}</small></span><span>{format(node.estimatedRows)} → {format(node.actualRows)}</span><span>{format(match?.actualTimeMs??null," ms")} → {format(node.actualTimeMs," ms")}</span><span>{format(node.loops)}</span><em>{match?"matched":"new"}</em></article>)}</div>}
      {view==="raw"&&<div className="epi-raw"><section><b>BASELINE</b><pre>{baselineText||"No baseline supplied."}</pre></section><section><b>CANDIDATE</b><pre>{candidateText||"No candidate supplied."}</pre></section></div>}
    </section><aside className="epi-findings"><header><div><b>Culprit ranking</b><small>{findings.length} evidence-backed finding{findings.length===1?"":"s"}</small></div><select value={severity} onChange={event=>{setSeverity(event.target.value as "all"|Severity);setSelectedFinding(0)}}><option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="info">Evidence gaps</option></select></header><div className="epi-finding-list">{visible.map((finding,index)=><button key={finding.id} className={`${finding.severity} ${index===selectedFinding?"active":""}`} onClick={()=>setSelectedFinding(index)}><span>#{index+1}</span><p><b>{finding.title}</b><small>{shorten(finding.node.operation+(finding.node.object?` · ${finding.node.object}`:""),52)}</small></p><em>{Math.round(finding.score)}</em></button>)}{!visible.length&&<div className="epi-no-findings"><b>No ranked findings yet</b><span>Load a candidate plan with runtime statistics for stronger conclusions.</span></div>}</div>{active&&<article className={`epi-finding-detail ${active.severity}`}><header><span>{active.severity.toUpperCase()}</span><em>CONFIDENCE {candidate.actual?actualCoverage>=70?"HIGH":"MEDIUM":"LOW"}</em></header><h3>{active.title}</h3><p>{active.evidence}</p><div><small>LIKELY CULPRIT</small><b>{active.node.operation}</b><span>{active.node.object||active.node.predicate||"Operator-level evidence"}</span></div><footer><small>DBA NEXT CHECK</small><p>{active.action}</p></footer></article>}</aside></div>
    <section className="epi-method"><header><span>METHOD</span><p><b>Evidence model</b><small>Actuals outrank estimates; missing evidence lowers confidence rather than becoming a clean bill of health.</small></p></header><div><a href="https://docs.oracle.com/en/database/oracle/oracle-database/19/arpls/DBMS_XPLAN.html" target="_blank" rel="noreferrer">Oracle ALLSTATS LAST</a><a href="https://www.postgresql.org/docs/current/using-explain.html" target="_blank" rel="noreferrer">PostgreSQL EXPLAIN</a><a href="https://learn.microsoft.com/en-us/sql/relational-databases/performance/save-an-execution-plan-in-xml-format" target="_blank" rel="noreferrer">SQL Server Showplan</a><a href="https://dev.mysql.com/doc/refman/8.4/en/explain.html" target="_blank" rel="noreferrer">MySQL EXPLAIN ANALYZE</a><a href="https://www.mongodb.com/docs/manual/reference/explain-results/" target="_blank" rel="noreferrer">MongoDB executionStats</a></div></section>
  </section>;
}
