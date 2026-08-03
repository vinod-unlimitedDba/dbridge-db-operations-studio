const docs = {
  mysql: {
    performance: "https://dev.mysql.com/doc/refman/8.4/en/performance-schema.html",
    digest: "https://dev.mysql.com/doc/refman/8.4/en/performance-schema-statement-digests.html",
    innodb: "https://dev.mysql.com/doc/refman/8.4/en/innodb-performance-schema.html",
  },
  mariadb: {
    performance: "https://mariadb.com/docs/server/reference/system-tables/performance-schema",
    digest: "https://mariadb.com/docs/server/reference/system-tables/performance-schema/performance-schema-tables/performance-schema-events_statements_summary_by_digest-table",
    innodb: "https://mariadb.com/docs/server/ha-and-performance/optimization-and-tuning/system-variables/innodb-status-variables",
  },
  sqlserver: {
    performance: "https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/system-dynamic-management-views",
    waits: "https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-os-wait-stats-transact-sql",
    queryStore: "https://learn.microsoft.com/en-us/sql/relational-databases/performance/monitoring-performance-by-using-the-query-store",
  },
};

const mysqlBaseCatalog = [
  {
    id: "environment", label: "Server identity & instrumentation", phase: "CONTEXT",
    guidance: "Capture product, version, host, port, database and Performance Schema state before interpreting cumulative counters.",
    sql: "select version() version, @@version_comment version_comment, @@hostname hostname, @@port port, database() database_name, @@performance_schema performance_schema, (select variable_value from performance_schema.global_status where variable_name='Uptime') uptime_seconds",
  },
  {
    id: "connections", label: "Connection & thread capacity", phase: "WORKLOAD",
    guidance: "Compare connected and running threads with the configured limit before changing pool or server capacity.",
    sql: `select
      (select count(*) from performance_schema.threads where processlist_id is not null) current_connections,
      (select count(*) from performance_schema.threads where processlist_id is not null and processlist_command<>'Sleep') running_connections,
      @@max_connections max_connections,
      round(100*(select count(*) from performance_schema.threads where processlist_id is not null)/nullif(@@max_connections,0),2) connection_use_pct`,
  },
  {
    id: "activity", label: "Live non-idle workload", phase: "WORKLOAD",
    guidance: "Rank live statements by runtime, state and transaction age. The collector never kills a thread.",
    sql: `select processlist_id connection_id, processlist_user user_name, processlist_host client_host,
      processlist_db database_name, processlist_command command_name, processlist_time runtime_seconds,
      processlist_state state_name, left(processlist_info,1000) statement_text
    from performance_schema.threads
    where processlist_id is not null and processlist_command<>'Sleep'
    order by processlist_time desc limit 50`,
  },
  {
    id: "dataLocks", label: "InnoDB row-lock waits", phase: "CONCURRENCY",
    guidance: "Map requesting and blocking transactions before coordinating any remediation.",
    sql: `select r.trx_mysql_thread_id waiting_thread, r.trx_started waiting_since, r.trx_query waiting_query,
      b.trx_mysql_thread_id blocking_thread, b.trx_started blocking_since, b.trx_query blocking_query
    from information_schema.innodb_lock_waits w
    join information_schema.innodb_trx r on r.trx_id=w.requesting_trx_id
    join information_schema.innodb_trx b on b.trx_id=w.blocking_trx_id
    order by r.trx_started limit 50`,
  },
  {
    id: "metadataLocks", label: "Metadata-lock pressure", phase: "CONCURRENCY",
    guidance: "Identify pending metadata locks and their object scope before investigating DDL or long transactions.",
    sql: `select object_type, object_schema, object_name, lock_type, lock_duration, lock_status,
      owner_thread_id, owner_event_id
    from performance_schema.metadata_locks
    where lock_status='PENDING'
    order by object_schema, object_name limit 100`,
  },
  {
    id: "waitProfile", label: "Global wait-event profile", phase: "WAITS",
    guidance: "Use two snapshots to calculate interval deltas because summary waits are cumulative.",
    sql: `select event_name, count_star,
      round(sum_timer_wait/1000000000000,3) total_seconds,
      round(avg_timer_wait/1000000000,3) average_ms,
      round(max_timer_wait/1000000000,3) maximum_ms
    from performance_schema.events_waits_summary_global_by_event_name
    where count_star>0 and event_name not like 'idle%'
    order by sum_timer_wait desc limit 30`,
  },
  {
    id: "topDigests", label: "Top statement digests", phase: "SQL",
    guidance: "Rank normalized statements by total impact, then compare rows examined, temporary work, errors and index signals.",
    sql: `select schema_name, digest, count_star executions,
      round(sum_timer_wait/1000000000,3) total_ms,
      round(avg_timer_wait/1000000000,3) average_ms,
      sum_rows_examined, sum_rows_sent, sum_created_tmp_disk_tables, sum_errors,
      sum_no_index_used, sum_no_good_index_used, left(digest_text,1000) digest_text
    from performance_schema.events_statements_summary_by_digest
    where digest is not null order by sum_timer_wait desc limit 40`,
  },
  {
    id: "focusedDigest", label: "Focused statement digest", phase: "SQL", requiresIdentifier: true,
    guidance: "Inspect the selected normalized digest without executing its representative SQL.",
    sql: `select schema_name, digest, count_star executions,
      round(sum_timer_wait/1000000000,3) total_ms,
      round(avg_timer_wait/1000000000,3) average_ms,
      round(max_timer_wait/1000000000,3) maximum_ms,
      sum_lock_time, sum_rows_affected, sum_rows_sent, sum_rows_examined,
      sum_created_tmp_tables, sum_created_tmp_disk_tables, sum_sort_rows,
      sum_no_index_used, sum_no_good_index_used, sum_errors, sum_warnings,
      first_seen, last_seen, left(digest_text,1000) digest_text
    from performance_schema.events_statements_summary_by_digest
    where digest='__IDENTIFIER__' limit 10`,
  },
  {
    id: "bufferPool", label: "InnoDB buffer-pool efficiency", phase: "MEMORY",
    guidance: "Separate a cold cache from persistent misses and scan-heavy SQL before changing memory.",
    sql: `select
      max(case when variable_name='Innodb_buffer_pool_read_requests' then variable_value+0 end) read_requests,
      max(case when variable_name='Innodb_buffer_pool_reads' then variable_value+0 end) disk_reads,
      max(case when variable_name='Innodb_buffer_pool_pages_dirty' then variable_value+0 end) dirty_pages,
      max(case when variable_name='Innodb_buffer_pool_pages_free' then variable_value+0 end) free_pages,
      round(100*(1-max(case when variable_name='Innodb_buffer_pool_reads' then variable_value+0 end)/
        nullif(max(case when variable_name='Innodb_buffer_pool_read_requests' then variable_value+0 end),0)),3) hit_pct
    from performance_schema.global_status
    where variable_name in ('Innodb_buffer_pool_read_requests','Innodb_buffer_pool_reads','Innodb_buffer_pool_pages_dirty','Innodb_buffer_pool_pages_free')`,
  },
  {
    id: "fileIo", label: "File I/O latency & volume", phase: "I/O",
    guidance: "Attribute wait time to exact data, log and temporary files before storage or query changes.",
    sql: `select file_name, event_name, count_read, count_write,
      round(sum_timer_read/1000000000000,3) read_seconds,
      round(sum_timer_write/1000000000000,3) write_seconds,
      round(case when count_read>0 then sum_timer_read/1000000000/count_read else 0 end,3) average_read_ms,
      round(case when count_write>0 then sum_timer_write/1000000000/count_write else 0 end,3) average_write_ms
    from performance_schema.file_summary_by_instance
    where count_read+count_write>0
    order by sum_timer_read+sum_timer_write desc limit 40`,
  },
  {
    id: "tableIo", label: "Hot table I/O & locks", phase: "I/O",
    guidance: "Find tables generating the most read, write and lock wait before reviewing access paths.",
    sql: `select object_schema, object_name, count_read, count_write,
      round(sum_timer_read/1000000000000,3) read_seconds,
      round(sum_timer_write/1000000000000,3) write_seconds,
      round(sum_timer_lock/1000000000000,3) lock_seconds
    from performance_schema.table_io_waits_summary_by_table
    where object_schema not in ('mysql','performance_schema','information_schema','sys')
    order by sum_timer_wait desc limit 50`,
  },
  {
    id: "tempAndSorts", label: "Temporary-table & sort pressure", phase: "MEMORY",
    guidance: "Measure disk temporary-table ratio and merge passes before changing per-session memory.",
    sql: `select
      max(case when variable_name='Created_tmp_tables' then variable_value+0 end) temporary_tables,
      max(case when variable_name='Created_tmp_disk_tables' then variable_value+0 end) disk_temporary_tables,
      round(100*max(case when variable_name='Created_tmp_disk_tables' then variable_value+0 end)/
        nullif(max(case when variable_name='Created_tmp_tables' then variable_value+0 end),0),2) disk_temp_pct,
      max(case when variable_name='Sort_merge_passes' then variable_value+0 end) sort_merge_passes,
      max(case when variable_name='Select_full_join' then variable_value+0 end) full_joins,
      max(case when variable_name='Select_scan' then variable_value+0 end) full_scans
    from performance_schema.global_status
    where variable_name in ('Created_tmp_tables','Created_tmp_disk_tables','Sort_merge_passes','Select_full_join','Select_scan')`,
  },
  {
    id: "memory", label: "Instrumented memory consumers", phase: "MEMORY",
    guidance: "Rank instrumented current and high-water allocations. Coverage depends on enabled instruments.",
    sql: `select event_name, current_count_used, current_number_of_bytes_used,
      high_count_used, high_number_of_bytes_used
    from performance_schema.memory_summary_global_by_event_name
    where current_number_of_bytes_used>0
    order by current_number_of_bytes_used desc limit 40`,
  },
  {
    id: "tables", label: "Table & index capacity", phase: "CAPACITY",
    guidance: "Rank allocated data, index and free space before partitioning or storage changes.",
    sql: `select table_schema, table_name, engine, table_rows,
      round(data_length/1048576,1) data_mb, round(index_length/1048576,1) index_mb,
      round(data_free/1048576,1) free_mb, round((data_length+index_length)/1048576,1) total_mb
    from information_schema.tables
    where table_type='BASE TABLE' and table_schema not in ('mysql','performance_schema','information_schema','sys')
    order by data_length+index_length desc limit 100`,
  },
  {
    id: "indexSignals", label: "Index-use signals", phase: "PLAN",
    guidance: "Treat no-index counters as candidates only; validate plans, selectivity, consolidation and write cost.",
    sql: `select object_schema, object_name, index_name, count_read, count_write,
      count_fetch, count_insert, count_update, count_delete
    from performance_schema.table_io_waits_summary_by_index_usage
    where object_schema not in ('mysql','performance_schema','information_schema','sys')
    order by count_write desc, count_read asc limit 100`,
  },
  {
    id: "replication", label: "Replication channel health", phase: "REPLICATION",
    guidance: "Review receiver/applier state, last errors and lag with topology ownership before failover decisions.",
    sql: "show replica status",
  },
  {
    id: "errors", label: "Statement error summary", phase: "RELIABILITY",
    guidance: "Correlate recent error counts with application and server logs; counters may be cumulative.",
    sql: `select error_number, error_name, sql_state, sum_error_raised, sum_error_handled,
      first_seen, last_seen
    from performance_schema.events_errors_summary_global_by_error
    where sum_error_raised>0 order by sum_error_raised desc limit 40`,
  },
  {
    id: "settings", label: "Performance-critical settings", phase: "CONTEXT",
    guidance: "Capture effective values before proposing a reviewed configuration change.",
    sql: `select variable_name, variable_value
    from performance_schema.global_variables
    where variable_name in ('max_connections','innodb_buffer_pool_size','innodb_redo_log_capacity',
      'innodb_log_file_size','tmp_table_size','max_heap_table_size','performance_schema',
      'slow_query_log','long_query_time','binlog_format','sync_binlog','innodb_flush_log_at_trx_commit')
    order by variable_name`,
  },
];

