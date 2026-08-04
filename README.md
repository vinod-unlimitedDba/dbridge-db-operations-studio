# DBridge Advanced

DBridge is a local-first database and DevOps operations console. It provides a
browser GUI while all privileged work is performed by a loopback-only local
service.

## Portable Windows edition

Use `release/DBridge-Advanced-Portable.exe` for one-click launch. It extracts
to the current user's temporary folder, opens the console on `127.0.0.1`, and
removes the temporary files after the local service exits. It does not install
a service, write registry keys, modify PATH, or require administrator access.

If company security blocks unsigned portable executables, unzip
`release/DBridge-Portable.zip` and double-click `Start-DBridge.cmd` instead.

## Capabilities

- A v2.22 unified diagnostics workspace combining performance triage, flight
  recording, visual plans, regression comparison, timelines, controls, and
  sanitized evidence export.
- Trusted SSH server tabs for hostname, IPv4, and bracketed IPv6 targets, with
  verify-before-auth host-key pinning, eight bounded sessions, and saved profiles
  that can optionally recall credentials from volatile local-agent memory.
- A resource-centric DevOps control plane organized by runtime, delivery, data
  movement, change comparison, and approved inspection.
- A redesigned v2.21 application shell across every workspace, with consistent
  mission-control ribbons, a responsive dark operations rail, and an auto-hide
  left panel that expands on hover or keyboard focus and toggles with Ctrl+B
- A Tabby-style protected terminal with up to eight restored profile tabs,
  two-pane comparison, output search/copy/clear, and read-only profiles for the
  local DBridge service, Git, Kubernetes, Docker, Kafka, GitHub, SSH, Terraform,
  cloud CLIs and GoldenGate; arbitrary shell text and command chaining remain blocked
- Light, dark and system-matched appearance for the whole console, applied
  before first paint so a dark session never flashes white, remembered on this
  laptop, and switchable from the header, the command palette or `Ctrl+Shift+L`
- Named SQL Studio connection profiles for each engine, so one workstation can
  hold separate production, SIT, UAT-Test, DEV and reporting targets. Browser
  profiles exclude passwords; optional one-click recall uses only the running
  local agent's bounded, expiring memory vault.
- Fuzzy command palette search across every workspace plus direct actions for
  appearance, density, shortcuts, profile capture and tool rescanning
- A built-in keyboard shortcut map on `Shift+/`, and a compact display density
  on `Ctrl+Shift+D` for fitting more evidence on one screen
- A header session indicator showing when the local service is serving a request
- Visual 1–72 hour log and trace intelligence with a 24-hour default, ranked
  findings, repeated-error signature grouping, timestamp coverage, dedicated
  Errors and Warnings views, and consistent red/amber/blue/green severity
  colors across local files, SSH server logs, database-native logs, GoldenGate,
  data warehouses and cloud telemetry
- Consolidated SQL Performance control deck with one database selector, one
  shared statement identifier, direct health/runtime/recommendation actions,
  and progressive Guided, Deep Dive, SQL Evidence, and Trace & Plans views
- Unified multi-database runtime trace workbench with ranked importance,
  runtime timeline, expandable evidence, and review-only terminal templates
  for Oracle SQL_ID/shared-pool evidence, PostgreSQL queryid, MongoDB operation
  comments, MySQL digests, and SQL Server Query Store IDs or query hashes
- Automatic SQL Studio connection-session recovery for engine, host, port,
  database/service, username, authentication and TLS preference, with per-engine
  context and explicit save or clear controls; passwords are never written to
  browser storage or source control.
- DBGate-style SQL Studio connection workflow with explicit Connect/Disconnect
  state, bundled direct drivers or approved integrated-client authentication, searchable
  schema and object browsing, double-click bounded query creation, and visual
  result grids with a complete raw Messages view
- MongoDB connects directly through the bundled Node.js driver without requiring
  `mongosh`; bundled direct adapters also cover Oracle, PostgreSQL, Redshift,
  MySQL, MariaDB, SQL Server and Azure Synapse
- Kubernetes and Docker visual dashboards with safe Read-only default and an
  explicitly unlocked Read-write mode for allowlisted rollout restart, scaling,
  pod recreation, and container start/stop/restart/pause actions; every change
  is validated, confirmed and constrained by existing RBAC or daemon permissions
