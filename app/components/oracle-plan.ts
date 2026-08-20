/*
 * Oracle input compatibility adapted for DB Operations Studio from the
 * MIT-licensed ora-explain-plan-viz project by David Budac and contributors.
 * See THIRD_PARTY_NOTICES.md. The normalized Studio data model and UI are local.
 */

export type OraclePlanFormat="dbms_xplan"|"sql_monitor_text"|"sql_monitor_xml"|"oracle_json"|"xbi";

export type OraclePlanNode={
  id:string;parentId:string|null;depth:number;operation:string;object:string;
  estimatedRows:number|null;actualRows:number|null;cost:number|null;actualTimeMs:number|null;
  loops:number|null;buffers:number|null;warning:string;predicate:string;
  bytes?:number|null;memoryBytes?:number|null;tempBytes?:number|null;physicalReads?:number|null;
  ioBytes?:number|null;queryBlock?:string;accessPredicate?:string;filterPredicate?:string;
};

export type OracleMonitorSummary={status?:string;durationMs?:number|null;cpuMs?:number|null;ioWaitMs?:number|null;bufferGets?:number|null;readBytes?:number|null;writeBytes?:number|null};

export type OraclePlanResult={
  nodes:OraclePlanNode[];kind:string;actual:boolean;warning:string;source:OraclePlanFormat;
  planHash?:string;sqlId?:string;sqlText?:string;notes?:string[];monitor?:OracleMonitorSummary;
};

const nullNode=(partial:Partial<OraclePlanNode>):OraclePlanNode=>({id:"",parentId:null,depth:0,operation:"UNKNOWN",object:"",estimatedRows:null,actualRows:null,cost:null,actualTimeMs:null,loops:null,buffers:null,warning:"",predicate:"",...partial});
const clean=(value:unknown)=>String(value??"").trim();

function numberValue(value:unknown):number|null{
  const text=clean(value).replaceAll(",","");if(!text||text==="."||/^[-—]+$/.test(text))return null;
  const match=text.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\s*([kmgt])?/i);if(!match)return null;
  const multipliers:Record<string,number>={k:1e3,m:1e6,g:1e9,t:1e12};const parsed=Number(match[0].replace(/[kmgt]/i,"").trim());
  return Number.isFinite(parsed)?parsed*(multipliers[(match[1]||"").toLowerCase()]||1):null;
}

function byteValue(value:unknown):number|null{
  const text=clean(value).replaceAll(",","");if(!text||text==="."||/^[-—]+$/.test(text))return null;
  const match=text.match(/(-?\d+(?:\.\d+)?)\s*(bytes?|[kmgt]i?b?)?/i);if(!match)return numberValue(text);
  const unit=(match[2]||"").toLowerCase(),power=unit.startsWith("k")?1:unit.startsWith("m")?2:unit.startsWith("g")?3:unit.startsWith("t")?4:0;
  return Number(match[1])*1024**power;
}

function clockMs(value:unknown):number|null{
  const text=clean(value);if(!text)return null;
  if(/^\d+(?:\.\d+)?\s*ms$/i.test(text))return numberValue(text);
  if(/^\d+(?:\.\d+)?\s*s$/i.test(text))return (numberValue(text)||0)*1000;
  if(!text.includes(":"))return numberValue(text);
  const parts=text.split(":").map(Number);if(parts.some(item=>!Number.isFinite(item)))return null;
  return parts.reduce((total,item)=>total*60+item,0)*1000;
}

function normalizeParents(nodes:OraclePlanNode[]):OraclePlanNode[]{
  const stack:string[]=[];
  for(const node of nodes){
    if(!node.parentId&&node.depth>0)node.parentId=stack[node.depth-1]||null;
    stack[node.depth]=node.id;stack.length=node.depth+1;
  }
  return nodes;
}

