import assert from "node:assert/strict";
import test from "node:test";
import {
  SSH_TERMINAL_LIMITS,
  normalizeSshHost,
  validateLocalForwardTarget,
  validateSftpPath,
  validateSshTarget,
} from "../portable/ssh-terminal.mjs";

test("accepts SSH hostnames and IP addresses with bounded terminal settings",()=>{
  const hostname=validateSshTarget({host:"sit-app-01.company.net",port:"2222",username:"ops_user",keepaliveSeconds:999,cols:2,rows:999});
  assert.equal(hostname.host,"sit-app-01.company.net");
  assert.equal(hostname.port,2222);
  assert.equal(hostname.keepaliveSeconds,300);
  assert.equal(hostname.cols,20);
  assert.equal(hostname.rows,200);
  assert.equal(normalizeSshHost("[2001:db8::10]"),"2001:db8::10");
  assert.equal(normalizeSshHost("10.20.30.40"),"10.20.30.40");
});

test("rejects unsafe SSH targets and privileged local tunnel binds",()=>{
  assert.throws(()=>normalizeSshHost("host;whoami"),/valid hostname/i);
  assert.throws(()=>validateSshTarget({host:"server",port:22,username:"root && whoami"}),/username/i);
  assert.throws(()=>validateLocalForwardTarget({remoteHost:"db.internal",remotePort:5432,localPort:80}),/1024/);
  assert.throws(()=>validateLocalForwardTarget({remoteHost:"db.internal",remotePort:70000,localPort:0}),/Remote port/);
});

test("limits SFTP input and exposes conservative SSH resource caps",()=>{
  assert.equal(validateSftpPath("/var/log/postgresql"),"/var/log/postgresql");
  assert.throws(()=>validateSftpPath("/tmp/file\nnext"),/invalid/);
  assert.deepEqual(validateLocalForwardTarget({remoteHost:"127.0.0.1",remotePort:5432,localPort:0}),{remoteHost:"127.0.0.1",remotePort:5432,requestedLocalPort:0});
  assert.equal(SSH_TERMINAL_LIMITS.maxSessions,8);
  assert.equal(SSH_TERMINAL_LIMITS.maxForwardsPerSession,4);
  assert.equal(SSH_TERMINAL_LIMITS.maxSftpDownloadBytes,2*1024*1024);
});