- Advanced container change control with exact command preview, Kubernetes RBAC
  or Docker daemon preflight, optional change-ticket references, automatic
  relocking after success, and a sanitized local audit history of permitted,
  failed and blocked operational actions
- Notepad++-style SQL workspace with persistent multi-document tabs, unsaved
  markers, find/replace, go-to-line, indentation and comment shortcuts, word
  wrap, zoom, cursor statistics, and local draft-session recovery
- Real-time editor completion for all 15 database and warehouse dialects,
  approved Kubernetes, Docker, Kafka, GitHub, cloud, IaC and GoldenGate command
  references; choose All, SQL, Ops or Off and insert with
  Tab/Enter without ever auto-executing the suggested text
- Local SQL/text file open and active-tab download without uploading file
  contents to DBridge or another service
- Read-only-by-default SQL Studio command execution across all 15 database and
  warehouse adapters
- A visual performance workbench with 50 guided read-only checks for workload,
  waits, blockers, I/O, cache, memory, replication, and connections across all
  five supported database engines
- A unified SQL Performance Command Center with visual Oracle, PostgreSQL,
  MongoDB, MySQL and SQL Server workspaces, one-click engine switching,
  per-engine connection context, a four-step investigation path, quick health
  capture, and direct evidence-based statement recommendations
- Coordinated core and full database health snapshots with progressive results,
  failure isolation, review-signal counts, timing, and stop-after-current control
- A 22-step Oracle SQL_ID X-Ray sequence covering AWR history, ASH, alert
  correlation, live progress, long operations, global cursor statistics,
  partition statistics, SQL Monitor, blockers, parallel execution, cursor
  sharing, plans, binds, undo, waits, current plan lines and I/O latency; each
  result remains selectable and feeds an application-performance score and
  evidence-ranked recommendations
- An Oracle Trace Lab for in-memory 10053 optimizer and 10046 SQL trace import
  or paste analysis, including parameters, transformations, access paths, join
  orders, costs, outlines, cursor calls, reads, rows, waits, and warnings
- A guarded TKPROF workspace with approved sorting, aggregation, wait, SYS SQL,
  and statement-limit options; temporary reports are removed after display
- Oracle SQL_ID, PostgreSQL queryid, MongoDB operation/comment, MySQL digest,
  and SQL Server query-hash diagnostics
- Evidence-based SQL identifier recommendations for all five engines, with
  ranked critical/high/medium findings, the live metric behind each finding,
  engine-specific plan validation guidance, and a copyable investigation report
- A SQL performance Flight Recorder with live latency, active-session, waiter,
  read-rate, throughput, and error samples; locally saved workload windows; and
  before/after deployment gates for Oracle, PostgreSQL, MongoDB, MySQL, and SQL Server
- Direct live plan capture by SQL_ID, queryid, operation/comment ID, digest, or
  query hash, plus plan-stability history, a blocking-chain map, and a visual
  index-candidate benefit/write-cost/storage advisor
- A visual Incident Investigation Center with multi-format execution-plan
  parsing, operator cost/row maps, plan-health scoring, and evidence-ranked
  scan, spill, cardinality, join, sort, and index findings
- Good-versus-slow plan regression comparison with red/green operator changes,
  metric deltas, plan fingerprints, and locally saved summary baselines
- A correlated database-and-delivery timeline for plans, logs, traces, Git,
  deployments, Kubernetes, and containers, plus sanitized HTML/JSON evidence export
- A connection and permission gate, editable environment thresholds that feed
  live SQL recommendations, and a visual readiness matrix for 15 database and
  data-warehouse adapters
- A monitoring catalog for 40+ relational, NoSQL, MPP, data-platform, and
  cloud-warehouse sources, with SSH server tailing, database-native views,
  local/UNC file tailing, and CLI telemetry modes
- Real-time severity counts for errors, warnings, informational events, total
  lines, file rotation, and last-update time
- Local trace-file analysis for waits, elapsed markers, and database errors
- Guided read-only DevOps GUI methods with context-aware fields for GitHub,
  Kubernetes, Docker, Podman, Kafka, Terraform, OpenTofu, Helm, Ansible,
  Argo CD, Vault, Nomad, Git, SSH, AWS, Azure, Google Cloud, Databricks, and
  Snowflake