function oracleWarning(node:OraclePlanNode):string{
  const operation=node.operation.toUpperCase();
  if((node.tempBytes||0)>0)return `Temporary space used (${Math.round((node.tempBytes||0)/1048576)} MB)`;
  if(/MERGE JOIN CARTESIAN/.test(operation))return "Cartesian join detected";
  if(/TABLE ACCESS FULL/.test(operation)&&(node.actualRows||node.estimatedRows||0)>=100000)return "High-volume full table scan";
  if(/WINDOW SORT|HASH GROUP|SORT ORDER/.test(operation)&&(node.memoryBytes||0)>0)return "Memory-intensive work area";
  return "";
}

function addPredicates(text:string,nodes:OraclePlanNode[]){
  const byId=new Map(nodes.map(node=>[node.id.replace(/^o/,""),node]));let current:{id:string;type:"access"|"filter";value:string}|null=null;
  const save=()=>{if(!current)return;const node=byId.get(current.id);if(node){const value=current.value.replace(/\)\s*$/,"").trim();if(current.type==="access")node.accessPredicate=value;else node.filterPredicate=value;node.predicate=[node.accessPredicate&&`access(${node.accessPredicate})`,node.filterPredicate&&`filter(${node.filterPredicate})`].filter(Boolean).join(" · ")}current=null};
  for(const line of text.split(/\r?\n/)){
    const match=line.match(/^\s*(\d+)\s+(?:\S+\s+)?-\s*(access|filter|storage)\((.*)$/i);
    if(match){save();current={id:match[1],type:match[2].toLowerCase()==="filter"?"filter":"access",value:match[3]};if((current.value.match(/\(/g)||[]).length<(current.value.match(/\)/g)||[]).length+1)save();continue}
    if(current&&line.trim()&&!/^\s*(?:Note|Outline|Query Block)/i.test(line)){current.value+=` ${line.trim()}`;if((current.value.match(/\(/g)||[]).length<(current.value.match(/\)/g)||[]).length+1)save()}
  }
  save();
}

function parseDbmsXplan(text:string):OraclePlanResult{
  const lines=text.split(/\r?\n/);let headers:string[]=[];const rawRows:{parts:string[];indent:number}[]=[];
  for(const line of lines){
    if(/^\|.*\bId\b.*\bOperation\b/i.test(line)){headers=line.split("|").slice(1,-1).map(item=>clean(item).toLowerCase().replace(/\s+/g," "));continue}
    if(headers.length&&/^\|\s*\*?\s*\d+\s*\|/.test(line)){
      const parts=line.split("|").slice(1,-1),opIndex=headers.findIndex(item=>item==="operation"),opRaw=parts[opIndex]||"";
      rawRows.push({parts,indent:opRaw.match(/^\s*/)?.[0].length||0});
    }
  }
  const minIndent=rawRows.length?Math.min(...rawRows.map(row=>row.indent)):0,parents:string[]=[];
  const get=(parts:string[],names:string[])=>{const index=headers.findIndex(header=>names.includes(header));return index>=0?clean(parts[index]):""};
  const nodes=rawRows.map((row,index)=>{
    const idValue=get(row.parts,["id"]).replace(/\D/g,"")||String(index),depth=Math.max(0,row.indent-minIndent);while(parents.length>depth)parents.pop();
    const node=nullNode({id:`o${idValue}`,parentId:depth?parents[depth-1]||null:null,depth,operation:get(row.parts,["operation"])||"ROW SOURCE",object:get(row.parts,["name"]),estimatedRows:numberValue(get(row.parts,["e-rows","rows","cardinality"])),actualRows:numberValue(get(row.parts,["a-rows"])),cost:numberValue(get(row.parts,["cost (%cpu)","cost"])),actualTimeMs:clockMs(get(row.parts,["a-time","actual time"])),loops:numberValue(get(row.parts,["starts"])),buffers:numberValue(get(row.parts,["buffers","cr gets","consistent gets"])),bytes:byteValue(get(row.parts,["bytes"])),memoryBytes:byteValue(get(row.parts,["omem","1mem","memory"])),tempBytes:byteValue(get(row.parts,["temp","temp space"])),physicalReads:numberValue(get(row.parts,["reads","read reqs"]))});
    node.warning=oracleWarning(node);parents[depth]=node.id;return node;
  });
  addPredicates(text,nodes);
  const notes=(text.match(/(?:dynamic statistics|adaptive plan|statistics feedback|SQL profile|SQL plan baseline)[^\r\n]*/gi)||[]).map(clean);
  return {nodes,kind:"Oracle DBMS_XPLAN",actual:nodes.some(node=>node.actualRows!==null||node.actualTimeMs!==null),warning:nodes.length?"":"No DBMS_XPLAN operations found",source:"dbms_xplan",planHash:text.match(/Plan hash value\s*:\s*(\d+)/i)?.[1],notes};
}

