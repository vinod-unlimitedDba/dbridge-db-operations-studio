import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createSessionCredentialVault } from "../portable/session-credentials.mjs";

test("keeps DB and SSH credentials in a bounded expiring memory vault",()=>{
  let clock=Date.parse("2026-08-04T00:00:00.000Z");
  const vault=createSessionCredentialVault({ttlMs:1000,maxEntries:2,now:()=>clock});

  const stored=vault.store({scope:"database",id:"profile-dev",username:"dbadmin",password:"not-persisted"});
  assert.deepEqual(Object.keys(stored).sort(),["available","expiresAt","id","scope"]);
  assert.equal(JSON.stringify(stored).includes("not-persisted"),false);
  assert.equal(vault.status("database","profile-dev").available,true);
  assert.deepEqual(vault.resolve("database","profile-dev"),{
    username:"dbadmin",password:"not-persisted",passphrase:"",expiresAt:clock+1000,
  });

  vault.store({scope:"ssh",id:"ssh-ops-host-22",username:"ops",passphrase:"memory-only"});
  assert.equal(vault.size,2);
  assert.throws(()=>vault.store({scope:"ssh",id:"third-entry",password:"blocked"}),/limit/i);

  clock+=1001;
  assert.equal(vault.status("database","profile-dev").available,false);
  assert.equal(vault.resolve("ssh","ssh-ops-host-22"),null);
  assert.equal(vault.size,0);
});

test("validates credential inputs and supports explicit removal",()=>{
  const vault=createSessionCredentialVault();
  assert.throws(()=>vault.store({scope:"cloud",id:"profile",password:"secret"}),/scope/i);
  assert.throws(()=>vault.store({scope:"database",id:"../profile",password:"secret"}),/identifier/i);
  assert.throws(()=>vault.store({scope:"database",id:"profile"}),/password or passphrase/i);
  assert.throws(()=>vault.store({scope:"ssh",id:"profile",password:"line\nbreak"}),/unsupported characters/i);

  vault.store({scope:"ssh",id:"ssh-dev",username:"ops",password:"session-secret"});
  assert.equal(vault.remove("ssh","ssh-dev").available,false);
  assert.equal(vault.resolve("ssh","ssh-dev"),null);
  vault.store({scope:"database",id:"db-dev",password:"session-secret"});
  vault.clear();
  assert.equal(vault.size,0);
});

test("wires one-click profiles without serializing browser secrets",async()=>{
  const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  const ssh=await readFile(new URL("../app/components/SshWorkspace.tsx",import.meta.url),"utf8");
  const server=await readFile(new URL("../portable/server.mjs",import.meta.url),"utf8");

  for(const endpoint of ["/api/credentials/session","/api/credentials/session/status","/api/credentials/session/delete"]){
    assert.equal(page.includes(endpoint)||ssh.includes(endpoint),true,endpoint);
    assert.equal(server.includes(endpoint),true,`${endpoint} server route`);
  }
  for(const behavior of ["Pass & connect","Remember until agent stops","connectToWorkspace(nextForm,profile.environment,id)","credentialId:credentialId||undefined"]){
    assert.equal(page.includes(behavior),true,behavior);
  }
  for(const behavior of ["consumeConnectionRequest()","await connect(nextForm,useCredential?credentialId:\"\")","credential remembered until the local agent stops","JSON.stringify(profiles)"]){
    assert.equal(ssh.includes(behavior),true,behavior);
  }
  assert.equal(page.includes('type Profile = Omit<DbForm,"password">'),true);
  assert.equal(ssh.includes("type Profile = { id:string; name:string; environment:string; host:string; port:string; username:string; authMethod:AuthMethod;"),true);
  for(const metadata of ["groupId?:string","favorite?:boolean","tags?:string[]","startupCommand?:string"])assert.equal(ssh.includes(metadata),true,metadata);
  assert.equal(/localStorage\.setItem\([^\n]+password/i.test(page),false);
  assert.equal(/localStorage\.setItem\([^\n]+password/i.test(ssh),false);
});