- A visual Kubernetes and Docker operations dashboard with cluster/node
  readiness, deployment/pod/service health, warning events, resource pressure,
  container state, engine profile, images, networks, volumes, and disk usage
- A local DevOps version baseline and comparison dashboard that identifies
  changed, new, missing, unchanged, and unavailable approved CLI versions
- Release and platform intelligence with Kubernetes topology/readiness maps,
  GitHub workflow-run regression baselines, browser-local configuration drift
  fingerprints, Kafka consumer lag by group/topic/partition, and reusable
  diagnostic runbooks made only from approved read-only actions
- An Oracle GoldenGate Operations Center inside SQL Studio for Microservices Architecture through
  Admin Client wallet aliases and Classic Architecture through fixed read-only
  GGSCI commands over SSH, with process state, lag, checkpoint, ABEND, OGG/ORA
  code, trail, network, and long-transaction troubleshooting
- Live server monitoring for `ggserr.log`, Extract/Replicat report files,
  discard files, and Administration Service logs, with direct handoff to the
  main Log Center
- Quick and full guided audit playbooks across all 20 DevOps integrations, with
  grouped outputs, progress, stop control, risk signals, and comparison against
  the previous in-memory audit
- A browser-local two-file deployment comparator for YAML, JSON, Terraform,
  SQL, scripts and configuration files, with red/green line-level redlines,
  context filtering, change counts, patch copy, and `.diff` download
- Clickable tool cards, method chips, safe command previews, execution timing,
  output filtering, and a strict command/argument allowlist
- Same-origin session token, loopback-only binding, bounded inputs, command
  timeouts, and in-memory credentials

## Required approved clients

MongoDB, Oracle, PostgreSQL, Redshift, MySQL, MariaDB, SQL Server and Synapse
use drivers included in the portable bundle. Specialized database adapters,
integrated authentication modes and DevOps actions can use clients already
installed and approved on the workstation: `sqlplus`, `psql`, `mysql`,
`sqlcmd`, `snowsql`, `bq`, `databricks`, `db2`, `hdbsql`,
`clickhouse-client`, `bteq`, `ssh`, `gh`, `kubectl`, `docker`,
`podman`, `kafka-topics.bat`, `kafka-consumer-groups.bat`, `adminclient`, `terraform`, `tofu`, `helm`, `ansible`,
`argocd`, `vault`, `nomad`, `git`, `aws`, `az`, `gcloud`, `databricks`, and
`snowsql`.

DBridge never downloads missing tools while running. The GUI reports whether a
bundled direct driver or an approved local client is ready.

SQL Studio connection profiles use browser-local storage on the current laptop
for non-secret metadata only: engine, environment, host, port, database/service,
username, authentication method and TLS preference. When **Remember until agent
stops** is enabled, the password is stored in the loopback local agent's volatile,
bounded memory vault for up to eight hours of activity. It is cleared on expiry,
explicit deletion, deselecting Remember, or agent shutdown and is never returned
by status APIs. Selecting a saved DB profile connects and opens SQL Workspace or
MongoDB Studio; selecting a saved SSH profile opens its terminal after host-key
verification.

Remote server logs use the Windows OpenSSH client with an existing SSH agent
or optional private-key path. The host must already be present in the user's
`known_hosts`, and the remote account must have read access to the selected
log. Database-native collection is available for Oracle, PostgreSQL, MongoDB,
MySQL, and SQL Server using the connection entered in SQL Studio.

GoldenGate Microservices diagnostics use an existing Admin Client wallet alias;
DBridge does not request or persist the GoldenGate password. Classic diagnostics
and GoldenGate log monitoring require an SSH host already trusted in
`known_hosts` and a server account permitted to read the selected files and run
the approved informational GGSCI commands.

## Development verification

```powershell
node --check portable/server.mjs
node --check portable/app/app.js
node portable/smoke-test.mjs
```

`portable/app/theme-dark.css` is generated, not hand-written. The feature
stylesheets hardcode their colours rather than sharing tokens, so the dark
appearance is produced by mirroring every colour-bearing rule under an
`html[data-theme="dark"]` scope and inverting each literal by the role its
property implies. After changing any light stylesheet, regenerate it:

```powershell
node portable/tools/generate-dark-theme.mjs
```

The existing hosted demonstration remains under `app/`. The portable product
is implemented under `portable/` and runs independently of cloud hosting.