function splitTableRow(line:string){return line.split("|").slice(1,-1)}

function parseSqlMonitorText(text:string):OraclePlanResult{
  const lines=text.split(/\r?\n/);let headerIndex=-1;
  for(let index=0;index<lines.length;index++)if(/^\|\s*Id\s*\|.*Operation/i.test(lines[index])){headerIndex=index;break}
  if(headerIndex<0)return {nodes:[],kind:"Oracle SQL Monitor text",actual:false,warning:"SQL Monitor operation table not found",source:"sql_monitor_text"};
  const h1=splitTableRow(lines[headerIndex]),h2=/^\|/.test(lines[headerIndex+1]||"")?splitTableRow(lines[headerIndex+1]):[];
  const headers=h1.map((item,index)=>`${clean(item)} ${clean(h2[index])}`.trim().toLowerCase().replace(/\s+/g," "));
  const find=(names:string[])=>headers.findIndex(header=>names.some(name=>header===name||header.includes(name)));
  const opIndex=find(["operation"]),idIndex=find(["id"]),nameIndex=find(["name"]),rowsEst=find(["rows (estim)","rows estim"]),rowsActual=headers.findIndex(item=>item.includes("rows (actual)")),costIndex=find(["cost"]),timeIndex=find(["time active(s)"]),execIndex=find(["execs"]),readReqIndex=find(["read reqs"]),readBytesIndex=find(["read bytes"]),memoryIndex=find(["mem (max)"]),tempIndex=find(["temp (max)"]);
  const parsed:{parts:string[];indent:number}[]=[];
  for(let index=headerIndex+2;index<lines.length;index++){
    const line=lines[index];if(!/^\|/.test(line)){if(parsed.length)break;continue}const parts=splitTableRow(line),id=clean(parts[idIndex]);if(!/^\d+$/.test(id))continue;
    parsed.push({parts,indent:(parts[opIndex]||"").match(/^\s*/)?.[0].length||0});
  }
  const minIndent=parsed.length?Math.min(...parsed.map(row=>row.indent)):0,nodes=parsed.map((row,index)=>{const get=(column:number)=>column>=0?clean(row.parts[column]):"",activeSeconds=numberValue(get(timeIndex));const node=nullNode({id:`o${get(idIndex)||index}`,depth:Math.max(0,row.indent-minIndent),operation:get(opIndex),object:get(nameIndex),estimatedRows:numberValue(get(rowsEst)),actualRows:numberValue(get(rowsActual)),cost:numberValue(get(costIndex)),actualTimeMs:activeSeconds===null?null:activeSeconds*1000,loops:numberValue(get(execIndex)),physicalReads:numberValue(get(readReqIndex)),ioBytes:byteValue(get(readBytesIndex)),memoryBytes:byteValue(get(memoryIndex)),tempBytes:byteValue(get(tempIndex))});node.warning=oracleWarning(node);return node});
  normalizeParents(nodes);addPredicates(text,nodes);
  const duration=numberValue(text.match(/^\s*Duration\s*:\s*([^\r\n]+)/im)?.[1]),sqlText=text.match(/SQL Text\s*-+\s*([\s\S]*?)\s*Global Information/i)?.[1]?.trim();
  return {nodes,kind:"Oracle SQL Monitor text",actual:nodes.some(node=>node.actualRows!==null||node.actualTimeMs!==null),warning:nodes.length?"":"No SQL Monitor operations found",source:"sql_monitor_text",planHash:text.match(/Plan Hash Value\s*=\s*(\d+)/i)?.[1],sqlId:text.match(/^\s*SQL ID\s*:\s*([a-z0-9]+)/im)?.[1],sqlText,monitor:{status:text.match(/^\s*Status\s*:\s*([^\r\n]+)/im)?.[1]?.trim(),durationMs:duration===null?null:duration*1000}};
}

