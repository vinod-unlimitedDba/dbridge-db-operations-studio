const docs = {
  oracle: "https://docs.oracle.com/en/database/oracle/oracle-database/26/arpls/DBMS_SQLDIAG.html",
  postgres: "https://www.postgresql.org/docs/current/pgstatstatements.html",
  mongodb: "https://www.mongodb.com/docs/manual/reference/database-profiler/",
  mysql: "https://dev.mysql.com/doc/refman/8.4/en/performance-schema-statement-digests.html",
  mariadb: "https://mariadb.com/docs/server/reference/system-tables/performance-schema/performance-schema-tables/performance-schema-events_statements_summary_by_digest-table",
  sqlserver: "https://learn.microsoft.com/en-us/sql/relational-databases/performance/monitoring-performance-by-using-the-query-store",
};

export const runtimeTraceCatalog = {
  oracle: {
    name: "Oracle",
    identifier: "SQL_ID",
    example: "8m5j1t2y4n6p9",
    equivalent: "Shared-pool compiler and runtime evidence",
    traceName: "10053 optimizer trace",
    limitation: "The shared pool retains cursor, plan, optimizer-environment and runtime evidence; it does not retain the original 10053 decision file. A new 10053 trace requires a controlled reparse in a traced session.",
    doc: docs.oracle,
    checks: [
      {
        id: "statement", label: "Shared-pool statement children", phase: "IDENTITY", importance: "critical",
        guidance: "Find every loaded child, plan hash and workload counter without executing the SQL.",
        sql: `select sql_id, child_number, plan_hash_value, executions, parse_calls, loads, invalidations,
          elapsed_time/1000 elapsed_ms, cpu_time/1000 cpu_ms, buffer_gets, disk_reads,
          rows_processed, fetches, sorts, direct_writes, application_wait_time/1000 application_wait_ms,
          concurrency_wait_time/1000 concurrency_wait_ms, user_io_wait_time/1000 user_io_wait_ms,
          cluster_wait_time/1000 cluster_wait_ms,
          case when executions>0 then elapsed_time/1000/executions end average_elapsed_ms,
          case when executions>0 then buffer_gets/executions end buffer_gets_per_exec,
          case when executions>0 then disk_reads/executions end disk_reads_per_exec,
          first_load_time, last_active_time, parsing_schema_name, module, action,
          substr(sql_fulltext,1,1000) sql_text
        from v$sql where sql_id='__IDENTIFIER__'
        order by elapsed_time desc fetch first 100 rows only`,
      },
      {
        id: "runtime", label: "Live sessions and waits", phase: "RUNTIME", importance: "critical",
        guidance: "Correlate the SQL_ID with active calls, waits, blockers, services and application modules.",
        sql: `select inst_id, sid, serial#, username, status, sql_id, prev_sql_id, event, wait_class, state,
          seconds_in_wait, last_call_et runtime_seconds, blocking_instance, blocking_session,
          final_blocking_instance, final_blocking_session, service_name, module, action, client_identifier
        from gv$session
        where sql_id='__IDENTIFIER__' or prev_sql_id='__IDENTIFIER__'
        order by case when sql_id='__IDENTIFIER__' then 0 else 1 end, last_call_et desc
        fetch first 100 rows only`,
      },
      {
        id: "plan", label: "Actual versus estimated plan lines", phase: "PLAN", importance: "critical",
        guidance: "Use already-captured row-source statistics to find cardinality errors, repeated starts and I/O-heavy operators.",
        sql: `select child_number, plan_hash_value, id, parent_id, depth, operation, options,
          object_owner, object_name, cardinality estimated_rows, last_output_rows actual_rows,
          last_starts, last_cr_buffer_gets, last_cu_buffer_gets, last_disk_reads, last_disk_writes,
          last_elapsed_time/1000 last_elapsed_ms, last_memory_used, last_execution, last_degree,
          access_predicates, filter_predicates
        from v$sql_plan_statistics_all
        where sql_id='__IDENTIFIER__'
        order by child_number, id fetch first 300 rows only`,
      },
      {
        id: "optimizer", label: "Optimizer environment by child", phase: "COMPILER", importance: "high",
        guidance: "Compare optimizer settings across children to explain why the same SQL text compiled differently.",
        sql: `select child_number, name parameter_name, value parameter_value, isdefault
        from v$sql_optimizer_env
        where sql_id='__IDENTIFIER__'
        order by child_number, name fetch first 300 rows only`,
      },
      {
        id: "sharing", label: "Child-cursor sharing reasons", phase: "COMPILER", importance: "high",
        guidance: "Identify bind, optimizer, authorization, statistics and environment mismatches behind cursor proliferation.",
        sql: `select child_number, unbound_cursor, sql_type_mismatch, optimizer_mismatch, outline_mismatch,
          stats_row_mismatch, literal_mismatch, force_hard_parse, auth_check_mismatch, bind_mismatch,
          bind_equiv_failure, user_bind_peek_mismatch, optimizer_mode_mismatch, px_mismatch
        from v$sql_shared_cursor
        where sql_id='__IDENTIFIER__'
        order by child_number fetch first 100 rows only`,
      },
      {
        id: "display", label: "Loaded cursor plan", phase: "PLAN", importance: "high",
        guidance: "Display the loaded plan with predicates, outline and peeked-bind metadata. The statement is not executed.",
        sql: `select plan_table_output
        from table(dbms_xplan.display_cursor('__IDENTIFIER__',null,'ALLSTATS LAST +PREDICATE +OUTLINE +PEEKED_BINDS'))`,
      },
    ],
  },
  postgres: {
    name: "PostgreSQL",
    identifier: "queryid",
    example: "-1234567890123456789",
    equivalent: "pg_stat_statements and live query_id evidence",
    traceName: "Planner and executor evidence",
    limitation: "pg_stat_statements retains normalized query and aggregate planning/execution counters, not a cached execution-plan tree. DBridge does not run EXPLAIN ANALYZE automatically because it executes the statement.",
    doc: docs.postgres,
    checks: [
      {
        id: "statement", label: "Statement statistics", phase: "IDENTITY", importance: "critical",
        guidance: "Retrieve normalized SQL, execution distribution, rows, buffer traffic, temporary I/O and block timing.",
        sql: `select queryid, calls, total_exec_time, min_exec_time, max_exec_time, mean_exec_time, stddev_exec_time,
          rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written,
          local_blks_hit, local_blks_read, temp_blks_read, temp_blks_written,
          blk_read_time, blk_write_time, left(query,1000) query
        from pg_stat_statements where queryid=__IDENTIFIER__
        order by total_exec_time desc limit 50`,
      },
      {
        id: "runtime", label: "Live activity by query_id", phase: "RUNTIME", importance: "critical",
        guidance: "Find active executions, wait events, transactions, client applications and blockers.",
        sql: `select pid, usename, application_name, client_addr, state, wait_event_type, wait_event,
          pg_blocking_pids(pid) blocker_pids,
          round(extract(epoch from (clock_timestamp()-query_start))::numeric,3) runtime_seconds,
          round(extract(epoch from (clock_timestamp()-xact_start))::numeric,3) transaction_seconds,
          left(query,1000) query
        from pg_stat_activity
        where query_id=__IDENTIFIER__
        order by query_start nulls last limit 100`,
      },
      {
        id: "locks", label: "Lock footprint for matching sessions", phase: "CONCURRENCY", importance: "high",
        guidance: "Map granted and waiting lock types for PIDs currently executing the queryid.",
        sql: `select a.pid, l.locktype, l.mode, l.granted, l.relation::regclass relation,
          l.page, l.tuple, l.transactionid, l.virtualxid, a.wait_event_type, a.wait_event
        from pg_stat_activity a join pg_locks l on l.pid=a.pid
        where a.query_id=__IDENTIFIER__
        order by l.granted, a.pid limit 200`,
      },
      {
        id: "planning", label: "Planning capture status", phase: "COMPILER", importance: "high",
        guidance: "Confirm query-id calculation, planning tracking and the statistics reset boundary before interpreting zeros.",
        sql: `select current_setting('compute_query_id',true) compute_query_id,
          current_setting('pg_stat_statements.track',true) statements_track,
          current_setting('pg_stat_statements.track_planning',true) track_planning,
          current_setting('track_io_timing',true) track_io_timing,
          current_setting('jit',true) jit,
          (select stats_reset from pg_stat_statements_info) statements_reset`,
      },
      {
        id: "environment", label: "Planner resource context", phase: "COMPILER", importance: "medium",
        guidance: "Capture resource and planner settings that influence plan selection without changing them.",
        sql: `select current_setting('work_mem') work_mem,
          current_setting('effective_cache_size') effective_cache_size,
          current_setting('random_page_cost') random_page_cost,
          current_setting('effective_io_concurrency',true) effective_io_concurrency,
          current_setting('max_parallel_workers_per_gather') max_parallel_workers_per_gather,
          current_setting('plan_cache_mode',true) plan_cache_mode`,
      },
    ],
  },
  mongodb: {
    name: "MongoDB",
    identifier: "operation or comment ID",
    example: "orders-api.checkout",
    equivalent: "currentOp, existing profiler and query-shape evidence",
    traceName: "Operation runtime evidence",
    limitation: "DBridge reads current operations and profiler data only when they already exist. It never enables profiling. executionStats requires evaluating a representative command and is therefore a separate operator decision.",
    doc: docs.mongodb,
    checks: [
      { id: "current", label: "Matching live operations", phase: "RUNTIME", importance: "critical", guidance: "Match operation ID, command comment or application name and rank runtime, locks and scan behavior." },
      { id: "profiler", label: "Existing profiler history", phase: "HISTORY", importance: "critical", guidance: "Read matching system.profile documents when profiling already exists; never enable or change the profiler." },
      { id: "queryStats", label: "Query-shape statistics", phase: "IDENTITY", importance: "high", guidance: "Inspect available query-shape metrics and retain only records containing the identifier." },
      { id: "planCache", label: "Collection plan-cache state", phase: "COMPILER", importance: "high", guidance: "Inspect cached query shapes only when an optional collection is supplied; never clear the cache." },
      { id: "context", label: "Server and profiler context", phase: "CONTEXT", importance: "medium", guidance: "Capture version, topology and current profiler status so missing history is interpreted correctly." },
    ],
  },
  mysql: {
    name: "MySQL",
    identifier: "statement digest",
    example: "A1B2C3D4E5F60718",
    equivalent: "Performance Schema digest and event history",
    traceName: "Optimizer and runtime evidence",
    limitation: "Performance Schema retains digest summaries and sampled/history events when configured. optimizer_trace is session-scoped and requires executing the statement in that session, so DBridge does not enable it automatically.",
    doc: docs.mysql,
    checks: [
      {
        id: "statement", label: "Digest workload summary", phase: "IDENTITY", importance: "critical",
        guidance: "Rank execution time, rows examined, rows returned, temporary tables, sorting, index use and errors.",
        sql: `select schema_name, digest, digest_text, count_star,
          round(sum_timer_wait/1000000000,3) total_elapsed_ms,
          round(avg_timer_wait/1000000000,3) average_elapsed_ms,
          round(max_timer_wait/1000000000,3) max_elapsed_ms,
          sum_lock_time, sum_errors, sum_warnings, sum_rows_affected, sum_rows_sent, sum_rows_examined,
          sum_created_tmp_disk_tables, sum_created_tmp_tables, sum_select_full_join, sum_select_scan,
          sum_sort_merge_passes, sum_no_index_used, sum_no_good_index_used, first_seen, last_seen
        from performance_schema.events_statements_summary_by_digest
        where digest='__IDENTIFIER__' order by sum_timer_wait desc limit 50`,
      },
      {
        id: "history", label: "Completed statement history", phase: "HISTORY", importance: "critical",
        guidance: "Inspect recent matching executions with per-call latency, rows, temporary work and errors.",
        sql: `select thread_id, event_id, event_name, sql_text, digest, current_schema,
          round(timer_wait/1000000000,3) elapsed_ms, lock_time, mysql_errno, returned_sqlstate,
          message_text, errors, warnings, rows_affected, rows_sent, rows_examined,
          created_tmp_disk_tables, created_tmp_tables, select_full_join, select_scan,
          sort_merge_passes, no_index_used, no_good_index_used, nesting_event_id
        from performance_schema.events_statements_history_long
        where digest='__IDENTIFIER__' order by event_id desc limit 100`,
      },
      {
        id: "runtime", label: "Currently executing events", phase: "RUNTIME", importance: "critical",
        guidance: "Find matching in-flight statements and their current wait time before the event reaches history.",
        sql: `select thread_id, event_id, event_name, sql_text, digest, current_schema,
          round(timer_wait/1000000000,3) elapsed_ms, lock_time, rows_sent, rows_examined,
          created_tmp_disk_tables, no_index_used
        from performance_schema.events_statements_current
        where digest='__IDENTIFIER__' order by timer_wait desc limit 100`,
      },
      {
        id: "stages", label: "Execution stages for recent events", phase: "RUNTIME", importance: "high",
        guidance: "Correlate recent statement event IDs with captured stages such as optimizing, statistics, sorting and sending data.",
        sql: `select s.thread_id, s.event_id, s.nesting_event_id, s.event_name,
          round(s.timer_wait/1000000000,3) elapsed_ms, s.work_completed, s.work_estimated
        from performance_schema.events_stages_history_long s
        where exists (
          select 1 from performance_schema.events_statements_history_long h
          where h.thread_id=s.thread_id and h.event_id=s.nesting_event_id and h.digest='__IDENTIFIER__'
        ) order by s.timer_wait desc limit 200`,
      },
      {
        id: "context", label: "Performance Schema capture status", phase: "CONTEXT", importance: "medium",
        guidance: "Confirm whether statement and stage consumers are enabled before interpreting missing rows.",
        sql: `select name, enabled
        from performance_schema.setup_consumers
        where name in ('events_statements_current','events_statements_history','events_statements_history_long','events_stages_history_long')
        order by name`,
      },
    ],
  },
  sqlserver: {
    name: "SQL Server",
    identifier: "query_id or query hash",
    example: "0x0123456789ABCDEF",
    equivalent: "Query Store and cached DMV evidence",
    traceName: "Compilation, plan and runtime history",
    limitation: "Query Store retains query text, plans, runtime windows and waits when enabled; the plan cache retains current cached metrics. A full event trace requires Extended Events and is not enabled by DBridge.",
    doc: docs.sqlserver,
    checks: [
      {
        id: "queryStore", label: "Query Store runtime history", phase: "HISTORY", importance: "critical",
        guidance: "Retrieve plan variants and aggregated runtime windows for the query identifier.",
        sql: `select top (100) q.query_id, convert(varchar(18),q.query_hash,1) query_hash,
          p.plan_id, p.is_forced_plan, p.force_failure_count, p.last_force_failure_reason_desc,
          rs.count_executions, rs.avg_duration/1000.0 average_duration_ms,
          rs.min_duration/1000.0 min_duration_ms, rs.max_duration/1000.0 max_duration_ms,
          rs.avg_cpu_time/1000.0 average_cpu_ms, rs.avg_logical_io_reads, rs.avg_physical_io_reads,
          rs.avg_rowcount, rs.last_execution_time, left(qt.query_sql_text,1000) query_sql_text
        from sys.query_store_query q
        join sys.query_store_query_text qt on qt.query_text_id=q.query_text_id
        join sys.query_store_plan p on p.query_id=q.query_id
        join sys.query_store_runtime_stats rs on rs.plan_id=p.plan_id
        where __SQLSERVER_FILTER__
        order by rs.last_execution_time desc`,
      },
      {
        id: "waits", label: "Query Store wait history", phase: "RUNTIME", importance: "high",
        guidance: "Rank persisted wait categories by plan and interval.",
        sql: `select top (100) q.query_id, convert(varchar(18),q.query_hash,1) query_hash,
          p.plan_id, ws.wait_category_desc, ws.total_query_wait_time_ms,
          ws.avg_query_wait_time_ms, ws.last_query_wait_time_ms, ws.max_query_wait_time_ms,
          ws.runtime_stats_interval_id
        from sys.query_store_query q
        join sys.query_store_plan p on p.query_id=q.query_id
        join sys.query_store_wait_stats ws on ws.plan_id=p.plan_id
        where __SQLSERVER_FILTER__
        order by ws.total_query_wait_time_ms desc`,
      },
      {
        id: "cached", label: "Cached statement metrics", phase: "RUNTIME", importance: "critical",
        guidance: "Use plan-cache counters for current executions, CPU, reads, writes, rows and plan hashes.",
        sql: `select top (100) convert(varchar(18),qs.query_hash,1) query_hash,
          convert(varchar(18),qs.query_plan_hash,1) query_plan_hash,
          qs.execution_count, qs.total_elapsed_time/1000.0 total_elapsed_ms,
          qs.last_elapsed_time/1000.0 last_elapsed_ms, qs.max_elapsed_time/1000.0 max_elapsed_ms,
          qs.total_worker_time/1000.0 total_cpu_ms, qs.total_logical_reads, qs.total_physical_reads,
          qs.total_logical_writes, qs.total_rows, qs.last_execution_time,
          left(substring(st.text,(qs.statement_start_offset/2)+1,
            ((case qs.statement_end_offset when -1 then datalength(st.text) else qs.statement_end_offset end-qs.statement_start_offset)/2)+1),1000) statement_text
        from sys.dm_exec_query_stats qs cross apply sys.dm_exec_sql_text(qs.sql_handle) st
        where __SQLSERVER_CACHE_FILTER__
        order by qs.last_execution_time desc`,
      },
      {
        id: "requests", label: "Active requests", phase: "RUNTIME", importance: "critical",
        guidance: "Find live request waits, blockers, CPU, reads, writes and memory grants for the query hash.",
        sql: `select top (100) r.session_id, r.status, r.command, r.blocking_session_id,
          r.wait_type, r.wait_time, r.wait_resource, r.cpu_time, r.total_elapsed_time,
          r.reads, r.writes, r.logical_reads, r.row_count, r.granted_query_memory,
          convert(varchar(18),r.query_hash,1) query_hash, convert(varchar(18),r.query_plan_hash,1) query_plan_hash,
          left(t.text,1000) statement_text
        from sys.dm_exec_requests r cross apply sys.dm_exec_sql_text(r.sql_handle) t
        where __SQLSERVER_REQUEST_FILTER__
        order by r.total_elapsed_time desc`,
      },
      {
        id: "plans", label: "Query Store plans", phase: "COMPILER", importance: "high",
        guidance: "Compare retained plan XML, compatibility level, engine version and compile timestamps.",
        sql: `select top (30) q.query_id, convert(varchar(18),q.query_hash,1) query_hash,
          p.plan_id, p.query_plan_hash, p.compatibility_level, p.engine_version,
          p.initial_compile_start_time, p.last_compile_start_time, p.is_forced_plan,
          p.query_plan
        from sys.query_store_query q join sys.query_store_plan p on p.query_id=q.query_id
        where __SQLSERVER_FILTER__
        order by p.last_compile_start_time desc`,
      },
    ],
  },
};

