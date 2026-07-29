const docs = {
  explain: "https://www.postgresql.org/docs/current/using-explain.html",
  monitoring: "https://www.postgresql.org/docs/current/monitoring.html",
  statements: "https://www.postgresql.org/docs/current/pgstatstatements.html",
  statistics: "https://www.postgresql.org/docs/current/planner-stats.html",
  vacuum: "https://www.postgresql.org/docs/current/routine-vacuuming.html",
  indexes: "https://www.postgresql.org/docs/current/indexes.html",
  resources: "https://www.postgresql.org/docs/current/runtime-config-resource.html",
  prepared: "https://www.postgresql.org/docs/current/view-pg-prepared-statements.html",
  replication: "https://www.postgresql.org/docs/current/runtime-config-replication.html",
  statisticsInfo: "https://www.postgresql.org/docs/current/monitoring-stats.html",
};

export const postgresBottleneckCatalog = [
  {
    id: "environment",
    label: "Server & workload context",
    phase: "CONTEXT",
    guidance: "Capture version, recovery role, uptime and the statistics reset boundary before interpreting cumulative counters.",
    sql: `select current_setting('server_version_num')::int server_version_num,
      current_setting('server_version') server_version,
      current_database() database_name,
      pg_is_in_recovery() is_standby,
      round(extract(epoch from (clock_timestamp() - pg_postmaster_start()))::numeric, 0) uptime_seconds,
      (select stats_reset from pg_stat_database where datname = current_database()) stats_reset`,
  },
  {
    id: "activity",
    label: "Waiting versus working",
    phase: "WORKLOAD",
    guidance: "Separate sessions waiting on a resource from sessions actively consuming CPU before choosing a tuning path.",
    sql: `select count(*) total_connections,
      count(*) filter (where state = 'active') active_sessions,
      count(*) filter (where state = 'active' and wait_event_type is not null) waiting_sessions,
      count(*) filter (where state = 'active' and wait_event_type is null and pid <> pg_backend_pid()) working_sessions,
      count(*) filter (where state = 'idle in transaction') idle_in_transaction,
      round(coalesce(max(extract(epoch from (clock_timestamp() - query_start))) filter (where state = 'active'), 0)::numeric, 1) max_query_seconds,
      round(coalesce(max(extract(epoch from (clock_timestamp() - xact_start))) filter (where xact_start is not null), 0)::numeric, 1) max_xact_seconds,
      round(100.0 * count(*) / nullif(current_setting('max_connections')::numeric, 0), 1) connection_utilization_pct
    from pg_stat_activity`,
  },
  {
    id: "waits",
    label: "Wait-event profile",
    phase: "WAITS",
    guidance: "Rank current wait classes and events. A wait is evidence of where time is blocked, not automatically the root cause.",
    sql: `select coalesce(wait_event_type, 'CPU / runnable') wait_event_type,
      coalesce(wait_event, 'not waiting') wait_event,
      count(*) session_count,
      round(max(extract(epoch from (clock_timestamp() - query_start)))::numeric, 1) max_seconds
    from pg_stat_activity
    where state = 'active' and pid <> pg_backend_pid()
    group by wait_event_type, wait_event
    order by session_count desc, max_seconds desc nulls last
    limit 20`,
  },
  {
    id: "blockers",
    label: "Blocking chains",
    phase: "LOCKS",
    guidance: "Identify blocked sessions and their blocker PIDs without cancelling or terminating anything.",
    sql: `select a.pid blocked_pid, a.usename blocked_user,
      pg_blocking_pids(a.pid) blocker_pids,
      a.wait_event_type, a.wait_event,
      round(extract(epoch from (clock_timestamp() - a.query_start))::numeric, 1) blocked_seconds,
      left(a.query, 240) blocked_query
    from pg_stat_activity a
    where cardinality(pg_blocking_pids(a.pid)) > 0
    order by blocked_seconds desc
    limit 25`,
  },
  {
    id: "database",
    label: "Database I/O, temp and errors",
    phase: "DATABASE",
    guidance: "Use cumulative database counters with their stats-reset time; compare two snapshots before calling a rate abnormal.",
    sql: `select datname, numbackends, xact_commit, xact_rollback,
      blks_read, blks_hit,
      round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2) cache_hit_pct,
      temp_files, temp_bytes, deadlocks,
      blk_read_time, blk_write_time,
      coalesce((to_jsonb(d)->>'sessions_abandoned')::numeric, 0) sessions_abandoned,
      coalesce((to_jsonb(d)->>'sessions_fatal')::numeric, 0) sessions_fatal,
      stats_reset
    from pg_stat_database d
    where datname = current_database()`,
  },
  {
    id: "statements",
    label: "Statement impact and variance",
    phase: "SQL",
    guidance: "Rank total impact, mean latency, physical reads, temp spill, WAL generation and runtime variance from pg_stat_statements.",
    sql: `select queryid::text queryid, calls,
      round(total_exec_time::numeric, 2) total_exec_ms,
      round(mean_exec_time::numeric, 2) mean_exec_ms,
      round(coalesce((to_jsonb(s)->>'max_exec_time')::numeric, mean_exec_time::numeric), 2) max_exec_ms,
      rows, shared_blks_hit, shared_blks_read,
      coalesce((to_jsonb(s)->>'temp_blks_read')::numeric, 0) temp_blks_read,
      coalesce((to_jsonb(s)->>'temp_blks_written')::numeric, 0) temp_blks_written,
      coalesce((to_jsonb(s)->>'wal_bytes')::numeric, 0) wal_bytes,
      round(coalesce((to_jsonb(s)->>'mean_plan_time')::numeric, 0), 2) mean_plan_ms,
      left(query, 400) query
    from pg_stat_statements s
    where dbid = (select oid from pg_database where datname = current_database())
    order by total_exec_time desc
    limit 30`,
  },
  {
    id: "tables",
    label: "Table churn, scans and statistics",
    phase: "STORAGE",
    guidance: "Find scan-heavy, dead-tuple-heavy or statistics-stale tables; these are candidates for plan and maintenance verification.",
    sql: `select schemaname, relname, n_live_tup, n_dead_tup,
      round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 2) dead_tuple_pct,
      seq_scan, seq_tup_read, idx_scan, idx_tup_fetch, n_mod_since_analyze,
      last_autovacuum, last_autoanalyze,
      pg_total_relation_size(relid) total_bytes
    from pg_stat_user_tables
    order by greatest(n_dead_tup, n_mod_since_analyze, seq_tup_read) desc
    limit 35`,
  },
  {
    id: "indexes",
    label: "Index usage and write cost",
    phase: "INDEXES",
    guidance: "Surface large low-use indexes as review candidates only; stats age, constraints and workload coverage must be checked before any removal.",
    sql: `select ui.schemaname, ui.relname, ui.indexrelname, ui.idx_scan,
      ui.idx_tup_read, ui.idx_tup_fetch,
      pg_relation_size(ui.indexrelid) index_bytes,
      ix.indisunique, ix.indisprimary, ix.indisvalid, ix.indisready
    from pg_stat_user_indexes ui
    join pg_index ix on ix.indexrelid = ui.indexrelid
    order by (ui.idx_scan = 0) desc, pg_relation_size(ui.indexrelid) desc
    limit 35`,
  },
  {
    id: "replication",
    label: "Replication apply pressure",
    phase: "REPLICATION",
    guidance: "Measure connected standby state, WAL byte distance and replay time lag where the sender reports it.",
    sql: `select application_name, client_addr, state, sync_state,
      pg_wal_lsn_diff(sent_lsn, replay_lsn) replay_lag_bytes,
      round(extract(epoch from coalesce(replay_lag, interval '0'))::numeric, 2) replay_lag_seconds,
      write_lag, flush_lag, replay_lag
    from pg_stat_replication
    order by replay_lag_bytes desc nulls last`,
  },
  {
    id: "settings",
    label: "Planner, memory and observability settings",
    phase: "SETTINGS",
    guidance: "Capture setting values and sources. Memory is multiplied per operation, worker and concurrent session.",
    sql: `select name, setting, unit, source, pending_restart
    from pg_settings
    where name in (
      'shared_buffers','work_mem','hash_mem_multiplier','maintenance_work_mem',
      'effective_cache_size','max_connections','random_page_cost',
      'effective_io_concurrency','track_io_timing','shared_preload_libraries',
      'max_parallel_workers_per_gather','max_parallel_workers','jit','plan_cache_mode',
      'autovacuum','autovacuum_vacuum_scale_factor','autovacuum_analyze_scale_factor',
      'autovacuum_freeze_max_age','checkpoint_timeout','max_wal_size',
      'track_wal_io_timing','compute_query_id','pg_stat_statements.max',
      'pg_stat_statements.track','pg_stat_statements.track_planning'
    )
    order by name`,
  },
  {
    id: "prepared",
    label: "Prepared-plan behavior",
    phase: "PLANS",
    guidance: "Inspect generic versus custom plan use in this diagnostic session; compare representative parameter values before changing plan policy.",
    sql: `select count(*) prepared_count,
      coalesce(sum(generic_plans), 0) generic_plans,
      coalesce(sum(custom_plans), 0) custom_plans
    from pg_prepared_statements`,
  },
  {
    id: "invalidIndexes",
    label: "Invalid or unfinished indexes",
    phase: "INDEXES",
    guidance: "Detect indexes that are invalid or not ready, including interrupted concurrent builds.",
    sql: `select n.nspname schemaname, c.relname index_name,
      t.relname table_name, i.indisvalid, i.indisready
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not i.indisvalid or not i.indisready
    order by n.nspname, c.relname
    limit 50`,
  },
  {
    id: "wal",
    label: "WAL generation and pressure",
    phase: "WAL",
    minVersion: 140000,
    guidance: "Review WAL volume, full WAL buffers and write/sync timing as cumulative evidence; use interval deltas to confirm pressure.",
    sql: `select wal_records, wal_fpi, wal_bytes, wal_buffers_full,
      wal_write, wal_sync, wal_write_time, wal_sync_time, stats_reset
    from pg_stat_wal`,
  },
  {
    id: "io",
    label: "Backend I/O profile",
    phase: "I/O",
    minVersion: 160000,
    guidance: "Use pg_stat_io to attribute reads, writes, evictions and fsync work by backend, object and context.",
    sql: `select backend_type, object, context,
      coalesce(reads, 0) reads, coalesce(read_time, 0) read_time_ms,
      coalesce(writes, 0) writes, coalesce(write_time, 0) write_time_ms,
      coalesce(extends, 0) extends, coalesce(extend_time, 0) extend_time_ms,
      coalesce(evictions, 0) evictions, coalesce(reuses, 0) reuses,
      coalesce(fsyncs, 0) fsyncs, coalesce(fsync_time, 0) fsync_time_ms
    from pg_stat_io
    order by coalesce(read_time, 0) + coalesce(write_time, 0) + coalesce(fsync_time, 0) desc
    limit 30`,
  },
  {
    id: "progress",
    label: "Maintenance progress",
    phase: "MAINTENANCE",
    minVersion: 130000,
    guidance: "Check active VACUUM, ANALYZE and CREATE INDEX progress before interpreting maintenance load or interrupting work.",
    sql: `select 'VACUUM' operation, pid, datname, relid::regclass::text target,
      phase, heap_blks_scanned progress_done, heap_blks_total progress_total
    from pg_stat_progress_vacuum
    union all
    select 'ANALYZE', pid, datname, relid::regclass::text,
      phase, sample_blks_scanned, sample_blks_total
    from pg_stat_progress_analyze
    union all
    select 'CREATE INDEX', pid, datname, relid::regclass::text,
      phase, blocks_done, blocks_total
    from pg_stat_progress_create_index
    order by operation, pid`,
  },
  {
    id: "checkpointer",
    label: "Checkpoint write pressure",
    phase: "WAL",
    minVersion: 170000,
    guidance: "Use requested versus timed checkpoints and write/sync time as cumulative evidence, then compare interval snapshots.",
    sql: `select num_timed, num_requested, restartpoints_timed, restartpoints_req,
      buffers_written, write_time, sync_time, stats_reset
    from pg_stat_checkpointer`,
  },
  {
    id: "focusedStatement",
    label: "Focused queryid profile",
    phase: "SQL FOCUS",
    requiresQueryId: true,
    guidance: "Profile the exact normalized statement across latency, variance, block access, temporary I/O, WAL and planning overhead.",
    sql: `select queryid::text queryid, calls,
      round(total_exec_time::numeric, 2) total_exec_ms,
      round(mean_exec_time::numeric, 2) mean_exec_ms,
      round(coalesce((to_jsonb(s)->>'min_exec_time')::numeric, 0), 2) min_exec_ms,
      round(coalesce((to_jsonb(s)->>'max_exec_time')::numeric, mean_exec_time::numeric), 2) max_exec_ms,
      round(coalesce((to_jsonb(s)->>'stddev_exec_time')::numeric, 0), 2) stddev_exec_ms,
      round(coalesce((to_jsonb(s)->>'mean_plan_time')::numeric, 0), 2) mean_plan_ms,
      rows,
      round(rows::numeric / nullif(calls, 0), 2) rows_per_call,
      shared_blks_hit, shared_blks_read,
      round(shared_blks_read::numeric / nullif(calls, 0), 2) reads_per_call,
      coalesce((to_jsonb(s)->>'temp_blks_read')::numeric, 0) temp_blks_read,
      coalesce((to_jsonb(s)->>'temp_blks_written')::numeric, 0) temp_blks_written,
      coalesce((to_jsonb(s)->>'wal_bytes')::numeric, 0) wal_bytes,
      left(query, 800) query
    from pg_stat_statements s
    where dbid = (select oid from pg_database where datname = current_database())
      and queryid::text = '__QUERY_ID__'
    limit 5`,
  },
  {
    id: "longTransactions",
    label: "Long transactions and old snapshots",
    phase: "TRANSACTIONS",
    guidance: "Expose the oldest transactions and idle-in-transaction sessions that can retain row versions, locks and vacuum horizons.",
    sql: `select pid, usename, application_name, client_addr, state,
      round(extract(epoch from (clock_timestamp() - xact_start))::numeric, 1) xact_seconds,
      round(extract(epoch from (clock_timestamp() - state_change))::numeric, 1) state_seconds,
      wait_event_type, wait_event,
      age(backend_xmin) backend_xmin_age,
      left(query, 300) query
    from pg_stat_activity
    where xact_start is not null and pid <> pg_backend_pid()
    order by xact_start
    limit 25`,
  },
  {
    id: "tableIo",
    label: "Table and index I/O concentration",
    phase: "I/O",
    guidance: "Find relations concentrating heap, index and TOAST reads before attributing a database-wide cache or storage signal.",
    sql: `select schemaname, relname,
      heap_blks_read, heap_blks_hit, idx_blks_read, idx_blks_hit,
      toast_blks_read, toast_blks_hit, tidx_blks_read, tidx_blks_hit,
      heap_blks_read + idx_blks_read + toast_blks_read + tidx_blks_read physical_blocks
    from pg_statio_user_tables
    order by physical_blocks desc
    limit 30`,
  },
  {
    id: "hotUpdates",
    label: "HOT update and write amplification",
    phase: "STORAGE",
    guidance: "Review update volume and HOT-update effectiveness; low HOT usage is a lead, not proof that fillfactor or indexes should change.",
    sql: `select schemaname, relname, n_tup_upd, n_tup_hot_upd,
      coalesce((to_jsonb(t)->>'n_tup_newpage_upd')::numeric, 0) n_tup_newpage_upd,
      round(100.0 * n_tup_hot_upd / nullif(n_tup_upd, 0), 2) hot_update_pct,
      n_dead_tup, pg_total_relation_size(relid) total_bytes
    from pg_stat_user_tables t
    where n_tup_upd > 0
    order by n_tup_upd desc
    limit 30`,
  },
  {
    id: "freeze",
    label: "Freeze and transaction-ID horizon",
    phase: "VACUUM",
    guidance: "Measure relation freeze age against the configured forced-vacuum horizon, including TOAST relations.",
    sql: `select n.nspname schemaname, c.relname,
      greatest(age(c.relfrozenxid), coalesce(age(t.relfrozenxid), 0)) xid_age,
      current_setting('autovacuum_freeze_max_age')::numeric freeze_max_age,
      round(100.0 * greatest(age(c.relfrozenxid), coalesce(age(t.relfrozenxid), 0))
        / nullif(current_setting('autovacuum_freeze_max_age')::numeric, 0), 2) freeze_age_pct
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_class t on t.oid = c.reltoastrelid
    where c.relkind in ('r','m') and n.nspname not in ('pg_catalog','information_schema')
    order by xid_age desc
    limit 30`,
  },
  {
    id: "replicationSlots",
    label: "Replication slot WAL retention",
    phase: "REPLICATION",
    minVersion: 130000,
    guidance: "Detect inactive or lagging slots retaining WAL; never drop a slot until its consumer and recovery requirements are confirmed.",
    sql: `select slot_name, slot_type, database, active,
      coalesce((to_jsonb(s)->>'wal_status'), 'unknown') wal_status,
      coalesce((to_jsonb(s)->>'safe_wal_size')::numeric, 0) safe_wal_size,
      case when restart_lsn is null then 0 else
        pg_wal_lsn_diff(case when pg_is_in_recovery() then pg_last_wal_replay_lsn() else pg_current_wal_lsn() end, restart_lsn)
      end retained_wal_bytes,
      restart_lsn, confirmed_flush_lsn
    from pg_replication_slots s
    order by retained_wal_bytes desc nulls last`,
  },
  {
    id: "archiver",
    label: "WAL archive health",
    phase: "WAL",
    guidance: "Check whether the latest archive attempt failed and retain cumulative counts only as historical context.",
    sql: `select archived_count, failed_count, last_archived_wal, last_archived_time,
      last_failed_wal, last_failed_time, stats_reset,
      coalesce(last_failed_time > last_archived_time, last_failed_time is not null) latest_attempt_failed
    from pg_stat_archiver`,
  },
  {
    id: "statementCapacity",
    label: "pg_stat_statements capacity",
    phase: "OBSERVABILITY",
    minVersion: 140000,
    guidance: "High entry deallocation can evict normalized statements and weaken historical diagnosis; interpret it over the statistics window.",
    sql: `select dealloc, stats_reset from pg_stat_statements_info`,
  },
  {
    id: "capabilities",
    label: "Optional diagnostic capabilities",
    phase: "CAPABILITIES",
    guidance: "Inventory installed supplied or third-party diagnostic extensions without installing, enabling or changing any capability.",
    sql: `select a.name, a.default_version, e.extversion installed_version,
      (e.oid is not null) installed
    from pg_available_extensions a
    left join pg_extension e on e.extname = a.name
    where a.name in ('pg_stat_statements','auto_explain','pg_buffercache','pgstattuple',
      'pageinspect','pg_freespacemap','pg_visibility','hypopg','pg_wait_sampling',
      'pg_stat_kcache','powa')
    order by installed desc, a.name`,
  },
  {
    id: "checkpointerLegacy",
    label: "Legacy checkpoint pressure",
    phase: "WAL",
    maxVersion: 169999,
    guidance: "For PostgreSQL 16 and older, read checkpoint counters from pg_stat_bgwriter and confirm pressure with interval deltas.",
    sql: `select checkpoints_timed num_timed, checkpoints_req num_requested,
      checkpoint_write_time write_time, checkpoint_sync_time sync_time,
      buffers_checkpoint buffers_written, buffers_backend, buffers_backend_fsync,
      stats_reset
    from pg_stat_bgwriter`,
  },
];