function directText(element:Element|undefined|null,name:string):string{
  if(!element)return "";const child=Array.from(element.children).find(item=>item.tagName.toLowerCase()===name.toLowerCase());return child?.textContent?.trim()||"";
}

function statValue(element:Element|undefined,name:string):string{
  if(!element)return "";const stats=Array.from(element.children).find(item=>item.tagName.toLowerCase()==="stats"&&item.getAttribute("type")==="plan_monitor");
  return Array.from(stats?.children||[]).find(item=>item.getAttribute("name")===name)?.textContent?.trim()||"";
}

function parseSqlMonitorXml(text:string):OraclePlanResult{
  const documentXml=new DOMParser().parseFromString(text,"application/xml");if(documentXml.querySelector("parsererror"))return {nodes:[],kind:"Oracle SQL Monitor XML",actual:false,warning:"Invalid SQL Monitor XML",source:"sql_monitor_xml"};
  const monitorById=new Map(Array.from(documentXml.querySelectorAll("plan_monitor > operation")).map(item=>[item.getAttribute("id")||"",item]));
  const estimateOps=Array.from(documentXml.querySelectorAll("plan > operation"));
  const nodes=estimateOps.map((element,index)=>{
    const id=element.getAttribute("id")||String(index),runtime=monitorById.get(id),depth=Number(element.getAttribute("depth")||runtime?.getAttribute("depth")||0),operation=[element.getAttribute("name"),element.getAttribute("options")].filter(Boolean).join(" "),access=element.querySelector('predicates predicate[type="access"]')?.textContent?.trim()||"",filter=element.querySelector('predicates predicate[type="filter"]')?.textContent?.trim()||"";
    const elapsed=numberValue(statValue(runtime,"elapsed_time")),duration=numberValue(statValue(runtime,"duration"));
    const node=nullNode({id:`o${id}`,parentId:runtime?.getAttribute("parent_id")?`o${runtime.getAttribute("parent_id")}`:null,depth,operation:operation||runtime?.getAttribute("name")||"ROW SOURCE",object:directText(element,"object"),estimatedRows:numberValue(directText(element,"card")),actualRows:numberValue(statValue(runtime,"cardinality")),cost:numberValue(directText(element,"cost")),actualTimeMs:elapsed!==null?elapsed/1000:duration!==null?duration*1000:null,loops:numberValue(statValue(runtime,"starts")),buffers:numberValue(statValue(runtime,"buffer_gets")),bytes:byteValue(directText(element,"bytes")),memoryBytes:byteValue(statValue(runtime,"max_memory")),tempBytes:byteValue(statValue(runtime,"max_temp")),physicalReads:numberValue(statValue(runtime,"read_reqs")),ioBytes:byteValue(statValue(runtime,"read_bytes")),queryBlock:directText(element,"qblock"),accessPredicate:access,filterPredicate:filter,predicate:[access&&`access(${access})`,filter&&`filter(${filter})`].filter(Boolean).join(" · ")});node.warning=oracleWarning(node);return node;
  });
  normalizeParents(nodes);const target=documentXml.querySelector("target"),monitorStats=documentXml.querySelector('stats[type="monitor"]');
  const globalStat=(name:string)=>Array.from(monitorStats?.children||[]).find(item=>item.getAttribute("name")===name)?.textContent?.trim()||"";
  return {nodes,kind:"Oracle SQL Monitor XML",actual:nodes.some(node=>node.actualRows!==null||node.actualTimeMs!==null),warning:nodes.length?"":"No SQL Monitor XML operations found",source:"sql_monitor_xml",planHash:target?.getAttribute("sql_plan_hash")||undefined,sqlId:target?.getAttribute("sql_id")||documentXml.querySelector("report_parameters > sql_id")?.textContent?.trim()||undefined,sqlText:directText(target,"sql_fulltext")||undefined,monitor:{status:directText(target,"status")||undefined,durationMs:(numberValue(directText(target,"duration"))||0)*1000,cpuMs:(numberValue(globalStat("cpu_time"))||0)/1000,ioWaitMs:(numberValue(globalStat("user_io_wait_time"))||0)/1000,bufferGets:numberValue(globalStat("buffer_gets")),readBytes:byteValue(globalStat("read_bytes")),writeBytes:byteValue(globalStat("write_bytes"))}};
}