runtimeTraceCatalog.mariadb = {...runtimeTraceCatalog.mysql, name:"MariaDB", doc:docs.mariadb};

export function validateRuntimeTraceInput(engine, identifier, collection = "") {
  const id = String(identifier || "").trim();
  if (!runtimeTraceCatalog[engine]) throw new Error("Select a supported runtime trace engine");
  if (engine === "oracle" && !/^[a-z0-9]{13}$/i.test(id)) throw new Error("Oracle SQL_ID must contain exactly 13 letters or digits");
  if (engine === "postgres" && !/^-?\d{1,20}$/.test(id)) throw new Error("PostgreSQL queryid must be a signed integer with at most 20 digits");
  if (engine === "mongodb" && (!id || id.length > 128 || /[\r\n\0]/.test(id))) throw new Error("MongoDB operation/comment ID must be 1 to 128 safe characters");
  if (["mysql","mariadb"].includes(engine) && !/^[a-f0-9]{8,64}$/i.test(id)) throw new Error(`${engine === "mariadb" ? "MariaDB" : "MySQL"} digest must contain 8 to 64 hexadecimal characters`);
  if (engine === "sqlserver" && !/^(?:\d{1,19}|0x[a-f0-9]{16})$/i.test(id)) throw new Error("SQL Server identifier must be a numeric query_id or a 0x-prefixed 16-digit query hash");
  const cleanCollection = String(collection || "").trim();
  if (cleanCollection && (cleanCollection.length > 255 || /[\r\n\0$]/.test(cleanCollection))) throw new Error("Enter a valid MongoDB collection name");
  return { identifier: engine === "oracle" ? id.toLowerCase() : ["mysql","mariadb"].includes(engine) || engine === "sqlserver" ? id.toUpperCase() : id, collection: cleanCollection };
}