export const mysqlBottleneckCatalog = mysqlBaseCatalog.map((item) => item.id === "dataLocks" ? {
  ...item,
  sql: `select w.requesting_thread_id waiting_thread, w.requesting_event_id waiting_event,
    r.object_schema, r.object_name, r.index_name, r.lock_type waiting_lock_type,
    r.lock_mode waiting_lock_mode, w.blocking_thread_id blocking_thread,
    w.blocking_event_id blocking_event, b.lock_type blocking_lock_type, b.lock_mode blocking_lock_mode
  from performance_schema.data_lock_waits w
  left join performance_schema.data_locks r on r.engine_lock_id=w.requesting_engine_lock_id
  left join performance_schema.data_locks b on b.engine_lock_id=w.blocking_engine_lock_id
  order by w.requesting_thread_id limit 50`,
} : { ...item });

export const mariadbBottleneckCatalog = mysqlBaseCatalog.map((item) => {
  if (item.id === "environment") return {
    ...item,
    sql: "select version() version, @@version_comment version_comment, @@hostname hostname, @@port port, database() database_name, @@performance_schema performance_schema, @@max_connections max_connections",
  };
  if (item.id === "bufferPool") return {
    ...item,
    sql: `select
      max(case when variable_name='INNODB_BUFFER_POOL_READ_REQUESTS' then variable_value+0 end) read_requests,
      max(case when variable_name='INNODB_BUFFER_POOL_READS' then variable_value+0 end) disk_reads,
      max(case when variable_name='INNODB_BUFFER_POOL_PAGES_DIRTY' then variable_value+0 end) dirty_pages,
      max(case when variable_name='INNODB_BUFFER_POOL_PAGES_FREE' then variable_value+0 end) free_pages,
      round(100*(1-max(case when variable_name='INNODB_BUFFER_POOL_READS' then variable_value+0 end)/
        nullif(max(case when variable_name='INNODB_BUFFER_POOL_READ_REQUESTS' then variable_value+0 end),0)),3) hit_pct
    from information_schema.global_status
    where variable_name in ('INNODB_BUFFER_POOL_READ_REQUESTS','INNODB_BUFFER_POOL_READS','INNODB_BUFFER_POOL_PAGES_DIRTY','INNODB_BUFFER_POOL_PAGES_FREE')`,
  };
  if (item.id === "tempAndSorts") return {
    ...item,
    sql: `select
      max(case when variable_name='CREATED_TMP_TABLES' then variable_value+0 end) temporary_tables,
      max(case when variable_name='CREATED_TMP_DISK_TABLES' then variable_value+0 end) disk_temporary_tables,
      round(100*max(case when variable_name='CREATED_TMP_DISK_TABLES' then variable_value+0 end)/
        nullif(max(case when variable_name='CREATED_TMP_TABLES' then variable_value+0 end),0),2) disk_temp_pct,
      max(case when variable_name='SORT_MERGE_PASSES' then variable_value+0 end) sort_merge_passes,
      max(case when variable_name='SELECT_FULL_JOIN' then variable_value+0 end) full_joins,
      max(case when variable_name='SELECT_SCAN' then variable_value+0 end) full_scans
    from information_schema.global_status
    where variable_name in ('CREATED_TMP_TABLES','CREATED_TMP_DISK_TABLES','SORT_MERGE_PASSES','SELECT_FULL_JOIN','SELECT_SCAN')`,
  };
  if (item.id === "replication") return { ...item, sql: "show all slaves status" };
  if (item.id === "errors") return {
    ...item,
    label: "Aborted connections & server errors",
    sql: `select variable_name, variable_value
      from information_schema.global_status
      where variable_name in ('ABORTED_CLIENTS','ABORTED_CONNECTS','CONNECTION_ERRORS_INTERNAL',
        'CONNECTION_ERRORS_MAX_CONNECTIONS','INNODB_DEADLOCKS') order by variable_name`,
  };
  if (item.id === "settings") return {
    ...item,
    sql: `select variable_name, variable_value
      from information_schema.global_variables
      where variable_name in ('MAX_CONNECTIONS','INNODB_BUFFER_POOL_SIZE','INNODB_LOG_FILE_SIZE',
        'TMP_TABLE_SIZE','MAX_HEAP_TABLE_SIZE','PERFORMANCE_SCHEMA','SLOW_QUERY_LOG',
        'LONG_QUERY_TIME','BINLOG_FORMAT','SYNC_BINLOG','INNODB_FLUSH_LOG_AT_TRX_COMMIT',
        'THREAD_HANDLING','WSREP_ON') order by variable_name`,
  };
  return { ...item };
});