function parseOracleJson(text:string):OraclePlanResult{
  try{
    const parsed=JSON.parse(text),rows=Array.isArray(parsed)?parsed:Array.isArray(parsed?.plan)?parsed.plan:Array.isArray(parsed?.Plan)?parsed.Plan:[];
    const nodes=rows.map((row:any,index:number)=>{const elapsed=numberValue(row.actual_elapsed_time??row.elapsed_time),access=clean(row.access_predicates),filter=clean(row.filter_predicates),node=nullNode({id:`o${clean(row.id??index)}`,parentId:row.parent_id===null||row.parent_id===undefined?null:`o${clean(row.parent_id)}`,depth:Number(row.depth||0),operation:[row.operation,row.options].filter(Boolean).join(" "),object:[row.object_owner,row.object_name].filter(Boolean).join("."),estimatedRows:numberValue(row.cardinality??row.estimated_rows),actualRows:numberValue(row.actual_rows),cost:numberValue(row.cost),actualTimeMs:elapsed===null?null:elapsed/1000,loops:numberValue(row.actual_starts??row.starts),buffers:numberValue(row.actual_cr_buffer_gets??row.logical_reads),bytes:byteValue(row.bytes),memoryBytes:byteValue(row.actual_memory_used),tempBytes:byteValue(row.actual_tempseg_size??row.temp_space),physicalReads:numberValue(row.actual_disk_reads??row.physical_reads),ioBytes:byteValue(row.actual_read_bytes),queryBlock:clean(row.qblock_name??row.query_block),accessPredicate:access,filterPredicate:filter,predicate:[access&&`access(${access})`,filter&&`filter(${filter})`].filter(Boolean).join(" · ")});node.warning=oracleWarning(node);return node});
    normalizeParents(nodes);return {nodes,kind:"Oracle V$SQL_PLAN JSON",actual:nodes.some((node:OraclePlanNode)=>node.actualRows!==null||node.actualTimeMs!==null),warning:nodes.length?"":"No Oracle JSON operations found",source:"oracle_json",planHash:clean(parsed?.plan_hash_value||rows[0]?.plan_hash_value)||undefined,sqlId:clean(parsed?.sql_id||rows[0]?.sql_id)||undefined};
  }catch{return {nodes:[],kind:"Oracle V$SQL_PLAN JSON",actual:false,warning:"Invalid Oracle plan JSON",source:"oracle_json"}}
}