export function runtimeTraceSql(engine, definition, identifier) {
  if (!definition?.sql) return "";
  if (engine === "sqlserver") {
    const byQueryId = /^\d+$/.test(identifier);
    const storeFilter = byQueryId ? `q.query_id=${identifier}` : `convert(varchar(18),q.query_hash,1)='${identifier}'`;
    const cacheFilter = byQueryId ? `1=0` : `convert(varchar(18),qs.query_hash,1)='${identifier}'`;
    const requestFilter = byQueryId ? `1=0` : `convert(varchar(18),r.query_hash,1)='${identifier}'`;
    return definition.sql
      .replaceAll("__SQLSERVER_FILTER__", storeFilter)
      .replaceAll("__SQLSERVER_CACHE_FILTER__", cacheFilter)
      .replaceAll("__SQLSERVER_REQUEST_FILTER__", requestFilter);
  }
  return definition.sql.replaceAll("__IDENTIFIER__", identifier);
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalized(row) {
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key.toLowerCase(), value]));
}

function pick(row, ...keys) {
  const item = normalized(row);
  for (const key of keys) if (item[key.toLowerCase()] !== undefined && item[key.toLowerCase()] !== null) return item[key.toLowerCase()];
  return undefined;
}

function allRows(results, id) {
  return results.find((item) => item.id === id)?.rows || [];
}

