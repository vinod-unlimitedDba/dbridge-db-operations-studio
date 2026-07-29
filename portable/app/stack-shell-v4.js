(() => {
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const DEVOPS_CONTEXT_KEY = "dbridge.devops.context.v2";
  const DIAGNOSTICS_MODE_KEY = "dbridge.diagnostics.mode.v1";
  let diagnosticsMode = "triage";
  let devopsMode = "platform";

  function safeStorageRead(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function safeStorageWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* preference only */ }
  }

  function updateNavigation() {
    const nav = q("#nav");
    const investigationButton = q('[data-view="investigation"]', nav);
    investigationButton?.remove();

    const performanceButton = q('[data-view="performance"]', nav);
    if (performanceButton) {
      q(".nav-copy b", performanceButton).textContent = "SQL Diagnostics";
      q(".nav-copy small", performanceButton).textContent = "Performance, plans and incidents";
    }

    const navOrder = ["overview", "sql", "performance", "logs", "devops", "terminal", "security"];
    navOrder.forEach((view, index) => {
      const button = q(`[data-view="${view}"]`, nav);
      if (!button) return;
      const number = String(index + 1).padStart(2, "0");
      const icon = q(".nav-icon", button);
      const key = q("kbd", button);
      if (icon) icon.textContent = number;
      if (key) key.textContent = String(index + 1);
    });

    const core = q("#coreWorkspaceTabs");
    q('[data-workspace-tab="investigation"]', core)?.remove();
    const performanceTab = q('[data-workspace-tab="performance"]', core);
    if (performanceTab) {
      q("b", performanceTab).textContent = "SQL Diagnostics";
      q("small", performanceTab).textContent = "Triage · compare · decide";
    }
    qa("[data-workspace-tab]", core).forEach((button, index) => {
      const badge = q("i", button);
      if (badge) badge.textContent = String(index + 1);
    });

    qa('[data-jump="investigation"]').forEach((button) => { button.dataset.jump = "performance"; });
    qa('[data-workspace-view="investigation"]').forEach((button) => {
      button.dataset.workspaceView = "performance";
      button.dataset.workspaceTarget = "diagnosticsEvidenceStudio";
    });

    if (typeof titles === "object") {
      titles.performance = "SQL Diagnostics";
      titles.investigation = "SQL Diagnostics";
    }
    if (typeof pageDetails === "object") {
      pageDetails.performance = {
        eyebrow: "DATABASE / SQL DIAGNOSTICS",
        context: "Performance, plans, regressions, traces and incident evidence in one workspace",
      };
      pageDetails.investigation = pageDetails.performance;
    }
    if (typeof commandPaletteItems !== "undefined") {
      const diagnostic = commandPaletteItems.find((item) => item.id === "performance");
      if (diagnostic) {
        diagnostic.label = "SQL Diagnostics workspace";
        diagnostic.description = "Triage workload pressure, statement plans, regressions and incident evidence";
        diagnostic.keywords += " flight recorder visual plan timeline regression";
      }
      const investigation = commandPaletteItems.find((item) => item.id === "investigation");
      if (investigation) {
        investigation.label = "Plan and regression evidence";
        investigation.view = "performance";
        investigation.target = "diagnosticsEvidenceStudio";
      }
    }

    const version = q(".sidebar .version b");
    if (version) version.textContent = "v2.22";
  }

  function diagnosticsLabel(mode) {
    const labels = {
      triage: ["TRIAGE", "Live pressure, SQL identifier analysis and engine-specific diagnostics"],
      recorder: ["FLIGHT RECORDER", "Capture bounded performance samples and compare workload windows"],
      plan: ["VISUAL PLAN", "Inspect the heavy route, operator cost, rows and access-path risk"],
      regression: ["REGRESSION", "Compare a known-good plan with the changed or slow plan"],
      timeline: ["INCIDENT TIMELINE", "Correlate SQL evidence with delivery and configuration events"],
      controls: ["EVIDENCE CONTROLS", "Validate adapters, thresholds, baselines and export policy"],
    };
    return labels[mode] || labels.triage;
  }

  function activateDiagnostics(mode, focusTarget = "") {
    const valid = ["triage", "recorder", "plan", "regression", "timeline", "controls"];
    diagnosticsMode = valid.includes(mode) ? mode : "triage";
    q("#diagnosticsTriagePanel")?.toggleAttribute("hidden", diagnosticsMode !== "triage");

    qa("#diagnosticsJourney [data-diagnostics-mode]").forEach((button) => {
      const active = button.dataset.diagnosticsMode === diagnosticsMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    const evidenceModes = { recorder: "flight", plan: "plan", regression: "regression", timeline: "timeline", controls: "controls" };
    if (diagnosticsMode === "triage") {
      qa("#diagnosticsEvidenceBody > .investigation-section").forEach((section) => section.classList.remove("active"));
    } else {
      if (typeof loadInvestigationWorkspace === "function" && !state.investigation.loaded) loadInvestigationWorkspace();
      if (typeof switchInvestigationTab === "function") switchInvestigationTab(evidenceModes[diagnosticsMode]);
    }

    const [title, copy] = diagnosticsLabel(diagnosticsMode);
    const label = q("#diagnosticsEvidenceLabel");
    if (label) {
      q("span", label).textContent = title.slice(0, 4);
      q("b", label).textContent = title;
      q("small", label).textContent = copy;
      label.hidden = diagnosticsMode === "triage";
    }
    safeStorageWrite(DIAGNOSTICS_MODE_KEY, { mode: diagnosticsMode });

    if (focusTarget) {
      requestAnimationFrame(() => q(`#${CSS.escape(focusTarget)}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function buildDiagnosticsWorkspace() {
    const performance = q("#performance-view");
    const investigation = q("#investigation-view");
    if (!performance || !investigation || q("#diagnosticsV4Hero")) return;

    const oldIntro = q(":scope > .page-intro", performance);
    if (oldIntro) oldIntro.remove();

    const triage = document.createElement("div");
    triage.id = "diagnosticsTriagePanel";
    triage.className = "diagnostics-panel";
    [...performance.children].forEach((child) => triage.appendChild(child));

    const hero = document.createElement("section");
    hero.id = "diagnosticsV4Hero";
    hero.className = "diagnostics-v4-hero";
    hero.innerHTML = `
      <header class="diagnostics-v4-head">
        <div class="diagnostics-v4-copy">
          <span>UNIFIED SQL DIAGNOSTICS / MULTI-DATABASE</span>
          <h1>Follow one evidence chain from symptom to decision.</h1>
          <p>Start with workload pressure, isolate a statement, inspect the heavy plan route, compare history and release context, then export a review-ready recommendation.</p>
        </div>
        <div class="diagnostics-v4-actions">
          <button type="button" data-diagnostics-open="recorder">Start flight recorder</button>
          <button type="button" data-diagnostics-open="plan">Analyze a plan</button>
          <span id="diagnosticsExportMount"></span>
        </div>
      </header>
      <div class="diagnostics-v4-pulse" id="diagnosticsPulse">
        <article><span>ACTIVE ENGINE</span><strong id="diagnosticsEngine">Oracle</strong><small>Shared SQL Studio context</small></article>
        <article><span>PLAN HEALTH</span><strong id="diagnosticsPlanHealth">—</strong><small>Current visual plan</small></article>
        <article><span>BASELINES</span><strong id="diagnosticsBaselineCount">0</strong><small>Saved locally</small></article>
        <article><span>FLIGHT WINDOWS</span><strong id="diagnosticsRecordingCount">0</strong><small>Before / after evidence</small></article>
        <article><span>TIMELINE</span><strong id="diagnosticsTimelineCount">0</strong><small>Correlated events</small></article>
      </div>`;

    const journey = document.createElement("nav");
    journey.id = "diagnosticsJourney";
    journey.className = "diagnostics-journey";
    journey.setAttribute("aria-label", "Unified SQL diagnostic workflow");
    journey.innerHTML = `
      <button type="button" class="active" data-diagnostics-mode="triage"><i>01</i><span><b>Triage</b><small>Pressure and SQL_ID</small></span></button>
      <button type="button" data-diagnostics-mode="recorder"><i>02</i><span><b>Record</b><small>Live workload window</small></span></button>
      <button type="button" data-diagnostics-mode="plan"><i>03</i><span><b>Visual plan</b><small>Heavy execution route</small></span></button>
      <button type="button" data-diagnostics-mode="regression"><i>04</i><span><b>Regression</b><small>Good versus slow</small></span></button>
      <button type="button" data-diagnostics-mode="timeline"><i>05</i><span><b>Timeline</b><small>Database plus delivery</small></span></button>
      <button type="button" data-diagnostics-mode="controls"><i>06</i><span><b>Controls</b><small>Access and evidence</small></span></button>`;

    const evidenceStudio = document.createElement("section");
    evidenceStudio.id = "diagnosticsEvidenceStudio";
    evidenceStudio.innerHTML = `
      <div class="diagnostics-evidence-label" id="diagnosticsEvidenceLabel" hidden>
        <span>PLAN</span><div><b>VISUAL PLAN</b><small>Execution evidence</small></div>
      </div>
      <div id="diagnosticsEvidenceBody"></div>`;
    const evidenceBody = q("#diagnosticsEvidenceBody", evidenceStudio);
    qa(":scope > .investigation-section", investigation).forEach((section) => evidenceBody.appendChild(section));

    const oldActions = q(".investigation-hero-actions", investigation);
    if (oldActions) q("#diagnosticsExportMount", hero).replaceWith(oldActions);

    performance.append(hero, journey, triage, evidenceStudio);
    investigation.hidden = true;
    investigation.setAttribute("aria-hidden", "true");
    investigation.classList.remove("view", "active");

    qa("[data-diagnostics-mode]", journey).forEach((button) => {
      button.addEventListener("click", () => activateDiagnostics(button.dataset.diagnosticsMode));
    });
    qa("[data-diagnostics-open]", hero).forEach((button) => {
      button.addEventListener("click", () => activateDiagnostics(button.dataset.diagnosticsOpen, "diagnosticsEvidenceStudio"));
    });

    const saved = safeStorageRead(DIAGNOSTICS_MODE_KEY, { mode: "triage" });
    activateDiagnostics(saved.mode || "triage");
  }

  const devopsGroups = {
    platform: {
      title: "Runtime platform",
      copy: "Kubernetes and Docker inventory, pressure, events, logs and controlled lifecycle actions.",
      selectors: [".devops-grid", ".container-visual-panel"],
    },
    delivery: {
      title: "Delivery intelligence",
      copy: "Release gates, topology, workflow runs, configuration drift, Kafka lag and approved audits.",
      selectors: [".devops-intelligence-panel", ".devops-audit-panel"],
    },
    replication: {
      title: "Data movement",
      copy: "GoldenGate processes, lag, checkpoints, ABEND evidence and trusted server logs.",
      selectors: [".ogg-operations-panel"],
    },
    changes: {
      title: "Change comparison",
      copy: "CLI version drift and redline comparison for manifests, Terraform, SQL and configuration.",
      selectors: [".version-comparison-panel", ".file-compare-panel"],
    },
    inspect: {
      title: "Guided inspection",
      copy: "Run one bounded, visible, allowlisted CLI method against the selected platform context.",
      selectors: [".tool-runner"],
    },
  };

  function updateDevopsSignals() {
    if (!q("#devopsV4Hero")) return;
    const toolValues = typeof state === "object" && state.tools ? Object.values(state.tools) : [];
    const ready = toolValues.filter((tool) => tool?.available).length;
    const toolCount = toolValues.length;
    const set = (id, value) => { const node = q(`#${id}`); if (node) node.textContent = value; };
    set("devopsReadyTools", toolCount ? `${ready}/${toolCount}` : "Scan");
    set("devopsRuntimeHealth", q("#containerPlatformHealth")?.textContent?.trim() || "Not run");
    set("devopsWarningSignals", q("#containerWarningCount")?.textContent?.trim() || "—");
    set("devopsPipelineSignals", q("#pipelineChangeCount")?.textContent?.trim() || "—");
    set("devopsKafkaSignal", q("#kafkaLagTotal")?.textContent?.trim() || "—");
  }

  function activateDevops(mode, focusTarget = "") {
    devopsMode = devopsGroups[mode] ? mode : "platform";
    qa("#devopsV4Tabs [data-devops-mode]").forEach((button) => {
      const active = button.dataset.devopsMode === devopsMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    qa("#devops-view .devops-v4-section").forEach((node) => {
      node.toggleAttribute("hidden", node.dataset.devopsGroup !== devopsMode);
    });
    const group = devopsGroups[devopsMode];
    q("#devopsSectionTitle").textContent = group.title;
    q("#devopsSectionCopy").textContent = group.copy;
    q("#devopsSectionCode").textContent = devopsMode.toUpperCase();
    if (focusTarget) requestAnimationFrame(() => q(`#${CSS.escape(focusTarget)}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function buildDevopsWorkspace() {
    const view = q("#devops-view");
    if (!view || q("#devopsV4Hero")) return;
    const intro = q(":scope > .page-intro", view);
    if (intro) {
      q("p", intro).textContent = "DEVOPS CONTROL PLANE";
      q("h1", intro).textContent = "Application, platform and delivery evidence";
      q("span", intro).textContent = "Move from resource health to the release, configuration or data-flow change that explains it.";
    }

    const context = safeStorageRead(DEVOPS_CONTEXT_KEY, { environment: "Production", service: "", window: "30m" });
    const hero = document.createElement("section");
    hero.id = "devopsV4Hero";
    hero.className = "devops-v4-hero";
    hero.innerHTML = `
      <header class="devops-v4-head">
        <div class="devops-v4-copy">
          <span>RESOURCE-CENTRIC OPERATIONS</span>
          <h1>See the application before choosing the tool.</h1>
          <p>Keep environment, service and evidence window visible while moving through Kubernetes, Docker, pipelines, Kafka, GoldenGate, drift and approved CLI inspection.</p>
        </div>
        <div class="devops-v4-context">
          <label>ENVIRONMENT<select id="devopsV4Environment"><option>Production</option><option>Staging</option><option>Development</option><option>Disaster recovery</option></select></label>
          <label>EVIDENCE WINDOW<select id="devopsV4Window"><option value="15m">Last 15 minutes</option><option value="30m">Last 30 minutes</option><option value="1h">Last hour</option><option value="24h">Last 24 hours</option></select></label>
          <label>APPLICATION / SERVICE<input id="devopsV4Service" maxlength="100" placeholder="payments-api, finance-etl, orders"></label>
        </div>
      </header>
      <div class="devops-v4-signalbar">
        <article><span>LOCAL TOOLS</span><strong id="devopsReadyTools">Scan</strong><small>Approved clients ready</small></article>
        <article><span>RUNTIME HEALTH</span><strong id="devopsRuntimeHealth">Not run</strong><small>K8s / Docker evidence</small></article>
        <article><span>PLATFORM WARNINGS</span><strong id="devopsWarningSignals">—</strong><small>Events and restarts</small></article>
        <article><span>PIPELINE CHANGE</span><strong id="devopsPipelineSignals">—</strong><small>Against baseline</small></article>
        <article><span>KAFKA LAG</span><strong id="devopsKafkaSignal">—</strong><small>Consumer snapshot</small></article>
      </div>`;
    intro?.after(hero);

    q("#devopsV4Environment").value = context.environment || "Production";
    q("#devopsV4Window").value = context.window || "30m";
    q("#devopsV4Service").value = context.service || "";
    ["devopsV4Environment", "devopsV4Window", "devopsV4Service"].forEach((id) => {
      q(`#${id}`).addEventListener("change", () => {
        safeStorageWrite(DEVOPS_CONTEXT_KEY, {
          environment: q("#devopsV4Environment").value,
          window: q("#devopsV4Window").value,
          service: q("#devopsV4Service").value.trim(),
        });
      });
    });

    const tabs = document.createElement("nav");
    tabs.id = "devopsV4Tabs";
    tabs.className = "devops-v4-tabs";
    tabs.setAttribute("aria-label", "DevOps evidence areas");
    tabs.innerHTML = `
      <button type="button" class="active" data-devops-mode="platform"><i>01</i><span><b>Runtime</b><small>K8s and Docker</small></span></button>
      <button type="button" data-devops-mode="delivery"><i>02</i><span><b>Delivery</b><small>CI/CD and Kafka</small></span></button>
      <button type="button" data-devops-mode="replication"><i>03</i><span><b>Data movement</b><small>GoldenGate</small></span></button>
      <button type="button" data-devops-mode="changes"><i>04</i><span><b>Changes</b><small>Versions and redline</small></span></button>
      <button type="button" data-devops-mode="inspect"><i>05</i><span><b>Inspect</b><small>Approved CLI methods</small></span></button>`;
    hero.after(tabs);

    const guide = document.createElement("div");
    guide.className = "devops-v4-guide";
    guide.innerHTML = `
      <button type="button" data-devops-open="platform" data-devops-focus="containerVisualBody"><span>RED</span><div><b>Runtime symptoms</b><small>Start with rate, errors, duration, saturation, restarts and resource pressure.</small></div></button>
      <button type="button" data-devops-open="delivery" data-devops-focus="pipelineRuns"><span>CI</span><div><b>Delivery correlation</b><small>Compare workflow outcomes, release windows and configuration fingerprints.</small></div></button>
      <button type="button" data-devops-open="delivery" data-devops-focus="kafkaLagView"><span>KFK</span><div><b>Streaming health</b><small>Review group lag, partition concentration and offset progress.</small></div></button>
      <button type="button" data-devops-open="changes" data-devops-focus="fileDiffOutput"><span>DIFF</span><div><b>Change evidence</b><small>Redline manifests and compare approved CLI versions against a baseline.</small></div></button>`;
    tabs.after(guide);

    const banner = document.createElement("div");
    banner.className = "devops-section-banner";
    banner.innerHTML = `<div><b id="devopsSectionTitle">Runtime platform</b><small id="devopsSectionCopy"></small></div><span id="devopsSectionCode">PLATFORM</span>`;
    guide.after(banner);

    Object.entries(devopsGroups).forEach(([group, definition]) => {
      definition.selectors.forEach((selector) => {
        const node = q(`:scope > ${selector}`, view);
        if (!node) return;
        node.classList.add("devops-v4-section");
        node.dataset.devopsGroup = group;
      });
    });

    qa("[data-devops-mode]", tabs).forEach((button) => button.addEventListener("click", () => activateDevops(button.dataset.devopsMode)));
    qa("[data-devops-open]", guide).forEach((button) => button.addEventListener("click", () => activateDevops(button.dataset.devopsOpen, button.dataset.devopsFocus)));
    activateDevops("platform");
    updateDevopsSignals();
    window.setInterval(updateDevopsSignals, 2500);
  }

  function enhanceTerminalCopy() {
    const intro = q("#terminal-view .terminal-page-intro");
    if (intro) {
      q("p", intro).textContent = "LOCAL + REMOTE TERMINAL / SESSION MANAGER";
      q("h1", intro).textContent = "Tabby-style local and trusted-server workspace";
      q("span", intro).textContent = "Use restored read-only inspection tabs or open up to four verified SSH sessions by hostname, IPv4 or bracketed IPv6.";
      const pill = q(".mode-pill", intro);
      if (pill) pill.innerHTML = "<i></i>Local + trusted SSH";
    }

    const targetLabel = q("#terminalTargetLabel");
    if (targetLabel && q("#terminalProfile")?.value === "ssh") {
      targetLabel.childNodes[0].textContent = "HOSTNAME / IP";
    }

    const panel = q("#sshTerminalPanel");
    if (!panel || q("#terminalRemoteMatrix")) return;
    const matrix = document.createElement("div");
    matrix.id = "terminalRemoteMatrix";
    matrix.className = "terminal-remote-matrix";
    matrix.innerHTML = `
      <article><span>TARGETS</span><b>Hostname · IPv4 · IPv6</b><small>Bracketed IPv6 is accepted. Port range is validated before connection.</small></article>
      <article><span>TRUST</span><b>known_hosts required</b><small>A server key must already be trusted; DBridge never silently accepts a new key.</small></article>
      <article><span>IDENTITY</span><b>Agent · key · password</b><small>Secrets are used only for the handshake and are not stored in profiles.</small></article>
      <article><span>BOUNDARY</span><b>4 sessions · 15 min idle</b><small>Each server tab is capped, locally streamed and closed with the application.</small></article>`;
    panel.after(matrix);
  }

  function redirectLegacyInvestigation() {
    if (typeof navigate !== "function" || navigate.__dbridgeV4Redirect) return;
    const original = navigate;
    const redirected = function(view, target) {
      if (view === "investigation") {
        original("performance", "diagnosticsEvidenceStudio");
        activateDiagnostics("plan", target || "diagnosticsEvidenceStudio");
        return;
      }
      return original(view, target);
    };
    redirected.__dbridgeV4Redirect = true;
    navigate = redirected;
  }

  function bindUpdatedShortcuts() {
    const views = ["overview", "sql", "performance", "logs", "devops", "terminal", "security"];
    window.addEventListener("keydown", (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const index = Number(event.key) - 1;
      if (index < 0 || index >= views.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate(views[index]);
    }, true);
  }

  function refreshDiagnosticSignals() {
    if (!q("#diagnosticsV4Hero") || typeof state !== "object") return;
    const names = { oracle: "Oracle", postgres: "PostgreSQL", mongodb: "MongoDB", mysql: "MySQL", sqlserver: "SQL Server" };
    const set = (id, value) => { const node = q(`#${id}`); if (node) node.textContent = value; };
    set("diagnosticsEngine", names[state.performanceWorkspace?.engine] || "Oracle");
    set("diagnosticsPlanHealth", state.investigation?.currentPlan ? `${state.investigation.currentPlan.score}/100` : "—");
    set("diagnosticsBaselineCount", String(state.investigation?.baselines?.length || 0));
    set("diagnosticsRecordingCount", String(state.investigation?.recordings?.length || 0));
    set("diagnosticsTimelineCount", String(state.investigation?.events?.length || 0));
  }

  function init() {
    updateNavigation();
    buildDiagnosticsWorkspace();
    buildDevopsWorkspace();
    enhanceTerminalCopy();
    redirectLegacyInvestigation();
    bindUpdatedShortcuts();
    refreshDiagnosticSignals();
    window.setInterval(refreshDiagnosticSignals, 2000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
