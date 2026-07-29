export const oracleDocs = {
  tuning: "https://docs.oracle.com/en/database/oracle/oracle-database/19/tgdba/index.html",
  session: "https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-SESSION.html",
  sqlstats: "https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-SQLSTATS.html",
  planStats: "https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-SQL_PLAN_STATISTICS_ALL.html",
  xplan: "https://docs.oracle.com/en/database/oracle/oracle-database/19/arpls/DBMS_XPLAN.html",
  ash: "https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-ACTIVE_SESSION_HISTORY.html",
  licensing: "https://docs.oracle.com/en/database/oracle/oracle-database/19/dblic/Licensing-Information.html",
  monitoring: "https://docs.oracle.com/en/database/oracle/oracle-database/19/admin/monitoring-the-database.html",
  officialBlog: "https://blogs.oracle.com/database/database-performance-tuning",
};

export const oracleBottleneckCatalog = [
  {
    id: "environment", label: "Database, instance & startup boundary", phase: "CONTEXT", license: "core",
    guidance: "Capture edition, role, open mode, instance, host, version, startup time and container before interpreting counters.",
    sql: `select d.name database_name, d.db_unique_name, d.database_role, d.open_mode, d.log_mode,
      i.instance_name, i.instance_number, i.host_name, i.version, i.status, i.startup_time,
      sys_context('USERENV','CON_NAME') container_name
    from v$database d cross join v$instance i`,
  },
  {
    id: "capabilities", label: "Diagnostic capability & license context", phase: "CONTEXT", license: "core",
    guidance: "Report configured management-pack access and RAC option as context only; the operator remains responsible for entitlement.",
    sql: `select (select value from v$parameter where name='control_management_pack_access') pack_access,
      (select value from v$option where parameter='Real Application Clusters') rac_enabled,
      (select value from v$option where parameter='Partitioning') partitioning_enabled,
      (select banner_full from v$version where banner_full like 'Oracle Database%' fetch first 1 row only) edition_banner
    from dual`,
  },
  {
    id: "sessionPressure", label: "Session & process capacity", phase: "WORKLOAD", license: "core",
    guidance: "Correlate current utilization with active, waiting and inactive sessions; high allocation alone is not CPU pressure.",
    sql: `select
      (select current_utilization from v$resource_limit where resource_name='sessions') current_sessions,
      (select limit_value from v$resource_limit where resource_name='sessions') session_limit,
      (select max_utilization from v$resource_limit where resource_name='sessions') peak_sessions,
      (select current_utilization from v$resource_limit where resource_name='processes') current_processes,
      (select limit_value from v$resource_limit where resource_name='processes') process_limit,
      count(case when type='USER' and status='ACTIVE' then 1 end) active_sessions,
      count(case when type='USER' and status='ACTIVE' and state='WAITING' and wait_class<>'Idle' then 1 end) waiting_sessions,
      count(case when type='USER' and status='INACTIVE' then 1 end) inactive_sessions,
      count(case when blocking_session is not null then 1 end) blocked_sessions
    from v$session`,
  },
  {
    id: "liveActivity", label: "Live application activity", phase: "WORKLOAD", license: "core",
    guidance: "Rank current user sessions by wait duration, SQL_ID, service, module, action and client identifier.",
    sql: `select sid, serial#, username, status, sql_id, prev_sql_id, event, wait_class, state,
      seconds_in_wait, last_call_et, service_name, module, action, client_identifier,
      blocking_instance, blocking_session, final_blocking_instance, final_blocking_session
    from v$session
    where type='USER' and (status='ACTIVE' or blocking_session is not null)
    order by case when blocking_session is not null then 0 else 1 end, seconds_in_wait desc
    fetch first 50 rows only`,
  },
  {
    id: "blockers", label: "Blocking chains & final blockers", phase: "CONCURRENCY", license: "core",
    guidance: "Identify the waiter, immediate blocker and final blocker. DBridge never kills a session.",
    sql: `select w.sid waiter_sid, w.serial# waiter_serial, w.username waiter_user, w.sql_id waiter_sql_id,
      w.event, w.wait_class, w.seconds_in_wait, w.row_wait_obj#,
      w.blocking_instance, w.blocking_session, w.final_blocking_instance, w.final_blocking_session,
      b.username blocker_user, b.sql_id blocker_sql_id, b.status blocker_status, b.module blocker_module,
      b.last_call_et blocker_last_call_seconds
    from v$session w
    left join gv$session b on b.inst_id=w.blocking_instance and b.sid=w.blocking_session
    where w.blocking_session is not null
    order by w.seconds_in_wait desc fetch first 50 rows only`,
  },
  {
    id: "systemWaits", label: "System non-idle wait profile", phase: "WAITS", license: "core",
    guidance: "These counters are cumulative since startup; use two snapshots with an unchanged startup boundary to calculate rates.",
    sql: `select wait_class, event, total_waits, time_waited_micro/1000 time_waited_ms,
      case when total_waits>0 then time_waited_micro/1000/total_waits else 0 end average_wait_ms
    from v$system_event
    where wait_class<>'Idle' and time_waited_micro>0
    order by time_waited_micro desc fetch first 30 rows only`,
  },
  {
    id: "systemMetrics", label: "Current one-minute system metrics", phase: "WORKLOAD", license: "core",
    guidance: "Use recent rate metrics to distinguish current CPU, I/O, transaction and response pressure from lifetime totals.",
    sql: `select metric_name, value metric_value, metric_unit, begin_time, end_time
    from v$sysmetric
    where group_id=2 and metric_name in (
      'Host CPU Utilization (%)','Database CPU Time Ratio','Database Wait Time Ratio',
      'Average Active Sessions','Executions Per Sec','User Transaction Per Sec',
      'Physical Read Total Bytes Per Sec','Physical Write Total Bytes Per Sec',
      'Redo Generated Per Sec','SQL Service Response Time')
    order by metric_name`,
  },
  {
    id: "timeModel", label: "Database time model", phase: "CPU", license: "core",
    guidance: "DB time, DB CPU, parse and PL/SQL values are cumulative. Compare deltas over the same incident interval.",
    sql: `select stat_name, value/1000000 seconds from v$sys_time_model
    where stat_name in ('DB time','DB CPU','sql execute elapsed time','parse time elapsed',
      'hard parse elapsed time','PL/SQL execution elapsed time','connection management call elapsed time')
    order by value desc`,
  },
  {
    id: "topSql", label: "Top SQL impact & variance", phase: "SQL", license: "core",
    guidance: "Rank statements by total elapsed impact, then compare CPU, reads, rows, executions, plan hash and last activity.",
    sql: `select sql_id, plan_hash_value, executions, parse_calls, loads, invalidations,
      elapsed_time/1000 elapsed_ms, cpu_time/1000 cpu_ms, buffer_gets, disk_reads, rows_processed,
      case when executions>0 then elapsed_time/1000/executions else null end average_elapsed_ms,
      case when executions>0 then cpu_time/1000/executions else null end average_cpu_ms,
      case when executions>0 then buffer_gets/executions else null end buffer_gets_per_exec,
      case when executions>0 then disk_reads/executions else null end disk_reads_per_exec,
      last_active_time, parsing_schema_name, module, substr(sql_text,1,500) sql_text
    from v$sqlstats where executions>0
    order by elapsed_time desc fetch first 30 rows only`,
  },
  {
    id: "focusedSql", label: "Focused SQL_ID workload profile", phase: "SQL", license: "core", requiresSqlId: true,
    guidance: "Aggregate all children and plan hashes for the selected SQL_ID without executing it.",
    sql: `select sql_id, count(*) child_cursors, count(distinct plan_hash_value) plan_count,
      sum(executions) executions, sum(parse_calls) parse_calls, sum(loads) loads, sum(invalidations) invalidations,
      sum(elapsed_time)/1000 elapsed_ms, sum(cpu_time)/1000 cpu_ms, sum(buffer_gets) buffer_gets,
      sum(disk_reads) disk_reads, sum(rows_processed) rows_processed,
      case when sum(executions)>0 then sum(elapsed_time)/1000/sum(executions) end average_elapsed_ms,
      case when sum(executions)>0 then sum(cpu_time)/1000/sum(executions) end average_cpu_ms,
      case when sum(executions)>0 then sum(buffer_gets)/sum(executions) end buffer_gets_per_exec,
      case when sum(executions)>0 then sum(disk_reads)/sum(executions) end disk_reads_per_exec,
      min(first_load_time) first_load_time, max(last_active_time) last_active_time
    from v$sql where sql_id='__SQL_ID__' group by sql_id`,
  },
  {
    id: "focusedPlanStats", label: "Actual versus estimated plan rows", phase: "PLAN", license: "core", requiresSqlId: true,
    guidance: "Find cardinality errors, repeated starts, physical reads and workarea spills from captured row-source statistics.",
    sql: `select child_number, plan_hash_value, id, parent_id, depth, operation, options,
      object_owner, object_name, cardinality estimated_rows, last_output_rows actual_rows,
      last_starts, last_cr_buffer_gets, last_cu_buffer_gets, last_disk_reads, last_disk_writes,
      last_elapsed_time/1000 last_elapsed_ms, last_memory_used, last_execution, last_degree,
      access_predicates, filter_predicates
    from v$sql_plan_statistics_all
    where sql_id='__SQL_ID__'
    order by child_number, id fetch first 250 rows only`,
  },
  {
    id: "cursorPlan", label: "Loaded cursor plan", phase: "PLAN", license: "core", requiresSqlId: true,
    guidance: "Display the loaded cursor plan with last runtime, predicates, outline and peeked-bind metadata. It does not execute the SQL.",
    sql: `select plan_table_output
    from table(dbms_xplan.display_cursor('__SQL_ID__',null,'ALLSTATS LAST +PREDICATE +OUTLINE +PEEKED_BINDS'))`,
  },
  {
    id: "childCursors", label: "Child cursor sharing reasons", phase: "CURSOR", license: "core", requiresSqlId: true,
    guidance: "Distinguish bind, optimizer, statistics, authorization and environment mismatches behind version-count growth.",
    sql: `select child_number, unbound_cursor, sql_type_mismatch, optimizer_mismatch, outline_mismatch,
      stats_row_mismatch, literal_mismatch, force_hard_parse, explain_plan_cursor, buffered_dml_mismatch,
      pdml_env_mismatch, auth_check_mismatch, bind_mismatch, bind_equiv_failure,
      user_bind_peek_mismatch, optimizer_mode_mismatch, px_mismatch, mv_query_gen_mismatch
    from v$sql_shared_cursor where sql_id='__SQL_ID__'
    order by child_number fetch first 100 rows only`,
  },
  {
    id: "bindMetadata", label: "Bind metadata (values redacted)", phase: "CURSOR", license: "core", requiresSqlId: true,
    guidance: "Review captured bind names, positions, types and capture times. Values are deliberately not collected.",
    sensitive: true,
    sql: `select child_number, name, position, datatype_string, precision, scale, max_length,
      was_captured, last_captured
    from v$sql_bind_capture where sql_id='__SQL_ID__'
    order by child_number, position fetch first 100 rows only`,
  },
  {
    id: "longOps", label: "Instrumented long operations", phase: "WORKLOAD", license: "core",
    guidance: "Locate active scans, RMAN work and other instrumented operations with progress and remaining time.",
    sql: `select sid, serial#, sql_id, opname, target, sofar, totalwork, units, elapsed_seconds,
      time_remaining, case when totalwork>0 then round(100*sofar/totalwork,2) end percent_complete,
      message
    from v$session_longops where totalwork>0 and sofar<totalwork
    order by time_remaining desc fetch first 50 rows only`,
  },
  {
    id: "segmentPressure", label: "Hot segment pressure", phase: "I/O", license: "core",
    guidance: "Rank segment physical reads, logical reads, ITL waits, buffer busy waits and row-lock waits; verify interval deltas.",
    sql: `select owner, object_name, subobject_name, object_type, statistic_name, value
    from v$segment_statistics
    where statistic_name in ('physical reads','logical reads','buffer busy waits','ITL waits','row lock waits')
      and value>0
    order by value desc fetch first 50 rows only`,
  },
  {
    id: "fileIo", label: "Datafile I/O latency", phase: "I/O", license: "core",
    guidance: "Find files with high cumulative average read/write service time; confirm with interval and operating-system storage evidence.",
    sql: `select fs.file#, df.name file_name, fs.phyrds physical_reads, fs.phywrts physical_writes,
      fs.readtim read_time_cs, fs.writetim write_time_cs,
      case when fs.phyrds>0 then fs.readtim*10/fs.phyrds else 0 end average_read_ms,
      case when fs.phywrts>0 then fs.writetim*10/fs.phywrts else 0 end average_write_ms
    from v$filestat fs join v$datafile df on df.file#=fs.file#
    order by greatest(case when fs.phyrds>0 then fs.readtim/fs.phyrds else 0 end,
      case when fs.phywrts>0 then fs.writetim/fs.phywrts else 0 end) desc
    fetch first 30 rows only`,
  },
  {
    id: "tempUsage", label: "Temporary-space consumers", phase: "MEMORY", license: "core",
    guidance: "Attribute live temp allocation to sessions, SQL_ID and segment type before changing PGA or temp capacity.",
    sql: `select u.username, u.session_addr, s.sid, s.serial#, s.sql_id, u.tablespace, u.segtype,
      sum(u.blocks) blocks, sum(u.blocks)*max(t.block_size) bytes
    from v$tempseg_usage u
    left join v$session s on s.saddr=u.session_addr
    join dba_tablespaces t on t.tablespace_name=u.tablespace
    group by u.username,u.session_addr,s.sid,s.serial#,s.sql_id,u.tablespace,u.segtype
    order by bytes desc fetch first 40 rows only`,
  },
  {
    id: "undoHealth", label: "Undo retention & snapshot errors", phase: "UNDO", license: "core",
    guidance: "Review recent ORA-01555 counts, unexpired-steal pressure, tuned retention and transaction concurrency.",
    sql: `select begin_time, end_time, undoblks, txncount, maxquerylen, maxqueryid, tuned_undoretention,
      ssolderrcnt, nospaceerrcnt, unxpstealcnt, unxpblkrelcnt
    from v$undostat order by begin_time desc fetch first 18 rows only`,
  },
  {
    id: "pgaHealth", label: "PGA allocation & workarea health", phase: "MEMORY", license: "core",
    guidance: "Use over-allocation, cache hit and extra bytes read/written to identify sort/hash spill pressure.",
    sql: `select
      max(case when name='aggregate PGA target parameter' then value end) pga_target_bytes,
      max(case when name='total PGA allocated' then value end) pga_allocated_bytes,
      max(case when name='maximum PGA allocated' then value end) pga_max_bytes,
      max(case when name='over allocation count' then value end) over_allocation_count,
      max(case when name='cache hit percentage' then value end) cache_hit_percentage,
      max(case when name='extra bytes read/written' then value end) extra_bytes_read_written
    from v$pgastat`,
  },
  {
    id: "sgaHealth", label: "SGA component pressure", phase: "MEMORY", license: "core",
    guidance: "Review current, minimum and maximum component sizes plus grow/shrink operations before changing memory targets.",
    sql: `select component, current_size, min_size, max_size, user_specified_size,
      oper_count, last_oper_type, last_oper_mode, last_oper_time
    from v$sga_dynamic_components
    where current_size>0 order by current_size desc`,
  },
  {
    id: "libraryCache", label: "Library cache reload & invalidation", phase: "CURSOR", license: "core",
    guidance: "High reload or invalidation ratios can indicate shared-pool pressure, object churn or cursor invalidation.",
    sql: `select namespace, gets, gethits, pins, pinhits, reloads, invalidations,
      case when pins>0 then round(100*reloads/pins,4) end reload_pct,
      case when pins>0 then round(100*invalidations/pins,4) end invalidation_pct
    from v$librarycache order by reloads+invalidations desc`,
  },
  {
    id: "redoStats", label: "Redo, commit & parse counters", phase: "REDO", license: "core",
    guidance: "These statistics are cumulative. Compare two snapshots to derive redo, commit, hard-parse and logon rates.",
    sql: `select name, value from v$sysstat
    where name in ('redo size','redo writes','redo write time','user commits','user rollbacks',
      'parse count (total)','parse count (hard)','execute count','logons cumulative',
      'opened cursors cumulative','sorts (disk)','workarea executions - onepass','workarea executions - multipass')
    order by name`,
  },
  {
    id: "parallelHealth", label: "Parallel execution capacity", phase: "PARALLEL", license: "core",
    guidance: "Correlate server availability, downgrades and serial fallback before changing DOP or parallel limits.",
    sql: `select statistic, value from v$px_process_sysstat
    where statistic in ('Servers In Use','Servers Available','Servers Started','Servers Shutdown',
      'Servers Highwater','Queries Initiated','DML Initiated','DFO Trees','Local Msgs Sent')
    union all
    select name statistic, value from v$sysstat
    where name like 'Parallel operations downgraded%' or name='Parallel operations not downgraded'
    order by statistic`,
  },
  {
    id: "racCache", label: "RAC global-cache waits", phase: "RAC", license: "core",
    guidance: "On RAC, rank gc waits by total and average time; on single-instance databases this normally returns no rows.",
    sql: `select event, total_waits, time_waited_micro/1000 time_waited_ms,
      case when total_waits>0 then time_waited_micro/1000/total_waits else 0 end average_wait_ms
    from v$system_event where event like 'gc %' and time_waited_micro>0
    order by time_waited_micro desc fetch first 25 rows only`,
  },
  {
    id: "statsHealth", label: "Focused-object optimizer statistics", phase: "PLAN", license: "core", requiresSqlId: true,
    guidance: "Check stale, missing and old table/partition statistics only for objects referenced by the focused loaded plan.",
    sql: `select s.owner, s.table_name, s.partition_name, s.object_type, s.num_rows,
      s.sample_size, s.last_analyzed, s.stale_stats, s.global_stats, s.user_stats
    from dba_tab_statistics s
    where (s.owner,s.table_name) in (
      select distinct object_owner,object_name from v$sql_plan
      where sql_id='__SQL_ID__' and object_owner is not null and object_name is not null)
      and (s.last_analyzed is null or s.stale_stats='YES' or s.last_analyzed<sysdate-30)
    order by case when s.last_analyzed is null then 0 when s.stale_stats='YES' then 1 else 2 end,
      s.owner,s.table_name,s.partition_name
    fetch first 100 rows only`,
  },
  {
    id: "alertErrors", label: "Recent alert-log correlation", phase: "RELIABILITY", license: "core",
    guidance: "Read recent high-priority ADR alert messages from the database. Access and retention remain controlled by Oracle.",
    sql: `select originating_timestamp, message_type, message_level, component_id, problem_key,
      substr(message_text,1,1000) message_text
    from v$diag_alert_ext
    where originating_timestamp>systimestamp-interval '30' minute and message_type in (1,2,3)
    order by originating_timestamp desc fetch first 50 rows only`,
  },
  {
    id: "ashProfile", label: "Recent ASH activity profile", phase: "HISTORY", license: "diagnostics",
    guidance: "Diagnostics Pack only. Sample recent active sessions by SQL_ID, state, wait class and event.",
    sql: `select sql_id, session_state, nvl(wait_class,'CPU') wait_class, nvl(event,'ON CPU') event,
      count(*) samples, min(sample_time) first_sample, max(sample_time) last_sample
    from v$active_session_history
    where sample_time>systimestamp-interval '15' minute
    group by sql_id,session_state,wait_class,event
    order by samples desc fetch first 50 rows only`,
  },
  {
    id: "awrSqlHistory", label: "Focused SQL AWR history", phase: "HISTORY", license: "diagnostics", requiresSqlId: true,
    guidance: "Diagnostics Pack only. Compare SQL_ID plans and per-snapshot execution deltas without creating snapshots.",
    sql: `select sn.begin_interval_time, st.instance_number, st.plan_hash_value,
      st.executions_delta, st.elapsed_time_delta/1000 elapsed_ms, st.cpu_time_delta/1000 cpu_ms,
      st.buffer_gets_delta, st.disk_reads_delta, st.rows_processed_delta
    from dba_hist_sqlstat st join dba_hist_snapshot sn
      on sn.dbid=st.dbid and sn.instance_number=st.instance_number and sn.snap_id=st.snap_id
    where st.sql_id='__SQL_ID__' and sn.begin_interval_time>sysdate-7
    order by sn.begin_interval_time desc fetch first 100 rows only`,
  },
  {
    id: "sqlMonitor", label: "Focused real-time SQL Monitor", phase: "RUNTIME", license: "tuning", requiresSqlId: true,
    guidance: "Tuning Pack only (and requires Diagnostics Pack). Review monitored executions; no report or task is created.",
    sql: `select inst_id, sid, session_serial#, sql_exec_id, sql_exec_start, status, sql_plan_hash_value,
      elapsed_time/1000 elapsed_ms, cpu_time/1000 cpu_ms, user_io_wait_time/1000 user_io_wait_ms,
      concurrency_wait_time/1000 concurrency_wait_ms, application_wait_time/1000 application_wait_ms,
      buffer_gets, disk_reads, physical_read_bytes, physical_write_bytes,
      px_servers_requested, px_servers_allocated, sql_plan_line_id, sql_plan_operation, sql_plan_options
    from gv$sql_monitor where sql_id='__SQL_ID__'
    order by sql_exec_start desc fetch first 50 rows only`,
  },
];