function addFinding(findings, severity, area, title, evidence, why, nextAction) {
  findings.push({ severity, area, title, evidence, why, nextAction });
}

function maximum(rows, ...keys) {
  return rows.reduce((value, row) => Math.max(value, numeric(pick(row, ...keys))), 0);
}

function total(rows, ...keys) {
  return rows.reduce((value, row) => value + numeric(pick(row, ...keys)), 0);
}

function unique(rows, ...keys) {
  return new Set(rows.map((row) => String(pick(row, ...keys) ?? "")).filter(Boolean)).size;
}

function rowText(row) {
  try { return JSON.stringify(row).toUpperCase(); } catch { return ""; }
}

function buildTerminalScript(engine, identifier, collection) {
  if (engine === "oracle") return `-- ORACLE SHARED-POOL EVIDENCE (read only)
-- A past 10053 trace cannot be reconstructed from V$SQL. These queries recover retained evidence.
select sql_id, child_number, plan_hash_value, executions, elapsed_time/1000 elapsed_ms,
       cpu_time/1000 cpu_ms, buffer_gets, disk_reads, rows_processed, last_active_time
from v$sql where sql_id='${identifier}' order by elapsed_time desc;

select * from table(dbms_xplan.display_cursor('${identifier}',null,
  'ALLSTATS LAST +PREDICATE +OUTLINE +PEEKED_BINDS'));

select child_number, name, value, isdefault
from v$sql_optimizer_env where sql_id='${identifier}' order by child_number, name;

-- NEW 10053 CAPTURE TEMPLATE (session-changing; DBA review required)
-- This generates future evidence only and requires reparsing the exact statement in this session.
-- alter session set tracefile_identifier='DBRIDGE_${identifier.toUpperCase()}';
-- alter session set events '10053 trace name context forever, level 1';
-- <parse the exact application SQL once in this controlled session>
-- alter session set events '10053 trace name context off';
-- select value from v$diag_info where name='Default Trace File';`;
  if (engine === "postgres") return `-- POSTGRESQL RETAINED RUNTIME EVIDENCE (read only)
select queryid, calls, total_exec_time, mean_exec_time, rows,
       shared_blks_hit, shared_blks_read, temp_blks_read, temp_blks_written, query
from pg_stat_statements where queryid=${identifier};

select pid, application_name, state, wait_event_type, wait_event,
       pg_blocking_pids(pid), query_start, query
from pg_stat_activity where query_id=${identifier};

-- PLAN TEMPLATE (review representative SQL first; does not execute it without ANALYZE)
-- EXPLAIN (VERBOSE, COSTS, SETTINGS, FORMAT JSON) <representative SQL>;`;
  if (engine === "mongodb") return `// MONGODB RETAINED RUNTIME EVIDENCE (read only)
db.currentOp({$or:[
  {opid:${JSON.stringify(identifier)}},
  {"command.comment":${JSON.stringify(identifier)}},
  {appName:${JSON.stringify(identifier)}}
]})

db.getCollection("system.profile").find({$or:[
  {opid:${JSON.stringify(identifier)}},
  {"command.comment":${JSON.stringify(identifier)}},
  {appName:${JSON.stringify(identifier)}}
]}).sort({ts:-1}).limit(50)

${collection ? `db.getCollection(${JSON.stringify(collection)}).aggregate([{$planCacheStats:{}},{$limit:100}])` : "// Add a collection name in DBridge to inspect $planCacheStats."}
// DBridge never enables the profiler or executes explain automatically.`;
  if (["mysql","mariadb"].includes(engine)) return `-- ${engine.toUpperCase()} PERFORMANCE SCHEMA EVIDENCE (read only)
select * from performance_schema.events_statements_summary_by_digest
where digest='${identifier}';

select * from performance_schema.events_statements_history_long
where digest='${identifier}' order by event_id desc limit 100;

-- OPTIMIZER_TRACE TEMPLATE (session-changing; DBA review required)
-- SET optimizer_trace='enabled=on';
-- <execute the representative statement in this controlled session>
-- SELECT TRACE FROM information_schema.OPTIMIZER_TRACE;
-- SET optimizer_trace='enabled=off';`;
  return `-- SQL SERVER QUERY STORE AND CACHE EVIDENCE (read only)
${/^\d+$/.test(identifier)
    ? `select q.query_id, p.plan_id, rs.* from sys.query_store_query q
join sys.query_store_plan p on p.query_id=q.query_id
join sys.query_store_runtime_stats rs on rs.plan_id=p.plan_id
where q.query_id=${identifier};`
    : `select convert(varchar(18),qs.query_hash,1) query_hash, qs.*
from sys.dm_exec_query_stats qs
where convert(varchar(18),qs.query_hash,1)='${identifier}';`}

-- Query Store retains plans, runtime intervals and wait categories when enabled.
-- DBridge does not create an Extended Events session or force a plan.`;
}

