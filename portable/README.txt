DBridge Advanced Portable
=========================

Start on Windows, macOS or Linux
---------------------------------
Requires Node.js 22.13.0 or newer.

Universal: node portable-launcher.mjs
Windows:   double-click Start-DBridge.cmd
macOS:     open Start-DBridge.command, or run sh start-dbridge.sh
Linux:     run sh start-dbridge.sh

The Node-portable package installs its locked, platform-specific database
drivers into this extracted folder on the first connected run. Later launches
work offline. The separate Windows offline package already includes Node.js and
all dependencies. Close the terminal window or press Ctrl+C to stop DBridge.

Friendly application shell
--------------------------
DBridge v2.30 uses one consistent application shell across SQL Studio,
performance, investigation, logs, DevOps, Terminal and security. The left navigation
describes each workspace, the header shows the current task, and the safety
strip keeps local-only, in-memory credential and read-only status visible.
Press Ctrl+K from anywhere to search tools and jump directly to a task. Use
Alt+1 through Alt+8 to switch primary workspaces when focus is not in a field.
The navigation becomes a drawer on smaller screens and all new controls support
keyboard focus and reduced-motion preferences. The left panel now defaults to
auto-hide: it remains as a compact icon rail and expands on hover or keyboard
focus. Ctrl+B pins or releases it and the preference is stored on this laptop.

Tabby-style protected terminal
------------------------------
The Terminal workspace keeps up to eight restored profile tabs for DBridge
health, Git, Kubernetes, Docker, Kafka, GitHub, SSH, Terraform, AWS, Azure,
Google Cloud and GoldenGate. Tabs can be viewed in a two-pane split, searched,
cleared and copied. Profiles, selected read-only actions and non-secret context
are restored locally; terminal output remains in browser memory.

This is intentionally a protected operations terminal. It reuses DBridge's
fixed command constructors and existing CLI identities. It does not accept
arbitrary shell text, command chaining, hidden scripts or a remote terminal
relay. Existing RBAC, SSH host verification, wallets and company policy still
apply.

24-hour log and trace intelligence
----------------------------------
Logs & Traces now opens with a visual incident summary for the selected 1, 6,
12, 24, 48 or 72-hour window. It classifies database, warehouse, GoldenGate,
server and cloud-log evidence into critical, error, warning, information,
recovered and debug events. Critical and error evidence is red, warnings are
amber, informational events are blue, and recovered or healthy events are
green. Findings rank error bursts, repeated normalized signatures, recovery
signals and timestamp coverage. Dedicated Errors, Warnings and All events
views keep the original line, time and severity visible, while Copy findings
creates a review-ready text report.

Initial reads are bounded to 2 MB or 10,000 SSH lines, and later live updates
remain incremental. Oracle and MySQL native collection applies the selected
time range on the database. PostgreSQL, MongoDB and SQL Server collect bounded
native evidence and the dashboard applies timestamp-aware window filtering.

Unified SQL Performance layout
------------------------------
SQL Performance uses one compact control deck instead of repeating database,
identifier and action controls in every panel. Choose the engine from the
left-hand rail, paste the statement identifier once, then start Engine health,
Runtime evidence or Recommendations. The same identifier follows the user
through Guided Analysis, Engine Deep Dive, SQL Evidence, and Trace & Plans.
Only the panels for the selected stage are shown, while deeper raw evidence
remains available when it is needed.

Unified runtime trace workbench
-------------------------------
SQL Performance now combines Oracle, PostgreSQL, MongoDB, MySQL and SQL Server
statement evidence in one guided workbench. Choose the engine, enter SQL_ID,
queryid, operation/comment ID, digest, Query Store query_id or query hash, then
capture fixed read-only evidence. The dashboard ranks important findings,
summarizes runtime and plan signals, builds a timeline, keeps expandable raw
evidence and creates a review-only terminal script that can be opened in SQL
Studio.

For Oracle, shared-pool evidence includes loaded children, actual plan rows,
optimizer environments, sharing reasons, runtime waits and DBMS_XPLAN output.
A historical 10053 decision trace cannot be recreated from the shared pool.
DBridge therefore provides a separately marked, commented 10053 reparse
template for DBA approval and never executes that session-changing template.
The equivalent retained sources are pg_stat_statements/pg_stat_activity for
PostgreSQL, currentOp/existing profiler/query statistics for MongoDB,
Performance Schema digest/history for MySQL, and Query Store/cached DMVs for
SQL Server.

