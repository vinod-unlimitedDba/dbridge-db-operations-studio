(() => {
  const TERMINAL_STORAGE_KEY = "dbridge.terminal.sessions.v1";
  const SHELL_MIGRATION_KEY = "dbridge.shell.v3.initialized";
  const MAX_TERMINAL_SESSIONS = 8;
  const MAX_SESSION_OUTPUT = 450000;

  const terminalProfiles = {
    system: {
      label: "DBridge host",
      code: "LOCAL",
      actions: {
        health: { label: "Local service health", endpoint: "/api/health", preview: "GET /api/health" },
        tools: { label: "Approved tool readiness", endpoint: "/api/tools/status", preview: "GET /api/tools/status" },
        adapters: { label: "Database adapter readiness", endpoint: "/api/adapters", preview: "GET /api/adapters" },
      },
      fields: {},
    },
    git: {
      label: "Git repository",
      code: "GIT",
      actions: {
        status: { label: "Repository status", preview: "git status --short --branch" },
        branches: { label: "Local and remote branches", preview: "git branch --all" },
        remotes: { label: "Configured remotes", preview: "git remote -v" },
        commits: { label: "Recent commits", preview: "git log --oneline --decorate -n 30" },
        diff: { label: "Working-tree diff summary", preview: "git diff --stat" },
        version: { label: "Git version", preview: "git --version" },
      },
      fields: { cwd: "WORKING FOLDER" },
    },
    kubernetes: {
      label: "Kubernetes",
      code: "K8S",
      actions: {
        cluster: { label: "Cluster information", preview: "kubectl cluster-info" },
        namespaces: { label: "Namespaces", preview: "kubectl get namespaces -o wide" },
        nodes: { label: "Nodes", preview: "kubectl get nodes -o wide" },
        pods: { label: "Pods", preview: "kubectl get pods -o wide" },
        deployments: { label: "Deployments", preview: "kubectl get deployments -o wide" },
        services: { label: "Services", preview: "kubectl get services -o wide" },
        events: { label: "Recent events", preview: "kubectl get events --sort-by=.lastTimestamp" },
        topPods: { label: "Pod resource usage", preview: "kubectl top pods" },
        topNodes: { label: "Node resource usage", preview: "kubectl top nodes" },
        describe: { label: "Describe resource", preview: "kubectl describe <resource>" },
      },
      fields: { target: "KUBECONFIG CONTEXT", secondary: "NAMESPACE", scope: "RESOURCE" },
    },
    docker: {
      label: "Docker",
      code: "DOCKER",
      actions: {
        info: { label: "Engine information", preview: "docker info" },
        containers: { label: "All containers", preview: "docker ps -a" },
        images: { label: "Images", preview: "docker images" },
        networks: { label: "Networks", preview: "docker network ls" },
        volumes: { label: "Volumes", preview: "docker volume ls" },
        diskUsage: { label: "Disk usage", preview: "docker system df" },
        stats: { label: "Resource snapshot", preview: "docker stats --no-stream" },
        logs: { label: "Container logs", preview: "docker logs --tail 300 <container>" },
        inspect: { label: "Inspect object", preview: "docker inspect <object>" },
        processes: { label: "Container processes", preview: "docker top <container>" },
      },
      fields: { target: "CONTAINER / OBJECT" },
    },
    kafka: {
      label: "Apache Kafka",
      code: "KAFKA",
      actions: {
        topics: { label: "List topics", preview: "kafka-topics --bootstrap-server <server> --list" },
        describeTopic: { label: "Describe topic", preview: "kafka-topics --bootstrap-server <server> --describe --topic <topic>" },
        groups: { label: "Consumer groups", preview: "kafka-consumer-groups --bootstrap-server <server> --list" },
        describeGroup: { label: "Group offsets and lag", preview: "kafka-consumer-groups --bootstrap-server <server> --describe --group <group>" },
      },
      fields: { target: "BOOTSTRAP SERVER", secondary: "TOPIC", scope: "CONSUMER GROUP" },
      defaults: { target: "localhost:9092" },
    },
    github: {
      label: "GitHub",
      code: "GH",
      actions: {
        status: { label: "Authentication status", preview: "gh auth status" },
        repositories: { label: "Repositories", preview: "gh repo list --limit 30" },
        pullRequests: { label: "Pull requests", preview: "gh pr list --limit 30" },
        workflows: { label: "Workflow runs", preview: "gh run list --limit 30" },
        issues: { label: "Open issues", preview: "gh issue list --limit 30" },
        releases: { label: "Releases", preview: "gh release list --limit 30" },
      },
      fields: { target: "OWNER / REPOSITORY" },
    },
    ssh: {
      label: "SSH client",
      code: "SSH",
      actions: {
        version: { label: "OpenSSH client version", preview: "ssh -V" },
        configuration: { label: "Resolved host configuration", preview: "ssh -G <host-alias>" },
        connectivity: { label: "Trusted connectivity check", preview: "ssh -o BatchMode=yes -o StrictHostKeyChecking=yes <host-alias> exit" },
      },
      fields: { target: "SSH HOST ALIAS" },
    },
    terraform: {
      label: "Terraform",
      code: "TF",
      actions: {
        version: { label: "Terraform version", preview: "terraform version" },
        providers: { label: "Providers", preview: "terraform providers" },
        validate: { label: "Validate configuration", preview: "terraform validate -no-color" },
        outputs: { label: "Outputs", preview: "terraform output -no-color" },
        state: { label: "State resources", preview: "terraform state list" },
        workspace: { label: "Current workspace", preview: "terraform workspace show" },
      },
      fields: { cwd: "WORKING FOLDER" },
    },
    aws: {
      label: "AWS",
      code: "AWS",
      actions: {
        identity: { label: "Caller identity", preview: "aws sts get-caller-identity --output json" },
        regions: { label: "Regions", preview: "aws ec2 describe-regions --output table" },
        eksClusters: { label: "EKS clusters", preview: "aws eks list-clusters --output table" },
        ecsClusters: { label: "ECS clusters", preview: "aws ecs list-clusters --output table" },
      },
      fields: { target: "AWS PROFILE", secondary: "REGION" },
    },
    azure: {
      label: "Azure",
      code: "AZ",
      actions: {
        account: { label: "Active account", preview: "az account show --output json" },
        subscriptions: { label: "Subscriptions", preview: "az account list --output table" },
        resourceGroups: { label: "Resource groups", preview: "az group list --output table" },
        aksClusters: { label: "AKS clusters", preview: "az aks list --output table" },
      },
      fields: { target: "SUBSCRIPTION" },
    },
    gcloud: {
      label: "Google Cloud",
      code: "GCP",
      actions: {
        account: { label: "Accounts", preview: "gcloud auth list" },
        project: { label: "Active project", preview: "gcloud config get-value project" },
        config: { label: "Configuration", preview: "gcloud config list" },
        clusters: { label: "GKE clusters", preview: "gcloud container clusters list" },
        sqlInstances: { label: "Cloud SQL instances", preview: "gcloud sql instances list" },
      },
      fields: { target: "GOOGLE CLOUD PROJECT" },
    },
    goldengate: {
      label: "GoldenGate",
      code: "OGG",
      actions: {
        overview: { label: "Process overview", preview: "adminclient INFO ALL" },
        lag: { label: "Extract and Replicat lag", preview: "adminclient LAG EXTRACT * / LAG REPLICAT *" },
        messages: { label: "Recent error messages", preview: "adminclient VIEW MESSAGES" },
        extract: { label: "Extract detail", preview: "adminclient INFO EXTRACT <group>, DETAIL" },
        replicat: { label: "Replicat detail", preview: "adminclient INFO REPLICAT <group>, DETAIL" },
        checkpoints: { label: "Checkpoint detail", preview: "adminclient INFO <group>, SHOWCH" },
        versions: { label: "GoldenGate versions", preview: "adminclient VERSIONS" },
      },
      fields: { target: "ADMINISTRATION SERVICE URL", secondary: "WALLET ALIAS", scope: "PROCESS GROUP" },
    },
  };

  const ribbonDefinitions = {
    overview: { code: "OPS", title: "Operations mission control", copy: "Readiness, activity and protected entry points", cards: [["STACK", "15 DB / DW adapters", "One portable console"], ["SAFETY", "Read-only first", "Explicit unlock for change"], ["ACCESS", "Loopback only", "No cloud relay"]], action: "Open SQL Studio", view: "sql" },
    sql: { code: "SQL", title: "Database workbench", copy: "Connection, navigator, scripts and result evidence", cards: [["TARGET", "Current database", "Follows connection selection"], ["EDITOR", "Persistent tabs", "Results + messages"], ["PROTECTION", "Read-only", "Writes require unlock"]], action: "Connection settings", target: "sqlEngine" },
    performance: { code: "PERF", title: "Performance command center", copy: "Health, runtime evidence, root cause and recommendation", cards: [["ENGINE", "Selected engine", "Shared across all checks"], ["IDENTIFIER", "Statement focus", "SQL_ID / queryid / digest"], ["EVIDENCE", "Retained only", "No trace is enabled"]], action: "Capture health", target: "performanceHealthSection" },
    investigation: { code: "EVID", title: "Incident evidence workspace", copy: "Plans, baselines, flight records and deployment context", cards: [["TIMELINE", "Correlated events", "Database + DevOps"], ["COMPARE", "Before / after", "Regression evidence"], ["EXPORT", "Review package", "Secrets excluded"]], action: "Open evidence", view: "investigation" },
    logs: { code: "LOG", title: "Observability explorer", copy: "24-hour findings, live tail and trace analysis", cards: [["WINDOW", "Last 24 hours", "1–72 hour control"], ["SEVERITY", "Color classified", "Errors stay red"], ["SOURCE", "Remote or native", "Bounded read only"]], action: "Open findings", target: "logInsights24h" },
    devops: { code: "OPS", title: "Platform engineering cockpit", copy: "Kubernetes, Docker, Kafka, delivery and drift", cards: [["CONTEXT", "Existing identity", "Kubeconfig / CLI login"], ["CHANGE", "Read-only default", "Preflight + confirmation"], ["COMPARE", "Version + redline", "Local evidence"]], action: "Container dashboard", target: "containerVisualBody" },
    terminal: { code: "›_", title: "Protected session manager", copy: "Tabby-style tabs, splits, profiles and search", cards: [["SESSIONS", "Restored profiles", "Output stays in memory"], ["LAYOUT", "Split evidence", "Compare two contexts"], ["COMMANDS", "Strict allowlist", "No shell chaining"]], action: "New terminal tab", terminalAction: "new" },
    security: { code: "SAFE", title: "Local security boundary", copy: "Portable controls, trust posture and policy", cards: [["NETWORK", "127.0.0.1", "Rejects remote hosts"], ["SECRETS", "Memory only", "Passwords not persisted"], ["COMMANDS", "Allowlisted", "Bounded execution"]], action: "Review controls", target: "security-view" },
  };

  const terminalState = {
    sessions: [],
    primaryId: "",
    splitId: "",
    focusedId: "",
    search: "",
  };

  function terminalId() {
    return globalThis.crypto?.randomUUID?.() || `terminal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function firstAction(profile) {
    return Object.keys(terminalProfiles[profile]?.actions || {})[0] || "";
  }

  function sanitizeTerminalSession(value) {
    const profile = terminalProfiles[value?.profile] ? value.profile : "system";
    const action = terminalProfiles[profile].actions[value?.action] ? value.action : firstAction(profile);
    const text = (input, max = 1024) => String(input || "").replace(/[\r\n\0]/g, "").slice(0, max);
    return {
      id: /^[A-Za-z0-9-]{8,80}$/.test(String(value?.id || "")) ? value.id : terminalId(),
      name: text(value?.name || terminalProfiles[profile].label, 60),
      profile,
      action,
      target: text(value?.target, 512),
      secondary: text(value?.secondary, 255),
      scope: text(value?.scope, 255),
      cwd: text(value?.cwd, 1024),
      output: "",
      command: "",
      status: "ready",
      updatedAt: null,
    };
  }

  function saveTerminalSessions() {
    try {
      const sessions = terminalState.sessions.slice(0, MAX_TERMINAL_SESSIONS).map(({ output, command, status, updatedAt, ...session }) => session);
      localStorage.setItem(TERMINAL_STORAGE_KEY, JSON.stringify({ version: 1, sessions, primaryId: terminalState.primaryId, splitId: terminalState.splitId }));
    } catch { /* local preferences are optional */ }
  }

  function loadTerminalSessions() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TERMINAL_STORAGE_KEY) || "null");
      if (parsed?.version === 1 && Array.isArray(parsed.sessions)) terminalState.sessions = parsed.sessions.slice(0, MAX_TERMINAL_SESSIONS).map(sanitizeTerminalSession);
      if (terminalState.sessions.length) {
        terminalState.primaryId = terminalState.sessions.some((session) => session.id === parsed.primaryId) ? parsed.primaryId : terminalState.sessions[0].id;
        terminalState.splitId = terminalState.sessions.some((session) => session.id === parsed.splitId && session.id !== terminalState.primaryId) ? parsed.splitId : "";
      }
    } catch { /* start with a fresh protected session */ }
    if (!terminalState.sessions.length) {
      const session = sanitizeTerminalSession({ profile: "system", name: "Local readiness" });
      terminalState.sessions.push(session);
      terminalState.primaryId = session.id;
    }
    terminalState.focusedId = terminalState.primaryId;
  }

  function terminalSession(id = terminalState.focusedId) {
    return terminalState.sessions.find((session) => session.id === id) || terminalState.sessions[0];
  }

  function createTerminalSession(profile = "system", focus = true) {
    if (terminalState.sessions.length >= MAX_TERMINAL_SESSIONS) {
      toast(`Terminal tabs are limited to ${MAX_TERMINAL_SESSIONS}`, true);
      return null;
    }
    const definition = terminalProfiles[profile] || terminalProfiles.system;
    const count = terminalState.sessions.filter((session) => session.profile === profile).length + 1;
    const session = sanitizeTerminalSession({ profile, name: `${definition.label} ${count}`, action: firstAction(profile), ...(definition.defaults || {}) });
    terminalState.sessions.push(session);
    if (focus) {
      terminalState.primaryId = session.id;
      terminalState.focusedId = session.id;
      if (terminalState.splitId === session.id) terminalState.splitId = "";
    }
    saveTerminalSessions();
    renderTerminalWorkspace();
    return session;
  }

  function closeTerminalSession(id = terminalState.focusedId) {
    if (terminalState.sessions.length === 1) {
      terminalState.sessions[0].output = "";
      terminalState.sessions[0].command = "";
      terminalState.sessions[0].status = "ready";
      renderTerminalWorkspace();
      return toast("The last terminal tab was cleared");
    }
    const closing = terminalSession(id);
    terminalState.sessions = terminalState.sessions.filter((session) => session.id !== id);
    if (terminalState.splitId === id) terminalState.splitId = "";
    if (terminalState.primaryId === id) {
      terminalState.primaryId = terminalState.splitId || terminalState.sessions[0].id;
      terminalState.splitId = "";
    }
    terminalState.focusedId = terminalState.primaryId;
    saveTerminalSessions();
    renderTerminalWorkspace();
    toast(`${closing.name} closed`);
  }

  function toggleTerminalSplit() {
    if (terminalState.splitId) {
      terminalState.splitId = "";
      terminalState.focusedId = terminalState.primaryId;
      saveTerminalSessions();
      renderTerminalWorkspace();
      return toast("Terminal split closed");
    }
    let secondary = terminalState.sessions.find((session) => session.id !== terminalState.primaryId);
    if (!secondary) secondary = createTerminalSession(terminalSession()?.profile || "system", false);
    if (!secondary) return;
    terminalState.splitId = secondary.id;
    terminalState.focusedId = secondary.id;
    saveTerminalSessions();
    renderTerminalWorkspace();
    toast("Terminal split opened");
  }

  function setTerminalFieldLabel(id, label, visible) {
    const element = document.getElementById(id);
    if (!element) return;
    element.classList.toggle("hidden", !visible);
    if (visible && element.firstChild?.nodeType === Node.TEXT_NODE) element.firstChild.nodeValue = label;
  }

  function terminalPreview(session) {
    const definition = terminalProfiles[session.profile];
    let preview = definition.actions[session.action]?.preview || "Approved read-only inspection";
    const replacements = [
      ["<server>", session.target],
      ["<host-alias>", session.target],
      ["<container>", session.target],
      ["<object>", session.target],
      ["<topic>", session.secondary],
      ["<group>", session.scope],
      ["<resource>", session.scope],
    ];
    replacements.forEach(([placeholder, value]) => {
      if (value) preview = preview.replaceAll(placeholder, value);
    });
    const context = [];
    if (session.profile === "kubernetes" && session.target) context.push(`--context ${session.target}`);
    if (session.profile === "kubernetes" && session.secondary) context.push(`-n ${session.secondary}`);
    if (session.profile === "github" && session.target) context.push(`--repo ${session.target}`);
    if (session.profile === "aws" && session.target) context.push(`--profile ${session.target}`);
    if (session.profile === "aws" && session.secondary) context.push(`--region ${session.secondary}`);
    if (session.cwd) context.push(`[cwd: ${session.cwd}]`);
    return `${preview}${context.length ? `  ${context.join(" ")}` : ""}`;
  }

  function syncFocusedTerminalSession() {
    const session = terminalSession();
    if (!session) return;
    const profile = document.getElementById("terminalProfile").value;
    const profileChanged = profile !== session.profile;
    session.profile = terminalProfiles[profile] ? profile : "system";
    if (profileChanged) {
      session.action = firstAction(session.profile);
      Object.assign(session, terminalProfiles[session.profile].defaults || {});
      session.name = terminalProfiles[session.profile].label;
    }
    session.action = document.getElementById("terminalAction").value || session.action;
    session.target = document.getElementById("terminalTarget").value.trim();
    session.secondary = document.getElementById("terminalSecondary").value.trim();
    session.scope = document.getElementById("terminalScope").value.trim();
    session.cwd = document.getElementById("terminalCwd").value.trim();
    document.getElementById("terminalCommandPreview").value = terminalPreview(session);
    saveTerminalSessions();
  }

  function renderTerminalControls() {
    const session = terminalSession();
    const definition = terminalProfiles[session.profile];
    const profile = document.getElementById("terminalProfile");
    profile.value = session.profile;
    const action = document.getElementById("terminalAction");
    action.innerHTML = Object.entries(definition.actions).map(([id, item]) => `<option value="${escapeHtml(id)}">${escapeHtml(item.label)}</option>`).join("");
    action.value = definition.actions[session.action] ? session.action : firstAction(session.profile);
    session.action = action.value;
    const fields = definition.fields || {};
    setTerminalFieldLabel("terminalTargetLabel", fields.target || "TARGET", Boolean(fields.target));
    setTerminalFieldLabel("terminalSecondaryLabel", fields.secondary || "SECONDARY", Boolean(fields.secondary));
    setTerminalFieldLabel("terminalScopeLabel", fields.scope || "RESOURCE", Boolean(fields.scope));
    setTerminalFieldLabel("terminalCwd", fields.cwd || "WORKING FOLDER", true);
    document.getElementById("terminalTarget").value = session.target || "";
    document.getElementById("terminalSecondary").value = session.secondary || "";
    document.getElementById("terminalScope").value = session.scope || "";
    document.getElementById("terminalCwd").value = session.cwd || "";
    document.getElementById("terminalCommandPreview").value = terminalPreview(session);
  }

  function renderTerminalTabs() {
    document.getElementById("terminalTabs").innerHTML = terminalState.sessions.map((session) => {
      const definition = terminalProfiles[session.profile];
      return `<button type="button" class="tabby-tab ${session.status} ${session.id === terminalState.focusedId ? "active" : ""}" data-terminal-tab="${escapeHtml(session.id)}"><i></i><span><b>${escapeHtml(session.name)}</b><small>${escapeHtml(definition.label)}</small></span><em data-terminal-close="${escapeHtml(session.id)}" title="Close tab">×</em></button>`;
    }).join("");
  }

  function highlightTerminalOutput(text, query) {
    const escaped = escapeHtml(text);
    if (!query) return escaped;
    const needle = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!needle) return escaped;
    return escaped.replace(new RegExp(needle, "gi"), (match) => `<mark>${match}</mark>`);
  }

  function terminalPaneMarkup(session) {
    const definition = terminalProfiles[session.profile];
    const focused = session.id === terminalState.focusedId;
    const body = session.output
      ? `<pre class="terminal-pane-output">${session.command ? `<span class="terminal-prompt-line">${escapeHtml(definition.code)} ›</span> <span class="terminal-command-line">${escapeHtml(session.command)}</span>\n\n` : ""}${highlightTerminalOutput(session.output, terminalState.search)}</pre>`
      : `<div class="terminal-pane-empty"><div><span>${escapeHtml(definition.code)}</span><b>${escapeHtml(session.name)} is ready</b><p>Choose a protected action above. The exact allowlisted command appears in the command bar before execution.</p></div></div>`;
    return `<article class="terminal-pane ${focused ? "focused" : ""}" data-terminal-pane="${escapeHtml(session.id)}"><header class="terminal-pane-head"><div><b>${escapeHtml(definition.label)}</b><small>${escapeHtml(session.command || terminalPreview(session))}</small></div><span>${session.updatedAt ? escapeHtml(new Date(session.updatedAt).toLocaleTimeString()) : "NOT RUN"}</span></header>${body}</article>`;
  }

  function renderTerminalPanes() {
    const ids = [terminalState.primaryId, terminalState.splitId].filter(Boolean);
    const panes = document.getElementById("terminalPanes");
    panes.classList.toggle("split", ids.length > 1);
    panes.innerHTML = ids.map((id) => terminalPaneMarkup(terminalSession(id))).join("");
  }

  function updateTerminalStatus() {
    const session = terminalSession();
    const stateElement = document.getElementById("terminalSessionState");
    const label = session.status === "running" ? "RUNNING" : session.status === "error" ? "FAILED" : session.status === "complete" ? "COMPLETE" : "READY";
    stateElement.className = `terminal-session-state ${session.status}`;
    stateElement.innerHTML = `<i></i>${label}`;
    document.getElementById("terminalSessionMeta").textContent = `${terminalState.sessions.length} tab${terminalState.sessions.length === 1 ? "" : "s"} · ${terminalState.splitId ? "split view" : "single pane"} · output in memory`;
    document.getElementById("terminalSplit").textContent = terminalState.splitId ? "Close split" : "Split right";
  }

  function renderTerminalWorkspace() {
    renderTerminalTabs();
    renderTerminalControls();
    renderTerminalPanes();
    updateTerminalStatus();
    updateWorkspaceRibbon("terminal");
  }

  async function runTerminalSession() {
    syncFocusedTerminalSession();
    const session = terminalSession();
    const definition = terminalProfiles[session.profile];
    session.status = "running";
    session.command = terminalPreview(session);
    session.output = "Running approved read-only inspection…";
    session.updatedAt = new Date().toISOString();
    renderTerminalWorkspace();
    try {
      let output;
      if (session.profile === "system") {
        const result = await api(definition.actions[session.action].endpoint);
        output = JSON.stringify(result, null, 2);
      } else {
        const result = await api("/api/devops/run", {
          method: "POST",
          body: JSON.stringify({ tool: session.profile, action: session.action, target: session.target, secondary: session.secondary, scope: session.scope, cwd: session.cwd }),
        });
        session.command = result.displayCommand || session.command;
        output = [result.stdout, result.stderr].filter(Boolean).join("\n") || "Command completed without output.";
      }
      session.output = String(output).slice(-MAX_SESSION_OUTPUT);
      session.status = "complete";
      session.updatedAt = new Date().toISOString();
      toast(`${definition.label} inspection completed`);
    } catch (error) {
      session.output = String(error.message || error).slice(0, MAX_SESSION_OUTPUT);
      session.status = "error";
      session.updatedAt = new Date().toISOString();
      toast(error.message || "Terminal inspection failed", true);
    }
    renderTerminalWorkspace();
  }

  function installWorkspaceRibbons() {
    Object.entries(ribbonDefinitions).forEach(([view, definition]) => {
      const container = document.getElementById(`${view}-view`);
      const intro = container?.querySelector(".page-intro");
      if (!intro || container.querySelector(".workspace-intel-ribbon")) return;
      const ribbon = document.createElement("section");
      ribbon.className = "workspace-intel-ribbon";
      ribbon.dataset.workspaceRibbon = view;
      ribbon.innerHTML = `<header><span>${escapeHtml(definition.code)}</span><div><b>${escapeHtml(definition.title)}</b><small>${escapeHtml(definition.copy)}</small></div></header>${definition.cards.map(([label, value, copy], index) => `<article data-ribbon-card="${index}"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b><small>${escapeHtml(copy)}</small></article>`).join("")}<button type="button">${escapeHtml(definition.action)}</button>`;
      ribbon.querySelector("button").addEventListener("click", () => {
        if (definition.terminalAction === "new") return createTerminalSession(document.getElementById("terminalProfile")?.value || "system");
        if (definition.view) navigate(definition.view);
        if (definition.target) {
          const target = document.getElementById(definition.target);
          target?.scrollIntoView({ behavior: "smooth", block: "center" });
          if (target && !target.disabled && /^(?:INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName)) window.setTimeout(() => target.focus({ preventScroll: true }), 260);
        }
      });
      intro.insertAdjacentElement("afterend", ribbon);
    });
  }

  function updateWorkspaceRibbon(view = state.currentView) {
    const ribbon = document.querySelector(`[data-workspace-ribbon="${view}"]`);
    if (!ribbon) return;
    const cards = [...ribbon.querySelectorAll("[data-ribbon-card]")];
    const values = {
      overview: [
        ["STACK", "15 DB / DW adapters", `${Object.values(state.tools || {}).filter((tool) => tool.available).length || 0} local tools ready`],
        ["SAFETY", "Read-only first", "Explicit unlock for change"],
        ["SESSION", state.ui?.sidebar === "auto" ? "Auto-hide rail" : "Pinned navigation", "Ctrl+B toggles the left panel"],
      ],
      sql: [
        ["TARGET", sqlAdapterUi[document.getElementById("sqlEngine")?.value]?.name || "Database", document.getElementById("sqlDatabase")?.value || "No service selected"],
        ["CONNECTION", state.sqlStudio?.connected ? "Connected" : "Disconnected", state.sqlStudio?.connected ? "Direct protected session" : "Enter approved credentials"],
        ["EDITOR", `${state.editorTabs?.length || 0} script tab${state.editorTabs?.length === 1 ? "" : "s"}`, "Ctrl+Enter runs the active command"],
      ],
      performance: [
        ["ENGINE", sqlAdapterUi[state.performanceWorkspace?.engine]?.name || "Oracle", "Shared across every diagnostic"],
        ["IDENTIFIER", state.performanceWorkspace?.identifiers?.[state.performanceWorkspace?.engine] || "Not selected", "Statement focus"],
        ["MODE", String(state.performanceWorkspace?.mode || "overview").toUpperCase(), "Progressive evidence workflow"],
      ],
      investigation: [
        ["BASELINES", `${state.investigation?.baselines?.length || 0} saved`, "Plan and workload comparisons"],
        ["RECORDINGS", `${state.investigation?.recordings?.length || 0} windows`, "Before / after evidence"],
        ["TIMELINE", `${state.investigation?.events?.length || 0} events`, "Database and delivery context"],
      ],
      logs: [
        ["WINDOW", `Last ${document.getElementById("logWindowHours")?.value || 24} hours`, "Timestamp-aware filtering"],
        ["SOURCE", typeof currentSource === "function" ? currentSource().name : "Database log", document.getElementById("logTransport")?.selectedOptions?.[0]?.textContent || "Remote server"],
        ["ERRORS", document.getElementById("logInsightErrorCount")?.textContent || "0", "Critical and errors in red"],
      ],
      devops: [
        ["TOOL", labels[document.getElementById("devopsTool")?.value] || "Platform", "Approved local client"],
        ["CONTAINERS", String(state.containerDashboard?.mode || "kubernetes").toUpperCase(), String(state.containerDashboard?.accessMode || "read").toUpperCase()],
        ["VERSION RADAR", state.versionComparison ? "Captured" : "Not captured", "Compare local CLI changes"],
      ],
      terminal: [
        ["SESSIONS", `${terminalState.sessions.length} open`, "Profiles restore locally"],
        ["LAYOUT", terminalState.splitId ? "Split panes" : "Single pane", "Compare protected outputs"],
        ["PROFILE", terminalProfiles[terminalSession()?.profile]?.label || "DBridge host", "Allowlisted inspection"],
      ],
      security: [
        ["NETWORK", "127.0.0.1 only", "Remote Host headers rejected"],
        ["SECRETS", "Memory only", "Passwords are never persisted"],
        ["COMMANDS", "Strict allowlists", "Bounded input and output"],
      ],
    }[view];
    values?.forEach((value, index) => {
      const card = cards[index];
      if (!card) return;
      card.querySelector("span").textContent = value[0];
      card.querySelector("b").textContent = value[1];
      card.querySelector("small").textContent = value[2];
    });
  }

  function bindTerminalWorkspace() {
    document.getElementById("terminalNewTab").addEventListener("click", () => createTerminalSession(document.getElementById("terminalProfile").value));
    document.getElementById("terminalTabAdd").addEventListener("click", () => createTerminalSession(document.getElementById("terminalProfile").value));
    document.getElementById("terminalCloseTab").addEventListener("click", () => closeTerminalSession());
    document.getElementById("terminalSplit").addEventListener("click", toggleTerminalSplit);
    document.getElementById("terminalRun").addEventListener("click", runTerminalSession);
    document.getElementById("terminalCopy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(terminalSession().output || ""); toast("Terminal output copied"); }
      catch { toast("Clipboard access was blocked", true); }
    });
    document.getElementById("terminalClear").addEventListener("click", () => {
      const session = terminalSession();
      session.output = "";
      session.command = "";
      session.status = "ready";
      renderTerminalWorkspace();
    });
    document.getElementById("terminalSearch").addEventListener("input", (event) => {
      terminalState.search = event.target.value;
      renderTerminalPanes();
    });
    document.getElementById("terminalProfile").addEventListener("change", () => {
      syncFocusedTerminalSession();
      renderTerminalWorkspace();
    });
    ["terminalAction", "terminalTarget", "terminalSecondary", "terminalScope", "terminalCwd"].forEach((id) => {
      document.getElementById(id).addEventListener(id === "terminalAction" ? "change" : "input", () => {
        syncFocusedTerminalSession();
        if (id === "terminalAction") renderTerminalPanes();
      });
    });
    document.getElementById("terminalTabs").addEventListener("click", (event) => {
      const close = event.target.closest("[data-terminal-close]");
      if (close) {
        event.stopPropagation();
        return closeTerminalSession(close.dataset.terminalClose);
      }
      const tab = event.target.closest("[data-terminal-tab]");
      if (!tab) return;
      const id = tab.dataset.terminalTab;
      if (terminalState.splitId === id || terminalState.primaryId === id) terminalState.focusedId = id;
      else {
        terminalState.primaryId = id;
        terminalState.focusedId = id;
        if (terminalState.splitId === id) terminalState.splitId = "";
      }
      saveTerminalSessions();
      renderTerminalWorkspace();
    });
    document.getElementById("terminalPanes").addEventListener("click", (event) => {
      const pane = event.target.closest("[data-terminal-pane]");
      if (!pane) return;
      terminalState.focusedId = pane.dataset.terminalPane;
      renderTerminalWorkspace();
    });
  }

  function installShellIntegration() {
    titles.terminal = "Terminal";
    pageDetails.terminal = { eyebrow: "LOCAL / TERMINAL", context: "Protected Tabby-style sessions for database and platform operations" };
    if (!commandPaletteItems.some((item) => item.id === "terminal")) {
      const securityIndex = commandPaletteItems.findIndex((item) => item.id === "security");
      commandPaletteItems.splice(securityIndex < 0 ? commandPaletteItems.length : securityIndex, 0, { id: "terminal", code: "›_", label: "Open operations terminal", description: "Tabby-style tabs, split panes, profiles and protected command execution", view: "terminal", target: "terminalProfile", keywords: "terminal tabby shell tabs split pane powershell ssh kubectl docker git" });
    }
    shortcutMapGroups[0].items[1].label = "Jump to a workspace (1–8)";
    shortcutMapGroups.push({
      title: "Terminal workspace",
      items: [
        { keys: "Ctrl Shift T", label: "New protected terminal tab" },
        { keys: "Ctrl Shift E", label: "Toggle terminal split pane" },
        { keys: "Ctrl Shift W", label: "Close focused terminal tab" },
        { keys: "Ctrl Shift F", label: "Search terminal output" },
      ],
    });

    if (localStorage.getItem(SHELL_MIGRATION_KEY) !== "1") {
      state.ui.sidebar = "auto";
      persistUiPreferences();
      applySidebarMode(false);
      localStorage.setItem(SHELL_MIGRATION_KEY, "1");
    }

    const originalNavigate = navigate;
    navigate = function enhancedNavigate(view) {
      originalNavigate(view);
      updateWorkspaceRibbon(view);
      if (view === "terminal") renderTerminalWorkspace();
    };

    document.addEventListener("keydown", (event) => {
      const editing = event.target instanceof HTMLElement && Boolean(event.target.closest("input, textarea, select, [contenteditable='true']"));
      if (!editing && event.altKey && /^[1-8]$/.test(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const views = ["overview", "sql", "performance", "investigation", "logs", "devops", "terminal", "security"];
        navigate(views[Number(event.key) - 1]);
        return;
      }
      if (state.currentView !== "terminal" || !(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (!["t", "e", "w", "f"].includes(key)) return;
      event.preventDefault();
      if (key === "t") createTerminalSession(document.getElementById("terminalProfile").value);
      if (key === "e") toggleTerminalSplit();
      if (key === "w") closeTerminalSession();
      if (key === "f") document.getElementById("terminalSearch").focus();
    }, true);
  }

  loadTerminalSessions();
  installWorkspaceRibbons();
  bindTerminalWorkspace();
  installShellIntegration();
  renderTerminalWorkspace();
  updateWorkspaceRibbon(state.currentView);
})();
