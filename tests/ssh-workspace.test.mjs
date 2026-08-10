import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("integrates the advanced Tabby-style SSH workspace",async()=>{
  const source=await readFile(new URL("../app/components/SshWorkspace.tsx",import.meta.url),"utf8");
  for(const capability of [
    "Remote operations terminal","New SSH connection","Auto-hide","Hostname or IP","OpenSSH agent","Private key file","Password",
    "Read-only SFTP","Local port forwarding","Quick commands","Broadcast","Split:","Export log",
    "Careful paste: send ${returns} command lines","Ctrl+Shift+D","Alt+1…8","Pinned host key verified on every connection","Trust and pin this host key?","No credential has been sent yet","Forget pinned key",
  ])assert.equal(source.includes(capability),true,capability);
  for(const endpoint of [
    "/api/terminal/ssh/preflight","/api/terminal/ssh/limits","/api/terminal/ssh/open",
    "/api/terminal/ssh/stream","/api/terminal/ssh/input","/api/terminal/ssh/resize",
    "/api/terminal/ssh/forward/open","/api/terminal/ssh/forward/close",
    "/api/terminal/ssh/sftp/list","/api/terminal/ssh/sftp/read","/api/terminal/ssh/trust/forget","/api/terminal/ssh/close",
  ])assert.equal(source.includes(endpoint),true,endpoint);
  assert.equal(source.includes("password:form.password"),true);
  assert.equal(source.includes('["connect","sftp","tunnels","snippets","settings"]'),false);
  assert.equal(source.includes("toolsPinned"),true);
  assert.equal(source.includes("window.setTimeout(()=>{setPanel(null);setConnectionOpen(false)},700)"),true);

  assert.equal(source.includes("password:form.password,passphrase:form.passphrase"),true);
  assert.equal(source.includes("const profile:Profile={"),true);
});

test("serves bounded SFTP and loopback-only local forwarding",async()=>{
  const service=await readFile(new URL("../portable/ssh-terminal.mjs",import.meta.url),"utf8");
  for(const implementation of ["maxSessions: 8","maxForwardsPerSession: 4","maxSftpDownloadBytes: 2 * 1024 * 1024","127.0.0.1","openSshLocalForward","closeSshForward","listSftpDirectory","readSftpFile","verifiedHostKey","keepaliveInterval"])assert.equal(service.includes(implementation),true,implementation);
  const server=await readFile(new URL("../portable/server.mjs",import.meta.url),"utf8");
  for(const route of ["/api/terminal/ssh/forward/open","/api/terminal/ssh/forward/close","/api/terminal/ssh/sftp/list","/api/terminal/ssh/sftp/read","/api/terminal/ssh/trust/forget"])assert.equal(server.includes(route),true,route);
  const css=await readFile(new URL("../app/ssh-workspace.css",import.meta.url),"utf8");
  for(const selector of [".ssh-advanced",".ssh-tabbar",".ssh-tools",".ssh-panes.vertical",".ssh-terminal-mount",".ssh-statusbar"])assert.equal(css.includes(selector),true,selector);
  for(const asset of ["xterm.js","xterm.css","xterm-addon-fit.js"])assert.ok((await stat(new URL(`../public/vendor/${asset}`,import.meta.url))).size>1000,asset);
});
