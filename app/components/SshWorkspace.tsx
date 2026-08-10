"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- xterm/SSE streams and local-preference hydration use explicit lifecycle keys. */

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type AuthMethod = "agent" | "key" | "password";
type ToolPanel = "connections" | "sftp" | "tunnels" | "snippets" | "settings";
type SplitMode = "none" | "vertical" | "horizontal";
type HostKey = { type:string; fingerprint:string };
type Forward = { forwardId:string; bindHost:string; localPort:number; remoteHost:string; remotePort:number; openedAt:string; activeConnections:number };
type SessionDescriptor = {
  sessionId:string; host:string; port:number; username:string; authMethod:AuthMethod; openedAt:string;
  lastActivity?:string; keepaliveSeconds?:number; hostKeys?:HostKey[]; verifiedHostKey?:string; forwards:Forward[];
};
type Session = SessionDescriptor & { environment:string; label:string; output:string; connected:boolean; unread:boolean };
type Profile = { id:string; name:string; environment:string; host:string; port:string; username:string; authMethod:AuthMethod; groupId?:string; inheritGroup?:boolean; favorite?:boolean; tags?:string[]; notes?:string; startupCommand?:string };
type ConnectionGroup = { id:string; name:string; environment:string; username:string; port:string; authMethod:AuthMethod };
type Snippet = { id:string; name:string; command:string };
type SftpEntry = { name:string; longname:string; type:"directory"|"file"|"symlink"; size:number; modifiedAt:string|null; permissions:string };
type Settings = { fontSize:number; theme:"midnight"|"forest"|"light"; keepaliveSeconds:number; cols:number; rows:number; toolsPinned:boolean; carefulPaste:boolean };
type ConnectionRequest = { url:string; requestId:number; username:string; password:string; remember:boolean; autoConnect:boolean };
type PreflightEvidence = { error?:string; host?:string; port?:number; fingerprint?:string; keyType?:string; hostKeys?:HostKey[]; trustStatus?:"new"|"trusted"|"changed"; trusted?:boolean; requiresTrust?:boolean; previousFingerprint?:string; firstSeenAt?:string; credentialSent?:boolean };
type ApiResult = Partial<SessionDescriptor> & {
  target?:PreflightEvidence; sessions?:SessionDescriptor[]; path?:string; entries?:SftpEntry[];
  file?:{path:string;size:number;data:string}; forward?:Forward; forwards?:Forward[]; credential?:{available?:boolean};
};
type AgentCall = (path:string, init?:RequestInit)=>Promise<ApiResult>;
type FitAddonLike = { fit:()=>void };
type TerminalLike = {
  write:(value:string)=>void; reset:()=>void; clear:()=>void; focus:()=>void; dispose:()=>void; loadAddon:(addon:unknown)=>void;
  open:(element:HTMLElement)=>void; onData:(handler:(value:string)=>void)=>{dispose:()=>void};
  onResize:(handler:(size:{cols:number;rows:number})=>void)=>{dispose:()=>void};
};
type TerminalRuntimeWindow = Window & {
  Terminal?:new(options:Record<string,unknown>)=>TerminalLike;
  FitAddon?:{FitAddon:new()=>FitAddonLike};
};

const PROFILE_KEY="dbops.ssh.profiles.v2";
const GROUP_KEY="dbops.ssh.groups.v1";
const SETTINGS_KEY="dbops.ssh.settings.v2";
const SNIPPET_KEY="dbops.ssh.snippets.v2";
const defaultSettings:Settings={fontSize:13,theme:"midnight",keepaliveSeconds:30,cols:110,rows:32,toolsPinned:false,carefulPaste:true};
const defaultSnippets:Snippet[]=[
  {id:"system",name:"System identity",command:"uname -a"},
  {id:"uptime",name:"Uptime and load",command:"uptime"},
  {id:"memory",name:"Memory usage",command:"free -m"},
  {id:"disk",name:"Filesystem usage",command:"df -h"},
  {id:"listeners",name:"Listening ports",command:"ss -lntp"},
];

function themeFor(name:Settings["theme"]){
  if(name==="forest")return{background:"#07120e",foreground:"#b7d9c8",cursor:"#5ee0aa",selectionBackground:"#275545"};
  if(name==="light")return{background:"#f5f7f8",foreground:"#24323a",cursor:"#087d78",selectionBackground:"#b9dedb"};
  return{background:"#02090e",foreground:"#b5d8ca",cursor:"#62d8d0",selectionBackground:"#1b4b4b"};
}

let terminalAssets:Promise<void>|null=null;
function loadTerminalAssets(){
  if(typeof window==="undefined"||(window as TerminalRuntimeWindow).Terminal)return Promise.resolve();
  if(terminalAssets)return terminalAssets;
  terminalAssets=new Promise<void>((resolve,reject)=>{
    if(!document.querySelector('link[data-dbops-xterm]')){
      const link=document.createElement("link");link.rel="stylesheet";link.href="/vendor/xterm.css";link.dataset.dbopsXterm="true";document.head.appendChild(link);
    }
    const load=(src:string,id:string)=>new Promise<void>((done,fail)=>{
      if(document.getElementById(id)){const wait=()=>((window as TerminalRuntimeWindow).Terminal&&id==="dbops-xterm"||(window as TerminalRuntimeWindow).FitAddon&&id!=="dbops-xterm")?done():window.setTimeout(wait,25);wait();return}
      const script=document.createElement("script");script.id=id;script.src=src;script.onload=()=>done();script.onerror=()=>fail(new Error("Terminal engine asset could not be loaded"));document.head.appendChild(script);
    });
    load("/vendor/xterm.js","dbops-xterm").then(()=>load("/vendor/xterm-addon-fit.js","dbops-xterm-fit")).then(resolve,reject);
  });
  return terminalAssets;
}

function TerminalPane({session,fontSize,theme,onInput,onResize,onFocus}:{session:Session;fontSize:number;theme:Settings["theme"];onInput:(id:string,data:string)=>void;onResize:(id:string,cols:number,rows:number)=>void;onFocus:(id:string)=>void}){
  const mount=useRef<HTMLDivElement>(null);const terminal=useRef<TerminalLike|null>(null);const written=useRef(0);
  useEffect(()=>{let disposed=false;let observer:ResizeObserver|undefined;let dataSub:{dispose:()=>void}|undefined;let resizeSub:{dispose:()=>void}|undefined;
    loadTerminalAssets().then(()=>{if(disposed||!mount.current)return;const Ctor=(window as TerminalRuntimeWindow).Terminal;const Fit=(window as TerminalRuntimeWindow).FitAddon?.FitAddon;if(!Ctor||!Fit)throw new Error("Terminal engine is unavailable");
      const term:TerminalLike=new Ctor({cursorBlink:true,fontFamily:'"Cascadia Mono", "SFMono-Regular", Consolas, monospace',fontSize,scrollback:8000,convertEol:false,theme:themeFor(theme),allowTransparency:false});
      const fit=new Fit();term.loadAddon(fit);term.open(mount.current);fit.fit();term.focus();terminal.current=term;
      if(session.output){term.write(session.output);written.current=session.output.length}
      dataSub=term.onData((data)=>onInput(session.sessionId,data));resizeSub=term.onResize(({cols,rows})=>onResize(session.sessionId,cols,rows));
      observer=new ResizeObserver(()=>{try{fit.fit()}catch{/* detached pane */}});observer.observe(mount.current);
    }).catch((error)=>{if(mount.current)mount.current.textContent=error instanceof Error?error.message:"Terminal engine unavailable"});
    return()=>{disposed=true;observer?.disconnect();dataSub?.dispose();resizeSub?.dispose();terminal.current?.dispose();terminal.current=null};
  },[session.sessionId,fontSize,theme]);
  useEffect(()=>{const term=terminal.current;if(!term)return;if(session.output.length<written.current){term.reset();written.current=0}const next=session.output.slice(written.current);if(next){term.write(next);written.current=session.output.length}},[session.output]);
  return <div className="ssh-terminal-mount" ref={mount} onMouseDown={()=>onFocus(session.sessionId)} aria-label={`Terminal ${session.username} at ${session.host}`}/>;
}