export const sqlserverBottleneckCatalog = [
  {
    id: "environment", label: "Instance, edition & startup boundary", phase: "CONTEXT",
    guidance: "Capture edition, version, host, instance, database and startup time before interpreting cumulative DMVs.",
    sql: `select cast(serverproperty('ProductVersion') as nvarchar(128)) product_version,
      cast(serverproperty('ProductLevel') as nvarchar(128)) product_level,
      cast(serverproperty('Edition') as nvarchar(256)) edition,
      cast(serverproperty('MachineName') as nvarchar(256)) machine_name,
      cast(serverproperty('InstanceName') as nvarchar(256)) instance_name,
      db_name() database_name, sqlserver_start_time
    from sys.dm_os_sys_info`,
  },
  {
    id: "connections", label: "Session & worker capacity", phase: "WORKLOAD",
    guidance: "Compare user sessions, active requests and workers with configured limits before changing connection pools.",
    sql: `select
      (select count(*) from sys.dm_exec_sessions where is_user_process=1) current_connections,
      (select count(*) from sys.dm_exec_requests where session_id<>@@spid) running_connections,
      (select max_workers_count from sys.dm_os_sys_info) max_workers,
      (select count(*) from sys.dm_os_workers where state='RUNNING') running_workers,
      (select count(*) from sys.dm_os_workers where state='RUNNABLE') runnable_workers`,
  },
  {
    id: "activity", label: "Live request workload", phase: "WORKLOAD",
    guidance: "Rank executing requests by elapsed time, CPU, reads, writes, waits and blocking.",
    sql: `select top (60) r.session_id, r.request_id, r.status, r.command,
      r.cpu_time cpu_ms, r.total_elapsed_time elapsed_ms, r.logical_reads, r.reads, r.writes,
      r.wait_type, r.wait_time wait_ms, r.wait_resource, r.blocking_session_id,
      r.percent_complete, r.estimated_completion_time, db_name(r.database_id) database_name,
      left(t.text,1500) statement_text
    from sys.dm_exec_requests r
    outer apply sys.dm_exec_sql_text(r.sql_handle) t
    where r.session_id<>@@spid order by r.total_elapsed_time desc`,
  },
  {
    id: "blockers", label: "Blocking chains", phase: "CONCURRENCY",
    guidance: "Identify waiters, blockers and resources. The collector never terminates a session.",
    sql: `select top (60) r.session_id waiting_session, r.blocking_session_id blocking_session,
      r.wait_type, r.wait_time wait_ms, r.wait_resource, r.status,
      db_name(r.database_id) database_name, left(t.text,1500) waiting_sql
    from sys.dm_exec_requests r outer apply sys.dm_exec_sql_text(r.sql_handle) t
    where r.blocking_session_id>0 order by r.wait_time desc`,
  },
  {
    id: "currentWaits", label: "Current waiting tasks", phase: "WAITS",
    guidance: "Correlate current waits with session, blocker and resource instead of relying only on lifetime totals.",
    sql: `select top (80) session_id, wait_duration_ms, wait_type, blocking_session_id, resource_description
    from sys.dm_os_waiting_tasks
    where session_id>50 order by wait_duration_ms desc`,
  },
  {
    id: "waitProfile", label: "Instance wait profile", phase: "WAITS",
    guidance: "Wait statistics are cumulative since startup or reset; use two snapshots for interval deltas.",
    sql: `select top (35) wait_type, waiting_tasks_count, wait_time_ms,
      signal_wait_time_ms, wait_time_ms-signal_wait_time_ms resource_wait_ms,
      cast(wait_time_ms*100.0/nullif(sum(wait_time_ms) over(),0) as decimal(9,2)) wait_pct
    from sys.dm_os_wait_stats
    where wait_type not like 'SLEEP%' and wait_type not in
      ('BROKER_EVENTHANDLER','BROKER_RECEIVE_WAITFOR','BROKER_TASK_STOP','CLR_AUTO_EVENT',
       'CLR_MANUAL_EVENT','DISPATCHER_QUEUE_SEMAPHORE','FT_IFTS_SCHEDULER_IDLE_WAIT',
       'HADR_FILESTREAM_IOMGR_IOCOMPLETION','LAZYWRITER_SLEEP','LOGMGR_QUEUE',
       'QDS_PERSIST_TASK_MAIN_LOOP_SLEEP','REQUEST_FOR_DEADLOCK_SEARCH','SQLTRACE_BUFFER_FLUSH',
       'XE_DISPATCHER_WAIT','XE_TIMER_EVENT') and waiting_tasks_count>0
    order by wait_time_ms desc`,
  },
  {
    id: "schedulers", label: "CPU scheduler pressure", phase: "CPU",
    guidance: "Sustained runnable queues indicate CPU demand; verify across multiple schedulers and intervals.",
    sql: `select scheduler_id, cpu_id, status, is_online, current_tasks_count, runnable_tasks_count,
      active_workers_count, work_queue_count, load_factor, yield_count
    from sys.dm_os_schedulers where status='VISIBLE ONLINE' order by runnable_tasks_count desc`,
  },
  {
    id: "memory", label: "OS, process & clerk memory", phase: "MEMORY",
    guidance: "Correlate low-memory indicators with available OS memory and dominant SQL Server clerks.",
    sql: `select 'PROCESS' scope_name, cast(physical_memory_in_use_kb as bigint) used_kb,
      cast(available_commit_limit_kb as bigint) available_kb,
      cast(process_physical_memory_low as int) physical_low,
      cast(process_virtual_memory_low as int) virtual_low, cast(null as nvarchar(256)) detail
    from sys.dm_os_process_memory
    union all
    select 'SYSTEM', total_physical_memory_kb-available_physical_memory_kb,
      available_physical_memory_kb, cast(system_low_memory_signal_state as int),
      cast(system_high_memory_signal_state as int), system_memory_state_desc
    from sys.dm_os_sys_memory`,
  },
  {
    id: "memoryClerks", label: "Top memory clerks", phase: "MEMORY",
    guidance: "Rank memory ownership before attributing pressure to the buffer pool or plan cache.",
    sql: `select top (40) type, name, sum(pages_kb) pages_kb,
      sum(virtual_memory_committed_kb) virtual_committed_kb,
      sum(awe_allocated_kb) awe_kb
    from sys.dm_os_memory_clerks group by type,name order by sum(pages_kb) desc`,
  },
  {
    id: "fileIo", label: "Database-file I/O latency", phase: "I/O",
    guidance: "Compare read/write latency per file and validate against host storage in the same interval.",
    sql: `select top (50) db_name(v.database_id) database_name, m.name logical_name,
      m.type_desc, m.physical_name, v.num_of_reads,
      cast(v.io_stall_read_ms*1.0/nullif(v.num_of_reads,0) as decimal(18,2)) average_read_ms,
      v.num_of_writes,
      cast(v.io_stall_write_ms*1.0/nullif(v.num_of_writes,0) as decimal(18,2)) average_write_ms,
      cast(v.size_on_disk_bytes/1048576.0 as decimal(18,1)) size_mb
    from sys.dm_io_virtual_file_stats(null,null) v
    join sys.master_files m on m.database_id=v.database_id and m.file_id=v.file_id
    order by coalesce(v.io_stall_read_ms/nullif(v.num_of_reads,0),0)+
      coalesce(v.io_stall_write_ms/nullif(v.num_of_writes,0),0) desc`,
  },
  {
    id: "topQueries", label: "Top cached query impact", phase: "SQL",
    guidance: "Rank cached statements by total elapsed impact, then compare CPU, reads, executions and plan generation.",
    sql: `select top (40) convert(varchar(18),q.query_hash,1) query_hash,
      q.execution_count executions, q.total_elapsed_time/1000.0 total_ms,
      q.total_worker_time/1000.0 cpu_ms, q.total_logical_reads,
      q.total_physical_reads, q.total_rows, q.last_elapsed_time/1000.0 last_ms,
      q.last_execution_time, q.plan_generation_num, left(t.text,1500) statement_text
    from sys.dm_exec_query_stats q outer apply sys.dm_exec_sql_text(q.sql_handle) t
    order by q.total_elapsed_time desc`,
  },
  {
    id: "focusedQuery", label: "Focused query-hash profile", phase: "SQL", requiresIdentifier: true,
    guidance: "Aggregate cached entries for the selected query hash without executing the SQL.",
    sql: `select convert(varchar(18),q.query_hash,1) query_hash,
      sum(q.execution_count) executions, sum(q.total_elapsed_time)/1000.0 total_ms,
      sum(q.total_worker_time)/1000.0 cpu_ms, sum(q.total_logical_reads) logical_reads,
      sum(q.total_physical_reads) physical_reads, sum(q.total_rows) rows_processed,
      max(q.last_elapsed_time)/1000.0 maximum_last_ms,
      min(q.creation_time) first_cached, max(q.last_execution_time) last_execution,
      max(q.plan_generation_num) maximum_plan_generation
    from sys.dm_exec_query_stats q
    where q.query_hash=convert(varbinary(8),'__IDENTIFIER__',1)
    group by q.query_hash`,
  },
  {
    id: "queryStore", label: "Query Store state & capture policy", phase: "HISTORY",
    guidance: "Inspect Query Store status only. The collector never enables Query Store or forces a plan.",
    sql: `select actual_state_desc, desired_state_desc, readonly_reason,
      current_storage_size_mb, max_storage_size_mb, query_capture_mode_desc,
      size_based_cleanup_mode_desc, stale_query_threshold_days,
      wait_stats_capture_mode_desc
    from sys.database_query_store_options`,
  },
  {
    id: "queryStoreRegressions", label: "Recent Query Store regressions", phase: "HISTORY",
    guidance: "Compare recent and prior runtime intervals before considering plan forcing or SQL changes.",
    sql: `with recent as (
      select rs.plan_id, avg(rs.avg_duration) recent_duration, sum(rs.count_executions) executions
      from sys.query_store_runtime_stats rs
      join sys.query_store_runtime_stats_interval i on i.runtime_stats_interval_id=rs.runtime_stats_interval_id
      where i.end_time>dateadd(hour,-1,sysdatetimeoffset()) group by rs.plan_id
    ), prior as (
      select rs.plan_id, avg(rs.avg_duration) prior_duration
      from sys.query_store_runtime_stats rs
      join sys.query_store_runtime_stats_interval i on i.runtime_stats_interval_id=rs.runtime_stats_interval_id
      where i.end_time between dateadd(hour,-25,sysdatetimeoffset()) and dateadd(hour,-1,sysdatetimeoffset())
      group by rs.plan_id
    )
    select top (30) q.query_id, p.plan_id, r.executions,
      r.recent_duration/1000.0 recent_ms, pr.prior_duration/1000.0 prior_ms,
      cast(r.recent_duration/nullif(pr.prior_duration,0) as decimal(18,2)) regression_ratio,
      p.is_forced_plan, p.force_failure_count, left(qt.query_sql_text,1500) query_text
    from recent r join prior pr on pr.plan_id=r.plan_id
    join sys.query_store_plan p on p.plan_id=r.plan_id
    join sys.query_store_query q on q.query_id=p.query_id
    join sys.query_store_query_text qt on qt.query_text_id=q.query_text_id
    where r.recent_duration>pr.prior_duration*1.5
    order by regression_ratio desc`,
  },
  {
    id: "tempdb", label: "TempDB allocation pressure", phase: "MEMORY",
    guidance: "Separate user objects, internal objects and version store before changing TempDB or query memory.",
    sql: `select
      sum(user_object_reserved_page_count)*8/1024.0 user_objects_mb,
      sum(internal_object_reserved_page_count)*8/1024.0 internal_objects_mb,
      sum(version_store_reserved_page_count)*8/1024.0 version_store_mb,
      sum(unallocated_extent_page_count)*8/1024.0 free_mb,
      sum(mixed_extent_page_count)*8/1024.0 mixed_mb
    from tempdb.sys.dm_db_file_space_usage`,
  },
  {
    id: "logSpace", label: "Transaction-log headroom", phase: "CAPACITY",
    guidance: "Review used percentage, total size and reuse wait before log growth or recovery-model changes.",
    sql: `select d.name database_name, d.recovery_model_desc, d.log_reuse_wait_desc,
      cast(ls.total_log_size_in_bytes/1048576.0 as decimal(18,1)) total_log_mb,
      cast(ls.used_log_space_in_bytes/1048576.0 as decimal(18,1)) used_log_mb,
      cast(ls.used_log_space_in_percent as decimal(9,2)) used_log_pct
    from sys.databases d
    cross apply sys.dm_db_log_stats(d.database_id) ls
    where d.state_desc='ONLINE' order by ls.used_log_space_in_percent desc`,
  },
  {
    id: "indexUsage", label: "Index read/write balance", phase: "PLAN",
    guidance: "Use seeks, scans, lookups and updates as evidence; verify uptime, constraints and workload cycles before removal.",
    sql: `select top (100) object_schema_name(i.object_id,db_id()) schema_name,
      object_name(i.object_id,db_id()) table_name, i.name index_name, i.type_desc,
      coalesce(u.user_seeks,0) user_seeks, coalesce(u.user_scans,0) user_scans,
      coalesce(u.user_lookups,0) user_lookups, coalesce(u.user_updates,0) user_updates
    from sys.indexes i
    left join sys.dm_db_index_usage_stats u on u.database_id=db_id() and u.object_id=i.object_id and u.index_id=i.index_id
    where i.object_id>100 and i.index_id>0
    order by coalesce(u.user_updates,0) desc, coalesce(u.user_seeks,0)+coalesce(u.user_scans,0) asc`,
  },
  {
    id: "missingIndexes", label: "Missing-index candidates", phase: "PLAN",
    guidance: "Treat DMV suggestions as workload signals; consolidate overlaps and measure write/storage cost before creation.",
    sql: `select top (50) db_name(d.database_id) database_name,
      object_schema_name(d.object_id,d.database_id) schema_name,
      object_name(d.object_id,d.database_id) table_name,
      s.user_seeks, s.user_scans, s.avg_total_user_cost, s.avg_user_impact,
      d.equality_columns, d.inequality_columns, d.included_columns,
      cast(s.avg_total_user_cost*s.avg_user_impact*(s.user_seeks+s.user_scans) as decimal(28,1)) impact_score
    from sys.dm_db_missing_index_group_stats s
    join sys.dm_db_missing_index_groups g on g.index_group_handle=s.group_handle
    join sys.dm_db_missing_index_details d on d.index_handle=g.index_handle
    order by impact_score desc`,
  },
  {
    id: "statistics", label: "Optimizer statistics freshness", phase: "PLAN",
    guidance: "Find old or heavily modified statistics, then validate the first incorrect plan estimate before updating.",
    sql: `select top (100) object_schema_name(st.object_id) schema_name,
      object_name(st.object_id) table_name, st.name statistics_name,
      p.last_updated, p.rows, p.rows_sampled, p.modification_counter,
      cast(100.0*p.modification_counter/nullif(p.rows,0) as decimal(9,2)) modified_pct
    from sys.stats st outer apply sys.dm_db_stats_properties(st.object_id,st.stats_id) p
    where st.object_id>100 order by p.modification_counter desc`,
  },
  {
    id: "hadr", label: "Availability-group health", phase: "REPLICATION",
    guidance: "Review synchronization, queue and health state with the HA owner before any failover decision.",
    sql: `select ar.replica_server_name, ag.name availability_group,
      db_name(drs.database_id) database_name, ars.role_desc, ars.operational_state_desc,
      ars.connected_state_desc, ars.synchronization_health_desc,
      drs.synchronization_state_desc, drs.synchronization_health_desc database_health,
      drs.log_send_queue_size, drs.redo_queue_size, drs.last_commit_time
    from sys.dm_hadr_availability_replica_states ars
    join sys.availability_replicas ar on ar.replica_id=ars.replica_id
    join sys.availability_groups ag on ag.group_id=ar.group_id
    left join sys.dm_hadr_database_replica_states drs on drs.replica_id=ars.replica_id
    order by ag.name, ar.replica_server_name, database_name`,
  },
  {
    id: "capacity", label: "Database file capacity", phase: "CAPACITY",
    guidance: "Review allocated size, growth policy and maximum size before a storage change.",
    sql: `select db_name(database_id) database_name, name logical_name, type_desc, physical_name,
      cast(size/128.0 as decimal(18,1)) size_mb, growth, is_percent_growth, max_size
    from sys.master_files order by size desc`,
  },
];