Portable runtime
----------------
DBridge binds only to 127.0.0.1 and does not need administrator access. The
cross-platform package uses Node.js already installed on the workstation and
runs npm ci only when its local node_modules folder is absent. The Windows
offline package includes its own Node.js runtime. Neither edition adds registry
keys, services, startup items, or system PATH entries.

SQL Studio connection
---------------------
SQL Studio automatically restores the last connection fields on this laptop.
It remembers the engine, host, port, database/service, username, authentication
method and network-security preference separately for each engine. Save now and
Clear saved controls are available in the Connection panel. The password is
never stored and must be entered again.

Select the database engine and authentication method, then choose Connect.
After validation, the Database Explorer loads approved tables, views and
collections from that database. Filter objects or double-click one to create a
bounded query in a new editor tab. Query output is shown in a visual result
grid, while the complete database response remains available under Messages.
MongoDB uses the bundled direct driver and does not require mongosh. Bundled
direct drivers also cover Oracle, PostgreSQL, Redshift, MySQL, MariaDB, SQL
Server and Synapse. Existing CLI / integrated context remains available where
an approved database client is required.

Notepad-style SQL editor
------------------------
SQL Studio supports up to 20 persistent editor tabs with unsaved markers,
double-click rename, close confirmation, find/replace, go-to-line, word wrap,
font zoom, line/column statistics, automatic indentation, line commenting and
local session recovery. Real-time completion covers every supported database
and warehouse dialect and approved Docker, Kubernetes,
Kafka, GitHub, cloud, infrastructure and GoldenGate command references. Type to
filter, use Up/Down to choose, and press Tab or Enter to insert. The AUTO button
cycles All, SQL, Ops and Off; suggestions are editor text and never run by
themselves. Ctrl+Space opens matching suggestions on demand. Ctrl+N creates a
tab, Ctrl+S saves the active tab as a local file, Ctrl+W closes a tab, Ctrl+F
finds, Ctrl+H replaces, Ctrl+G goes to a line, Ctrl+O opens local SQL/text files,
Ctrl+/ toggles SQL comments and Ctrl+Enter runs the active SQL.

Kubernetes and Docker dashboard access
--------------------------------------
The visual dashboard always starts in Read-only mode. Read-write mode can be
unlocked for the current session to run only approved Kubernetes rollout
restart, deployment scaling, pod recreation, and Docker container start, stop,
restart, pause or unpause actions. Every change shows a confirmation first.
Kubernetes writes require a specific namespace. Existing kubeconfig RBAC and
Docker daemon permissions still apply; DBridge cannot bypass company access.
Before execution, Preview & preflight shows the exact allowlisted command and
checks Kubernetes RBAC or Docker daemon availability. An optional change-ticket
reference can be attached. Successful changes auto-lock the dashboard by
default. Sanitized success, failure and blocked-action history is retained only
in the portable data folder.

Required enterprise clients
---------------------------
DBridge bundles direct drivers for Oracle, PostgreSQL, Redshift, MongoDB, MySQL,
MariaDB, SQL Server and Synapse. MongoDB does not require mongosh. The clients
below remain optional fallbacks or are required for specialized adapters,
integrated authentication, logs and DevOps functions:

- Oracle fallback/diagnostics: sqlplus
- PostgreSQL/Redshift fallback: psql
- MySQL/MariaDB fallback: mysql
- SQL Server/Synapse fallback: sqlcmd
- Remote server logs: Windows OpenSSH client (ssh)
- GitHub: gh
- Kubernetes: kubectl
- Docker: docker
- Podman: podman
- Kafka: kafka-topics.bat
- Kafka lag intelligence: kafka-consumer-groups.bat
- Oracle GoldenGate Microservices: adminclient with an approved wallet alias
- Terraform: terraform
- OpenTofu: tofu
- Helm: helm
- Ansible: ansible and ansible-inventory
- Argo CD: argocd
- HashiCorp Vault: vault
- HashiCorp Nomad: nomad
- Git: git
- AWS telemetry: aws
- Azure/Synapse/Fabric telemetry: az
- BigQuery/Cloud SQL/AlloyDB telemetry: gcloud
- Databricks telemetry: databricks
- Snowflake telemetry: snowsql
- BigQuery SQL: bq
- Databricks SQL: databricks CLI profile and SQL warehouse
- IBM Db2 SQL: db2 CLP
- SAP HANA SQL: hdbsql with an approved hdbuserstore key
- ClickHouse SQL: clickhouse-client
- Teradata SQL: bteq

Advanced DevOps Hub
-------------------
The Kubernetes and Docker Visual Dashboard turns approved live inspection data
into node-readiness cards, workload health maps, warning-event streams, CPU and
memory pressure bars, Docker container fleet status, engine capacity, and
image/network/volume/storage inventory. Refresh is manual and read-only; the
dashboard never starts, stops, removes, scales, or modifies a workload.

