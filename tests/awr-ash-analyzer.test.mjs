import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("adds an advanced local Oracle AWR and ASH performance investigator",async()=>{
  const [page,layout,component,css]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/layout.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/components/AwrAshAnalyzer.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/awr-ash-analyzer.css",import.meta.url),"utf8"),
  ]);
  for(const wiring of ["AWR / ASH Analyzer","AwrAshAnalyzer","awrash"])assert.equal(page.includes(wiring),true,wiring);
  assert.equal(layout.includes("./awr-ash-analyzer.css"),true,"AWR/ASH stylesheet import");
  for(const capability of [
    "Oracle AWR + ASH Performance Investigator","Known-good baseline","Analyze performance report","Ranked findings and verification plan",
    "Wait-event response-time map","SQL culprit correlation","ASH concentration pivots","Evidence coverage and blind spots",
    "AAS","DB CPU dominates database time","Active workload increased versus baseline","Evidence gaps","NO REPORT UPLOAD",
  ])assert.equal(component.includes(capability),true,capability);
  for(const method of ["detectKind","parseWaits","parseSql","parseAsh","eventAdvice","applyBaseline","analyzeSingle"])assert.equal(component.includes(method),true,method);
  for(const event of ["db file sequential read","log file sync","enq: TX","direct path read temp","cursor: pin","buffer busy"])assert.equal(component.toLowerCase().includes(event.toLowerCase()),true,event);
  for(const selector of [".awr-analyzer",".awr-input-grid",".awr-verdict",".awr-findings",".awr-data-table",".awr-ash-grid",".awr-coverage"])assert.equal(css.includes(selector),true,selector);
  assert.equal(component.includes("dangerouslySetInnerHTML"),false,"untrusted report HTML must never be rendered");
  assert.equal(component.includes("12_000_000"),true,"local report size guard");
});