const severityWeight = { CRITICAL: 100, HIGH: 72, MEDIUM: 42, INFO: 12 };
const areas = ["SQL & Plans", "Concurrency", "CPU & Memory", "I/O & Temp", "Redo & Undo", "RAC & Reliability"];

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalized(row) {
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [String(key).toLowerCase(), value]));
}

function rowsFor(map, id) {
  const result = map.get(id);
  return result?.ok && Array.isArray(result.rows) ? result.rows.map(normalized) : [];
}

function firstFor(map, id) {
  return rowsFor(map, id)[0] || {};
}

function metric(rows, name) {
  return rows.find((row) => String(row.metric_name || row.stat_name || row.name || "").toLowerCase() === name.toLowerCase());
}

function finding(id, severity, area, title, cause, evidence, impact, verify, action, doc, confidence = "Measured") {
  return { id, severity, area, title, cause, evidence, impact, verify, action, doc, confidence };
}

function formatBytes(value) {
  let bytes = number(value);
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function analyzeOracleBottlenecks(checks = [], focusSqlId = "", packScope = "core") {
  const map = new Map(checks.map((item) => [item.id, item]));
  const findings = [];
  const session = firstFor(map, "sessionPressure");
  const active = number(session.active_sessions);
  const waiting = number(session.waiting_sessions);
  const blocked = number(session.blocked_sessions);
  const currentSessions = number(session.current_sessions);
  const sessionLimit = number(session.session_limit);
  const sessionUse = sessionLimit > 0 ? 100 * currentSessions / sessionLimit : 0;
  const blockers = rowsFor(map, "blockers");
  const waits = rowsFor(map, "systemWaits");
  const currentMetrics = rowsFor(map, "systemMetrics");
  const focused = firstFor(map, "focusedSql");
  const planRows = rowsFor(map, "focusedPlanStats");
  const childRows = rowsFor(map, "childCursors");
  const fileRows = rowsFor(map, "fileIo");
  const tempRows = rowsFor(map, "tempUsage");
  const undoRows = rowsFor(map, "undoHealth");
  const pga = firstFor(map, "pgaHealth");
  const libraryRows = rowsFor(map, "libraryCache");
  const redoRows = rowsFor(map, "redoStats");
  const parallelRows = rowsFor(map, "parallelHealth");
  const racRows = rowsFor(map, "racCache");
  const staleRows = rowsFor(map, "statsHealth");
  const alertRows = rowsFor(map, "alertErrors");
  const monitorRows = rowsFor(map, "sqlMonitor");
  const longOps = rowsFor(map, "longOps");

  if (blocked || blockers.length) findings.push(finding(
    "blocking-chain", blockers.some((row) => number(row.seconds_in_wait) >= 300) ? "CRITICAL" : "HIGH", "Concurrency",
    "Live blocking chain is delaying application work",
    "An open transaction or session owns a conflicting lock while waiters queue behind it.",
    `${Math.max(blocked, blockers.length)} blocked session(s); longest measured waiter ${Math.max(0, ...blockers.map((row) => number(row.seconds_in_wait)))}s.`,
    "Response times and connection demand can grow until the final blocker commits, rolls back, or releases the resource.",
    "Confirm the final blocker SID/serial, transaction owner, SQL_ID, object and business operation. Coordinate with the owner; SID alone is not stable.",
    "Fix the transaction boundary or blocking application path under change control. DBridge does not terminate either session.",
    oracleDocs.session,
  ));

  const concurrencyWait = waits.find((row) => /enq:|library cache|cursor:|mutex|latch|buffer busy|row cache/i.test(`${row.event} ${row.wait_class}`));
  if (concurrencyWait && number(concurrencyWait.average_wait_ms) >= 2) findings.push(finding(
    "concurrency-wait", number(concurrencyWait.average_wait_ms) >= 20 ? "HIGH" : "MEDIUM", "Concurrency",
    `Concurrency pressure led by ${concurrencyWait.event || concurrencyWait.wait_class}`,
    "Lock, cursor, latch, shared-pool or hot-block serialization is limiting parallel application progress.",
    `${number(concurrencyWait.total_waits).toLocaleString()} cumulative waits; ${number(concurrencyWait.average_wait_ms).toFixed(2)} ms average.`,
    "Work can appear idle at the application while sessions are serialized inside the database.",
    "Capture an interval delta and match live sessions, P1/P2/P3, SQL_ID and object. A cumulative wait total is not sufficient alone.",
    "Correct the confirmed hot object, transaction, cursor-sharing or parse cause; do not respond by broadly raising limits.",
    oracleDocs.tuning,
  ));

  if (sessionUse >= 85) findings.push(finding(
    "session-capacity", sessionUse >= 95 ? "HIGH" : "MEDIUM", "Concurrency",
    "Session capacity has limited headroom",
    "Pool leakage, excessive pool sizing, connection churn, idle sessions or sustained database latency is consuming the configured limit.",
    `${currentSessions.toLocaleString()} of ${sessionLimit.toLocaleString()} sessions (${sessionUse.toFixed(1)}%); ${number(session.inactive_sessions)} inactive.`,
    "New connections may queue or fail and can amplify an existing performance incident.",
    "Compare application pool totals, logon rate, inactive-session age and process utilization across two snapshots.",
    "Correct pool lifecycle and workload pressure first; change session/process limits only after OS and memory capacity validation.",
    oracleDocs.session,
  ));

  const hostCpu = number(metric(currentMetrics, "Host CPU Utilization (%)")?.metric_value);
  const dbCpuRatio = number(metric(currentMetrics, "Database CPU Time Ratio")?.metric_value);
  const dbWaitRatio = number(metric(currentMetrics, "Database Wait Time Ratio")?.metric_value);
  if (hostCpu >= 85 || dbCpuRatio >= 80) findings.push(finding(
    "cpu-pressure", hostCpu >= 95 ? "CRITICAL" : "HIGH", "CPU & Memory",
    "Current workload is CPU constrained",
    "Expensive SQL, hard parsing, PL/SQL, background work or host contention is consuming CPU faster than requests complete.",
    `Host CPU ${hostCpu.toFixed(1)}%; database CPU-time ratio ${dbCpuRatio.toFixed(1)}%; database wait-time ratio ${dbWaitRatio.toFixed(1)}%.`,
    "Runnable work queues and latency rise even when individual sessions show ON CPU rather than a named wait.",
    "Correlate top SQL CPU deltas, OS run queue, DB CPU and service/module. Confirm the same one-minute window.",
    "Tune the top CPU SQL or workload source first; validate capacity or Resource Manager changes separately.",
    oracleDocs.tuning,
  ));

  const ioWait = waits.find((row) => /User I\/O/i.test(String(row.wait_class)));
  const maxReadMs = Math.max(0, ...fileRows.map((row) => number(row.average_read_ms)));
  if ((ioWait && number(ioWait.average_wait_ms) >= 10) || maxReadMs >= 20) findings.push(finding(
    "io-latency", Math.max(number(ioWait?.average_wait_ms), maxReadMs) >= 40 ? "HIGH" : "MEDIUM", "I/O & Temp",
    "Storage latency or excess physical I/O is visible",
    "Inefficient access paths, cache misses, storage contention, checkpoint/redo work or an overloaded file path is delaying reads.",
    `Top User I/O average ${number(ioWait?.average_wait_ms).toFixed(2)} ms; maximum cumulative datafile read average ${maxReadMs.toFixed(2)} ms.`,
    "Foreground SQL spends elapsed time waiting for blocks, often increasing connection concurrency.",
    "Take a 30–60 second delta, attribute reads to SQL and segments, and compare database values with host/storage latency in the same interval.",
    "Reduce confirmed unnecessary I/O or remediate the specific storage path; avoid cache-size changes from hit ratios alone.",
    oracleDocs.tuning,
  ));

  const tempBytes = tempRows.reduce((sum, row) => sum + number(row.bytes), 0);
  const overalloc = number(pga.over_allocation_count);
  const pgaCacheHit = number(pga.cache_hit_percentage);
  const extraWorkareaBytes = number(pga.extra_bytes_read_written);
  if (tempBytes >= 1024 ** 3 || overalloc > 0 || (pgaCacheHit > 0 && pgaCacheHit < 90)) findings.push(finding(
    "workarea-pressure", tempBytes >= 10 * 1024 ** 3 || overalloc > 0 ? "HIGH" : "MEDIUM", "CPU & Memory",
    "PGA workarea or temporary-space pressure",
    "Sorts, hash joins, bitmap operations or parallel workers are spilling because workareas exceed available PGA or the chosen plan processes excessive rows.",
    `${formatBytes(tempBytes)} currently allocated in temp; ${overalloc.toLocaleString()} cumulative PGA over-allocations; ${pgaCacheHit.toFixed(1)}% workarea cache hit; ${formatBytes(extraWorkareaBytes)} extra I/O.`,
    "Spill increases physical I/O and elapsed time and may affect unrelated workloads sharing temp storage.",
    "Identify SQL_ID and temp segment type, inspect plan row counts and workarea execution mode, then compare concurrent demand.",
    "Reduce rows or improve the plan first. Test any PGA change with concurrency math; never size from a single SQL execution.",
    oracleDocs.planStats,
  ));

  const undoError = undoRows.reduce((sum, row) => sum + number(row.ssolderrcnt) + number(row.nospaceerrcnt), 0);
  const undoSteal = undoRows.reduce((sum, row) => sum + number(row.unxpstealcnt), 0);
  if (undoError || undoSteal) findings.push(finding(
    "undo-pressure", undoError ? "HIGH" : "MEDIUM", "Redo & Undo",
    "Undo retention pressure or snapshot-too-old evidence",
    "Long queries, high change volume, insufficient undo headroom or retention competition is reusing undo needed by readers.",
    `${undoError.toLocaleString()} recent snapshot/no-space errors and ${undoSteal.toLocaleString()} unexpired extents stolen across sampled intervals.`,
    "Long-running reads may fail or return application errors; writers can also hit allocation pressure.",
    "Match the affected SQL and time to MAXQUERYLEN, tuned retention, undo blocks, alert log and change workload.",
    "Shorten the confirmed long query/transaction or size undo retention from measured generation and SLA under storage review.",
    oracleDocs.tuning,
  ));

  const reloads = libraryRows.reduce((sum, row) => sum + number(row.reloads), 0);
  const invalidations = libraryRows.reduce((sum, row) => sum + number(row.invalidations), 0);
  const maxReloadPct = Math.max(0, ...libraryRows.map((row) => number(row.reload_pct)));
  if (maxReloadPct >= 1 || invalidations >= 100) findings.push(finding(
    "library-cache", maxReloadPct >= 5 ? "HIGH" : "MEDIUM", "Concurrency",
    "Library cache reload or invalidation pressure",
    "Shared-pool pressure, DDL/object invalidation, statistics changes, cursor mismatch or parse churn is forcing cursor work.",
    `${reloads.toLocaleString()} cumulative reloads, ${invalidations.toLocaleString()} invalidations; maximum namespace reload ratio ${maxReloadPct.toFixed(2)}%.`,
    "Hard parsing and serialization add CPU and latency, and can cause child cursor growth.",
    "Use interval deltas, top parse_calls/loads, child sharing reasons and deployment/DDL history.",
    "Correct the confirmed cursor-sharing or object-change source. Do not flush the shared pool from this diagnosis.",
    oracleDocs.sqlstats,
  ));

  if (focusSqlId && focused.sql_id) {
    const avgElapsed = number(focused.average_elapsed_ms);
    const avgCpu = number(focused.average_cpu_ms);
    const readsPerExec = number(focused.disk_reads_per_exec);
    const buffersPerExec = number(focused.buffer_gets_per_exec);
    const plans = number(focused.plan_count);
    const children = number(focused.child_cursors);
    if (avgElapsed >= 1000 || readsPerExec >= 10000 || buffersPerExec >= 100000) findings.push(finding(
      "focused-sql-profile", avgElapsed >= 10000 ? "CRITICAL" : "HIGH", "SQL & Plans",
      `SQL_ID ${focusSqlId} has a high per-execution cost`,
      "The loaded plan, row volume, access path, waits or bind selectivity is consuming substantial work for each execution.",
      `${number(focused.executions).toLocaleString()} executions; ${avgElapsed.toFixed(1)} ms average elapsed; ${avgCpu.toFixed(1)} ms CPU; ${buffersPerExec.toLocaleString()} buffers and ${readsPerExec.toLocaleString()} reads per execution.`,
      "This statement can dominate application response time or database capacity even at moderate call volume.",
      "Compare child plans, actual/estimated rows, predicates, bind metadata and wait profile for a representative slow execution.",
      "Test the smallest SQL, statistics or index correction outside production and compare p50/p95/p99, reads, CPU and row correctness.",
      oracleDocs.sqlstats,
    ));
    if (plans > 1 || children >= 10) findings.push(finding(
      "plan-variance", plans >= 3 || children >= 30 ? "HIGH" : "MEDIUM", "SQL & Plans",
      "Focused SQL has plan or child-cursor variance",
      "Bind selectivity, adaptive behavior, environment mismatch, invalidation or statistics change is producing multiple reusable cursors.",
      `${plans.toLocaleString()} plan hash value(s) across ${children.toLocaleString()} loaded child cursor(s).`,
      "Different requests may receive materially different latency, creating intermittent incidents.",
      "Compare per-child executions and cost, sharing flags, captured metadata and application service/module. Do not assume the newest plan is worse.",
      "Correct the confirmed statistics/bind/environment cause; evaluate SQL Plan Management only under licensed, reviewed change control.",
      oracleDocs.xplan,
    ));
  }

  let worstCardinalityRatio = 0;
  let worstPlanLine = null;
  for (const row of planRows) {
    const estimated = number(row.estimated_rows);
    const actual = number(row.actual_rows);
    if (estimated > 0 && actual > 0) {
      const ratio = Math.max(actual / estimated, estimated / actual);
      if (ratio > worstCardinalityRatio) { worstCardinalityRatio = ratio; worstPlanLine = row; }
    }
  }
  if (worstCardinalityRatio >= 10) findings.push(finding(
    "cardinality-error", worstCardinalityRatio >= 100 ? "HIGH" : "MEDIUM", "SQL & Plans",
    "Actual rows diverge from optimizer estimates",
    "Stale/missing statistics, skew, correlated predicates, expression selectivity or bind sensitivity is distorting join order and access-path costing.",
    `Largest captured estimate error is ${worstCardinalityRatio.toFixed(1)}× at plan line ${worstPlanLine?.id ?? "unknown"} (${[worstPlanLine?.operation, worstPlanLine?.options].filter(Boolean).join(" ")}).`,
    "The optimizer can choose the wrong join method, order, index or memory allocation and multiply work downstream.",
    "Confirm LAST statistics belong to a representative execution; inspect predicates, object statistics, histograms and correlations at the first wrong row source.",
    "Test targeted statistics, extended statistics or a SQL/index rewrite; avoid global statistics changes from a single plan line.",
    oracleDocs.planStats,
  ));

  const mismatchChildren = childRows.filter((row) => Object.entries(row).some(([key, value]) => key !== "child_number" && String(value).toUpperCase() === "Y"));
  if (mismatchChildren.length >= 5) findings.push(finding(
    "child-cursor-mismatch", mismatchChildren.length >= 20 ? "HIGH" : "MEDIUM", "SQL & Plans",
    "Many child cursors report sharing mismatches",
    "Bind metadata, optimizer settings, authorization, statistics or parallel environment differs between executions.",
    `${mismatchChildren.length} child cursor row(s) contain one or more sharing-mismatch flags.`,
    "Parse CPU and memory rise, while different sessions can select different plans.",
    "Rank the mismatch flags, match them to service/module and deployment changes, and confirm version_count trend with a second snapshot.",
    "Normalize the confirmed application/session environment or bind contract; do not flush cursors as a primary fix.",
    oracleDocs.sqlstats,
  ));

  const logFileSync = waits.find((row) => String(row.event).toLowerCase() === "log file sync");
  const redoSize = number(metric(redoRows, "redo size")?.value);
  const commits = number(metric(redoRows, "user commits")?.value);
  if (logFileSync && number(logFileSync.average_wait_ms) >= 5) findings.push(finding(
    "commit-latency", number(logFileSync.average_wait_ms) >= 20 ? "HIGH" : "MEDIUM", "Redo & Undo",
    "Commit latency is visible in log file sync",
    "Frequent commits, redo-device latency, CPU scheduling or log writer pressure is delaying foreground commit acknowledgement.",
    `${number(logFileSync.average_wait_ms).toFixed(2)} ms cumulative average log file sync; ${commits.toLocaleString()} commits and ${formatBytes(redoSize)} redo since startup.`,
    "Chatty transactions can convert small database operations into high end-to-end latency.",
    "Measure interval commit rate, redo bytes/commit, log file parallel write, storage latency and application commit boundaries.",
    "Batch only where transaction semantics permit, or remediate confirmed redo I/O/CPU scheduling. Never weaken durability for a quick fix.",
    oracleDocs.tuning,
  ));

  const pxDowngrades = parallelRows.filter((row) => /downgrad|serial/i.test(String(row.statistic))).reduce((sum, row) => sum + number(row.value), 0);
  const monitorDowngraded = monitorRows.filter((row) => number(row.px_servers_requested) > number(row.px_servers_allocated)).length;
  if (pxDowngrades || monitorDowngraded) findings.push(finding(
    "parallel-downgrade", "MEDIUM", "CPU & Memory",
    "Parallel execution downgrade or shortage",
    "The requested degree competes with server limits, concurrent statements, services or Resource Manager allocation.",
    `${pxDowngrades.toLocaleString()} cumulative downgrade/serial signals; ${monitorDowngraded} monitored execution(s) received fewer servers than requested.`,
    "Runtime becomes variable and individual sessions can consume more elapsed time than the expected parallel plan.",
    "Compare requested/allocated DOP, Servers In Use/Available, service and concurrent parallel workload in the same window.",
    "Tune SQL and DOP policy to measured benefit; do not broadly raise parallel limits without CPU, memory and concurrency testing.",
    oracleDocs.tuning,
  ));

  const worstGc = racRows[0] || {};
  if (number(worstGc.average_wait_ms) >= 3) findings.push(finding(
    "rac-global-cache", number(worstGc.average_wait_ms) >= 10 ? "HIGH" : "MEDIUM", "RAC & Reliability",
    `RAC global-cache pressure led by ${worstGc.event || "gc wait"}`,
    "Hot blocks, inefficient access, instance affinity, interconnect delay or cross-instance modification is increasing cache-fusion work.",
    `${number(worstGc.total_waits).toLocaleString()} cumulative waits at ${number(worstGc.average_wait_ms).toFixed(2)} ms average.`,
    "Cross-instance block transfers add latency and can serialize a hot application path.",
    "Use interval deltas and identify SQL, object, block class, instances and service placement before changing affinity.",
    "Correct the hot data/access pattern or reviewed service placement; validate interconnect evidence with the cluster team.",
    oracleDocs.tuning,
  ));

  if (staleRows.length) findings.push(finding(
    "optimizer-statistics", staleRows.some((row) => !row.last_analyzed) ? "HIGH" : "MEDIUM", "SQL & Plans",
    "Focused plan references stale, missing or old statistics",
    "Object or partition statistics may not represent the current data volume, distribution or correlations.",
    `${staleRows.length} focused table/partition statistic row(s) need review; ${staleRows.filter((row) => !row.last_analyzed).length} were never analyzed.`,
    "Cardinality errors can select inefficient joins, access paths, memory sizes or parallel degrees.",
    "Confirm modification volume, partition-level/global preference, histogram need and the first wrong estimate before gathering anything.",
    "Test a targeted statistics strategy in a representative environment; schedule production collection through normal maintenance control.",
    oracleDocs.planStats,
  ));

  if (longOps.some((row) => number(row.time_remaining) >= 300)) findings.push(finding(
    "long-operation", "MEDIUM", "SQL & Plans",
    "Instrumented operation has substantial work remaining",
    "A large scan, maintenance task, backup or parallel operation is retaining resources for an extended interval.",
    `${longOps.length} active instrumented operation(s); maximum reported remaining time ${Math.max(...longOps.map((row) => number(row.time_remaining))).toFixed(0)}s.`,
    "The operation can compete with application CPU, I/O, parallel servers or undo while it runs.",
    "Match SID, SQL_ID, operation, target and progress across two samples; remaining-time estimates can fluctuate.",
    "Optimize or reschedule only after ownership and workload impact are confirmed. DBridge does not stop the operation.",
    oracleDocs.monitoring,
  ));

  if (alertRows.length) findings.push(finding(
    "alert-errors", alertRows.some((row) => number(row.message_type) <= 2) ? "HIGH" : "MEDIUM", "RAC & Reliability",
    "Recent high-priority database alert messages",
    "A database, storage, process, memory, cluster or internal Oracle condition was written to ADR during the investigation window.",
    `${alertRows.length} priority alert message(s) in the last 30 minutes; newest problem key: ${alertRows[0]?.problem_key || "not supplied"}.`,
    "Infrastructure or database faults can dominate query latency and make SQL-only tuning misleading.",
    "Correlate exact timestamps and ORA codes with application errors, instance state and the full server alert log.",
    "Follow the documented incident/runbook path for the confirmed error. Do not treat SQL tuning as remediation for an infrastructure fault.",
    oracleDocs.monitoring,
  ));

  if (!findings.length) findings.push(finding(
    "no-dominant-signal", "INFO", "SQL & Plans",
    "No dominant bottleneck crossed the current thresholds",
    "The incident may be intermittent, outside the sampled window, below the thresholds, or hidden by unavailable privileges.",
    `${checks.filter((item) => item.ok).length} of ${checks.length} checks completed; ${active} active and ${waiting} waiting session(s) now.`,
    "A quiet snapshot does not disprove a past application slowdown.",
    "Capture a second snapshot while the slowdown is active and provide an optional SQL_ID for cursor-level correlation.",
    "Keep the system unchanged until repeatable evidence identifies the resource and application scope.",
    oracleDocs.officialBlog,
    "Snapshot",
  ));

  findings.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);
  const pressureMap = areas.map((area) => {
    const matches = findings.filter((item) => item.area === area && item.severity !== "INFO");
    const score = matches.length ? Math.min(100, Math.max(...matches.map((item) => severityWeight[item.severity])) + Math.min(18, (matches.length - 1) * 6)) : 0;
    return { area, count: matches.length, score, severity: score >= 90 ? "CRITICAL" : score >= 65 ? "HIGH" : score >= 35 ? "MEDIUM" : "CLEAR" };
  }).sort((a, b) => b.score - a.score);
  const completed = checks.filter((item) => item.ok).length;
  const skipped = checks.filter((item) => item.skipped).length;
  const failed = checks.length - completed - skipped;
  const priority = findings.filter((item) => ["CRITICAL", "HIGH"].includes(item.severity)).length;
  const pressureScore = Math.min(100, Math.round(
    Math.max(0, ...findings.filter((item) => item.severity !== "INFO").map((item) => severityWeight[item.severity])) +
    Math.min(20, Math.max(0, priority - 1) * 5),
  ));
  const dominantMode = blocked || blockers.length ? "BLOCKED" : waiting > active / 2 || dbWaitRatio > dbCpuRatio ? "WAITING" : hostCpu >= 85 || dbCpuRatio >= 70 ? "CPU" : active ? "WORKING" : "QUIET";
  return {
    total: checks.length, completed, skipped, failed,
    critical: findings.filter((item) => item.severity === "CRITICAL").length,
    high: findings.filter((item) => item.severity === "HIGH").length,
    medium: findings.filter((item) => item.severity === "MEDIUM").length,
    info: findings.filter((item) => item.severity === "INFO").length,
    pressureScore, dominantMode, primary: findings[0]?.title || "No dominant signal",
    primaryEvidence: findings[0]?.evidence || "",
    focusSqlId, focusedSql: focused.sql_id ? focused : null, packScope,
    findings, pressureMap,
    metrics: {
      activeSessions: active, waitingSessions: waiting, blockedSessions: Math.max(blocked, blockers.length),
      sessionUsePercent: Number(sessionUse.toFixed(1)), hostCpuPercent: Number(hostCpu.toFixed(1)),
      databaseCpuRatio: Number(dbCpuRatio.toFixed(1)), databaseWaitRatio: Number(dbWaitRatio.toFixed(1)),
      maxReadMs: Number(maxReadMs.toFixed(2)), tempBytes, pgaOverallocations: overalloc,
      alertErrors: alertRows.length,
    },
    safetyNote: "Fixed read-only evidence only. Core is the default; licensed sources run only after explicit scope selection. No session, plan, statistics, memory setting, object, snapshot, advisor, profile or baseline is changed.",
  };
}