The DevOps Hub provides clickable tool cards and guided read-only methods for
GitHub, Kubernetes, Docker, Podman, Kafka, Terraform, OpenTofu, Helm, Ansible,
Argo CD, Vault, Nomad, Git, SSH, AWS, Azure, Google Cloud, Databricks and
Snowflake. Context-aware fields cover repository, cluster context, namespace,
resource, container, topic, consumer group, profile, region, project and
working folder. The version-change radar stores a local baseline and compares
it with current approved CLI versions. Arbitrary shell commands are not
accepted; every command and argument is built from a server-side allowlist.
Quick and full guided audit playbooks run coordinated inspections across all
20 integrations, show progressive grouped results, count review signals, and
compare successful output with the previous audit held in browser memory.

Oracle GoldenGate Operations Center
-----------------------------------
The complete GoldenGate workspace is located inside SQL Studio, below the SQL
editor, so database and replication diagnostics stay in one operational area.
Microservices Architecture connects through the company-approved Admin Client
and an existing Oracle wallet credential alias. Classic Architecture runs only
fixed informational GGSCI commands over trusted SSH. DBridge shows Manager,
Extract, Replicat and service state, maximum lag, checkpoints, ABENDs, OGG/ORA
codes and evidence-based recommendations for trail, filesystem, network and
long-transaction conditions.

The live log console reads ggserr.log, process report files, discard files and
Administration Service logs over SSH. It never starts, stops, alters or deletes
a GoldenGate process, trail or configuration. The SSH account must already be
authorized to read the selected files and the host must exist in known_hosts.

Release and platform intelligence adds a Kubernetes topology/readiness map,
GitHub workflow run capture with saved regression baselines, configuration
fingerprint drift comparison, Kafka consumer lag by group/topic/partition, and
locally saved diagnostic runbooks. Runbooks can contain only the same approved
read-only actions exposed by Guided Inspection and require confirmation to run.

Two-file deployment comparison
------------------------------
Select or drag an older and newer text, code, YAML, JSON, Terraform, SQL or
configuration file into the DevOps Hub. Removed lines are shown in red with
strike-through and added lines in green with underline. Files are processed
only in browser memory and are never uploaded. The redline can be filtered,
copied, or downloaded as a .diff patch.

Database performance lab
------------------------
The primary database workflow is presented as four consistent, keyboard-
accessible tabs: SQL Studio, SQL Performance, Investigation, and Logs & Traces.
Switching tabs preserves the current in-memory connection context. SQL Studio
shows a three-step connect, browse/write, run/review path; Logs & Traces adds
shortcuts for source selection, live following, file trace analysis, and the
Oracle 10053/10046/TKPROF lab. The tab strip becomes horizontally scrollable
on smaller screens.

The SQL Performance Command Center presents Oracle, PostgreSQL, MongoDB, MySQL
and SQL Server as five visual workspaces. Selecting an engine coordinates the
health snapshot, statement identifier, guided checks, connection context and
recommendation workflow. In-memory, non-secret connection context is retained
while switching engines. A four-step path guides users from broad health to a
specific statement, focused evidence and ranked next actions. Oracle-only
SQL_ID X-Ray and Trace Lab tools appear only in the Oracle workspace.

SQL Performance is divided into four task-based workspaces so the page no
longer displays every advanced panel in one long scroll:

1. Overview confirms the active connection and runs the coordinated health
   snapshot.
2. Engine Deep Dive opens the selected Oracle, PostgreSQL or MongoDB
   bottleneck workspace. MySQL and SQL Server receive a friendly three-step
   path across health, statement evidence and ten guided checks.
3. SQL Evidence contains the statement identifier, raw evidence and
   ranked recommendations.
4. Trace & Plans contains guided checks, license-controlled Oracle deep
   X-Ray, Oracle Trace Lab and the final validation checklist.

Quick actions, cross-workspace links and saved diagnostic profiles switch to
the required workspace automatically. Only the current task is visible, while
database selection and in-memory connection context stay available at the top.

The visual performance workbench provides 50 fixed read-only checks across
Oracle, PostgreSQL, MongoDB, MySQL and SQL Server. It covers active workload,
expensive statements, waits, blockers, cache, I/O, memory, replication and
connections. Statement analysis supports Oracle SQL_ID, PostgreSQL queryid,
MongoDB operation/comment IDs, MySQL digests and SQL Server query hashes.