export const relationalBottleneckCatalogs = {
  mysql: mysqlBottleneckCatalog,
  mariadb: mariadbBottleneckCatalog,
  sqlserver: sqlserverBottleneckCatalog,
};

const severityWeight = { CRITICAL: 100, HIGH: 72, MEDIUM: 42, INFO: 12 };
const areas = ["Concurrency", "CPU & Memory", "I/O & Temp", "SQL & Plans", "Capacity", "Replication"];

function number(value) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
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

function finding(id, severity, area, title, cause, evidence, impact, verify, action, doc, confidence = "Measured") {
  return { id, severity, area, title, cause, evidence, impact, verify, action, doc, confidence };
}

function addMysqlFindings(engine, map, findings) {
  const sourceDocs = docs[engine];
  const connections = firstFor(map, "connections");
  const activity = rowsFor(map, "activity");
  const blockers = rowsFor(map, "dataLocks");
  const metadataLocks = rowsFor(map, "metadataLocks");
  const waits = rowsFor(map, "waitProfile");
  const buffer = firstFor(map, "bufferPool");
  const temp = firstFor(map, "tempAndSorts");
  const files = rowsFor(map, "fileIo");
  const digests = rowsFor(map, "topDigests");
  const focused = firstFor(map, "focusedDigest");
  const replicas = rowsFor(map, "replication");

  const connectionUse = number(connections.connection_use_pct);
  if (connectionUse >= 80) findings.push(finding(
    "connection-capacity", connectionUse >= 95 ? "CRITICAL" : "HIGH", "Concurrency",
    "Connection capacity has limited headroom",
    "Pool sizing, connection leakage, sleeping sessions or database latency is consuming the configured connection limit.",
    `${number(connections.current_connections)} of ${number(connections.max_connections)} connections (${connectionUse.toFixed(1)}%); ${number(connections.running_connections)} currently running.`,
    "New requests can queue or fail and amplify an existing latency incident.",
    "Compare application pool totals, sleeping-session age and connection rate across two snapshots.",
    "Correct pool lifecycle or workload pressure first; change max_connections only after memory and thread-capacity validation.",
    sourceDocs.performance,
  ));

  if (blockers.length || metadataLocks.length) findings.push(finding(
    "blocking", blockers.some((row) => number(row.waiting_seconds) >= 300) ? "CRITICAL" : "HIGH", "Concurrency",
    "Live row or metadata blocking is present",
    "An open transaction or DDL path owns a conflicting row or metadata lock.",
    `${blockers.length} InnoDB row-lock wait(s) and ${metadataLocks.length} pending metadata lock(s).`,
    "Waiters retain connections and can cause application-wide queue growth.",
    "Confirm blocker thread, transaction age, object and owning business operation before coordinating remediation.",
    "Fix the transaction or deployment boundary under change control. DBridge never kills a connection.",
    sourceDocs.performance,
  ));

  const longest = Math.max(0, ...activity.map((row) => number(row.runtime_seconds)));
  if (longest >= 60) findings.push(finding(
    "long-running", longest >= 600 ? "HIGH" : "MEDIUM", "SQL & Plans",
    "Long-running live statement needs correlation",
    "A large scan, lock wait, inefficient plan, maintenance task or external dependency is retaining a server thread.",
    `${activity.length} active statement(s); longest runtime ${longest.toFixed(0)} seconds.`,
    "Long work can increase concurrency, undo/history retention and replication lag.",
    "Match the thread to its transaction, wait state, digest, execution plan and application owner.",
    "Tune or reschedule only after ownership and progress are confirmed; do not cancel from this snapshot.",
    sourceDocs.digest,
  ));

  const hit = number(buffer.hit_pct);
  if (hit > 0 && hit < 99) findings.push(finding(
    "buffer-pool", hit < 95 ? "HIGH" : "MEDIUM", "CPU & Memory",
    "InnoDB buffer-pool misses need review",
    "The workload is reading pages from storage because of a cold cache, scan-heavy access, working-set pressure or insufficient buffer headroom.",
    `${hit.toFixed(2)}% cumulative buffer hit; ${number(buffer.disk_reads).toLocaleString()} physical reads from ${number(buffer.read_requests).toLocaleString()} requests.`,
    "Physical reads add latency and storage load and can raise connection concurrency.",
    "Compare interval deltas and top table/file/statement reads; distinguish startup warmup from sustained misses.",
    "Reduce unnecessary scans first, then test memory sizing with host headroom and peak concurrency.",
    sourceDocs.innodb,
  ));

  const diskTemp = number(temp.disk_temp_pct);
  if (diskTemp >= 20) findings.push(finding(
    "disk-temp", diskTemp >= 50 ? "HIGH" : "MEDIUM", "I/O & Temp",
    "Temporary work is frequently reaching disk",
    "Sort, grouping, DISTINCT or intermediate results exceed in-memory limits or process too many rows.",
    `${diskTemp.toFixed(1)}% of temporary tables reached disk; ${number(temp.sort_merge_passes).toLocaleString()} sort merge passes.`,
    "Disk temporary work adds latency and competes with data and redo I/O.",
    "Identify the responsible digests and plan operators before changing per-session memory.",
    "Reduce rows and improve the plan first; size memory using maximum concurrent sessions, not one query.",
    sourceDocs.performance,
  ));

  const worstFileMs = Math.max(0, ...files.map((row) => Math.max(number(row.average_read_ms), number(row.average_write_ms))));
  if (worstFileMs >= 20) findings.push(finding(
    "file-latency", worstFileMs >= 50 ? "HIGH" : "MEDIUM", "I/O & Temp",
    "Database file latency is elevated",
    "Storage contention, checkpoint/flush pressure or I/O-heavy access paths are delaying database work.",
    `Maximum cumulative average file latency is ${worstFileMs.toFixed(2)} ms.`,
    "Foreground response time and background flushing can both degrade.",
    "Calculate a short interval delta and compare exact files with host/storage latency and top I/O statements.",
    "Remediate the confirmed file path or excess I/O; do not resize cache from a lifetime average alone.",
    sourceDocs.innodb,
  ));

  const noIndex = digests.reduce((sum, row) => sum + number(row.sum_no_index_used) + number(row.sum_no_good_index_used), 0);
  if (noIndex > 0) findings.push(finding(
    "index-signals", "MEDIUM", "SQL & Plans",
    "Statement digests report missing index-use signals",
    "Some normalized statements scanned without a usable or selective index.",
    `${noIndex.toLocaleString()} cumulative no-index or no-good-index execution signal(s) among the top digests.`,
    "Rows examined, CPU and I/O can grow faster than returned rows.",
    "Inspect the actual plan, predicate selectivity, table size and existing overlapping indexes.",
    "Test a consolidated index or SQL rewrite with representative reads, writes, storage and maintenance cost.",
    sourceDocs.digest,
  ));

  if (focused.digest && (number(focused.average_ms) >= 500 || number(focused.sum_rows_examined) > number(focused.sum_rows_sent) * 100)) findings.push(finding(
    "focused-digest", number(focused.average_ms) >= 5000 ? "HIGH" : "MEDIUM", "SQL & Plans",
    "Focused digest has high per-execution work",
    "The current access path, row selectivity, locking or temporary work is expensive for each normalized execution.",
    `${number(focused.executions).toLocaleString()} executions; ${number(focused.average_ms).toFixed(2)} ms average; ${number(focused.sum_rows_examined).toLocaleString()} rows examined and ${number(focused.sum_rows_sent).toLocaleString()} sent.`,
    "The digest can dominate latency or capacity even at moderate call volume.",
    "Capture EXPLAIN ANALYZE in an approved test context and compare rows, loops, waits, temporary work and index choice.",
    "Test the smallest SQL/statistics/index correction outside production and compare latency plus row correctness.",
    sourceDocs.digest,
  ));

  const replicaIssue = replicas.find((row) => {
    const state = `${row.replica_io_running || row.slave_io_running || ""} ${row.replica_sql_running || row.slave_sql_running || ""}`;
    const lag = number(row.seconds_behind_source || row.seconds_behind_master);
    return /no/i.test(state) || lag >= 60 || row.last_io_error || row.last_sql_error;
  });
  if (replicaIssue) findings.push(finding(
    "replication", number(replicaIssue.seconds_behind_source || replicaIssue.seconds_behind_master) >= 300 ? "HIGH" : "MEDIUM", "Replication",
    "Replication channel needs attention",
    "Receiver/applier failure, workload pressure, network delay or a blocking transaction is delaying replicated changes.",
    `Reported lag ${number(replicaIssue.seconds_behind_source || replicaIssue.seconds_behind_master).toFixed(0)} seconds; receiver/applier state ${replicaIssue.replica_io_running || replicaIssue.slave_io_running || "unknown"}/${replicaIssue.replica_sql_running || replicaIssue.slave_sql_running || "unknown"}.`,
    "Read replicas can become stale and recovery objectives may be at risk.",
    "Confirm channel errors, relay/binlog positions, worker state, network and source transaction size.",
    "Follow the topology runbook; do not skip or reset replication events from this snapshot.",
    sourceDocs.performance,
  ));
}