type Bounds={start:number;end:number};
function parseXbi(text:string):OraclePlanResult{
  const lines=text.split(/\r?\n/),header2Index=lines.findIndex(line=>/\bRow Source\b/.test(line));if(header2Index<1)return {nodes:[],kind:"Oracle XBI",actual:false,warning:"XBI Row Source table not found",source:"xbi"};
  const header1=lines[header2Index-1],header2=lines[header2Index],separator=lines[header2Index+1]||"",bounds:Bounds[]=[];for(const match of separator.matchAll(/-+/g))bounds.push({start:match.index||0,end:(match.index||0)+match[0].length});
  const columns=new Map<string,Bounds>();for(const bound of bounds){const label=`${header1.slice(bound.start,bound.end)} ${header2.slice(bound.start,bound.end)}`.trim().toLowerCase().replace(/\s+/g," ");if(/\bop id\b/.test(label))columns.set("id",bound);else if(/par\. id/.test(label))columns.set("parent",bound);else if(/row source/.test(label))columns.set("operation",bound);else if(/query block/.test(label))columns.set("query",bound);else if(/ms spent|this operation/.test(label))columns.set("time",bound);else if(/consistent.*gets/.test(label))columns.set("consistent",bound);else if(/rowsource.*starts/.test(label))columns.set("starts",bound);else if(/real.*rows/.test(label))columns.set("actual",bound);else if(/est\..*rows/.test(label))columns.set("estimated",bound);else if(/current.*gets/.test(label))columns.set("current",bound);else if(/physical.*read/.test(label))columns.set("reads",bound);else if(/memory|used \(mb\)/.test(label))columns.set("memory",bound);else if(/optimizer.*cost/.test(label))columns.set("cost",bound)}
  const field=(line:string,key:string)=>{const bound=columns.get(key);return bound?line.slice(bound.start,bound.end):""},rows:OraclePlanNode[]=[];
  for(let index=header2Index+2;index<lines.length;index++){
    const line=lines[index];if(!line.trim()){if(rows.length)break;continue}const id=clean(field(line,"id"));if(!/^\d+$/.test(id))continue;const rawOperation=field(line,"operation"),bracket=rawOperation.trim().match(/^(.+?)\s+\[([^\]]+)\]$/),starts=numberValue(field(line,"starts")),estimate=numberValue(field(line,"estimated"));
    const node=nullNode({id:`o${id}`,parentId:numberValue(field(line,"parent"))===null?null:`o${numberValue(field(line,"parent"))}`,depth:rawOperation.match(/^\s*/)?.[0].length||0,operation:bracket?.[1]?.trim()||rawOperation.trim(),object:bracket?.[2]||"",estimatedRows:estimate!==null&&starts?Math.round(estimate/starts):estimate,actualRows:numberValue(field(line,"actual")),cost:numberValue(field(line,"cost")),actualTimeMs:numberValue(field(line,"time")),loops:starts,buffers:(numberValue(field(line,"consistent"))||0)+(numberValue(field(line,"current"))||0)||null,memoryBytes:numberValue(field(line,"memory"))===null?null:(numberValue(field(line,"memory"))||0)*1048576,physicalReads:numberValue(field(line,"reads")),queryBlock:clean(field(line,"query"))});node.warning=oracleWarning(node);rows.push(node);
  }
  const minDepth=rows.length?Math.min(...rows.map(row=>row.depth)):0;rows.forEach(row=>row.depth=Math.max(0,row.depth-minDepth));normalizeParents(rows);addPredicates(text,rows);
  return {nodes:rows,kind:"Oracle XBI (eXplain Better)",actual:rows.some(node=>node.actualRows!==null||node.actualTimeMs!==null),warning:rows.length?"":"No XBI operations found",source:"xbi",planHash:text.match(/\b(\d{6,})\b.*Statement first parsed/i)?.[1],sqlId:text.match(/sql_id\s*=\s*([a-z0-9]+)/i)?.[1]};
}

export function detectOraclePlanFormat(text:string):OraclePlanFormat|null{
  const trimmed=text.trim();if(!trimmed)return null;
  if(/^</.test(trimmed)&&/<sql_monitor_report|<plan_monitor/i.test(trimmed))return "sql_monitor_xml";
  if(/SQL Monitoring Report[\s\S]*SQL Plan Monitoring Details/i.test(trimmed))return "sql_monitor_text";
  if(/eXplain Better|\bRow Source\b[\s\S]*ms spent in/i.test(trimmed))return "xbi";
  if(/Plan hash value|DBMS_XPLAN|Predicate Information/i.test(trimmed)&&/^\|.*\bId\b.*\bOperation\b/im.test(trimmed))return "dbms_xplan";
  if(/^[\[{]/.test(trimmed)&&/"(?:parent_id|object_owner|actual_cr_buffer_gets|actual_elapsed_time)"/i.test(trimmed))return "oracle_json";
  return null;
}

export function parseOraclePlan(text:string):OraclePlanResult|null{
  const format=detectOraclePlanFormat(text);if(!format)return null;
  if(format==="sql_monitor_xml")return parseSqlMonitorXml(text);
  if(format==="sql_monitor_text")return parseSqlMonitorText(text);
  if(format==="oracle_json")return parseOracleJson(text);
  if(format==="xbi")return parseXbi(text);
  return parseDbmsXplan(text);
}