The Oracle Bottleneck Intelligence workspace adds 30 license-aware, read-only
checks. It starts database-wide and can optionally focus on a 13-character
SQL_ID. Core evidence covers database/instance context, session and process
capacity, live activity, blockers, cumulative waits, current one-minute
metrics, DB time, top and focused SQL, actual-versus-estimated plan rows,
DBMS_XPLAN cursor output, child-cursor sharing reasons, redacted bind metadata,
long operations, hot segments, datafile latency, temp consumers, undo, PGA,
SGA, library cache, redo/parse counters, parallel execution, RAC cache-fusion
waits, focused-object statistics and recent ADR alert errors.

The Oracle workspace ranks causes in six visual pressure domains and explains
the probable cause, measured evidence, application impact, safe verification
and controlled next action. It distinguishes BLOCKED, WAITING, CPU, WORKING
and QUIET snapshots. Run a second scan with the same startup boundary to
validate cumulative wait, SQL, redo and cursor rates.

The license scope defaults to Core views only. Selecting Diagnostics licensed
adds two pack-only checks for recent ASH and focused AWR SQL history. Selecting
Diagnostics + Tuning licensed also adds focused SQL Monitor. The selection is
an operator declaration and does not verify the Oracle contract. DBridge skips
pack-only views unless selected, never creates AWR snapshots, and never runs
ADDM, SQL Tuning Advisor, SQL Access Advisor, SQL Profiles or plan changes.
Bind values are deliberately not collected.

The PostgreSQL Bottleneck Intelligence workspace adds 26 version-aware,
read-only checks. It can focus on one pg_stat_statements queryid while still
correlating database-wide waits, blockers, transaction age, relation I/O,
temporary spill, table churn, HOT updates, stale statistics, freeze/XID risk,
invalid indexes, WAL, old/new checkpoint views, archive failures, replication
lag and retained WAL from slots. Findings are shown as a visual pressure map
and a cause chain with measured evidence, application impact, safe
verification and a controlled next action. A second scan calculates interval
rates only when the statistics reset boundary is unchanged.

Most PostgreSQL statistics are cumulative. DBridge does not reset them.
EXPLAIN ANALYZE is never started by this bottleneck scan because it executes
the statement; use it only after reviewing SQL side effects and representative
parameters. Extension, VACUUM, ANALYZE, session cancellation, DDL, slot and
configuration changes remain outside the automatic workflow.

The MongoDB Performance Intelligence workspace adds 19 direct-driver,
read-only checks for topology and capabilities, live $currentOp evidence,
serverStatus workload and latency counters, locks, connection establishment,
admission queues, WiredTiger cache and eviction, checkpoints and journal,
transactions, flow control, replica health and lag, oplog retention, bounded
collection footprints, existing profiler samples, optional $queryStats,
collection index usage, plan-cache state, sharding/balancer context, and the
remote server RAM log buffer. An operation ID, command comment or appName can
focus live activity; an optional collection adds node-local index and
plan-cache evidence.

The MongoDB findings explain whether work is waiting or running inefficiently,
show a visual pressure map, and correlate the likely cause with measured
evidence, application impact, a safe verification step and an official
MongoDB reference. High WiredTiger cache use is not treated as a fault by
itself. Counters are cumulative and index statistics are node-local, so repeat
the scan after 5-15 seconds and verify that uptime did not roll back before
using interval conclusions.

DBridge never enables profiling, runs executionStats, kills an operation,
clears a plan cache, changes query settings, creates/hides/drops an index, or
modifies a balancer, shard key, oplog or replica set. queryPlanner is the safe
first plan review; deeper or mutating actions require explicit authorization
and normal company change control. The getLog view contains only the latest
server RAM-buffer entries and is not a replacement for the full remote
mongod.log.

Get Recommendations runs a fixed read-only evidence query and ranks findings
by severity. Each finding shows its metric evidence and a safe engine-specific
next action. It never creates indexes, forces plans, cancels work, or changes
database settings automatically. The complete report can be copied from the GUI.
Core and full health snapshots run coordinated check sets with progressive
results, failure isolation, review-signal counts, timing and stop control.

Oracle SQL_ID investigation sequence
------------------------------------
The SQL performance page includes a 22-step Oracle SQL_ID X-Ray. It runs fixed
read-only checks in order for AWR history, ASH, alert correlation, remaining
time, SQL Monitor progress, RAC-wide cursor statistics, missing and stale
partition statistics, SQL Monitor reports, full cursor output, database
context, blocking, parallel execution, slave time, cursor sharing, DBMS_XPLAN,
bind capture, undo, waits, current plan line and I/O latency. One failed or
unauthorized source does not stop later checks. Select any step to see its raw
Oracle output, automatic evidence markers and recommendation. Stop waits for
the current check and preserves everything already collected.

