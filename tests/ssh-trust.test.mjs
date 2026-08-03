import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateKeyPairSync } from "node:crypto";
import ssh2 from "../portable/node_modules/ssh2/lib/index.js";
const { Server } = ssh2;
import test from "node:test";
import { fingerprintSshHostKey, inspectSshHostKey, sshTrustStatus, validateSshFingerprint } from "../portable/ssh-trust.mjs";

test("classifies new, matching, and changed SSH host fingerprints",()=>{
  const first=fingerprintSshHostKey(Buffer.from("first test server key"));
  const replacement=fingerprintSshHostKey(Buffer.from("replacement server key"));
  assert.equal(validateSshFingerprint(first),first);
  assert.equal(sshTrustStatus("",first),"new");
  assert.equal(sshTrustStatus(first,first),"trusted");
  assert.equal(sshTrustStatus(first,replacement),"changed");
  assert.throws(()=>validateSshFingerprint("SHA256:not-a-real-fingerprint"),/invalid/);
});

test("inspects a server key before any SSH authentication attempt",async(t)=>{
  const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
  let authenticationAttempted=false;
  const server=new Server({hostKeys:[privateKey.export({type:"pkcs1",format:"pem"})]},(client)=>{
    client.on("error",()=>{});
    client.on("authentication",(context)=>{authenticationAttempted=true;context.reject()});
  });
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});
  t.after(()=>new Promise((resolve)=>server.close(resolve)));
  const address=server.address();
  assert.equal(typeof address,"object");
  const inspected=await inspectSshHostKey({host:"127.0.0.1",port:address.port,username:"scan-only",timeoutMs:5000});
  assert.match(inspected.fingerprint,/^SHA256:[A-Za-z0-9+/]{43}$/);
  assert.match(inspected.keyType,/^ssh-rsa$|^rsa-sha2-/);
  assert.equal(authenticationAttempted,false);
});
test("the interactive SSH service does not read or modify OpenSSH known_hosts",async()=>{
  const service=await readFile(new URL("../portable/ssh-terminal.mjs",import.meta.url),"utf8");
  assert.equal(service.includes("known_hosts"),false);
  for(const implementation of ["inspectSshTrust","trustSshHost","expectedFingerprint","hostKeyMismatch","forgetSshHostTrust"])assert.equal(service.includes(implementation),true,implementation);
  const trust=await readFile(new URL("../portable/ssh-trust.mjs",import.meta.url),"utf8");
  for(const implementation of ["ssh-trusted-hosts.json","Returning false ends the scan before SSH authentication starts","trustStatus","previousFingerprint","FORGET ${host}:${port}"])assert.equal(trust.includes(implementation),true,implementation);
});