function addSqlServerFindings(map, findings) {
  const connections = firstFor(map, "connections");
  const activity = rowsFor(map, "activity");
  const blockers = rowsFor(map, "blockers");
  const currentWaits = rowsFor(map, "currentWaits");
  const schedulers = rowsFor(map, "schedulers");
  const memory = rowsFor(map, "memory");
  const files = rowsFor(map, "fileIo");
  const focused = firstFor(map, "focusedQuery");
  const regressions = rowsFor(map, "queryStoreRegressions");
  const tempdb = firstFor(map, "tempdb");
  const logs = rowsFor(map, "logSpace");
  const hadr = rowsFor(map, "hadr");

  if (blockers.length || currentWaits.some((row) => number(row.blocking_session_id) > 0)) findings.push(finding(
    "blocking", blockers.some((row) => number(row.wait_ms) >= 300000) ? "CRITICAL" : "HIGH", "Concurrency",
    "Live blocking chain is delaying requests",
    "An open transaction owns an incompatible lock while other sessions queue behind it.",
    `${blockers.length} blocked request(s); longest measured block ${Math.max(0, ...blockers.map((row) => number(row.wait_ms) / 1000)).toFixed(1)} seconds.`,
    "Blocked requests retain workers and connections and can create an application-wide pile-up.",
    "Confirm the head blocker, transaction owner, wait resource, database and business operation.",
    "Correct the transaction boundary or application path under change control. DBridge never terminates a session.",
    docs.sqlserver.performance,
  ));

  const runnable = schedulers.reduce((sum, row) => sum + number(row.runnable_tasks_count), 0);
  const maxRunnable = Math.max(0, ...schedulers.map((row) => number(row.runnable_tasks_count)));
  if (runnable >= Math.max(4, schedulers.length) || maxRunnable >= 4) findings.push(finding(
    "scheduler-pressure", maxRunnable >= 10 ? "HIGH" : "MEDIUM", "CPU & Memory",
    "CPU scheduler queues are elevated",
    "Runnable database work is waiting for CPU because of expensive queries, compilation, parallelism or host contention.",
    `${runnable} runnable task(s) across ${schedulers.length} visible scheduler(s); busiest scheduler queue ${maxRunnable}.`,
    "Latency rises while sessions may show runnable rather than a resource wait.",
    "Confirm persistence across snapshots and correlate top worker time, host CPU, parallel requests and deployment activity.",
    "Tune the top CPU workload first; review MAXDOP or capacity only with measured concurrency and NUMA context.",
    docs.sqlserver.performance,
  ));

  if (memory.some((row) => number(row.physical_low) === 1 || (row.scope_name === "SYSTEM" && number(row.available_kb) < 1024 * 1024))) findings.push(finding(
    "memory-pressure", "HIGH", "CPU & Memory",
    "SQL Server or the host reports low-memory pressure",
    "The SQL Server process, operating system or competing processes have insufficient committed/physical headroom.",
    memory.map((row) => `${row.scope_name}: ${(number(row.available_kb) / 1024).toFixed(0)} MB available, low=${number(row.physical_low)}`).join("; "),
    "Cache churn, grants, compilation and paging can increase latency across unrelated workloads.",
    "Correlate clerks, grants, target/total server memory, OS consumers and recent configuration or workload changes.",
    "Remove the confirmed competing demand or test memory configuration with OS reserve; avoid cache-clearing commands.",
    docs.sqlserver.performance,
  ));

  const longest = Math.max(0, ...activity.map((row) => number(row.elapsed_ms)));
  if (longest >= 60000) findings.push(finding(
    "long-request", longest >= 600000 ? "HIGH" : "MEDIUM", "SQL & Plans",
    "Long-running request needs plan and wait correlation",
    "An inefficient plan, blocking, large operation, memory grant, external call or maintenance task is retaining resources.",
    `${activity.length} active request(s); longest elapsed ${(longest / 1000).toFixed(1)} seconds.`,
    "Workers, memory grants, TempDB, locks or log can remain occupied.",
    "Match query hash, plan, wait type, percent complete, blocker and application owner.",
    "Tune or reschedule only after ownership and progress are confirmed; do not kill from this snapshot.",
    docs.sqlserver.performance,
  ));

  const worstFileMs = Math.max(0, ...files.map((row) => Math.max(number(row.average_read_ms), number(row.average_write_ms))));
  if (worstFileMs >= 20) findings.push(finding(
    "file-latency", worstFileMs >= 50 ? "HIGH" : "MEDIUM", "I/O & Temp",
    "Database-file latency is elevated",
    "I/O-heavy plans, storage contention, log flushes or background work are delaying database files.",
    `Maximum cumulative average file latency is ${worstFileMs.toFixed(2)} ms.`,
    "Queries, checkpoints, recovery and log durability can be delayed.",
    "Calculate interval latency by file and compare it with host/storage data plus top physical-read statements.",
    "Reduce confirmed excess I/O or remediate the exact storage path; avoid moving all files from a lifetime average.",
    docs.sqlserver.performance,
  ));

  const tempUsed = number(tempdb.user_objects_mb) + number(tempdb.internal_objects_mb) + number(tempdb.version_store_mb);
  const tempFree = number(tempdb.free_mb);
  if (tempUsed > 0 && tempFree < tempUsed * 0.2) findings.push(finding(
    "tempdb-pressure", tempFree < tempUsed * 0.05 ? "HIGH" : "MEDIUM", "I/O & Temp",
    "TempDB has limited free headroom",
    "Large sorts, hashes, spills, row versioning or temporary objects are consuming TempDB.",
    `${tempUsed.toFixed(1)} MB used across user/internal/version-store allocations with ${tempFree.toFixed(1)} MB free.`,
    "Queries can slow, autogrow or fail while version cleanup and concurrent work compete.",
    "Attribute allocations to sessions, plans, spills and version-store transactions; confirm file growth and disk headroom.",
    "Reduce the responsible workload or size TempDB through reviewed capacity planning; do not shrink during an incident.",
    docs.sqlserver.performance,
  ));

  const logPressure = logs.find((row) => number(row.used_log_pct) >= 80);
  if (logPressure) findings.push(finding(
    "log-pressure", number(logPressure.used_log_pct) >= 95 ? "CRITICAL" : "HIGH", "Capacity",
    `Transaction log for ${logPressure.database_name || "a database"} has limited headroom`,
    `Log truncation is waiting on ${logPressure.log_reuse_wait_desc || "an unresolved reuse condition"} while active work consumes log space.`,
    `${number(logPressure.used_log_pct).toFixed(1)}% used (${number(logPressure.used_log_mb).toFixed(1)} of ${number(logPressure.total_log_mb).toFixed(1)} MB).`,
    "Transactions, backups, availability replicas or recovery can be disrupted if the log cannot reuse or grow.",
    "Confirm reuse wait, longest transaction, log backup chain, AG send queues, autogrowth and disk free space.",
    "Follow the database recovery/log runbook; do not change recovery model or shrink the log as an incident shortcut.",
    docs.sqlserver.performance,
  ));

  if (focused.query_hash && (number(focused.total_ms) / Math.max(number(focused.executions), 1) >= 500 || number(focused.logical_reads) / Math.max(number(focused.executions), 1) >= 100000)) findings.push(finding(
    "focused-query", "HIGH", "SQL & Plans",
    "Focused query hash has a high per-execution cost",
    "The cached plan, cardinality, parameter sensitivity, reads or waits consume substantial work per execution.",
    `${number(focused.executions).toLocaleString()} executions; ${(number(focused.total_ms) / Math.max(number(focused.executions), 1)).toFixed(1)} ms and ${(number(focused.logical_reads) / Math.max(number(focused.executions), 1)).toFixed(0)} logical reads per execution.`,
    "The query can dominate response time or capacity even at moderate frequency.",
    "Compare actual plan rows, memory grants, waits, parameter values and Query Store plan/runtime history.",
    "Test the smallest SQL/statistics/index correction outside production before considering a reviewed Query Store plan action.",
    docs.sqlserver.queryStore,
  ));

  if (regressions.length) findings.push(finding(
    "query-store-regression", regressions.some((row) => number(row.regression_ratio) >= 5) ? "HIGH" : "MEDIUM", "SQL & Plans",
    "Query Store reports recent runtime regressions",
    "A plan, parameter, statistics, data-volume or resource change increased recent duration relative to prior intervals.",
    `${regressions.length} plan(s) exceeded the 1.5x regression screen; maximum ratio ${Math.max(...regressions.map((row) => number(row.regression_ratio))).toFixed(1)}x.`,
    "Affected application calls can have intermittent or sustained latency increases.",
    "Compare plans, parameters, execution counts, waits and deployment/statistics timing across representative intervals.",
    "Correct the confirmed cause; consider plan forcing only after validation, monitoring and rollback preparation.",
    docs.sqlserver.queryStore,
  ));

  const unhealthy = hadr.filter((row) => !/HEALTHY|SYNCHRONIZED/i.test(`${row.synchronization_health_desc || ""} ${row.database_health || ""} ${row.synchronization_state_desc || ""}`));
  if (unhealthy.length) findings.push(finding(
    "hadr-health", unhealthy.some((row) => number(row.log_send_queue_size) >= 1024 * 1024) ? "HIGH" : "MEDIUM", "Replication",
    "Availability-group replica health needs attention",
    "Transport, redo, connectivity, workload or storage pressure is preventing healthy synchronization.",
    `${unhealthy.length} replica/database row(s) are not healthy or synchronized.`,
    "Recovery objectives and readable-secondary freshness may be at risk.",
    "Confirm role, connected state, send/redo queues, last commit, network and replica I/O/CPU.",
    "Follow the HA runbook with the availability owner; do not fail over from one snapshot.",
    docs.sqlserver.performance,
  ));

  const runningWorkers = number(connections.running_workers);
  const maxWorkers = number(connections.max_workers);
  if (maxWorkers && runningWorkers / maxWorkers >= 0.8) findings.push(finding(
    "worker-capacity", runningWorkers / maxWorkers >= 0.95 ? "HIGH" : "MEDIUM", "Concurrency",
    "Worker-thread headroom is limited",
    "Blocking, long requests, parallelism or connection pressure is retaining workers.",
    `${runningWorkers} running workers of ${maxWorkers}; ${number(connections.runnable_workers)} runnable.`,
    "New work can wait for workers and appear as broad application latency.",
    "Correlate worker states, blockers, parallel requests, schedulers and connection pools across multiple snapshots.",
    "Fix the workload or blocking source first; do not raise worker settings without support guidance and load testing.",
    docs.sqlserver.performance,
  ));
}

