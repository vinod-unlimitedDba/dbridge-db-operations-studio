"use client";

import { useEffect, useRef, useState } from "react";

export type DatabaseTunnel = { sessionId:string; forwardId:string; remoteHost:string; remotePort:number; localPort:number; jumpHost:string; jumpUsername:string };
type JumpSession = { sessionId:string; host:string; port:number; username:string; forwards:{forwardId:string}[] };
type RouteFields = { connectionMode?:"direct"|"ssh"; sshTunnel?:DatabaseTunnel; oracleServerDN?:string };
type Props = {
  value:RouteFields & {engine:string;host:string;port:string;tlsMode:string};
  agentOnline:boolean;
  agentCall:(path:string,init?:RequestInit)=>Promise<any>;
  onChange:(patch:RouteFields)=>void;
  onOpenSsh:()=>void;
};

export default function DatabaseTunnelPanel({value,agentOnline,agentCall,onChange,onOpenSsh}:Props) {
  const [sessions,setSessions]=useState<JumpSession[]>([]);
  const [supported,setSupported]=useState<string[]>([]);
  const [sessionId,setSessionId]=useState(value.sshTunnel?.sessionId||"");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const mounted=useRef(true);
  const ssh=value.connectionMode==="ssh";
  const tunnel=value.sshTunnel;
  const mismatch=tunnel&&(tunnel.remoteHost.toLowerCase()!==value.host.trim().toLowerCase()||tunnel.remotePort!==Number(value.port));
  const refresh=async()=>{
    if(!agentOnline)return;
    try {
      const data=await agentCall("/api/connections/tunnels");
      if(!Array.isArray(data.supportedEngines))throw new Error("Update the local edition to use database tunnels.");
      if(!mounted.current)return;
      setSessions(data.sessions||[]);setSupported(data.supportedEngines);
      setSessionId(current=>data.sessions?.some((item:JumpSession)=>item.sessionId===current)?current:data.sessions?.[0]?.sessionId||"");
      setMessage("");
      if(tunnel&&!data.sessions?.some((item:JumpSession)=>item.sessionId===tunnel.sessionId&&item.forwards?.some(forward=>forward.forwardId===tunnel.forwardId))) {
        onChange({sshTunnel:undefined});setMessage("The SSH session or tunnel closed. Reconnect before running SQL.");
      }
    }catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:"Could not load jump servers.")}
  };
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
  useEffect(()=>{if(!ssh)return;void refresh();const timer=setInterval(()=>void refresh(),10000);return()=>clearInterval(timer)},[ssh,agentOnline,tunnel?.forwardId]);
  const close=async()=>{
    if(tunnel)await agentCall("/api/terminal/ssh/forward/close",{method:"POST",body:JSON.stringify({sessionId:tunnel.sessionId,forwardId:tunnel.forwardId})});
    onChange({sshTunnel:undefined});
  };
  const changeMode=async(mode:"direct"|"ssh")=>{
    setBusy(true);
    try{if(tunnel)await close();onChange({connectionMode:mode,sshTunnel:undefined});setMessage("")}
    catch(error){setMessage(error instanceof Error?error.message:"Could not close the old tunnel. Refresh its status.")}
    finally{setBusy(false)}
  };
  const open=async()=>{
    if(!value.host.trim()||!value.port.trim()){setMessage("Enter the actual database host and port below first.");return}
    setBusy(true);setMessage("");
    try{
      if(tunnel)await close();
      const data=await agentCall("/api/connections/tunnels/open",{method:"POST",body:JSON.stringify({engine:value.engine,host:value.host.trim(),port:value.port,sessionId})});
      if(!data.tunnel?.forwardId)throw new Error("The local agent did not return a database tunnel.");
      if(!mounted.current){await agentCall("/api/terminal/ssh/forward/close",{method:"POST",body:JSON.stringify(data.tunnel)});return}
      onChange({connectionMode:"ssh",sshTunnel:data.tunnel});
      setMessage("Tunnel ready. Enter database credentials and select Connect to validate the database.");
    }catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:"Could not open the tunnel.")}
    finally{if(mounted.current)setBusy(false)}
  };
  return <section className="db-tunnel-panel" aria-label="Jump-server connection">
    <label>CONNECTION ROUTE<select value={ssh?"ssh":"direct"} disabled={busy} onChange={event=>void changeMode(event.target.value as "direct"|"ssh")}><option value="direct">Direct database connection</option><option value="ssh">Through SSH jump server</option></select></label>
    {ssh&&<>
      <label>CONNECTED JUMP SERVER<select value={sessionId} disabled={busy||Boolean(tunnel)} onChange={event=>setSessionId(event.target.value)}><option value="">Select an SSH session…</option>{sessions.map(session=><option key={session.sessionId} value={session.sessionId}>{session.username}@{session.host}:{session.port}</option>)}</select></label>
      <div className="db-tunnel-actions"><button type="button" onClick={onOpenSsh}>Connect jump server</button><button type="button" onClick={()=>void refresh()} disabled={!agentOnline||busy}>Refresh</button></div>
      <p>Use the database hostname and port as reached from the jump server. SSH and database logins are separate.</p>
      {tunnel?<><div className={`db-tunnel-route ${mismatch?"warning":""}`} role="status"><b>{tunnel.jumpUsername}@{tunnel.jumpHost}</b><span>{tunnel.remoteHost}:{tunnel.remotePort}</span><small>Local port {tunnel.localPort} · {mismatch?"Target changed — reopen tunnel":"Tunnel open; database validation is separate"}</small></div><button type="button" disabled={busy} onClick={()=>{setBusy(true);void close().catch(error=>setMessage(error.message)).finally(()=>setBusy(false))}}>Close database tunnel</button></>:<button type="button" className="primary" onClick={()=>void open()} disabled={!agentOnline||!sessionId||busy||!supported.includes(value.engine)}>{busy?"Opening tunnel…":"Open database tunnel"}</button>}
      {supported.length>0&&!supported.includes(value.engine)&&<p role="alert">This adapter requires a direct connection. Choose a supported database adapter for SSH.</p>}
      {value.engine==="oracle"&&<><p>For RAC, use a DBA-approved listener endpoint. A SCAN redirect may need additional routing.</p>{value.tlsMode==="require"&&<label>ORACLE SERVER CERTIFICATE DN<input value={value.oracleServerDN||""} onChange={event=>onChange({oracleServerDN:event.target.value})} placeholder="CN=db.example.com,OU=Database,O=Company"/><small>Use the certificate DN supplied by your DBA for TCPS identity checks.</small></label>}</>}
      {value.engine==="mongodb"&&<p>This route connects to the selected MongoDB member only; replica-set failover is not provided by one tunnel.</p>}
      {!agentOnline&&<p>Use the <a href="/downloads/DBridge-Node-Portable.zip">updated local edition</a> for database and jump-server access. Requires Node.js 22.13 or newer.</p>}
      {message&&<p role="status">{message}</p>}
    </>}
  </section>;
}