export function analyzeRuntimeTrace(engine, identifier, collection, results) {
  const definition = runtimeTraceCatalog[engine];
  const findings = [];
  const successful = results.filter((item) => item.ok);
  const failed = results.filter((item) => !item.ok && !item.skipped);
  const rows = results.flatMap((item) => item.rows || []);
  let executions = 0;
  let averageMs = 0;
  let maximumMs = 0;
  let planVersions = 0;
  let runtimeSeconds = 0;
  let scanRatio = 0;
  let waitSignals = 0;

  if (engine === "oracle") {
    const statement = allRows(results, "statement");
    const runtime = allRows(results, "runtime");
    const plan = allRows(results, "plan");
    executions = total(statement, "executions");
    averageMs = maximum(statement, "average_elapsed_ms");
    maximumMs = maximum(statement, "elapsed_ms");
    planVersions = unique(statement, "plan_hash_value");
    runtimeSeconds = maximum(runtime, "runtime_seconds", "last_call_et");
    waitSignals = runtime.filter((row) => String(pick(row, "wait_class") || "").toUpperCase() !== "IDLE" && String(pick(row, "state") || "").toUpperCase() === "WAITING").length;
    const ratios = plan.map((row) => {
      const estimated = numeric(pick(row, "estimated_rows", "cardinality"));
      const actual = numeric(pick(row, "actual_rows", "last_output_rows"));
      return estimated > 0 && actual > 0 ? Math.max(actual / estimated, estimated / actual) : 0;
    });
    scanRatio = Math.max(0, ...ratios);
    const invalidations = total(statement, "invalidations");
    const sharingReasons = allRows(results, "sharing").reduce((count, row) => count + Object.values(row).filter((value) => String(value).toUpperCase() === "Y").length, 0);
    if (invalidations > 0) addFinding(findings, invalidations > 10 ? "HIGH" : "MEDIUM", "Compiler", "Loaded cursors were invalidated", `${invalidations.toLocaleString()} invalidations`, "Invalidation forces recompilation and can change the selected plan.", "Correlate invalidation times with DDL, statistics and object changes.");
    if (sharingReasons > 0) addFinding(findings, sharingReasons > 10 ? "HIGH" : "MEDIUM", "Compiler", "Child cursors have sharing mismatches", `${sharingReasons.toLocaleString()} mismatch flags`, "Different bind, optimizer or authorization environments can multiply children and plan variants.", "Compare the flagged V$SQL_SHARED_CURSOR columns and optimizer environments.");
  } else if (engine === "postgres") {
    const statement = allRows(results, "statement");
    const runtime = allRows(results, "runtime");
    executions = total(statement, "calls");
    averageMs = maximum(statement, "mean_exec_time");
    maximumMs = maximum(statement, "max_exec_time");
    planVersions = 0;
    runtimeSeconds = maximum(runtime, "runtime_seconds");
    waitSignals = runtime.filter((row) => pick(row, "wait_event_type")).length;
    const examined = total(statement, "shared_blks_hit") + total(statement, "shared_blks_read");
    const returned = total(statement, "rows");
    scanRatio = returned > 0 ? examined / returned : examined;
    if (!allRows(results, "planning").length) addFinding(findings, "INFO", "Capture", "Planning capture context is unavailable", "No planning-status row", "Planning columns may be zero when tracking is disabled.", "Confirm pg_stat_statements.track_planning and the statistics reset boundary.");
  } else if (engine === "mongodb") {
    const current = allRows(results, "current");
    const profile = allRows(results, "profiler").filter((row) => !pick(row, "profilingStatus"));
    executions = current.length + profile.length;
    averageMs = profile.length ? total(profile, "millis") / profile.length : 0;
    maximumMs = Math.max(maximum(profile, "millis"), maximum(current, "microsecs_running") / 1000, maximum(current, "secs_running") * 1000);
    runtimeSeconds = Math.max(maximum(current, "secs_running"), maximum(current, "microsecs_running") / 1000000);
    planVersions = unique(profile, "planSummary");
    waitSignals = current.filter((row) => pick(row, "waitingForLock") === true).length;
    const docs = total(profile, "docsExamined");
    const returned = total(profile, "nreturned");
    scanRatio = returned > 0 ? docs / returned : docs;
    if (!profile.length) addFinding(findings, "INFO", "Capture", "No matching profiler history was retained", "system.profile returned no matching event", "The profiler may be disabled, the capped history may have rolled over, or the comment was not present.", "Use application comments consistently and enable profiling only through approved DBA change control.");
  } else if (["mysql","mariadb"].includes(engine)) {
    const statement = allRows(results, "statement");
    const history = allRows(results, "history");
    const runtime = allRows(results, "runtime");
    executions = total(statement, "count_star") || history.length;
    averageMs = maximum(statement, "average_elapsed_ms");
    maximumMs = Math.max(maximum(statement, "max_elapsed_ms"), maximum(history, "elapsed_ms"), maximum(runtime, "elapsed_ms"));
    runtimeSeconds = maximumMs / 1000;
    planVersions = 0;
    const examined = total(statement, "sum_rows_examined") || total(history, "rows_examined");
    const returned = total(statement, "sum_rows_sent") || total(history, "rows_sent");
    scanRatio = returned > 0 ? examined / returned : examined;
    const diskTemp = total(statement, "sum_created_tmp_disk_tables") + total(history, "created_tmp_disk_tables");
    if (diskTemp > 0) addFinding(findings, diskTemp > 100 ? "HIGH" : "MEDIUM", "Temporary work", "Disk temporary tables were recorded", `${diskTemp.toLocaleString()} disk temporary tables`, "On-disk temporary work can dominate latency and I/O for grouping, sorting or wide rows.", "Inspect the recent event text and stages before changing memory limits.");
    const noIndex = total(statement, "sum_no_index_used") + total(history, "no_index_used");
    if (noIndex > 0) addFinding(findings, "MEDIUM", "Access path", "Executions reported no index use", `${noIndex.toLocaleString()} no-index signals`, "A full scan may be expected or may reflect a missing/selectivity problem.", "Review the representative digest text and run EXPLAIN in an approved test session.");
  } else {
    const queryStore = allRows(results, "queryStore");
    const cached = allRows(results, "cached");
    const requests = allRows(results, "requests");
    executions = total(queryStore, "count_executions") || total(cached, "execution_count");
    averageMs = maximum(queryStore, "average_duration_ms");
    maximumMs = Math.max(maximum(queryStore, "max_duration_ms"), maximum(cached, "max_elapsed_ms"), maximum(requests, "total_elapsed_time"));
    runtimeSeconds = maximum(requests, "total_elapsed_time") / 1000;
    planVersions = unique(queryStore, "plan_id") || unique(cached, "query_plan_hash");
    waitSignals = requests.filter((row) => pick(row, "wait_type") || numeric(pick(row, "blocking_session_id")) > 0).length;
    const reads = total(queryStore, "avg_logical_io_reads") + total(queryStore, "avg_physical_io_reads") + total(cached, "total_logical_reads");
    const returned = total(queryStore, "avg_rowcount") + total(cached, "total_rows");
    scanRatio = returned > 0 ? reads / returned : reads;
  }

  if (!rows.length) addFinding(findings, "HIGH", "Capture", "No retained statement evidence matched", `${successful.length} checks completed with zero matching rows`, "The identifier may be wrong, the cache/history may have rolled over, capture may be disabled, or privileges may hide evidence.", "Confirm the identifier and capture during the incident before changing SQL or configuration.");
  if (averageMs >= 1000 || maximumMs >= 10000) addFinding(findings, "HIGH", "Runtime", "Statement latency is materially high", `Average ${averageMs.toFixed(1)} ms; maximum/total signal ${maximumMs.toFixed(1)} ms`, "Long individual executions can hold resources, amplify concurrency and breach application timeouts.", "Compare CPU, waits, I/O and the slowest plan or operation before tuning.");
  else if (averageMs >= 250 || maximumMs >= 2000) addFinding(findings, "MEDIUM", "Runtime", "Statement latency needs review", `Average ${averageMs.toFixed(1)} ms; maximum/total signal ${maximumMs.toFixed(1)} ms`, "Moderate latency can become a workload problem at high call volume.", "Multiply per-call latency by executions and compare with the incident window.");
  if (planVersions > 1) addFinding(findings, planVersions > 4 ? "HIGH" : "MEDIUM", "Plan stability", "Multiple plan or execution variants were retained", `${planVersions} distinct variants`, "Plan changes or environment-sensitive compilation can create intermittent latency.", "Compare variants by runtime, compile context, estimates and access paths.");
  if (runtimeSeconds >= 30) addFinding(findings, runtimeSeconds >= 300 ? "HIGH" : "MEDIUM", "Live runtime", "A matching operation is currently long-running", `${runtimeSeconds.toFixed(1)} seconds`, "Live duration is direct incident evidence and may also retain locks or memory.", "Inspect its current wait/blocker and plan before considering cancellation.");
  if (waitSignals > 0) addFinding(findings, "HIGH", "Waits", "Matching executions are waiting or blocked", `${waitSignals} live wait/block signals`, "The SQL may be a victim of concurrency or resource pressure rather than intrinsically inefficient.", "Resolve the wait chain or resource cause before changing the statement.");
  if (scanRatio >= 100) addFinding(findings, "HIGH", "Efficiency", "Work examined is far above output", `${scanRatio.toFixed(1)} examined/read units per returned unit`, "Low selectivity or an inefficient access path increases CPU and I/O.", "Compare predicates, estimates and index selectivity using a representative plan.");
  else if (scanRatio >= 20) addFinding(findings, "MEDIUM", "Efficiency", "Statement efficiency needs review", `${scanRatio.toFixed(1)} examined/read units per returned unit`, "The statement is doing materially more work than its output volume.", "Validate predicates, estimates, partition pruning and access-path choice.");
  if (failed.length) addFinding(findings, "INFO", "Coverage", "Some trace sources were unavailable", `${failed.length} of ${results.length} checks failed`, "Version, privileges or optional capture configuration can limit retained evidence.", "Open Evidence to review each failure; do not enable features without approval.");

  const severityRank = { HIGH: 3, MEDIUM: 2, INFO: 1 };
  findings.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  const high = findings.filter((item) => item.severity === "HIGH").length;
  const medium = findings.filter((item) => item.severity === "MEDIUM").length;
  const importanceScore = Math.min(100, high * 22 + medium * 10 + (rows.length ? 8 : 20));
  const timeline = results.flatMap((item) => (item.rows || []).slice(0, 30).map((row, index) => ({
    check: item.label,
    phase: item.phase,
    order: index + 1,
    time: pick(row, "last_active_time", "last_execution_time", "ts", "first_seen", "last_seen", "query_start") || "",
    runtimeMs: numeric(pick(row, "average_elapsed_ms", "mean_exec_time", "elapsed_ms", "millis", "total_elapsed_time", "runtime_seconds")) * (pick(row, "runtime_seconds") !== undefined ? 1000 : 1),
    detail: String(pick(row, "event", "wait_event", "wait_type", "planSummary", "operation", "event_name", "statement_text", "query", "sql_text") || item.guidance || "").slice(0, 300),
  })));
  const headline = findings[0]?.title || (rows.length ? "Retained evidence captured without a critical signal" : "No retained evidence matched this identifier");
  return {
    importanceScore,
    severity: high ? "HIGH" : medium ? "MEDIUM" : "INFO",
    headline,
    summary: { executions, averageMs, maximumMs, planVersions, runtimeSeconds, scanRatio, waitSignals, matchedRows: rows.length, checksComplete: successful.length, checksTotal: results.length },
    findings,
    timeline,
    terminalScript: buildTerminalScript(engine, identifier, collection),
    equivalent: definition.equivalent,
    traceName: definition.traceName,
    limitation: definition.limitation,
    doc: definition.doc,
  };
}