AWR, ASH and SQL Monitor require the appropriate Oracle Diagnostics or Tuning
Pack license. Deep X-Ray follows the Evidence Scope selected in Oracle
Bottleneck Intelligence and blocks pack-only steps before database access
unless the matching scope is selected. DBridge never enables a pack or changes
a database setting. The Oracle account and either the bundled direct driver or
the fallback sqlplus context must already be approved by your company.

SQL Flight Recorder
-------------------
Record live latency, active sessions, waiting sessions, logical and physical
read rates, throughput and error deltas for Oracle, PostgreSQL, MongoDB, MySQL
and SQL Server. Saved before/after windows can be compared and used as a visual
deployment health gate. Direct plan capture accepts SQL_ID, queryid, MongoDB
operation/comment ID, MySQL digest or SQL Server query hash. Plan history,
blocking-chain maps and index-candidate trade-off guidance are also available.

Incident Investigation Center
-----------------------------
The visual plan workspace accepts Oracle DBMS_XPLAN, PostgreSQL EXPLAIN text
or JSON, MongoDB executionStats, MySQL JSON plans, SQL Server XML plans, and
generic indented plans. It maps operator depth, cost, row volume, scans, spills,
cardinality mismatches, large joins and sorts. Good and slow plans can be
compared with red/green operator and metric changes.

Plan summary baselines, custom tuning thresholds and incident events are saved
only in the portable local data folder. The timeline correlates database plans,
logs and traces with Git, deployment, Kubernetes and container events. HTML and
JSON evidence reports can redact hostnames, IP addresses, emails and quoted
literals. The connection validator uses one fixed read-only identity/diagnostic
query and never installs a missing client or bypasses database permissions.

Oracle Trace Lab
----------------
Import or paste an Oracle 10053 optimizer trace or 10046 SQL trace for
in-memory analysis. The GUI summarizes SQL IDs, cursor calls, CPU and elapsed
time, reads, rows, waits, optimizer parameters, transformations, access paths,
join orders, costs, outline hints, and warnings. The TKPROF workspace uses the
approved tkprof executable already in PATH, reads the source trace without
modifying it, and removes its temporary report after loading the result.

Database and warehouse log coverage
-----------------------------------
The catalog contains 40+ presets across relational databases, NoSQL/search,
MPP warehouses, Hadoop/Spark data platforms, and cloud warehouses. Server logs
can be read over SSH using an existing key or SSH agent. Oracle, PostgreSQL,
MongoDB, MySQL and SQL Server also support database-native diagnostic views.
File-based sources support local paths, UNC shares, and mounted server logs.
Cloud sources poll their approved local CLI and existing sign-in profile.

If a client is unavailable, DBridge reports it in the GUI. It never downloads
or installs missing software.

Security
--------
- SQL runs in read-only mode unless writes are explicitly unlocked.
- Passwords are retained only in the active browser page and local process.
- The web service rejects non-local Host headers and binds only to 127.0.0.1.
- Browser responses include CSP, frame blocking, MIME protection, a no-referrer
  policy, same-origin isolation and restricted browser feature permissions.
- API calls require a new random same-origin token on every launch.
- Log and trace files are read, never modified.
- SSH requires a host already trusted in known_hosts and a remote account with
  read permission. DBridge does not bypass server or database access controls.
- Use only company-approved accounts, contexts, files, and permissions.

The portable ZIP contains no installer and does not disable or bypass
antivirus, endpoint protection, company proxy rules, RBAC or database
permissions. Review the included SHA256 file and SECURITY-NOTES.txt before
sharing it through an approved company email or file-transfer channel.


UNIFIED SQL DIAGNOSTICS AND TRUSTED SERVER TABS
-----------------------------------------------
SQL Performance and Investigation are combined into one six-stage SQL
Diagnostics workspace: Triage, Flight Recorder, Visual Plan, Regression,
Timeline, and Controls. Existing engine-specific checks, 10053/TKPROF,
baselines, recommendations, and evidence export remain available.

The Terminal workspace accepts a server hostname, IPv4 address, or bracketed
IPv6 address. It supports up to four live SSH server tabs plus non-secret saved
server profiles and a known_hosts preflight. New server keys are never accepted
automatically. Passwords and passphrases are not saved.

DevOps is organized into Runtime, Delivery, Data Movement, Changes, and Guided
Inspection views with a shared environment, application, and evidence window.