export function analyzeRelationalBottlenecks(engine, checks = [], identifier = "") {
  if (!relationalBottleneckCatalogs[engine]) throw new Error("Unsupported relational bottleneck engine");
  const map = new Map(checks.map((item) => [item.id, item]));
  const findings = [];
  if (engine === "sqlserver") addSqlServerFindings(map, findings);
  else addMysqlFindings(engine, map, findings);

  const completed = checks.filter((item) => item.ok).length;
  const skipped = checks.filter((item) => item.skipped).length;
  const failed = checks.length - completed - skipped;
  if (failed >= Math.ceil(checks.length / 3)) findings.push(finding(
    "evidence-coverage", "MEDIUM", "Capacity",
    "Diagnostic evidence coverage is incomplete",
    "The connected account lacks one or more monitoring permissions, optional instrumentation is disabled, or the server version omits a queried view.",
    `${completed} of ${checks.length} checks completed; ${skipped} skipped and ${failed} unavailable.`,
    "A missing signal can hide the true bottleneck or lower confidence in the pressure score.",
    "Review each failed check and grant only the minimum approved monitoring permission; do not enable instrumentation automatically.",
    "Repeat the snapshot after the access or version boundary is understood.",
    engine === "sqlserver" ? docs.sqlserver.performance : docs[engine].performance,
    "Coverage",
  ));

  if (!findings.length) findings.push(finding(
    "no-dominant-signal", "INFO", "SQL & Plans",
    "No dominant bottleneck crossed the current thresholds",
    "The incident may be intermittent, outside the sample, below thresholds or hidden by unavailable evidence.",
    `${completed} of ${checks.length} read-only checks completed.`,
    "A quiet snapshot does not disprove an earlier application slowdown.",
    "Capture another snapshot while the slowdown is active and provide an optional statement identifier.",
    "Keep the system unchanged until repeatable evidence identifies the resource and application scope.",
    engine === "sqlserver" ? docs.sqlserver.performance : docs[engine].performance,
    "Snapshot",
  ));

  findings.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);
  const pressureMap = areas.map((area) => {
    const matching = findings.filter((item) => item.area === area && item.severity !== "INFO");
    const score = matching.length
      ? Math.min(100, Math.max(...matching.map((item) => severityWeight[item.severity])) + Math.min(18, (matching.length - 1) * 6))
      : 0;
    return { area, count: matching.length, score, severity: score >= 90 ? "CRITICAL" : score >= 65 ? "HIGH" : score >= 35 ? "MEDIUM" : "CLEAR" };
  }).sort((a, b) => b.score - a.score);
  const pressureScore = Math.min(100, Math.max(0, ...pressureMap.map((item) => item.score)));
  const highPriority = findings.filter((item) => ["CRITICAL", "HIGH"].includes(item.severity));
  const dominantArea = pressureMap.find((item) => item.score > 0)?.area || "QUIET";
  return {
    total: checks.length,
    completed,
    skipped,
    failed,
    critical: findings.filter((item) => item.severity === "CRITICAL").length,
    high: findings.filter((item) => item.severity === "HIGH").length,
    medium: findings.filter((item) => item.severity === "MEDIUM").length,
    info: findings.filter((item) => item.severity === "INFO").length,
    pressureScore,
    dominantMode: dominantArea.toUpperCase(),
    primary: findings[0]?.title || "No dominant signal",
    primaryEvidence: findings[0]?.evidence || "",
    identifier,
    findings,
    pressureMap,
    metrics: {
      completedChecks: completed,
      unavailableChecks: failed,
      highPriorityFindings: highPriority.length,
      evidenceCoveragePercent: checks.length ? Math.round(100 * completed / checks.length) : 0,
    },
    safetyNote: "Fixed read-only evidence only. No session, query, plan, index, statistics, configuration, instrumentation, replication state, Query Store setting or database object is changed.",
  };
}