function cleanPathJoin(parent:string,name:string){return parent==="."?name:`${parent.replace(/\/$/,"")}/${name}`}
function parentPath(path:string){if(path==="."||path==="/")return path;const clean=path.replace(/\/$/,"");const index=clean.lastIndexOf("/");return index<=0?(clean.startsWith("/")?"/":"."):clean.slice(0,index)}
function safeFilename(value:string){return value.replace(/[\\/:*?"<>|\0-\x1f]/g,"_").slice(0,120)||"terminal.log"}
function sessionCredentialId(host:string,port:string,username:string){return ("ssh-"+username+"-"+host+"-"+port).replace(/[^A-Za-z0-9_.:@-]/g,"-").slice(0,128)}
function errorName(error:unknown){return typeof error==="object"&&error!==null&&"name" in error?String(error.name):""}
function errorMessage(error:unknown){return error instanceof Error?error.message:String(error)}
function openedSession(result:ApiResult):SessionDescriptor{
  if(!result.sessionId||!result.host||typeof result.port!=="number"||!result.username||!result.authMethod||!result.openedAt)throw new Error("The local agent returned an invalid SSH session");
  return{sessionId:result.sessionId,host:result.host,port:result.port,username:result.username,authMethod:result.authMethod,openedAt:result.openedAt,lastActivity:result.lastActivity,keepaliveSeconds:result.keepaliveSeconds,hostKeys:result.hostKeys,verifiedHostKey:result.verifiedHostKey,forwards:result.forwards||[]};
}

export default function SshWorkspace({environment,agentToken,agentCall,notify,connectionRequest,consumeConnectionRequest,keepPass,onKeepPassChange}:{environment:string;agentToken:string;agentCall:AgentCall;notify:(message:string)=>void;connectionRequest?:ConnectionRequest|null;consumeConnectionRequest:()=>void;keepPass:boolean;onKeepPassChange:(enabled:boolean)=>void}){
  const [form,setForm]=useState({name:"",host:"",port:"22",username:"",authMethod:"agent" as AuthMethod,keyPath:"",password:"",passphrase:"",groupId:"",inheritGroup:false,tags:"",notes:"",startupCommand:""});
  const [profiles,setProfiles]=useState<Profile[]>([]);const [selectedProfile,setSelectedProfile]=useState("");
  const [groups,setGroups]=useState<ConnectionGroup[]>([]);const [profileSearch,setProfileSearch]=useState("");const [quickTarget,setQuickTarget]=useState("");
  const [groupDraft,setGroupDraft]=useState({id:"",name:"",username:"",port:"22",authMethod:"agent" as AuthMethod});
  const [sessions,setSessions]=useState<Session[]>([]);const [activeId,setActiveId]=useState("");const [secondaryId,setSecondaryId]=useState("");
  const [split,setSplit]=useState<SplitMode>("none");const [panel,setPanel]=useState<ToolPanel|null>(null);const [connectionOpen,setConnectionOpen]=useState(false);const [busy,setBusy]=useState(false);
  const [broadcast,setBroadcast]=useState(false);const [search,setSearch]=useState("");const [evidence,setEvidence]=useState<PreflightEvidence|null>(null);
  const [settings,setSettings]=useState<Settings>(defaultSettings);const [snippets,setSnippets]=useState<Snippet[]>(defaultSnippets);
  const [snippetName,setSnippetName]=useState("");const [snippetCommand,setSnippetCommand]=useState("");
  const [remotePath,setRemotePath]=useState(".");const [sftpEntries,setSftpEntries]=useState<SftpEntry[]>([]);const [sftpBusy,setSftpBusy]=useState(false);
  const [forwardForm,setForwardForm]=useState({localPort:"0",remoteHost:"127.0.0.1",remotePort:"5432"});
  const controllers=useRef<Record<string,AbortController>>({});const activeRef=useRef("");const queues=useRef<Record<string,string>>({});const queueTimers=useRef<Record<string,number>>({});
  const searchRef=useRef<HTMLInputElement>(null);const importRef=useRef<HTMLInputElement>(null);const toolHideTimer=useRef<number|null>(null);
  const active=sessions.find(item=>item.sessionId===activeId);const secondary=sessions.find(item=>item.sessionId===secondaryId&&item.sessionId!==activeId);
  const scopedProfiles=profiles.filter(profile=>profile.environment===environment);
  const scopedGroups=groups.filter(group=>group.environment===environment);
  const resolvedProfile=(profile:Profile)=>{const group=profile.groupId?groups.find(item=>item.id===profile.groupId):undefined;return group&&profile.inheritGroup?{...profile,username:group.username||profile.username,port:group.port||profile.port,authMethod:group.authMethod||profile.authMethod}:profile};
  const filteredProfiles=scopedProfiles.filter(profile=>{const query=profileSearch.trim().toLowerCase();return !query||[profile.name,profile.host,profile.username,...(profile.tags||[]),profile.notes||""].some(value=>value.toLowerCase().includes(query))});
  const visible=split==="none"||!secondary?[active].filter(Boolean) as Session[]:[active,secondary].filter(Boolean) as Session[];
  const searchMatches=useMemo(()=>{if(!search||!active)return[];const query=search.toLowerCase();return active.output.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g,"").split(/\r?\n/).filter(line=>line.toLowerCase().includes(query)).slice(-40)},[active,search]);
  const cancelToolHide=()=>{if(toolHideTimer.current!==null){window.clearTimeout(toolHideTimer.current);toolHideTimer.current=null}};
  const scheduleToolHide=()=>{cancelToolHide();if(settings.toolsPinned)return;toolHideTimer.current=window.setTimeout(()=>{setPanel(null);setConnectionOpen(false)},700)};
  const openConnection=()=>{setPanel(null);setConnectionOpen(true)};
  const toggleTool=(item:ToolPanel)=>{cancelToolHide();setConnectionOpen(false);setPanel(current=>current===item?null:item)};
  useEffect(()=>()=>cancelToolHide(),[]);

  useEffect(()=>{activeRef.current=activeId;setSessions(items=>items.map(item=>item.sessionId===activeId?{...item,unread:false}:item))},[activeId]);
  useEffect(()=>{try{const stored=JSON.parse(localStorage.getItem(PROFILE_KEY)||"[]");if(Array.isArray(stored))setProfiles(stored);const storedGroups=JSON.parse(localStorage.getItem(GROUP_KEY)||"[]");if(Array.isArray(storedGroups))setGroups(storedGroups);const savedSettings=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"null");if(savedSettings)setSettings({...defaultSettings,...savedSettings});const savedSnippets=JSON.parse(localStorage.getItem(SNIPPET_KEY)||"[]");if(Array.isArray(savedSnippets)&&savedSnippets.length)setSnippets(savedSnippets)}catch{/* preferences remain at safe defaults */}},[]);
  useEffect(()=>{localStorage.setItem(PROFILE_KEY,JSON.stringify(profiles))},[profiles]);
  useEffect(()=>{localStorage.setItem(GROUP_KEY,JSON.stringify(groups))},[groups]);
  useEffect(()=>{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings))},[settings]);
  useEffect(()=>{localStorage.setItem(SNIPPET_KEY,JSON.stringify(snippets))},[snippets]);
  useEffect(()=>{
    if(!connectionRequest?.url)return;
    const request=connectionRequest;
    consumeConnectionRequest();
    void (async()=>{
      try{
        const target=new URL(request.url);
        if(target.protocol!=="ssh:"||!target.hostname)return;
        const username=(request.username||decodeURIComponent(target.username)).trim();
        if(!username)return;
        const port=target.port||"22";
        const credentialId=sessionCredentialId(target.hostname,port,username);
        const authMethod:AuthMethod=request.password?"password":"agent";
        const nextForm={name:`${username}@${target.hostname}`,host:target.hostname,port,username,authMethod,keyPath:"",password:request.password,passphrase:"",groupId:"",inheritGroup:false,tags:"",notes:"",startupCommand:""};
        const useCredential=Boolean(request.remember&&request.password);
        setForm(nextForm);setEvidence(null);setPanel(null);setConnectionOpen(!request.autoConnect);
        if(request.remember){
          const profile:Profile={id:credentialId,name:nextForm.name,environment,host:nextForm.host,port:nextForm.port,username:nextForm.username,authMethod};
          setProfiles(items=>[...items.filter(item=>item.id!==profile.id),profile]);
          setSelectedProfile(credentialId);
          if(useCredential)await agentCall("/api/credentials/session",{method:"POST",body:JSON.stringify({scope:"ssh",id:credentialId,username,password:request.password})});
        }else{setSelectedProfile("");await agentCall("/api/credentials/session/delete",{method:"POST",body:JSON.stringify({scope:"ssh",id:credentialId})}).catch(()=>{/* one-time connection remains usable */})}
        if(request.autoConnect)await connect(nextForm,useCredential?credentialId:"");
      }catch(error){setConnectionOpen(true);notify(error instanceof Error?error.message:"SSH target could not be connected")}
    })();
  },[connectionRequest?.requestId]);

  const appendOutput=(sessionId:string,value:string,connected?:boolean)=>setSessions(items=>items.map(item=>item.sessionId===sessionId?{...item,output:(item.output+value).slice(-260000),connected:connected??item.connected,unread:activeRef.current!==sessionId||item.unread}:item));
  const consumeStream=async(sessionId:string)=>{controllers.current[sessionId]?.abort();const controller=new AbortController();controllers.current[sessionId]=controller;
    const response=await fetch(`http://127.0.0.1:17865/api/terminal/ssh/stream?session=${encodeURIComponent(sessionId)}`,{headers:{"X-DBridge-Token":agentToken},signal:controller.signal});
    if(!response.ok||!response.body)throw new Error("SSH output stream could not be opened");const reader=response.body.getReader();const decoder=new TextDecoder();let buffer="";
    while(true){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});let boundary=buffer.indexOf("\n\n");while(boundary>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);for(const line of block.split(/\r?\n/)){if(!line.startsWith("data: "))continue;try{const event=JSON.parse(line.slice(6));if(event.type==="output"&&event.data){const raw=atob(event.data);appendOutput(sessionId,new TextDecoder().decode(Uint8Array.from(raw,char=>char.charCodeAt(0))))}else if(event.type==="closed")appendOutput(sessionId,`\r\n\x1b[31m[session closed] ${event.reason||""}\x1b[0m\r\n`,false);else if(event.type==="forward")setSessions(items=>items.map(item=>item.sessionId===sessionId?{...item,forwards:event.action==="closed"?item.forwards.filter(forward=>forward.forwardId!==event.forwardId):[...item.forwards.filter(forward=>forward.forwardId!==event.forward?.forwardId),event.forward]}:item))}catch{/* ignore malformed keepalive */}}boundary=buffer.indexOf("\n\n")}}
  };
  // The pairing token, not parent re-renders, owns the lifetime of restored streams.
  useEffect(()=>{
    if(!agentToken)return;
    let cancelled=false;
    const liveControllers=controllers.current;
    agentCall("/api/terminal/ssh/limits").then(data=>{
      if(cancelled)return;
      const restored:Session[]=(data.sessions||[]).map(item=>({...item,environment,label:`${item.username}@${item.host}`,output:"",connected:true,unread:false,forwards:item.forwards||[]}));
      setSessions(restored);
      if(restored.length)setActiveId(restored[0].sessionId);
      restored.forEach(item=>consumeStream(item.sessionId).catch(error=>{
        if(errorName(error)!=="AbortError")appendOutput(item.sessionId,`\r\n[stream error] ${errorMessage(error)}\r\n`,false);
      }));
    }).catch(()=>{/* local agent may still be pairing */});
    return()=>{cancelled=true;Object.values(liveControllers).forEach(controller=>controller.abort())};
  },[agentToken]);

  const payload=(includeSecrets=true,value=form,credentialId=selectedProfile)=>({environment,host:value.host.trim(),port:value.port,username:value.username.trim(),authMethod:value.authMethod,privateKeyPath:value.keyPath.trim(),credentialId:credentialId||undefined,keepaliveSeconds:settings.keepaliveSeconds,cols:settings.cols,rows:settings.rows,...(includeSecrets?{password:value.password,passphrase:value.passphrase}:{})});
  const inspectHost=async(value=form)=>{
    const data=await agentCall("/api/terminal/ssh/preflight",{method:"POST",body:JSON.stringify(payload(false,value,""))});
    if(!data.target?.fingerprint||!data.target.trustStatus)throw new Error("The SSH server did not present a usable host key");
    setEvidence(data.target);
    return data.target;
  };
  const preflight=async()=>{setBusy(true);try{const inspected=await inspectHost();notify(inspected.trustStatus==="trusted"?"Pinned SSH host key matched":inspected.trustStatus==="new"?"New SSH host key is ready for approval":"SSH host key change detected and blocked")}catch(error){setEvidence({error:error instanceof Error?error.message:"Host-key inspection failed"});notify(error instanceof Error?error.message:"Host-key inspection failed")}finally{setBusy(false)}};
  async function connect(value=form,credentialId=selectedProfile){
    if(sessions.filter(item=>item.connected).length>=8)return notify("Close a terminal before opening more than eight sessions");
    setBusy(true);
    try{
      if(credentialId&&!keepPass)await agentCall("/api/credentials/session/delete",{method:"POST",body:JSON.stringify({scope:"ssh",id:credentialId})});
      const inspected=await inspectHost(value);
      if(inspected.trustStatus==="changed")throw new Error("SSH host key changed. Forget the old pin only after verifying the server was intentionally rebuilt or re-keyed.");
      const trustHostKey=inspected.trustStatus==="new";
      if(trustHostKey&&!window.confirm(`First connection to ${inspected.host}:${inspected.port}.\n\nTrust and pin this host key?\n${inspected.keyType}\n${inspected.fingerprint}\n\nNo credential has been sent yet.`)){notify("Connection cancelled before authentication");return}
      const opened=openedSession(await agentCall("/api/terminal/ssh/open",{method:"POST",body:JSON.stringify({...payload(true,value,credentialId),trustHostKey,hostFingerprint:inspected.fingerprint,hostKeyType:inspected.keyType})}));
      const session:Session={...opened,environment,label:value.name.trim()||`${opened.username}@${opened.host}`,output:`\x1b[32mConnected to ${opened.username}@${opened.host}:${opened.port}\x1b[0m\r\n`,connected:true,unread:false,forwards:opened.forwards||[]};
      setSessions(items=>[...items,session]);setActiveId(session.sessionId);setConnectionOpen(false);setPanel(null);setForm(current=>({...current,password:"",passphrase:""}));
      consumeStream(session.sessionId).catch(error=>{if(errorName(error)!=="AbortError")appendOutput(session.sessionId,`\r\n[stream error] ${errorMessage(error)}\r\n`,false)});
      if(value.startupCommand.trim())window.setTimeout(()=>queueInput(session.sessionId,`${value.startupCommand.trim()}\r`),450);
      notify(trustHostKey?"SSH host key pinned and terminal connected":"Pinned host key matched; terminal connected");
    }catch(error){notify(error instanceof Error?error.message:"SSH connection failed")}finally{setBusy(false)}
  }
  const forgetHostTrust=async()=>{
    if(!evidence?.host||!evidence.port)return;
    const expected=`FORGET ${evidence.host}:${evidence.port}`;const confirmation=window.prompt(`To forget the pinned key, type:\n${expected}`);
    if(confirmation===null)return;
    setBusy(true);try{await agentCall("/api/terminal/ssh/trust/forget",{method:"POST",body:JSON.stringify({...payload(false),confirmation})});setEvidence(null);notify("Pinned SSH host key forgotten; inspect it again before connecting")}catch(error){notify(error instanceof Error?error.message:"Pinned key could not be forgotten")}finally{setBusy(false)}
  };
  const closeSession=async(sessionId:string)=>{try{await agentCall("/api/terminal/ssh/close",{method:"POST",body:JSON.stringify({sessionId})})}catch{/* already closed */}controllers.current[sessionId]?.abort();delete controllers.current[sessionId];setSessions(items=>{const remaining=items.filter(item=>item.sessionId!==sessionId);setActiveId(current=>current===sessionId?(remaining[0]?.sessionId||""):current);return remaining});if(secondaryId===sessionId)setSecondaryId("");notify("SSH terminal closed")};
  const queueInput=(sessionId:string,data:string)=>{queues.current[sessionId]=(queues.current[sessionId]||"")+data;if(queueTimers.current[sessionId])return;queueTimers.current[sessionId]=window.setTimeout(()=>{const value=queues.current[sessionId]||"";queues.current[sessionId]="";delete queueTimers.current[sessionId];agentCall("/api/terminal/ssh/input",{method:"POST",body:JSON.stringify({sessionId,data:value})}).catch(error=>notify(error instanceof Error?error.message:"SSH input failed"))},18)};
  const sendInput=(sessionId:string,data:string)=>{const pasted=data.replace(/\x1b\[200~|\x1b\[201~/g,"");const returns=(pasted.match(/[\r\n]/g)||[]).length;if(settings.carefulPaste&&returns>1&&!window.confirm(`Careful paste: send ${returns} command lines to ${broadcast?"all connected sessions":"the active session"}?`))return;const targets=broadcast?sessions.filter(item=>item.connected).map(item=>item.sessionId):[sessionId];targets.forEach(id=>queueInput(id,data))};
  const resizeTerminal=(sessionId:string,cols:number,rows:number)=>{agentCall("/api/terminal/ssh/resize",{method:"POST",body:JSON.stringify({sessionId,cols,rows})}).catch(()=>{/* next fit retries */})};
  const applyProfile=async(id:string)=>{
    setSelectedProfile(id);
    const stored=profiles.find(item=>item.id===id);
    if(!stored)return;
    const profile=resolvedProfile(stored);
    const nextForm={name:profile.name,host:profile.host,port:profile.port,username:profile.username,authMethod:profile.authMethod,password:"",passphrase:"",keyPath:"",groupId:stored.groupId||"",inheritGroup:Boolean(stored.groupId&&stored.inheritGroup!==false),tags:(stored.tags||[]).join(", "),notes:stored.notes||"",startupCommand:stored.startupCommand||""};
    setForm(nextForm);setEvidence(null);
    try{
      const data=await agentCall("/api/credentials/session/status",{method:"POST",body:JSON.stringify({scope:"ssh",id})});
      if(profile.authMethod==="agent"||(profile.authMethod==="password"&&data.credential?.available)){notify(`${profile.name} selected; connecting now`);await connect(nextForm,id)}
      else{openConnection();notify(profile.authMethod==="key"?"Enter the private-key path to connect":"Enter the password once, then save or connect")}
    }catch(error){openConnection();notify(error instanceof Error?error.message:"Saved credential status is unavailable")}
  };
  const applyGroupToForm=(id:string)=>{const group=groups.find(item=>item.id===id);setForm(value=>group?{...value,groupId:id,inheritGroup:true,username:group.username||value.username,port:group.port||value.port,authMethod:group.authMethod}:{...value,groupId:""})};
  const saveProfile=async()=>{
    if(!form.name.trim()||!form.host.trim()||!form.username.trim())return notify("Profile name, host, and username are required");
    const port=Number(form.port);if(!Number.isInteger(port)||port<1||port>65535)return notify("SSH port must be between 1 and 65535");
    if(/[\r\n]/.test(form.startupCommand))return notify("Startup command must be a single command line");
    const existing=profiles.find(item=>item.id===selectedProfile);
    const profile:Profile={id:selectedProfile||crypto.randomUUID(),name:form.name.trim().slice(0,80),environment,host:form.host.trim(),port:String(port),username:form.username.trim(),authMethod:form.authMethod,groupId:form.groupId||undefined,inheritGroup:Boolean(form.groupId&&form.inheritGroup),favorite:existing?.favorite||false,tags:form.tags.split(",").map(item=>item.trim()).filter(Boolean).slice(0,8),notes:form.notes.trim().slice(0,500),startupCommand:form.startupCommand.trim().slice(0,500)};
    const remembered=keepPass&&Boolean(form.password||form.passphrase);
    try{
      if(remembered){await agentCall("/api/credentials/session",{method:"POST",body:JSON.stringify({scope:"ssh",id:profile.id,username:form.username,password:form.password,passphrase:form.passphrase})});setForm(value=>({...value,password:"",passphrase:""}))}
      else if(!keepPass){await agentCall("/api/credentials/session/delete",{method:"POST",body:JSON.stringify({scope:"ssh",id:profile.id})})}
    }catch(error){return notify(error instanceof Error?error.message:"SSH credential could not be remembered")}
    setProfiles(items=>[...items.filter(item=>item.id!==profile.id),profile]);setSelectedProfile(profile.id);
    notify(remembered?"SSH profile saved; credential remembered until the local agent stops":"SSH profile metadata saved without a persistent credential");
  };
  const saveGroup=()=>{if(!groupDraft.name.trim())return notify("Enter a connection folder name");const port=Number(groupDraft.port);if(!Number.isInteger(port)||port<1||port>65535)return notify("Folder default port must be between 1 and 65535");const group:ConnectionGroup={id:groupDraft.id||crypto.randomUUID(),name:groupDraft.name.trim().slice(0,60),environment,username:groupDraft.username.trim().slice(0,128),port:String(port),authMethod:groupDraft.authMethod};setGroups(items=>[...items.filter(item=>item.id!==group.id),group]);setGroupDraft({id:"",name:"",username:"",port:"22",authMethod:"agent"});notify("Connection folder and inherited defaults saved")};
  const editGroup=(group:ConnectionGroup)=>setGroupDraft({id:group.id,name:group.name,username:group.username,port:group.port,authMethod:group.authMethod});
  const deleteGroup=(id:string)=>{if(!window.confirm("Delete this folder? Saved connections will move to Ungrouped."))return;setGroups(items=>items.filter(item=>item.id!==id));setProfiles(items=>items.map(profile=>profile.groupId===id?{...profile,groupId:undefined,inheritGroup:false}:profile));setGroupDraft({id:"",name:"",username:"",port:"22",authMethod:"agent"});notify("Connection folder removed; profiles moved to Ungrouped")};
  const toggleFavorite=(id:string)=>setProfiles(items=>items.map(profile=>profile.id===id?{...profile,favorite:!profile.favorite}:profile));
  const exportConnectionLibrary=()=>{const content=JSON.stringify({schema:"dbops-remote-library-v1",exportedAt:new Date().toISOString(),environment,groups:scopedGroups,profiles:scopedProfiles},null,2);const url=URL.createObjectURL(new Blob([content],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download=`dbops-remote-${environment.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-connections.json`;link.click();URL.revokeObjectURL(url);notify("Connection metadata exported without credentials")};
  const importConnectionLibrary=async(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];event.target.value="";if(!file)return;if(file.size>512000)return notify("Connection library must be 500 KB or smaller");try{const parsed=JSON.parse(await file.text());if(parsed?.schema!=="dbops-remote-library-v1"||!Array.isArray(parsed.profiles)||!Array.isArray(parsed.groups))throw new Error("Select a DB Operations Studio connection-library JSON file");const short=(value:unknown,max:number)=>String(value||"").trim().slice(0,max);const sourceGroups:ConnectionGroup[]=parsed.groups.slice(0,100).filter((item:ConnectionGroup)=>item&&item.name);const importedGroups:ConnectionGroup[]=sourceGroups.map((item:ConnectionGroup)=>({id:crypto.randomUUID(),name:short(item.name,60),environment,username:short(item.username,128),port:/^\d{1,5}$/.test(String(item.port))&&Number(item.port)>0&&Number(item.port)<=65535?String(item.port):"22",authMethod:["agent","key","password"].includes(item.authMethod)?item.authMethod:"agent"}));const groupMap=new Map<string,string>(sourceGroups.map((item,index)=>[String(item.id),importedGroups[index].id]));const importedProfiles:Profile[]=parsed.profiles.slice(0,500).filter((item:Profile)=>item&&item.name&&item.host).map((item:Profile)=>({id:crypto.randomUUID(),name:short(item.name,80),environment,host:short(item.host,255),port:/^\d{1,5}$/.test(String(item.port))?String(item.port):"22",username:short(item.username,128),authMethod:["agent","key","password"].includes(item.authMethod)?item.authMethod:"agent",groupId:groupMap.get(item.groupId||""),inheritGroup:Boolean(item.inheritGroup),favorite:Boolean(item.favorite),tags:Array.isArray(item.tags)?item.tags.map(tag=>short(tag,30)).filter(Boolean).slice(0,8):[],notes:short(item.notes,500),startupCommand:short(item.startupCommand,500).replace(/[\r\n]+/g," ")}));setGroups(items=>[...items,...importedGroups]);setProfiles(items=>[...items,...importedProfiles]);notify(`Imported ${importedProfiles.length} connection profiles without credentials`)}catch(error){notify(error instanceof Error?error.message:"Connection library import failed")}};
  const quickConnectNow=async()=>{const raw=quickTarget.trim();if(!raw)return;const saved=scopedProfiles.find(profile=>profile.name.toLowerCase()===raw.toLowerCase()||profile.host.toLowerCase()===raw.toLowerCase());if(saved){setQuickTarget("");return applyProfile(saved.id)}let target=raw.replace(/^ssh:\/\//i,""),username="";const at=target.lastIndexOf("@");if(at>=0){username=target.slice(0,at);target=target.slice(at+1)}let host=target,port="22";if(target.startsWith("[")){const end=target.indexOf("]");if(end>0){host=target.slice(1,end);if(target.slice(end+1).startsWith(":"))port=target.slice(end+2)}}else if((target.match(/:/g)||[]).length===1){const parts=target.split(":");host=parts[0];port=parts[1]||"22"}if(!host||!/^\d{1,5}$/.test(port))return notify("Use user@hostname:port or a saved profile name");const next={...form,name:`${username||form.username||"ssh"}@${host}`,host,port,username:username||form.username,authMethod:"agent" as AuthMethod,password:"",passphrase:"",keyPath:"",groupId:"",inheritGroup:false,tags:"",notes:"",startupCommand:""};setForm(next);setSelectedProfile("");setQuickTarget("");if(!next.username){openConnection();return notify("Enter the SSH username to finish Quick Connect")}await connect(next,"")};
  const editProfile=(profile:Profile)=>{const resolved=resolvedProfile(profile);setSelectedProfile(profile.id);setForm({name:profile.name,host:profile.host,port:resolved.port,username:resolved.username,authMethod:resolved.authMethod,password:"",passphrase:"",keyPath:"",groupId:profile.groupId||"",inheritGroup:Boolean(profile.groupId&&profile.inheritGroup!==false),tags:(profile.tags||[]).join(", "),notes:profile.notes||"",startupCommand:profile.startupCommand||""});setEvidence(null);openConnection()};
  const profileCard=(profile:Profile)=>{const resolved=resolvedProfile(profile);return <article key={profile.id} className={selectedProfile===profile.id?"selected":""}><button className="ssh-profile-star" onClick={()=>toggleFavorite(profile.id)} title={profile.favorite?"Remove favorite":"Add favorite"}>{profile.favorite?"*":"o"}</button><span><b>{profile.name}</b><small>{resolved.username}@{profile.host}:{resolved.port}</small>{Boolean(profile.tags?.length)&&<em>{profile.tags?.join(" / ")}</em>}</span><button onClick={()=>applyProfile(profile.id)}>Connect</button><button onClick={()=>editProfile(profile)}>Edit</button></article>};
  const deleteProfile=async()=>{
    if(!selectedProfile)return;
    try{await agentCall("/api/credentials/session/delete",{method:"POST",body:JSON.stringify({scope:"ssh",id:selectedProfile})})}catch{/* profile metadata can still be removed */}
    setProfiles(items=>items.filter(item=>item.id!==selectedProfile));setSelectedProfile("");notify("SSH profile and its session credential were deleted");
  };
  const copySessionToForm=(session:Session)=>{setSelectedProfile("");setForm(value=>({...value,name:session.label,host:session.host,port:String(session.port),username:session.username,authMethod:session.authMethod,password:"",passphrase:"",keyPath:"",groupId:"",inheritGroup:false,tags:"",notes:"",startupCommand:""}));openConnection();notify(session.authMethod==="agent"?"Connection copied; choose Connect when ready":"Connection copied; re-enter its credential to reconnect")};
  const cycleSplit=()=>{if(sessions.length<2)return notify("Open another terminal tab before splitting");const other=sessions.find(item=>item.sessionId!==activeId);setSecondaryId(other?.sessionId||"");setSplit(value=>value==="none"?"vertical":value==="vertical"?"horizontal":"none")};
  const copyOutput=()=>{if(active)navigator.clipboard.writeText(active.output).then(()=>notify("Terminal output copied"),()=>notify("Clipboard access was denied"))};
  const downloadOutput=()=>{if(!active)return;const blob=new Blob([active.output],{type:"text/plain;charset=utf-8"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=safeFilename(`${active.label}-${new Date().toISOString()}.log`);link.click();URL.revokeObjectURL(url)};

  const listSftp=async(path=remotePath)=>{if(!active?.connected)return notify("Select a connected terminal first");setSftpBusy(true);try{const data=await agentCall("/api/terminal/ssh/sftp/list",{method:"POST",body:JSON.stringify({sessionId:active.sessionId,path})});setRemotePath(data.path||path);setSftpEntries(data.entries||[])}catch(error){notify(error instanceof Error?error.message:"SFTP listing failed")}finally{setSftpBusy(false)}};
  const openSftpEntry=(entry:SftpEntry)=>{const path=cleanPathJoin(remotePath,entry.name);if(entry.type==="directory")listSftp(path);else downloadSftp(path,entry.name)};
  const downloadSftp=async(path:string,name:string)=>{if(!active)return;setSftpBusy(true);try{const data=await agentCall("/api/terminal/ssh/sftp/read",{method:"POST",body:JSON.stringify({sessionId:active.sessionId,path})});if(!data.file)throw new Error("The SFTP response did not include a file");const raw=atob(data.file.data);const bytes=Uint8Array.from(raw,char=>char.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes]));const link=document.createElement("a");link.href=url;link.download=safeFilename(name);link.click();URL.revokeObjectURL(url);notify("SFTP file downloaded locally")}catch(error){notify(error instanceof Error?error.message:"SFTP download failed")}finally{setSftpBusy(false)}};
  const openForward=async()=>{if(!active)return notify("Select a connected terminal first");setBusy(true);try{const data=await agentCall("/api/terminal/ssh/forward/open",{method:"POST",body:JSON.stringify({sessionId:active.sessionId,...forwardForm})});if(!data.forward)throw new Error("The local agent did not return a tunnel");setSessions(items=>items.map(item=>item.sessionId===active.sessionId?{...item,forwards:data.forwards||[]}:item));notify(`Tunnel listening on 127.0.0.1:${data.forward.localPort}`)}catch(error){notify(error instanceof Error?error.message:"Tunnel could not be opened")}finally{setBusy(false)}};
  const closeForward=async(forwardId:string)=>{if(!active)return;try{const data=await agentCall("/api/terminal/ssh/forward/close",{method:"POST",body:JSON.stringify({sessionId:active.sessionId,forwardId})});setSessions(items=>items.map(item=>item.sessionId===active.sessionId?{...item,forwards:data.forwards||[]}:item));notify("Local tunnel closed")}catch(error){notify(error instanceof Error?error.message:"Tunnel could not be closed")}};
  const runSnippet=(snippet:Snippet)=>{if(!active?.connected)return notify("Select a connected terminal first");if(!window.confirm(`Run “${snippet.name}” on ${active.username}@${active.host}?`))return;sendInput(active.sessionId,`${snippet.command}\r`)};
  const addSnippet=()=>{if(!snippetName.trim()||!snippetCommand.trim())return;setSnippets(items=>[...items,{id:crypto.randomUUID(),name:snippetName.trim(),command:snippetCommand.trim()}]);setSnippetName("");setSnippetCommand("")};

  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.key==="Escape"&&(connectionOpen||panel)){event.preventDefault();if(connectionOpen)setConnectionOpen(false);else setPanel(null)}else if(event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==="t"){event.preventDefault();openConnection()}else if(event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==="n"){event.preventDefault();setConnectionOpen(false);setPanel("connections");setGroupDraft({id:"",name:"",username:"",port:"22",authMethod:"agent"})}else if(event.ctrlKey&&event.altKey&&event.key.toLowerCase()==="c"){event.preventDefault();setConnectionOpen(false);setPanel("connections")}else if(event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==="w"&&activeId){event.preventDefault();closeSession(activeId)}else if(event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==="d"){event.preventDefault();cycleSplit()}else if(event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==="b"){event.preventDefault();setBroadcast(value=>!value)}else if(event.ctrlKey&&event.key.toLowerCase()==="f"){event.preventDefault();searchRef.current?.focus()}else if(event.altKey&&/^\d$/.test(event.key)){const index=Number(event.key)-1;if(sessions[index]){event.preventDefault();setActiveId(sessions[index].sessionId)}}};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler)},[activeId,sessions,connectionOpen,panel]);

  return <section className="ssh-advanced">
    <header className="ssh-titlebar"><div><span>SSH</span><p><b>Remote operations terminal</b><small>Profiles · tabs · splits · SFTP · local tunnels</small></p></div><aside><i className={active?.connected?"online":""}/><b>{sessions.filter(item=>item.connected).length}/8 live</b><em>{environment}</em></aside></header>
    <div className="ssh-quickbar"><span>QUICK CONNECT</span><input value={quickTarget} onChange={event=>setQuickTarget(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();void quickConnectNow()}}} placeholder="user@hostname:22 or saved profile"/><button onClick={()=>void quickConnectNow()} disabled={busy}>Connect</button><small>Tabby-style Quick Connect with agent auth; every new host key is inspected before login.</small></div>
    <nav className="ssh-tabbar"><button className="ssh-new-tab" onClick={openConnection} title="New connection (Ctrl+Shift+T)"><b>+</b><span>New connection</span></button>{sessions.map((session,index)=><button key={session.sessionId} className={activeId===session.sessionId?"active":""} onClick={()=>setActiveId(session.sessionId)}><i className={session.connected?"online":""}/><span>{session.label}<small>Alt+{index+1} · {session.host}</small></span>{session.unread&&<em/>}<b onClick={event=>{event.stopPropagation();closeSession(session.sessionId)}}>×</b></button>)}</nav>
    <div className="ssh-toolbar"><button onClick={()=>active&&copySessionToForm(active)} disabled={!active}>Duplicate / reconnect</button><button onClick={cycleSplit} disabled={sessions.length<2}>Split: {split}</button><button className={broadcast?"danger active":""} onClick={()=>setBroadcast(value=>!value)} title="Ctrl+Shift+B">Broadcast {broadcast?"ON":"off"}</button><button onClick={()=>active&&sendInput(active.sessionId,"\u0003")} disabled={!active}>Ctrl+C</button><button onClick={copyOutput} disabled={!active}>Copy output</button><button onClick={downloadOutput} disabled={!active}>Export log</button><label className="ssh-search">⌕<input ref={searchRef} value={search} onChange={event=>setSearch(event.target.value)} placeholder="Find in output  Ctrl+F"/>{search&&<b>{searchMatches.length}</b>}</label></div>
    <div className="ssh-workarea">
      <aside className={`ssh-tools ${(panel||connectionOpen)?"open":""} ${settings.toolsPinned?"pinned":""}`} onMouseEnter={cancelToolHide} onMouseLeave={scheduleToolHide} onFocusCapture={cancelToolHide} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))scheduleToolHide()}}>
        <nav className="ssh-tool-rail" aria-label="SSH workspace tools">{(["connections","sftp","tunnels","snippets","settings"] as ToolPanel[]).map(item=><button key={item} className={panel===item?"active":""} onClick={()=>toggleTool(item)} aria-expanded={panel===item} title={`${item} - click to open, move away to auto-hide`}><i>{item==="connections"?"TREE":item==="sftp"?"SF":item==="tunnels"?"TUN":item==="snippets"?">_":"SET"}</i><span>{item}</span></button>)}<button className={`ssh-pin-toggle ${settings.toolsPinned?"active":""}`} onClick={()=>setSettings(value=>({...value,toolsPinned:!value.toolsPinned}))} title={settings.toolsPinned?"Unpin tool drawer":"Pin tool drawer"}><i>{settings.toolsPinned?"PIN":"AUTO"}</i><span>{settings.toolsPinned?"Pinned":"Auto-hide"}</span></button></nav>
        {(panel||connectionOpen)&&<div className={`ssh-tool-content ${connectionOpen?"connection":panel==="connections"?"library":""}`} role={connectionOpen?"dialog":"complementary"} aria-modal={connectionOpen||undefined}>
          <div className="ssh-drawer-chrome"><span><b>{connectionOpen?"New SSH connection":panel==="connections"?"Connection manager":panel==="sftp"?"SFTP browser":panel==="tunnels"?"Local tunnels":panel==="snippets"?"Command snippets":"Terminal settings"}</b><small>{connectionOpen?(settings.toolsPinned?"Pinned open":"Auto-hides after you leave - pin to keep open"):settings.toolsPinned?"Pinned open":"Auto-hides after you leave"}</small></span><aside><button className={settings.toolsPinned?"active":""} onClick={()=>setSettings(value=>({...value,toolsPinned:!value.toolsPinned}))}>{settings.toolsPinned?"Unpin":"Pin"}</button><button onClick={()=>connectionOpen?setConnectionOpen(false):setPanel(null)} aria-label="Close drawer">×</button></aside></div>
        {connectionOpen&&<><header><b>Connection profile</b><small>Hostname, IPv4, or bracketed IPv6</small></header><label>Saved profile<select value={selectedProfile} onChange={event=>applyProfile(event.target.value)}><option value="">New profile</option>{scopedProfiles.map(profile=><option key={profile.id} value={profile.id}>{profile.name} · {profile.host}</option>)}</select></label><label>Folder<select value={form.groupId} onChange={event=>applyGroupToForm(event.target.value)}><option value="">Ungrouped</option>{scopedGroups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className="ssh-inherit-defaults"><input type="checkbox" checked={form.inheritGroup} disabled={!form.groupId} onChange={event=>setForm(value=>({...value,inheritGroup:event.target.checked}))}/><span><b>Inherit folder defaults</b><small>Username, port and authentication follow the selected folder.</small></span></label><label>Profile name<input value={form.name} onChange={event=>setForm(value=>({...value,name:event.target.value}))} placeholder="Payments SIT"/></label><label>Tags<input value={form.tags} onChange={event=>setForm(value=>({...value,tags:event.target.value}))} placeholder="database, payments, bastion"/></label><label>Startup command<input value={form.startupCommand} onChange={event=>setForm(value=>({...value,startupCommand:event.target.value}))} placeholder="Optional: cd /opt/app"/></label><label>Notes<textarea value={form.notes} onChange={event=>setForm(value=>({...value,notes:event.target.value}))} placeholder="Owner, purpose, change window or runbook reference"/></label><label>Hostname or IP<input value={form.host} onChange={event=>{setSelectedProfile("");setForm(value=>({...value,host:event.target.value}))}} placeholder="server.company.net or 10.20.30.40"/></label><div className="ssh-pair"><label>Username<input value={form.username} onChange={event=>{setSelectedProfile("");setForm(value=>({...value,username:event.target.value}))}} placeholder="opsuser"/></label><label>Port<input value={form.port} onChange={event=>{setSelectedProfile("");setForm(value=>({...value,port:event.target.value}))}}/></label></div><label>Authentication<select value={form.authMethod} onChange={event=>{setSelectedProfile("");setForm(value=>({...value,authMethod:event.target.value as AuthMethod,password:"",passphrase:""}))}}><option value="agent">OpenSSH agent</option><option value="key">Private key file</option><option value="password">Password</option></select></label>{form.authMethod==="key"&&<><label>Private key path<input value={form.keyPath} onChange={event=>setForm(value=>({...value,keyPath:event.target.value}))} placeholder="C:\Users\me\.ssh\id_ed25519"/></label><label>Optional passphrase<input type="password" autoComplete="off" value={form.passphrase} onChange={event=>setForm(value=>({...value,passphrase:event.target.value}))}/></label></>}{form.authMethod==="password"&&<label>Password<input type="password" autoComplete="off" value={form.password} onChange={event=>setForm(value=>({...value,password:event.target.value}))}/></label>}<label className="ssh-remember-credential"><input type="checkbox" checked={keepPass} onChange={event=>onKeepPassChange(event.target.checked)}/><span><b>Remember until agent stops</b><small>Credential stays in volatile local-agent memory only.</small></span></label><div className="ssh-panel-actions"><button onClick={preflight} disabled={busy}>Inspect key</button><button className="primary" onClick={()=>connect()} disabled={busy}>{busy?"Working…":"Connect"}</button></div><div className="ssh-profile-actions"><button onClick={saveProfile}>{keepPass?"Save + remember":"Save metadata"}</button><button onClick={deleteProfile} disabled={!selectedProfile}>Delete</button></div><small className="ssh-security-note">A new server key is inspected before authentication, approved once, and pinned by the local agent. Profile metadata stays in this browser; remembered passwords and passphrases stay only in volatile agent memory and clear when the agent stops.</small>{evidence&&<div className={evidence.error||evidence.trustStatus==="changed"?"ssh-evidence error":"ssh-evidence"}>{evidence.error?<b>{evidence.error}</b>:<><b>{evidence.trustStatus==="new"?"New host key — approval required":evidence.trustStatus==="trusted"?"Pinned host key matched":"Host key changed — connection blocked"}</b><span>{evidence.host}:{evidence.port}</span>{evidence.hostKeys?.map((key:HostKey)=><code key={key.fingerprint}>{key.type}<small>{key.fingerprint}</small></code>)}{evidence.credentialSent===false&&<small>No SSH credential was sent during inspection.</small>}{evidence.previousFingerprint&&<code>Previously pinned<small>{evidence.previousFingerprint}</small></code>}{evidence.trustStatus!=="new"&&<button onClick={forgetHostTrust} disabled={busy}>Forget pinned key</button>}</>}</div>}</>}
        {panel==="connections"&&<><header><b>Remote connection manager</b><small>mRemoteNG-style folders, inherited defaults, favorites and portable metadata</small></header><div className="ssh-library-toolbar"><label><span>FILTER CONNECTIONS</span><input value={profileSearch} onChange={event=>setProfileSearch(event.target.value)} placeholder="Name, host, user, tag or note"/></label><div><button onClick={()=>setGroupDraft({id:"",name:"",username:"",port:"22",authMethod:"agent"})}>New folder</button><button onClick={exportConnectionLibrary} disabled={!scopedProfiles.length&&!scopedGroups.length}>Export JSON</button><button onClick={()=>importRef.current?.click()}>Import JSON</button><input ref={importRef} type="file" accept="application/json,.json" onChange={importConnectionLibrary}/></div></div><section className="ssh-folder-editor"><header><b>{groupDraft.id?"Edit connection folder":"New connection folder"}</b><small>Profiles can inherit user, port and authentication from this folder.</small></header><label>Folder name<input value={groupDraft.name} onChange={event=>setGroupDraft(value=>({...value,name:event.target.value}))} placeholder="Linux production"/></label><div className="ssh-pair"><label>Default username<input value={groupDraft.username} onChange={event=>setGroupDraft(value=>({...value,username:event.target.value}))} placeholder="opsuser"/></label><label>Port<input value={groupDraft.port} onChange={event=>setGroupDraft(value=>({...value,port:event.target.value}))}/></label></div><label>Default authentication<select value={groupDraft.authMethod} onChange={event=>setGroupDraft(value=>({...value,authMethod:event.target.value as AuthMethod}))}><option value="agent">OpenSSH agent</option><option value="key">Private key file</option><option value="password">Password</option></select></label><div><button className="primary" onClick={saveGroup}>{groupDraft.id?"Update folder":"Add folder"}</button>{groupDraft.id&&<button onClick={()=>deleteGroup(groupDraft.id)}>Delete folder</button>}</div></section><div className="ssh-connection-tree">{filteredProfiles.some(profile=>profile.favorite)&&<section className="favorite"><header><span>*</span><b>Favorites</b><small>{filteredProfiles.filter(profile=>profile.favorite).length}</small></header>{filteredProfiles.filter(profile=>profile.favorite).map(profileCard)}</section>}{scopedGroups.map(group=><section key={group.id}><header><span>DIR</span><b>{group.name}</b><small>{filteredProfiles.filter(profile=>profile.groupId===group.id).length}</small><button onClick={()=>editGroup(group)}>Edit</button></header>{filteredProfiles.filter(profile=>profile.groupId===group.id).map(profileCard)}</section>)}<section><header><span>ROOT</span><b>Ungrouped</b><small>{filteredProfiles.filter(profile=>!profile.groupId).length}</small></header>{filteredProfiles.filter(profile=>!profile.groupId).map(profileCard)}</section>{!filteredProfiles.length&&<p>No connection matches this environment and filter.</p>}</div><small className="ssh-library-security">Exports contain connection metadata only. Passwords, passphrases, host pins and live sessions are never included.</small></>}
        {panel==="sftp"&&<><header><b>Read-only SFTP</b><small>Browse and download through the active session</small></header><div className="ssh-path"><button onClick={()=>listSftp(parentPath(remotePath))}>↑</button><input value={remotePath} onChange={event=>setRemotePath(event.target.value)}/><button onClick={()=>listSftp()} disabled={sftpBusy}>Go</button></div><div className="ssh-file-list">{sftpEntries.length?sftpEntries.map(entry=><button key={entry.name} onDoubleClick={()=>openSftpEntry(entry)} onClick={()=>entry.type==="directory"?listSftp(cleanPathJoin(remotePath,entry.name)):downloadSftp(cleanPathJoin(remotePath,entry.name),entry.name)}><i>{entry.type==="directory"?"DIR":entry.type==="symlink"?"LNK":"FILE"}</i><span><b>{entry.name}</b><small>{entry.permissions} · {entry.type==="file"?`${entry.size.toLocaleString()} B`:"folder"}</small></span></button>):<p>Select Go to list the remote path. Files are limited to 2 MB per browser download.</p>}</div></>}
        {panel==="tunnels"&&<><header><b>Local port forwarding</b><small>Loopback bind only — never exposed to the LAN</small></header><label>Local port<input value={forwardForm.localPort} onChange={event=>setForwardForm(value=>({...value,localPort:event.target.value}))}/><small>Use 0 to choose a free port.</small></label><label>Remote destination<input value={forwardForm.remoteHost} onChange={event=>setForwardForm(value=>({...value,remoteHost:event.target.value}))} placeholder="127.0.0.1"/></label><label>Remote port<input value={forwardForm.remotePort} onChange={event=>setForwardForm(value=>({...value,remotePort:event.target.value}))}/></label><button className="primary ssh-wide" onClick={openForward} disabled={!active||busy}>Open local tunnel</button><div className="ssh-forward-list">{active?.forwards?.map(forward=><article key={forward.forwardId}><i>↔</i><span><b>127.0.0.1:{forward.localPort}</b><small>to {forward.remoteHost}:{forward.remotePort}</small></span><button onClick={()=>closeForward(forward.forwardId)}>Close</button></article>)||<p>No active tunnels.</p>}</div></>}
        {panel==="snippets"&&<><header><b>Quick commands</b><small>Every run requires confirmation</small></header><div className="ssh-snippets">{snippets.map(snippet=><article key={snippet.id}><span><b>{snippet.name}</b><code>{snippet.command}</code></span><button onClick={()=>runSnippet(snippet)}>Run</button>{!defaultSnippets.some(item=>item.id===snippet.id)&&<button onClick={()=>setSnippets(items=>items.filter(item=>item.id!==snippet.id))}>×</button>}</article>)}</div><label>Snippet name<input value={snippetName} onChange={event=>setSnippetName(event.target.value)}/></label><label>Command<input value={snippetCommand} onChange={event=>setSnippetCommand(event.target.value)}/></label><button className="ssh-wide" onClick={addSnippet}>Add locally</button></>}
        {panel==="settings"&&<><header><b>Terminal settings</b><small>Saved locally on this browser</small></header><label>Theme<select value={settings.theme} onChange={event=>setSettings(value=>({...value,theme:event.target.value as Settings["theme"]}))}><option value="midnight">Midnight</option><option value="forest">Forest</option><option value="light">Light</option></select></label><label>Font size<input type="range" min="10" max="20" value={settings.fontSize} onChange={event=>setSettings(value=>({...value,fontSize:Number(event.target.value)}))}/><small>{settings.fontSize}px</small></label><label>Keepalive seconds<input type="number" min="5" max="300" value={settings.keepaliveSeconds} onChange={event=>setSettings(value=>({...value,keepaliveSeconds:Number(event.target.value)}))}/></label><div className="ssh-pair"><label>Initial columns<input type="number" value={settings.cols} onChange={event=>setSettings(value=>({...value,cols:Number(event.target.value)}))}/></label><label>Initial rows<input type="number" value={settings.rows} onChange={event=>setSettings(value=>({...value,rows:Number(event.target.value)}))}/></label></div><label className="ssh-setting-toggle"><input type="checkbox" checked={settings.carefulPaste} onChange={event=>setSettings(value=>({...value,carefulPaste:event.target.checked}))}/><span><b>Careful paste</b><small>Warn before sending multiple command lines, including during broadcast.</small></span></label><div className="ssh-shortcuts"><b>Keyboard shortcuts</b><span>Ctrl+Alt+C - Connection tree</span><span>Ctrl+Shift+N - New folder</span><span>Ctrl+Shift+T · New profile</span><span>Ctrl+Shift+W · Close tab</span><span>Ctrl+Shift+D · Cycle split</span><span>Ctrl+Shift+B · Broadcast</span><span>Alt+1…8 · Select tab</span></div></>}
        </div>}</aside>
      <main className={`ssh-panes ${split}`} onMouseDown={()=>{if(connectionOpen)setConnectionOpen(false);else if(panel&&!settings.toolsPinned)setPanel(null)}}>{visible.length?visible.map(session=><section key={session.sessionId} className={activeId===session.sessionId?"active":""}><header><div><i className={session.connected?"online":""}/><b>{session.username}@{session.host}:{session.port}</b><small>{session.environment} · {session.authMethod} · keepalive {session.keepaliveSeconds||30}s</small></div><aside><button onClick={()=>setActiveId(session.sessionId)}>Focus</button><button onClick={()=>copySessionToForm(session)}>Clone</button></aside></header><TerminalPane session={session} fontSize={settings.fontSize} theme={settings.theme} onInput={sendInput} onResize={resizeTerminal} onFocus={setActiveId}/></section>):<div className="ssh-empty"><span>&gt;_</span><b>No terminal connected</b><small>Select New connection, enter a hostname or IP, inspect its fingerprint, and connect. New keys are approved and pinned on the fly.</small><button onClick={openConnection}>Create connection</button></div>}{search&&active&&<aside className="ssh-search-results"><header><b>Search results</b><button onClick={()=>setSearch("")}>×</button></header>{searchMatches.length?searchMatches.map((line,index)=><code key={index}>{line}</code>):<p>No matching output in the active tab.</p>}</aside>}</main>
    </div>
    <footer className="ssh-statusbar"><span><i className={active?.connected?"online":""}/>{active?.connected?"SSH connected":"No active connection"}</span><span>{active?.verifiedHostKey||active?.hostKeys?.[0]?.fingerprint||"Pinned host key verified on every connection"}</span><span>{broadcast?`Broadcasting to ${sessions.filter(item=>item.connected).length} sessions`:"Input: active pane only"}</span><span>UTF-8 · xterm-256color</span></footer>
  </section>;
}