const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
const severityWeight = { CRITICAL: 30, HIGH: 18, MEDIUM: 9, LOW: 4, INFO: 0 };

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowsById(checks, id) {
  return checks.find((item) => item.id === id && item.ok)?.rows || [];
}

function finding(id, severity, area, title, cause, evidence, impact, verify, action, doc) {
  return { id, severity, area, title, cause, evidence, impact, verify, action, doc };
}

export function analyzePostgresBottlenecks(checks = [], focusQueryId = "") {
  const findings = [];
  const activity = rowsById(checks, "activity")[0] || {};
  const waits = rowsById(checks, "waits");
  const blockers = rowsById(checks, "blockers");
  const database = rowsById(checks, "database")[0] || {};
  const statements = rowsById(checks, "statements");
  const focusedStatement = rowsById(checks, "focusedStatement")[0] || {};
  const tables = rowsById(checks, "tables");
  const tableIo = rowsById(checks, "tableIo");
  const hotUpdates = rowsById(checks, "hotUpdates");
  const freeze = rowsById(checks, "freeze");
  const indexes = rowsById(checks, "indexes");
  const replication = rowsById(checks, "replication");
  const replicationSlots = rowsById(checks, "replicationSlots");
  const archiver = rowsById(checks, "archiver")[0] || {};
  const statementCapacity = rowsById(checks, "statementCapacity")[0] || {};
  const longTransactions = rowsById(checks, "longTransactions");
  const settings = Object.fromEntries(rowsById(checks, "settings").map((item) => [item.name, item.setting]));
  const prepared = rowsById(checks, "prepared")[0] || {};
  const invalidIndexes = rowsById(checks, "invalidIndexes");
  const wal = rowsById(checks, "wal")[0] || {};
  const io = rowsById(checks, "io");
  const checkpointer = rowsById(checks, "checkpointer")[0] || rowsById(checks, "checkpointerLegacy")[0] || {};
  const waiting = number(activity.waiting_sessions);
  const working = number(activity.working_sessions);

  if (focusQueryId && !Object.keys(focusedStatement).length) {
    findings.push(finding("focused-query-missing", "LOW", "SQL FOCUS", `queryid ${focusQueryId} was not visible`,
      "The statement may not have executed since the statistics reset, may belong to another database or user, may have been evicted, or may be hidden by privileges.",
      "The exact queryid profile returned no row while the rest of the database scan completed.",
      "Query-specific attribution is incomplete; system-wide findings still apply.",
      "Confirm the database, stats-reset time, application user and normalized queryid from the same server version.",
      "Run the application path again, then recapture. Do not reset production statistics just to populate this view.",
      docs.statements));
  }

  if (Object.keys(focusedStatement).length) {
    const calls = Math.max(number(focusedStatement.calls), 1);
    const readsPerCall = number(focusedStatement.shared_blks_read) / calls;
    const tempPerCall = number(focusedStatement.temp_blks_written) / calls;
    const variability = number(focusedStatement.stddev_exec_ms) / Math.max(number(focusedStatement.mean_exec_ms), 0.001);
    const planningShare = number(focusedStatement.mean_plan_ms) / Math.max(number(focusedStatement.mean_exec_ms) + number(focusedStatement.mean_plan_ms), 0.001);
    const walPerCall = number(focusedStatement.wal_bytes) / calls;
    const dimensions = [
      ["physical reads", readsPerCall],
      ["temporary writes", tempPerCall],
      ["WAL bytes", walPerCall / 8192],
      ["runtime variability", variability * 100],
      ["planning share", planningShare * 100],
    ].sort((a, b) => b[1] - a[1]);
    const dominant = dimensions[0]?.[0] || "elapsed time";
    findings.push(finding("focused-query-profile",
      readsPerCall >= 10000 || tempPerCall >= 2048 || variability >= 2 ? "HIGH"
        : readsPerCall >= 1000 || tempPerCall >= 128 || variability >= 1 ? "MEDIUM" : "INFO",
      "SQL FOCUS", `Focused query is dominated by ${dominant}`,
      "The normalized statement profile identifies the largest measured cost dimension, but an execution plan is still required to locate the responsible node.",
      `queryid ${focusedStatement.queryid}: ${number(focusedStatement.mean_exec_ms).toFixed(2)} ms mean, ${number(focusedStatement.max_exec_ms).toFixed(2)} ms max, ${readsPerCall.toFixed(1)} physical blocks/call, ${tempPerCall.toFixed(1)} temp blocks/call, ${(walPerCall / 1024).toFixed(1)} KiB WAL/call.`,
      "This statement can be separated from database-wide pressure and prioritized by both per-call latency and total workload impact.",
      "Capture a representative EXPLAIN plan; use ANALYZE only when the SQL and side effects are understood, and compare selective plus non-selective parameters.",
      "Fix the highest-cost plan node or estimate first, then validate with repeated calls and a second pg_stat_statements snapshot.",
      docs.explain));
  }

  if (blockers.length || waits.some((item) => String(item.wait_event_type).toLowerCase() === "lock")) {
    const longest = Math.max(0, ...blockers.map((item) => number(item.blocked_seconds)));
    findings.push(finding("lock-contention", longest >= 60 || blockers.length >= 3 ? "CRITICAL" : "HIGH", "LOCKS", "Blocking chain is delaying application work",
      "A transaction is holding a conflicting lock; a long or idle transaction is a common upstream cause.",
      `${blockers.length} blocked session(s); longest visible block ${longest.toFixed(1)} seconds.`,
      "Latency queues behind the blocker and can exhaust the application connection pool.",
      "Inspect blocker PID, transaction age, application owner and blocked SQL together.",
      "Coordinate with the owner; commit or roll back safely. Never terminate a session from this dashboard.",
      docs.monitoring));
  }

  const connectionPct = number(activity.connection_utilization_pct);
  const idleTransactions = number(activity.idle_in_transaction);
  if (connectionPct >= 80 || idleTransactions >= 5) {
    findings.push(finding("connection-pressure", connectionPct >= 95 ? "CRITICAL" : "HIGH", "CONNECTIONS", "Connection or transaction saturation",
      "Pool over-allocation, a connection leak, slow queries, or application transactions left open can consume backend slots.",
      `${connectionPct.toFixed(1)}% of max_connections is in use; ${idleTransactions} session(s) are idle in transaction.`,
      "New work may queue or fail, while old snapshots can delay vacuum cleanup.",
      "Correlate pool metrics with pg_stat_activity state, xact_start and application_name.",
      "Fix pool sizing and transaction scope in the application; avoid raising max_connections before checking memory and pooling.",
      docs.monitoring));
  } else if (idleTransactions > 0 && number(activity.max_xact_seconds) >= 300) {
    findings.push(finding("long-transaction", "MEDIUM", "TRANSACTIONS", "Long transaction can retain old row versions",
      "An application transaction has remained open long enough to hold an old snapshot.",
      `${idleTransactions} idle-in-transaction session(s); oldest transaction ${number(activity.max_xact_seconds).toFixed(1)} seconds.`,
      "Vacuum cleanup can be delayed and table/index bloat can grow.",
      "Identify the owning application and confirm whether the transaction is intentionally long.",
      "Shorten transaction scope and add application-side idle transaction timeouts through change control.",
      docs.vacuum));
  }

  const oldestTransaction = [...longTransactions].sort((a, b) => number(b.xact_seconds) - number(a.xact_seconds))[0];
  if (oldestTransaction && number(oldestTransaction.xact_seconds) >= 900 && !findings.some((item) => item.id === "long-transaction")) {
    findings.push(finding("old-snapshot", number(oldestTransaction.xact_seconds) >= 3600 ? "HIGH" : "MEDIUM", "TRANSACTIONS", "Old transaction is extending the cleanup horizon",
      "A long-running or idle transaction retains a snapshot and can also retain locks.",
      `PID ${oldestTransaction.pid} has been in a transaction for ${number(oldestTransaction.xact_seconds).toFixed(0)} seconds; state is ${oldestTransaction.state || "unknown"}.`,
      "Dead tuples can remain unreclaimable and later scans or maintenance can do more work.",
      "Confirm the application owner, backend_xmin age, state, lock footprint and business purpose.",
      "Correct transaction boundaries in the application; use termination only through an approved incident procedure.",
      docs.vacuum));
  }

  const tempHeavy = statements.filter((item) => number(item.temp_blks_written) >= 1024);
  if (tempHeavy.length || number(database.temp_bytes) >= 10 * 1024 ** 3) {
    const top = [...tempHeavy].sort((a, b) => number(b.temp_blks_written) - number(a.temp_blks_written))[0];
    findings.push(finding("temp-spill", tempHeavy.some((item) => number(item.temp_blks_written) >= 16384) ? "HIGH" : "MEDIUM", "MEMORY", "Sort or hash work is spilling to temporary files",
      "Large intermediate row sets, underestimated cardinality, or insufficient per-operation memory can force disk-based sort/hash work.",
      top ? `queryid ${top.queryid} wrote ${number(top.temp_blks_written).toLocaleString()} temporary blocks.` : `${number(database.temp_bytes).toLocaleString()} cumulative temporary bytes since the stats reset.`,
      "Extra temporary I/O increases response time and competes with database storage traffic.",
      "Capture EXPLAIN (ANALYZE, BUFFERS, SETTINGS) and look for external sort methods or multi-batch hashes.",
      "Reduce rows earlier and fix estimates first; test SET LOCAL work_mem in one controlled session before any scoped configuration change.",
      docs.resources));
  }

  const scanHeavy = statements.filter((item) => number(item.shared_blks_read) >= 10000 && number(item.shared_blks_read) > number(item.shared_blks_hit) * 0.2);
  const ioTime = io.reduce((sum, item) => sum + number(item.read_time_ms) + number(item.write_time_ms) + number(item.fsync_time_ms), 0);
  const cacheHit = number(database.cache_hit_pct);
  if (scanHeavy.length || (cacheHit > 0 && cacheHit < 90) || ioTime >= 60000) {
    const top = [...scanHeavy].sort((a, b) => number(b.shared_blks_read) - number(a.shared_blks_read))[0];
    const topRelation = tableIo[0];
    findings.push(finding("io-pressure", scanHeavy.length >= 3 || (cacheHit > 0 && cacheHit < 80) ? "HIGH" : "MEDIUM", "I/O", "Read-heavy workload or storage pressure",
      "A scan-heavy access path, a working set larger than cache, checkpoint traffic, or storage latency can dominate elapsed time.",
      top ? `queryid ${top.queryid} has ${number(top.shared_blks_read).toLocaleString()} shared block reads; database cache hit is ${cacheHit ? `${cacheHit.toFixed(2)}%` : "not available"}${topRelation ? `; ${topRelation.schemaname}.${topRelation.relname} leads relation reads` : ""}.` : `Database cache hit is ${cacheHit.toFixed(2)}%; cumulative pg_stat_io time is ${ioTime.toFixed(1)} ms.`,
      "Physical reads extend statement latency and may slow unrelated workloads.",
      "Inspect the exact plan with BUFFERS and correlate the same incident window with operating-system iostat/vmstat evidence.",
      "Fix query shape or access paths using measured plans; do not infer that shared_buffers alone is the solution.",
      docs.explain));
  }

  const highVariance = statements
    .map((item) => ({ ...item, variance: number(item.max_exec_ms) / Math.max(number(item.mean_exec_ms), 0.001) }))
    .filter((item) => number(item.calls) >= 5 && item.variance >= 8);
  if (highVariance.length) {
    const top = highVariance.sort((a, b) => b.variance - a.variance)[0];
    findings.push(finding("plan-variance", top.variance >= 25 ? "HIGH" : "MEDIUM", "PLANS", "Runtime variance suggests parameter sensitivity or intermittent contention",
      "Skewed parameter values, generic prepared plans, cache state, locks, or changing row counts can make the same normalized statement behave differently.",
      `queryid ${top.queryid} max execution is ${top.variance.toFixed(1)}× its mean (${number(top.max_exec_ms).toFixed(1)} ms vs ${number(top.mean_exec_ms).toFixed(1)} ms).`,
      "Tail latency can remain severe even when average latency appears acceptable.",
      "Compare plans for representative selective and non-selective parameter values and align them with wait evidence.",
      "Test plan_cache_mode only with SET LOCAL in a controlled session; prefer statistics and query/index fixes that work across the value distribution.",
      docs.prepared));
  }

  if (number(prepared.generic_plans) > number(prepared.custom_plans) * 2 && number(prepared.generic_plans) >= 5) {
    findings.push(finding("generic-plans", "LOW", "PLANS", "Generic prepared plans dominate this diagnostic session",
      "PostgreSQL may reuse a parameter-independent plan when its estimated average cost appears preferable.",
      `${number(prepared.generic_plans).toLocaleString()} generic versus ${number(prepared.custom_plans).toLocaleString()} custom plan executions are visible in this session.`,
      "Under strong data skew, a generic plan can be inefficient for particular parameter values.",
      "Treat this session-scoped counter as a lead; reproduce with the application prepare/execute pattern.",
      "Compare custom and generic plans for representative values; do not force a global plan policy from this counter alone.",
      docs.prepared));
  }

  const staleTables = tables.filter((item) => {
    const live = Math.max(number(item.n_live_tup), 1);
    return number(item.dead_tuple_pct) >= 15 || number(item.n_mod_since_analyze) / live >= 0.2;
  });
  if (staleTables.length) {
    const top = [...staleTables].sort((a, b) => Math.max(number(b.dead_tuple_pct), number(b.n_mod_since_analyze) / Math.max(number(b.n_live_tup), 1) * 100) - Math.max(number(a.dead_tuple_pct), number(a.n_mod_since_analyze) / Math.max(number(a.n_live_tup), 1) * 100))[0];
    findings.push(finding("vacuum-statistics", staleTables.some((item) => number(item.dead_tuple_pct) >= 30) ? "HIGH" : "MEDIUM", "MAINTENANCE", "Vacuum or planner statistics debt",
      "High table churn can leave dead tuples and change value distributions faster than automatic maintenance thresholds react.",
      `${top.schemaname}.${top.relname} reports ${number(top.dead_tuple_pct).toFixed(1)}% dead tuples and ${number(top.n_mod_since_analyze).toLocaleString()} changes since analyze.`,
      "Dead rows increase scan work; stale statistics can cause row-estimate errors and poor join/access-path choices.",
      "Compare estimated versus actual rows in EXPLAIN and confirm autovacuum/analyze timing for this table.",
      "Run targeted ANALYZE or VACUUM through normal change control, then tune per-table autovacuum thresholds when churn justifies it; avoid VACUUM FULL as a first response.",
      docs.vacuum));
  }

  const freezeRisk = freeze.filter((item) => number(item.freeze_age_pct) >= 75);
  if (freezeRisk.length) {
    const top = [...freezeRisk].sort((a, b) => number(b.freeze_age_pct) - number(a.freeze_age_pct))[0];
    findings.push(finding("freeze-horizon", number(top.freeze_age_pct) >= 90 ? "CRITICAL" : "HIGH", "VACUUM", "Transaction-ID freeze horizon is approaching",
      "A relation has accumulated old unfrozen transaction IDs close to the forced autovacuum threshold.",
      `${top.schemaname}.${top.relname} is at ${number(top.freeze_age_pct).toFixed(1)}% of autovacuum_freeze_max_age.`,
      "Anti-wraparound vacuum can consume substantial I/O; failure to advance the horizon eventually threatens database availability.",
      "Check active autovacuum progress, long transactions, table-level autovacuum settings and recent vacuum errors.",
      "Prioritize a DBA-reviewed vacuum plan and remove the condition blocking vacuum progress; do not disable autovacuum.",
      docs.vacuum));
  }

  const inefficientHot = hotUpdates.filter((item) => number(item.n_tup_upd) >= 10000 && number(item.hot_update_pct) < 10 && number(item.total_bytes) >= 1024 ** 3);
  if (inefficientHot.length) {
    const top = [...inefficientHot].sort((a, b) => number(b.n_tup_upd) - number(a.n_tup_upd))[0];
    findings.push(finding("hot-update", "LOW", "WRITE PATH", "Update-heavy table has low HOT-update reuse",
      "Updates may touch indexed columns or lack same-page space, causing more index maintenance than a HOT update would require.",
      `${top.schemaname}.${top.relname}: ${number(top.n_tup_upd).toLocaleString()} updates and ${number(top.hot_update_pct).toFixed(1)}% HOT updates in the statistics window.`,
      "Extra index changes can increase WAL, cache churn and vacuum work.",
      "Identify changed columns, index coverage, tuple width, fillfactor and stats-reset time before proposing a change.",
      "Reduce unnecessary indexes or test table-specific fillfactor only with measured write/read trade-offs and a controlled rewrite plan.",
      docs.statisticsInfo));
  }

  const scanTables = tables.filter((item) => number(item.seq_tup_read) >= 1_000_000 && number(item.seq_scan) > number(item.idx_scan));
  if (scanTables.length) {
    const top = [...scanTables].sort((a, b) => number(b.seq_tup_read) - number(a.seq_tup_read))[0];
    findings.push(finding("scan-shape", "MEDIUM", "QUERY SHAPE", "Scan-heavy table workload needs plan-level verification",
      "Non-sargable predicates, missing or incorrectly ordered indexes, low selectivity, or a deliberately efficient sequential scan can all produce this signal.",
      `${top.schemaname}.${top.relname} has ${number(top.seq_tup_read).toLocaleString()} sequential tuples read.`,
      "Repeated wide scans can consume CPU and I/O, but a sequential scan is not automatically wrong.",
      "Capture the exact slow statement and compare estimated/actual rows, rows removed by filter, loops and buffers.",
      "Test sargable predicates and equality-before-range index ordering; consider partial, expression or INCLUDE indexes only against measured workload.",
      docs.indexes));
  }

  if (invalidIndexes.length) {
    const sample = invalidIndexes[0];
    findings.push(finding("invalid-index", "HIGH", "INDEXES", "Invalid or unfinished index detected",
      "A failed or interrupted concurrent index build can leave an index invalid or not ready.",
      `${invalidIndexes.length} index(es) require review; example ${sample.schemaname}.${sample.index_name}.`,
      "The optimizer cannot safely use an invalid index, while the object may still add maintenance or operational complexity.",
      "Review CREATE INDEX progress/history and the failed build reason before taking action.",
      "Rebuild or remove only through an approved, workload-aware maintenance procedure.",
      docs.indexes));
  }

  const largeUnused = indexes.filter((item) => number(item.idx_scan) === 0 && number(item.index_bytes) >= 1024 ** 3 && !item.indisprimary && !item.indisunique);
  if (largeUnused.length) {
    const bytes = largeUnused.reduce((sum, item) => sum + number(item.index_bytes), 0);
    findings.push(finding("index-overhead", "LOW", "INDEXES", "Large low-use indexes need workload review",
      "Some indexes may not have been scanned during the current statistics window, or they may serve rare, seasonal, constraint, or failover workloads.",
      `${largeUnused.length} non-unique index(es) with zero scans total ${(bytes / 1024 ** 3).toFixed(1)} GiB.`,
      "Unnecessary indexes consume cache/storage and add write, vacuum and WAL work.",
      "Check stats_reset, constraints, replicas, month-end jobs and query history before classifying an index unused.",
      "Measure write cost and workload coverage; this analyzer never recommends an automatic DROP INDEX.",
      docs.indexes));
  }

  const maxReplicationBytes = Math.max(0, ...replication.map((item) => number(item.replay_lag_bytes)));
  const maxReplicationSeconds = Math.max(0, ...replication.map((item) => number(item.replay_lag_seconds)));
  if (maxReplicationBytes >= 64 * 1024 ** 2 || maxReplicationSeconds >= 30) {
    findings.push(finding("replication-lag", maxReplicationBytes >= 1024 ** 3 || maxReplicationSeconds >= 300 ? "HIGH" : "MEDIUM", "REPLICATION", "Standby replay lag is accumulating",
      "Primary WAL production, network transport, receiver I/O, replay contention, or slow standby storage can separate sent and replay positions.",
      `Maximum visible lag is ${(maxReplicationBytes / 1024 ** 2).toFixed(1)} MiB and ${maxReplicationSeconds.toFixed(1)} seconds.`,
      "Read replicas can return stale data and recovery objectives may be at risk.",
      "Compare sent/write/flush/replay positions and inspect standby receiver, replay waits and storage.",
      "Resolve the slowest stage; avoid changing retention or durability settings before confirming the cause.",
      docs.monitoring));
  }

  const retainingSlots = replicationSlots.filter((item) =>
    (!item.active && number(item.retained_wal_bytes) >= 1024 ** 3)
    || number(item.retained_wal_bytes) >= 10 * 1024 ** 3
    || ["extended", "unreserved", "lost"].includes(String(item.wal_status || "").toLowerCase()));
  if (retainingSlots.length) {
    const top = [...retainingSlots].sort((a, b) => number(b.retained_wal_bytes) - number(a.retained_wal_bytes))[0];
    const slotLost = String(top.wal_status || "").toLowerCase() === "lost";
    findings.push(finding("slot-retention", slotLost || number(top.retained_wal_bytes) >= 50 * 1024 ** 3 ? "CRITICAL" : "HIGH", "REPLICATION", slotLost ? "Replication slot has lost required WAL" : "Replication slot is retaining significant WAL",
      "A slow, disconnected or abandoned slot consumer prevents older WAL from being recycled.",
      `${top.slot_name} is ${top.active ? "active" : "inactive"} and retains ${(number(top.retained_wal_bytes) / 1024 ** 3).toFixed(2)} GiB; status ${top.wal_status || "unknown"}.`,
      "The pg_wal filesystem can fill, or a slot can become unusable when a configured retention limit is exceeded.",
      "Confirm the slot owner, consumer health, restart_lsn, storage headroom and recovery requirements.",
      "Restore the consumer or use the approved slot lifecycle procedure; never drop a slot solely from this dashboard signal.",
      docs.replication));
  }

  if (String(archiver.latest_attempt_failed) === "true" || archiver.latest_attempt_failed === true) {
    findings.push(finding("archive-failure", "HIGH", "WAL", "Latest WAL archive attempt failed",
      "The archive command or archive library could not durably store the newest attempted WAL segment.",
      `Last failed WAL ${archiver.last_failed_wal || "unknown"} at ${archiver.last_failed_time || "unknown"}; archived ${number(archiver.archived_count).toLocaleString()}, failed ${number(archiver.failed_count).toLocaleString()} since reset.`,
      "Recovery-point objectives and WAL recycling can be affected while archive failures continue.",
      "Inspect the PostgreSQL server log, archive destination capacity, credentials and the configured archive command result.",
      "Repair the archive destination or command through the backup/recovery runbook, then verify a newer successful archive.",
      docs.monitoring));
  }

  if (number(wal.wal_buffers_full) > 0 || number(checkpointer.num_requested) > number(checkpointer.num_timed) * 0.25 && number(checkpointer.num_requested) >= 10) {
    findings.push(finding("wal-checkpoint", "MEDIUM", "WAL", "WAL or checkpoint pressure needs interval confirmation",
      "Write bursts, full-page images, many maintained indexes, undersized WAL buffering, or requested checkpoints can concentrate write and sync work.",
      `${number(wal.wal_buffers_full).toLocaleString()} cumulative WAL buffer-full events; ${number(checkpointer.num_requested).toLocaleString()} requested checkpoints.`,
      "Write and fsync bursts can raise commit and query latency.",
      "Capture two snapshots around the incident and calculate per-second deltas; correlate them with statement WAL and storage latency.",
      "Reduce avoidable write/index amplification first, then tune WAL/checkpoint settings only from measured interval evidence.",
      docs.monitoring));
  }

  if (settings.track_io_timing === "off") {
    findings.push(finding("io-observability", "LOW", "OBSERVABILITY", "I/O timing is disabled",
      "track_io_timing is off, so PostgreSQL cannot attribute read/write time in several statistics and EXPLAIN outputs.",
      "pg_settings reports track_io_timing = off.",
      "Diagnosis can distinguish block counts but not database-observed I/O time.",
      "Measure timer overhead on this platform and review the organization’s observability policy.",
      "Enable only through approved configuration change if measured overhead is acceptable; OS tools remain useful either way.",
      docs.monitoring));
  }

  if (number(statementCapacity.dealloc) > 0) {
    findings.push(finding("statement-eviction", "LOW", "OBSERVABILITY", "pg_stat_statements has evicted entries",
      "The extension reached its tracked-statement capacity and deallocated least-executed entries.",
      `${number(statementCapacity.dealloc).toLocaleString()} deallocation event(s) are recorded since ${statementCapacity.stats_reset || "the statistics reset"}.`,
      "Rare or older statements can disappear, weakening regression and long-window workload analysis.",
      "Compare deallocation growth over an interval with query churn and pg_stat_statements.max.",
      "Reduce unbounded query-text variation or review capacity through normal configuration change; never reset statistics as a tuning shortcut.",
      docs.statements));
  }

  const failed = checks.filter((item) => !item.ok && !item.skipped);
  if (failed.some((item) => item.id === "statements")) {
    findings.push(finding("statements-unavailable", "LOW", "OBSERVABILITY", "pg_stat_statements evidence is unavailable",
      "The extension may not be installed, preloaded, created in this database, or visible to the diagnostic account.",
      "The statement-impact check failed independently; all other checks continued.",
      "Total-impact ranking and normalized query history are incomplete.",
      "Review the returned database error and shared_preload_libraries with the DBA.",
      "Enable pg_stat_statements only through the approved extension and restart process; do not reset production statistics for this investigation.",
      docs.statements));
  }

  if (!findings.some((item) => severityRank[item.severity] >= severityRank.MEDIUM)) {
    findings.push(finding("no-dominant-signal", "INFO", "SNAPSHOT", "No dominant bottleneck in this snapshot",
      "The incident may be intermittent, statement-specific, outside PostgreSQL, or absent during collection.",
      `${working} working and ${waiting} waiting session(s) were visible when evidence was collected.`,
      "A quiet snapshot cannot prove that the application query is healthy.",
      "Capture the same scan during the incident, then obtain EXPLAIN (ANALYZE, BUFFERS, SETTINGS) safely for the exact statement and parameters.",
      "Compare repeatable before/after evidence including p50, p95 and p99 latency.",
      docs.explain));
  }

  findings.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || a.area.localeCompare(b.area));
  const pressureScore = Math.min(100, findings.reduce((sum, item) => sum + severityWeight[item.severity], 0));
  const completed = checks.filter((item) => item.ok).length;
  const skipped = checks.filter((item) => item.skipped).length;
  const critical = findings.filter((item) => item.severity === "CRITICAL").length;
  const high = findings.filter((item) => item.severity === "HIGH").length;
  const dominantMode = blockers.length || waiting > working ? "WAITING" : working > waiting ? "WORKING" : working || waiting ? "MIXED" : "QUIET";
  const primary = findings.find((item) => severityRank[item.severity] >= severityRank.MEDIUM)?.title || "No dominant signal";
  const areaOrder = ["SQL FOCUS", "LOCKS", "TRANSACTIONS", "I/O", "MEMORY", "MAINTENANCE", "VACUUM", "WAL", "REPLICATION", "CONNECTIONS", "QUERY SHAPE", "PLANS", "INDEXES", "WRITE PATH", "OBSERVABILITY"];
  const pressureMap = areaOrder.map((area) => {
    const areaFindings = findings.filter((item) => item.area === area);
    const score = Math.min(100, areaFindings.reduce((sum, item) => sum + severityWeight[item.severity], 0) * 2);
    const severity = [...areaFindings].sort((a, b) => severityRank[b.severity] - severityRank[a.severity])[0]?.severity || "CLEAR";
    return { area, score, count: areaFindings.length, severity };
  }).filter((item) => item.count > 0).sort((a, b) => b.score - a.score || b.count - a.count).slice(0, 8);
  return {
    pressureScore,
    dominantMode,
    primary,
    critical,
    high,
    completed,
    skipped,
    failed: failed.length,
    total: checks.length,
    findings,
    focusQueryId,
    focusedStatement: Object.keys(focusedStatement).length ? focusedStatement : null,
    pressureMap,
    docs,
  };
}
