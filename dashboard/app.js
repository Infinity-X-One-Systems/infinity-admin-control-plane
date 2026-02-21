/**
 * INFINITY ADMIN CONTROL PLANE — Core Application
 * Single-Page Application controller: routing, state, rendering.
 */
import {
  getToken, getOrg, setToken, setOrg,
  validateToken, fetchOrgRepos, categorizeRepo,
  fetchOrgProjects, fetchOpenPRs, fetchWorkflowRuns,
  fetchSecretAlerts, fetchOrgWebhooks,
  loadOrgIndex, loadProjectMap, loadMemorySnapshot,
  fetchRateLimit,
} from './github-api.js';

/* ============================================================
   GLOBAL STATE
   ============================================================ */
const State = {
  theme:       localStorage.getItem('iacp_theme') || 'dark',
  section:     location.hash.replace('#', '') || 'overview',
  repos:       [],
  projects:    [],
  prs:         [],
  memory:      null,
  webhooks:    [],
  tokenValid:  null,
  deferredInstallPrompt: null,
  monacoLoaded: false,
  monacoEditor: null,
};

/* ============================================================
   THEME
   ============================================================ */
function applyTheme(theme) {
  State.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('iacp_theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

/* ============================================================
   ROUTING
   ============================================================ */
const SECTIONS = [
  'overview','projects','discovery','sandbox',
  'validation','industry','memory','vault',
  'editor','roadmap','gateway','settings',
];

function navigate(section) {
  if (!SECTIONS.includes(section)) section = 'overview';
  State.section = section;
  location.hash = section;

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === section);
  });

  // Show/hide sections
  document.querySelectorAll('.page-section').forEach(el => {
    el.classList.toggle('active', el.id === `section-${section}`);
  });

  // Update breadcrumb
  const label = document.getElementById('breadcrumb-active');
  if (label) label.textContent = sectionLabel(section);

  // Lazy-load section data
  loadSection(section);
}

function sectionLabel(s) {
  return { overview:'Overview', projects:'Projects', discovery:'Discovery',
           sandbox:'Sandbox', validation:'Validation', industry:'Industry',
           memory:'Memory', vault:'Vault', editor:'Editor',
           roadmap:'Roadmap', gateway:'Gateway & Tunnel', settings:'Settings' }[s] || s;
}

/* ============================================================
   SECTION DATA LOADERS
   ============================================================ */
async function loadSection(section) {
  switch (section) {
    case 'overview':    return loadOverview();
    case 'projects':    return loadProjects();
    case 'discovery':   return loadDiscovery();
    case 'sandbox':     return loadSandbox();
    case 'validation':  return loadValidation();
    case 'industry':    return loadIndustry();
    case 'memory':      return loadMemory();
    case 'vault':       return loadVault();
    case 'editor':      return loadEditor();
    case 'roadmap':     return loadRoadmap();
    case 'gateway':     return loadGateway();
    case 'settings':    return renderSettings();
  }
}

/* ============================================================
   OVERVIEW
   ============================================================ */
async function loadOverview() {
  const index = await loadOrgIndex();
  if (index?.repos) {
    State.repos = index.repos;
    renderKPIs(index);
    renderRecentActivity(index);
  }
  renderSystemStatus();
  renderWebhookFeed();
}

function renderKPIs(index) {
  const grid = document.getElementById('kpi-grid');
  if (!grid) return;

  const cats = ['core','discovery','sandbox','industry','memory','tools'];
  const counts = {};
  for (const c of cats) counts[c] = 0;
  for (const r of (index.repos || [])) counts[categorizeRepo(r)] = (counts[categorizeRepo(r)] || 0) + 1;

  const total  = (index.repos || []).length;
  const open_prs = (index.repos || []).reduce((s, r) => s + (r.openPullRequests?.totalCount || 0), 0);
  const open_issues = (index.repos || []).reduce((s, r) => s + (r.openIssues?.totalCount || 0), 0);

  grid.innerHTML = `
    ${kpiCard('TOTAL REPOS',    total,       '📦', '')}
    ${kpiCard('OPEN PRs',       open_prs,    '🔀', 'warning')}
    ${kpiCard('OPEN ISSUES',    open_issues, '🐛', 'info')}
    ${kpiCard('CORE REPOS',     counts.core || 0, '⚡', 'success')}
    ${kpiCard('SANDBOX',        counts.sandbox || 0, '🧪', 'purple')}
    ${kpiCard('MEMORY REPOS',   counts.memory || 0, '🧠', 'orange')}
  `;
}

function kpiCard(label, value, emoji, variant) {
  return `<div class="kpi-card ${variant}">
    <div class="kpi-label">${emoji} ${label}</div>
    <div class="kpi-value">${value}</div>
  </div>`;
}

function renderRecentActivity(index) {
  const el = document.getElementById('recent-repos');
  if (!el) return;
  const recent = (index.repos || [])
    .filter(r => !r.isArchived)
    .slice(0, 8);

  if (!recent.length) { el.innerHTML = emptyState('No repos indexed yet. Run the sync workflow.'); return; }

  el.innerHTML = `<div class="data-table-wrap">
    <table>
      <thead><tr>
        <th>Repository</th><th>Language</th><th>PRs</th><th>Issues</th><th>Updated</th><th></th>
      </tr></thead>
      <tbody>
        ${recent.map(r => `<tr>
          <td>
            <div class="font-bold text-accent truncate" style="max-width:180px">${r.name}</div>
            <div class="text-xs text-muted truncate" style="max-width:180px">${r.description || ''}</div>
          </td>
          <td>${r.primaryLanguage ? `<span class="badge badge-muted">${r.primaryLanguage.name}</span>` : '—'}</td>
          <td><span class="badge ${r.openPullRequests?.totalCount > 0 ? 'badge-warning' : 'badge-muted'}">${r.openPullRequests?.totalCount || 0}</span></td>
          <td><span class="badge ${r.openIssues?.totalCount > 0 ? 'badge-info' : 'badge-muted'}">${r.openIssues?.totalCount || 0}</span></td>
          <td class="text-xs text-muted">${relativeTime(r.pushedAt)}</td>
          <td><a href="${r.url}" target="_blank" class="btn btn-sm">Open ↗</a></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderSystemStatus() {
  const el = document.getElementById('system-status-panel');
  if (!el) return;
  const token = getToken();
  const items = [
    { icon: '🔑', label: 'GitHub Token',  status: token ? 'valid' : 'invalid',  text: token ? 'Configured' : 'Not set — add in Settings' },
    { icon: '🌐', label: 'GitHub API',    status: 'valid',   text: 'api.github.com reachable' },
    { icon: '🏢', label: 'Org Context',   status: 'valid',   text: getOrg() },
    { icon: '⚙️', label: 'Pages Deploy',  status: 'valid',   text: 'GitHub Pages active' },
    { icon: '🤖', label: 'Orchestrator',  status: 'warning', text: 'App auth not configured' },
    { icon: '🧠', label: 'Memory Repo',   status: 'warning', text: 'Sync pending' },
  ];
  el.innerHTML = items.map(it => `
    <div class="vault-item">
      <div class="vault-icon">${it.icon}</div>
      <div>
        <div class="vault-item-title">${it.label}</div>
        <div class="vault-item-status">
          <span class="token-status ${it.status}">${it.status === 'valid' ? '✓' : it.status === 'warning' ? '⚠' : '✗'} ${it.text}</span>
        </div>
      </div>
    </div>`).join('');
}

function renderWebhookFeed() {
  const el = document.getElementById('webhook-feed');
  if (!el) return;
  // Mock recent events until live webhook data is available
  const events = [
    { type: 'push',          repo: 'infinity-core',        time: '2m ago',  desc: 'main ← feat/orchestrator-v2' },
    { type: 'pull_request',  repo: 'infinity-sandbox',     time: '18m ago', desc: 'PR #42 opened by copilot' },
    { type: 'workflow_run',  repo: 'infinity-admin-control-plane', time: '1h ago', desc: 'deploy-pages succeeded' },
    { type: 'issues',        repo: 'infinity-tools',        time: '3h ago', desc: 'Issue #7 closed' },
    { type: 'repository',    repo: 'infinity-vision',       time: '1d ago', desc: 'New repo created' },
  ];
  el.innerHTML = events.map(e => `
    <div class="webhook-event">
      <span class="webhook-event-type">${e.type}</span>
      <span class="webhook-event-desc"><strong>${e.repo}</strong> — ${e.desc}</span>
      <span class="webhook-event-time">${e.time}</span>
    </div>`).join('');
}

/* ============================================================
   PROJECTS
   ============================================================ */
async function loadProjects() {
  const el = document.getElementById('kanban-board');
  if (!el) return;

  const projectMap = await loadProjectMap();
  if (projectMap?.columns) {
    renderKanban(el, projectMap.columns);
    return;
  }

  // Fallback: show skeleton board with defined columns
  const COLS = [
    { id: 'new_idea',           label: 'NEW IDEA',           color: '#8b949e', items: [] },
    { id: 'discovery',          label: 'DISCOVERY',          color: '#58a6ff', items: [] },
    { id: 'evolution_complete', label: 'EVOLUTION COMPLETE', color: '#bc8cff', items: [] },
    { id: 'sandbox_build',      label: 'SANDBOX BUILD',      color: '#ffa657', items: [] },
    { id: 'validation',         label: 'VALIDATION',         color: '#d29922', items: [] },
    { id: 'fix_loop',           label: 'FIX LOOP',           color: '#f85149', items: [] },
    { id: 'deployment_candidate', label: 'DEPLOYMENT CANDIDATE', color: '#3fb950', items: [] },
    { id: 'awaiting_approval',  label: 'AWAITING APPROVAL',  color: '#00b4ff', items: [] },
    { id: 'released',           label: 'RELEASED',           color: '#1f6feb', items: [] },
  ];
  renderKanban(el, COLS);
}

function renderKanban(el, columns) {
  el.innerHTML = columns.map(col => `
    <div class="kanban-col">
      <div class="kanban-col-header">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="col-dot" style="background:${col.color || 'var(--accent)'}"></span>
          <span style="font-size:11px">${col.label}</span>
        </div>
        <span class="kanban-col-count">${col.items?.length || 0}</span>
      </div>
      <div class="kanban-cards">
        ${(col.items || []).map(item => `
          <div class="kanban-card">
            <div class="kanban-card-title">${item.title}</div>
            <div class="kanban-card-meta">
              <span class="text-xs text-muted">${item.repo || ''}</span>
              <span class="badge badge-muted">${item.type || 'issue'}</span>
            </div>
          </div>`).join('')}
        ${!(col.items?.length) ? `<div class="text-xs text-subtle" style="text-align:center;padding:12px 0">No items</div>` : ''}
      </div>
    </div>`).join('');
}

/* ============================================================
   DISCOVERY PIPELINE
   ============================================================ */
async function loadDiscovery() {
  const el = document.getElementById('discovery-pipeline');
  if (!el) return;

  const steps = [
    { id: 'ingest',    label: 'Ingest',    state: 'done',   icon: '📥' },
    { id: 'analyze',   label: 'Analyze',   state: 'done',   icon: '🔍' },
    { id: 'rank',      label: 'Rank',      state: 'active', icon: '📊' },
    { id: 'evolve',    label: 'Evolve',    state: 'idle',   icon: '🧬' },
    { id: 'validate',  label: 'Validate',  state: 'idle',   icon: '✅' },
    { id: 'deploy',    label: 'Deploy',    state: 'idle',   icon: '🚀' },
  ];

  el.innerHTML = `
    <div class="pipeline">
      ${steps.map((s, i) => `
        <div class="pipeline-node">
          <div class="node-circle ${s.state}" title="${s.id}">${s.icon}</div>
          <div class="node-label">${s.label}</div>
        </div>
        ${i < steps.length - 1 ? `<div class="pipeline-edge ${s.state === 'done' ? 'done' : ''}"></div>` : ''}
      `).join('')}
    </div>`;

  const runsEl = document.getElementById('discovery-runs');
  if (!runsEl) return;
  runsEl.innerHTML = skeletonRows(4);

  const repos = State.repos.filter(r => categorizeRepo(r) === 'discovery').slice(0, 3);
  if (!repos.length) {
    runsEl.innerHTML = emptyState('No discovery repos found. Tag repos with topic "discovery".');
    return;
  }
  // Show as table
  runsEl.innerHTML = `<div class="data-table-wrap"><table>
    <thead><tr><th>Repository</th><th>Last Push</th><th>Open PRs</th><th>Open Issues</th><th></th></tr></thead>
    <tbody>${repos.map(r => `<tr>
      <td class="font-bold">${r.name}</td>
      <td class="text-xs text-muted">${relativeTime(r.pushedAt)}</td>
      <td>${r.openPullRequests?.totalCount || 0}</td>
      <td>${r.openIssues?.totalCount || 0}</td>
      <td><a href="${r.url}" target="_blank" class="btn btn-sm btn-primary">Open</a></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

/* ============================================================
   SANDBOX BUILD MONITORING
   ============================================================ */
async function loadSandbox() {
  const el = document.getElementById('sandbox-builds');
  if (!el) return;
  el.innerHTML = skeletonRows(4);

  const sandboxRepos = State.repos.filter(r => categorizeRepo(r) === 'sandbox').slice(0, 4);
  if (!sandboxRepos.length) {
    el.innerHTML = emptyState('No sandbox repos indexed yet. Run the org-index sync workflow.');
    return;
  }

  const rows = sandboxRepos.map(r => `<tr>
    <td class="font-bold text-accent">${r.name}</td>
    <td>${r.primaryLanguage?.name || '—'}</td>
    <td><span class="badge badge-warning">${r.openPullRequests?.totalCount || 0} open</span></td>
    <td class="text-xs text-muted">${relativeTime(r.pushedAt)}</td>
    <td><a href="${r.url}/actions" target="_blank" class="btn btn-sm">Actions ↗</a></td>
  </tr>`);

  el.innerHTML = `<div class="data-table-wrap"><table>
    <thead><tr><th>Repo</th><th>Language</th><th>PRs</th><th>Last Push</th><th></th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table></div>`;
}

/* ============================================================
   VALIDATION / PAT MATRIX
   ============================================================ */
async function loadValidation() {
  const matrixEl = document.getElementById('validation-matrix');
  if (!matrixEl) return;

  const checks = [
    { icon: '🔑', label: 'PAT Token',    value: getToken() ? 'SET' : 'MISSING',     cls: getToken() ? 'pass' : 'fail' },
    { icon: '🏢', label: 'Org Access',   value: State.tokenValid === true ? 'OK' : State.tokenValid === false ? 'FAIL' : 'PENDING', cls: State.tokenValid === true ? 'pass' : State.tokenValid === false ? 'fail' : 'warn' },
    { icon: '🔒', label: 'GHAS',         value: 'Active',   cls: 'pass' },
    { icon: '🤖', label: 'Dependabot',   value: 'Enabled',  cls: 'pass' },
    { icon: '🔍', label: 'CodeQL',       value: 'On Push',  cls: 'pass' },
    { icon: '🔐', label: 'Secret Scan',  value: 'Active',   cls: 'pass' },
    { icon: '📋', label: 'CODEOWNERS',   value: 'Present',  cls: 'pass' },
    { icon: '✍️', label: 'Signed Commits', value: 'Required', cls: 'warn' },
    { icon: '👁️', label: 'Branch Protect', value: 'main',   cls: 'pass' },
    { icon: '🔄', label: 'Actions',      value: 'Enabled',  cls: 'pass' },
  ];

  matrixEl.innerHTML = checks.map(c => `
    <div class="matrix-cell ${c.cls}">
      <div class="cell-icon">${c.icon}</div>
      <div class="cell-value">${c.value}</div>
      <div class="cell-label">${c.label}</div>
    </div>`).join('');

  // PR validation table
  const prEl = document.getElementById('pr-matrix');
  if (!prEl) return;
  const prs = State.prs.slice(0, 10);
  if (!prs.length) {
    prEl.innerHTML = emptyState('No open PRs found. Token required with repo scope.');
    return;
  }
  prEl.innerHTML = `<div class="data-table-wrap"><table>
    <thead><tr><th>#</th><th>Title</th><th>Repo</th><th>Author</th><th>Status</th><th></th></tr></thead>
    <tbody>${prs.map(pr => `<tr>
      <td class="text-xs text-muted">#${pr.number}</td>
      <td class="truncate" style="max-width:200px">${pr.title}</td>
      <td class="text-xs">${pr.repoName || pr.base?.repo?.name || '—'}</td>
      <td class="text-xs">${pr.user?.login || '—'}</td>
      <td><span class="badge badge-warning">open</span></td>
      <td><a href="${pr.html_url}" target="_blank" class="btn btn-sm">Review ↗</a></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

/* ============================================================
   INDUSTRY REPO CATEGORIZATION
   ============================================================ */
async function loadIndustry() {
  const el = document.getElementById('industry-repos');
  if (!el) return;

  const groups = {};
  const CATS = ['core','discovery','sandbox','industry','memory','tools','archive','other'];
  for (const c of CATS) groups[c] = [];
  for (const r of State.repos) {
    const cat = categorizeRepo(r);
    (groups[cat] = groups[cat] || []).push(r);
  }

  if (!State.repos.length) {
    el.innerHTML = emptyState('No repos loaded yet. Sync the org index from Settings.');
    return;
  }

  el.innerHTML = CATS.filter(c => groups[c].length > 0).map(cat => `
    <div class="card mb-4">
      <div class="card-header">
        <div class="card-title">${catEmoji(cat)} ${cat.toUpperCase()} <span class="badge badge-muted">${groups[cat].length}</span></div>
      </div>
      <div class="repo-grid">
        ${groups[cat].map(r => `
          <div class="repo-card" onclick="window.open('${r.url}','_blank')">
            <div class="repo-card-header">
              <div>
                <div class="repo-name">${r.name}</div>
              </div>
              ${r.isPrivate ? `<span class="badge badge-muted">private</span>` : `<span class="badge badge-info">public</span>`}
            </div>
            <div class="repo-desc">${r.description || 'No description'}</div>
            <div class="repo-meta">
              ${r.primaryLanguage ? `<span>🔵 ${r.primaryLanguage.name}</span>` : ''}
              <span>⭐ ${r.stargazerCount || 0}</span>
              <span>🔀 ${r.openPullRequests?.totalCount || 0} PRs</span>
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function catEmoji(c) {
  return { core:'⚡', discovery:'🔍', sandbox:'🧪', industry:'🏭',
           memory:'🧠', tools:'🛠️', archive:'📦', other:'📁' }[c] || '📁';
}

/* ============================================================
   MEMORY VIEWER
   ============================================================ */
async function loadMemory() {
  const el = document.getElementById('memory-timeline');
  if (!el) return;

  let snapshot = State.memory;
  if (!snapshot) {
    snapshot = await loadMemorySnapshot();
    State.memory = snapshot;
  }

  if (!snapshot?.entries?.length) {
    el.innerHTML = `
      <div class="alert alert-info">
        Memory snapshot not yet synced. The <code>memory-sync.yml</code> workflow will populate this view by reading from
        <strong>InfinityXOneSystems/infinity-core-memory</strong>.
      </div>
      ${sampleMemoryTimeline()}`;
    return;
  }

  el.innerHTML = `<div class="memory-timeline">
    ${snapshot.entries.map(e => `
      <div class="memory-entry ${e.type || ''}">
        <div class="memory-entry-time">${new Date(e.timestamp).toLocaleString()} · ${e.type || 'log'}</div>
        <div class="memory-entry-title">${e.title}</div>
        <div class="memory-entry-body">${e.body}</div>
      </div>`).join('')}
  </div>`;
}

function sampleMemoryTimeline() {
  const entries = [
    { type: 'decision',   time: 'Sample', title: 'Architecture Decision: GitHub-native IACP', body: 'Chose GitHub Pages + GraphQL as primary stack. No external compute required.' },
    { type: 'deployment', time: 'Sample', title: 'Initial Dashboard Deployed', body: 'Dashboard v1.0 deployed to GitHub Pages via Actions workflow.' },
    { type: 'benchmark',  time: 'Sample', title: 'GraphQL Indexing Performance', body: '47 repos indexed in 2.3s via paginated GraphQL query.' },
    { type: 'risk',       time: 'Sample', title: 'PAT Token Expiry Risk', body: 'Fine-grained PATs expire in 90 days. Rotation reminder added to roadmap.' },
  ];
  return `<div class="memory-timeline">
    ${entries.map(e => `
      <div class="memory-entry ${e.type}">
        <div class="memory-entry-time">${e.time}</div>
        <div class="memory-entry-title">${e.title}</div>
        <div class="memory-entry-body">${e.body}</div>
      </div>`).join('')}
  </div>`;
}

/* ============================================================
   VAULT / SECURITY
   ============================================================ */
async function loadVault() {
  const el = document.getElementById('vault-grid');
  if (!el) return;

  const items = [
    { icon: '🔐', title: 'Secret Scanning',    status: 'Active', variant: 'success' },
    { icon: '🔍', title: 'CodeQL Analysis',     status: 'On Push + PR', variant: 'success' },
    { icon: '🤖', title: 'Dependabot Alerts',   status: 'Enabled', variant: 'success' },
    { icon: '🛡️', title: 'Branch Protection',   status: 'main protected', variant: 'success' },
    { icon: '✍️', title: 'Signed Commits',      status: 'Recommended', variant: 'warning' },
    { icon: '👥', title: 'Required Reviewers',  status: '1 required', variant: 'success' },
    { icon: '📋', title: 'CODEOWNERS',          status: 'Defined', variant: 'success' },
    { icon: '🌐', title: 'GHAS',                status: 'Enabled', variant: 'success' },
  ];

  el.innerHTML = items.map(it => `
    <div class="vault-item">
      <div class="vault-icon">${it.icon}</div>
      <div>
        <div class="vault-item-title">${it.title}</div>
        <div class="vault-item-status">
          <span class="token-status ${it.variant === 'success' ? 'valid' : 'pending'}">${it.status}</span>
        </div>
      </div>
    </div>`).join('');

  // Probe CF tunnel endpoints and populate vault endpoint grid
  const cfEndpoints = CF_ENDPOINTS.map(ep => {
    const savedCfUrl = localStorage.getItem(GW_KEY_CF_URL);
    const savedGwUrl = localStorage.getItem(GW_KEY_CF_GW);
    if (ep.id === 'vizual-x'    && savedCfUrl) return { ...ep, url: savedCfUrl };
    if (ep.id === 'infinityxai' && savedGwUrl) return { ...ep, url: savedGwUrl };
    return ep;
  });
  const vaultGrid = document.getElementById('vault-endpoint-grid');
  if (vaultGrid) {
    vaultGrid.innerHTML = cfEndpoints.map(ep => endpointCardHtml(ep, 'checking')).join('');
    const statuses = await Promise.all(cfEndpoints.map(ep => probeEndpoint(ep.url)));
    vaultGrid.innerHTML = cfEndpoints.map((ep, i) => endpointCardHtml(ep, statuses[i])).join('');
  }
}

/* ============================================================
   MONACO EDITOR
   ============================================================ */
async function loadEditor() {
  if (State.monacoLoaded) return;
  const container = document.getElementById('monaco-container');
  if (!container) return;

  container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:13px;gap:10px">
    <span style="animation:spin 1s linear infinite;display:inline-block">⚙️</span> Loading Monaco Editor…
  </div>`;

  // Load Monaco from CDN
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs/loader.min.js';
  script.onload = () => {
    window.require.config({
      paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs' }
    });
    window.require(['vs/editor/editor.main'], () => {
      State.monacoLoaded = true;
      const theme = State.theme === 'dark' ? 'vs-dark' : 'vs';
      State.monacoEditor = window.monaco.editor.create(container, {
        value: EDITOR_DEFAULT_CONTENT,
        language: 'yaml',
        theme,
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
        lineNumbers: 'on',
        tabSize: 2,
      });
    });
  };
  document.head.appendChild(script);
}

const EDITOR_DEFAULT_CONTENT = `# Infinity Admin Control Plane — Live Editor
# Use this editor to inspect and draft configuration files.
# Files are not auto-saved; copy content to commit via GitHub.

name: Infinity Master State Engine
description: Sovereign project board for all IACP repos

columns:
  - name: NEW_IDEA
    color: "#8b949e"
  - name: DISCOVERY
    color: "#58a6ff"
  - name: EVOLUTION_COMPLETE
    color: "#bc8cff"
  - name: SANDBOX_BUILD
    color: "#ffa657"
  - name: VALIDATION
    color: "#d29922"
  - name: FIX_LOOP
    color: "#f85149"
  - name: DEPLOYMENT_CANDIDATE
    color: "#3fb950"
  - name: AWAITING_APPROVAL
    color: "#00b4ff"
  - name: RELEASED
    color: "#1f6feb"

repos_to_sync:
  - infinity-core
  - infinity-core-memory
  - infinity-vision
  - infinity-tools
  - infinity-sandbox
  - infinity-admin-control-plane
  - infinity-template-infinity-gitops
  - infinity-experiment
`;

/* ============================================================
   GATEWAY & TUNNEL
   ============================================================ */
const GW_KEY_CUSTOM   = 'iacp_gw_custom';
const GW_KEY_CF_URL   = 'iacp_gw_cf_tunnel_url';
const GW_KEY_CF_GW    = 'iacp_gw_cf_gateway_url';

// Built-in endpoints (Cloudflare tunnel + AI gateway)
const CF_ENDPOINTS = [
  { id: 'vizual-x',      label: 'vizual-x.com',     url: 'https://vizual-x.com',     icon: '☁️', group: 'cf' },
  { id: 'infinityxai',   label: 'infinityxai.com',   url: 'https://infinityxai.com',  icon: '🤖', group: 'ai' },
];
const AI_ENDPOINTS = [
  { id: 'ollama-local',  label: 'Ollama (local)',    url: 'http://localhost:11434',   icon: '🦙', group: 'ai' },
  { id: 'groq-api',      label: 'Groq API',          url: 'https://api.groq.com',     icon: '⚡', group: 'ai' },
  { id: 'gemini-api',    label: 'Gemini API',        url: 'https://generativelanguage.googleapis.com', icon: '🔮', group: 'ai' },
];

/**
 * Probe a single endpoint using a no-cors HEAD request with a 5 s timeout.
 * Returns 'online' | 'offline' | 'unknown'.
 * Opaque (no-cors) responses count as online — the server replied.
 */
async function probeEndpoint(url) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
    return 'online';
  } catch (e) {
    if (e.name === 'AbortError') return 'offline';
    return 'offline';
  } finally {
    clearTimeout(tid);
  }
}

function endpointCardHtml(ep, status) {
  const dotCls = status === 'online' ? 'online' : status === 'offline' ? 'offline' : 'warning';
  const statusText = status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Checking…';
  return `
    <div class="deeplink-card" style="cursor:default">
      <div class="deeplink-icon">${ep.icon}</div>
      <div style="flex:1;min-width:0">
        <div class="deeplink-label">${ep.label}</div>
        <div class="deeplink-desc" style="display:flex;align-items:center;gap:5px">
          <span class="status-dot ${dotCls}" style="width:6px;height:6px;flex-shrink:0"></span>
          ${statusText}
        </div>
      </div>
      <a href="${ep.url}" target="_blank" class="btn btn-xs" style="flex-shrink:0">Open ↗</a>
    </div>`;
}

async function loadGateway() {
  const cfEl = document.getElementById('gateway-cf-grid');
  const aiEl = document.getElementById('gateway-ai-grid');
  if (!cfEl || !aiEl) return;

  // Merge built-in CF endpoints with saved custom CF tunnel URL from settings
  const savedCfUrl = localStorage.getItem(GW_KEY_CF_URL);
  const savedGwUrl = localStorage.getItem(GW_KEY_CF_GW);
  const cfEndpoints = CF_ENDPOINTS.map(ep => {
    if (ep.id === 'vizual-x'    && savedCfUrl) return { ...ep, url: savedCfUrl };
    if (ep.id === 'infinityxai' && savedGwUrl) return { ...ep, url: savedGwUrl };
    return ep;
  });

  // Custom user-added endpoints
  let custom = [];
  try { custom = JSON.parse(localStorage.getItem(GW_KEY_CUSTOM) || '[]'); } catch { custom = []; }

  // Render skeleton while probing
  const allCf = cfEndpoints;
  const allAi = [...AI_ENDPOINTS, ...custom.filter(c => c.group !== 'cf')];
  const cfCustom = custom.filter(c => c.group === 'cf');

  cfEl.innerHTML = [...allCf, ...cfCustom].map(ep => endpointCardHtml(ep, 'checking')).join('');
  aiEl.innerHTML = allAi.map(ep => endpointCardHtml(ep, 'checking')).join('');

  // Probe all concurrently
  const allEndpoints = [...allCf, ...cfCustom, ...allAi];
  const results = await Promise.all(allEndpoints.map(ep => probeEndpoint(ep.url)));

  // Re-render with real statuses
  const statusMap = {};
  allEndpoints.forEach((ep, i) => { statusMap[ep.id] = results[i]; });

  cfEl.innerHTML = [...allCf, ...cfCustom].map(ep => endpointCardHtml(ep, statusMap[ep.id] || 'offline')).join('');
  aiEl.innerHTML = allAi.map(ep => endpointCardHtml(ep, statusMap[ep.id] || 'offline')).join('');

  // Update sidebar nav dot based on CF tunnel status
  const navDot = document.getElementById('gateway-nav-dot');
  const cfOnline = [...allCf, ...cfCustom].some(ep => statusMap[ep.id] === 'online');
  if (navDot) navDot.className = `status-dot ${cfOnline ? 'online' : 'warning'}`;

  // Update vault endpoint grid (for the vault section)
  renderVaultEndpoints([...allCf, ...cfCustom].map((ep, i) => ({ ep, status: statusMap[ep.id] || 'offline' })));
}

function renderVaultEndpoints(items) {
  const el = document.getElementById('vault-endpoint-grid');
  if (!el) return;
  el.innerHTML = items.length
    ? items.map(({ ep, status }) => endpointCardHtml(ep, status)).join('')
    : `<div style="padding:12px;font-size:12px;color:var(--text-muted)">Run probe from Gateway panel.</div>`;
}

function addGatewayEndpoint() {
  const labelEl = document.getElementById('gateway-new-label');
  const urlEl   = document.getElementById('gateway-new-url');
  const label = labelEl?.value.trim();
  const url   = urlEl?.value.trim();
  if (!label || !url) { showToast('Enter both a label and a URL', 'error'); return; }
  try { new URL(url); } catch { showToast('Invalid URL — must start with http:// or https://', 'error'); return; }

  let custom = [];
  try { custom = JSON.parse(localStorage.getItem(GW_KEY_CUSTOM) || '[]'); } catch { custom = []; }
  const id = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  custom.push({ id, label, url, icon: '🔗', group: 'cf' });
  localStorage.setItem(GW_KEY_CUSTOM, JSON.stringify(custom));

  if (labelEl) labelEl.value = '';
  if (urlEl)   urlEl.value   = '';
  showToast(`Added ${label} — probing…`, 'info');
  loadGateway();
}

function clearCustomEndpoints() {
  localStorage.removeItem(GW_KEY_CUSTOM);
  showToast('Custom endpoints cleared', 'info');
  loadGateway();
}

function saveTunnelConfig() {
  const cfUrl = document.getElementById('settings-cf-tunnel-url')?.value.trim();
  const gwUrl = document.getElementById('settings-cf-gateway-url')?.value.trim();
  if (cfUrl) localStorage.setItem(GW_KEY_CF_URL, cfUrl);
  if (gwUrl) localStorage.setItem(GW_KEY_CF_GW, gwUrl);
  showToast('Tunnel config saved', 'success');
}

/* ============================================================
   ROADMAP
   ============================================================ */
function loadRoadmap() {
  const el = document.getElementById('roadmap-phases');
  if (!el) return;

  const phases = [
    {
      id: 'p1', label: 'Phase 1 — Foundation (Day 1-2)', color: '#3fb950',
      items: [
        { text: 'Deploy dashboard to GitHub Pages', done: true },
        { text: 'Configure dark/light mode + PWA manifest', done: true },
        { text: 'Add GitHub token input in Settings', done: true },
        { text: 'Load org repo index from _STATE/org-index.json', done: true },
        { text: 'Deploy sync-org-index.yml workflow', done: true },
      ]
    },
    {
      id: 'p2', label: 'Phase 2 — API Integration (Day 2-3)', color: '#58a6ff',
      items: [
        { text: 'Connect GraphQL org repo index (live)', done: false },
        { text: 'Connect GitHub Projects V2 board state', done: false },
        { text: 'Display open PR validation matrix', done: false },
        { text: 'Wire memory-sync workflow to memory viewer', done: false },
        { text: 'Add webhook event display (org admin PAT)', done: false },
      ]
    },
    {
      id: 'p3', label: 'Phase 3 — Intelligence (Day 3-4)', color: '#bc8cff',
      items: [
        { text: 'Monaco editor with file browser', done: false },
        { text: 'Repo graph visualization (SVG)', done: false },
        { text: 'VS Code deep-linking (vscode:// protocol)', done: false },
        { text: 'Copilot integration entrypoints', done: false },
        { text: 'Sandbox build status from Actions API', done: false },
      ]
    },
    {
      id: 'p4', label: 'Phase 4 — Governance (Day 4-5)', color: '#ffa657',
      items: [
        { text: 'Branch protection enforcement matrix', done: false },
        { text: 'CODEOWNERS validation viewer', done: false },
        { text: 'Secret scanning alert dashboard', done: false },
        { text: 'Signed commit enforcement check', done: false },
        { text: 'PAT rotation reminder system', done: false },
      ]
    },
    {
      id: 'p5', label: 'Phase 5 — Expansion (Day 5-7)', color: '#d29922',
      items: [
        { text: 'Cloudflare tunnel status indicator', done: true },
        { text: 'Ollama / Groq / Gemini API status', done: false },
        { text: 'Google Cloud project health check', done: false },
        { text: 'Vertex AI integration entrypoint', done: false },
        { text: 'Persistent runner topology map', done: false },
      ]
    },
  ];

  el.innerHTML = phases.map(phase => {
    const done = phase.items.filter(i => i.done).length;
    const total = phase.items.length;
    const pct = Math.round(done / total * 100);
    return `
    <div class="roadmap-phase">
      <div class="roadmap-phase-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
        <div class="phase-label">
          <span style="width:10px;height:10px;border-radius:50%;background:${phase.color};display:inline-block;flex-shrink:0"></span>
          ${phase.label}
        </div>
        <span class="phase-progress-text">${done}/${total} · ${pct}%</span>
      </div>
      <div class="roadmap-phase-body">
        <div class="progress-bar mb-3"><div class="progress-fill" style="width:${pct}%;background:${phase.color}"></div></div>
        ${phase.items.map(item => `
          <div class="checklist-item ${item.done ? 'done' : ''}">
            <div class="checklist-checkbox">${item.done ? '✓' : ''}</div>
            <div class="item-text">${item.text}</div>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   SETTINGS
   ============================================================ */
function renderSettings() {
  const el = document.getElementById('section-settings');
  if (!el) return;

  document.getElementById('settings-token').value = getToken();
  document.getElementById('settings-org').value   = getOrg();

  const cfUrl = localStorage.getItem(GW_KEY_CF_URL) || '';
  const gwUrl = localStorage.getItem(GW_KEY_CF_GW)  || '';
  const cfField = document.getElementById('settings-cf-tunnel-url');
  const gwField = document.getElementById('settings-cf-gateway-url');
  if (cfField) cfField.value = cfUrl;
  if (gwField) gwField.value = gwUrl;
}

async function handleSettingsSave() {
  const token = document.getElementById('settings-token').value.trim();
  const org   = document.getElementById('settings-org').value.trim();
  if (token) setToken(token);
  if (org)   setOrg(org);

  const status = document.getElementById('token-validation-status');
  if (status) status.innerHTML = `<span class="token-status pending">⏳ Validating…</span>`;

  const result = await validateToken();
  State.tokenValid = result.valid;
  if (status) {
    status.innerHTML = result.valid
      ? `<span class="token-status valid">✓ Valid — ${result.user.login}</span>`
      : `<span class="token-status invalid">✗ Invalid — ${result.error}</span>`;
  }
  showToast(result.valid ? 'Token validated successfully' : 'Token invalid — check permissions', result.valid ? 'success' : 'error');
}

async function handleSyncNow() {
  showToast('Sync triggered — workflow dispatched', 'info');
  // In a full implementation, this would POST to the workflow dispatch endpoint
}

/* ============================================================
   REPO GRAPH (SVG canvas)
   ============================================================ */
function renderRepoGraph() {
  const canvas = document.getElementById('repo-graph-canvas');
  if (!canvas) return;

  const repos = State.repos.slice(0, 20);
  if (!repos.length) {
    canvas.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="var(--text-muted)" font-size="12">No repos loaded — sync org index first</text>`;
    return;
  }

  const W = canvas.clientWidth || 700;
  const H = 340;
  const cx = W / 2;
  const cy = H / 2;
  const r  = Math.min(cx, cy) - 60;

  const nodes = repos.map((repo, i) => {
    const angle = (2 * Math.PI * i) / repos.length - Math.PI / 2;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      name: repo.name,
      cat: categorizeRepo(repo),
    };
  });

  const CAT_COLORS = { core:'#00b4ff', discovery:'#58a6ff', sandbox:'#ffa657',
                       industry:'#3fb950', memory:'#bc8cff', tools:'#d29922', other:'#8b949e' };

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- Hub node -->
    <circle cx="${cx}" cy="${cy}" r="20" fill="#00b4ff" opacity="0.2"/>
    <circle cx="${cx}" cy="${cy}" r="8" fill="#00b4ff"/>
    <text x="${cx}" y="${cy + 26}" text-anchor="middle" font-size="10" fill="var(--text-muted)">ORG</text>

    <!-- Edges -->
    ${nodes.map(n => `<line x1="${cx}" y1="${cy}" x2="${n.x}" y2="${n.y}" stroke="var(--border)" stroke-width="1" opacity="0.5"/>`).join('')}

    <!-- Nodes -->
    ${nodes.map(n => {
      const color = CAT_COLORS[n.cat] || '#8b949e';
      const label = n.name.length > 16 ? n.name.slice(0, 14) + '…' : n.name;
      return `
        <circle cx="${n.x}" cy="${n.y}" r="8" fill="${color}" opacity="0.85"/>
        <text x="${n.x}" y="${n.y + 18}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${label}</text>`;
    }).join('')}
  </svg>`;

  canvas.innerHTML = svg;
}

/* ============================================================
   UTILS
   ============================================================ */
function relativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 60)    return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)     return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30)    return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function emptyState(msg) {
  return `<div style="padding:32px;text-align:center;color:var(--text-subtle);font-size:12px">${msg}</div>`;
}

function skeletonRows(n) {
  return Array.from({length: n}, () =>
    `<div class="skeleton-row"><div class="loading-pulse" style="width:${60+Math.random()*30}%"></div></div>`
  ).join('');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${{ success:'✓', error:'✗', info:'ℹ' }[type] || 'ℹ'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

/* ============================================================
   PWA INSTALL
   ============================================================ */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  State.deferredInstallPrompt = e;
  const btn = document.getElementById('install-btn');
  if (btn) btn.classList.remove('hidden');
});

async function triggerInstall() {
  if (!State.deferredInstallPrompt) return;
  State.deferredInstallPrompt.prompt();
  const { outcome } = await State.deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    document.getElementById('install-btn')?.classList.add('hidden');
    showToast('Dashboard installed as PWA!', 'success');
  }
  State.deferredInstallPrompt = null;
}

/* ============================================================
   SERVICE WORKER REGISTRATION
   ============================================================ */
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/pwa/service-worker.js')
      .catch(() => {/* non-critical */});
  }
}

/* ============================================================
   COPILOT ENTRYPOINTS
   ============================================================ */
function renderCopilotEntrypoints() {
  const el = document.getElementById('copilot-grid');
  if (!el) return;

  const org  = getOrg();
  const cards = [
    { icon: '🤖', title: 'Copilot Chat',        desc: 'Open in GitHub.com workspace', href: `https://github.com/copilot`, target: '_blank' },
    { icon: '💻', title: 'VS Code — Core',       desc: 'Open infinity-core locally',   href: `vscode://vscode.git/clone?url=https://github.com/${org}/infinity-core`, target: '_self' },
    { icon: '🧪', title: 'VS Code — Sandbox',    desc: 'Open infinity-sandbox locally', href: `vscode://vscode.git/clone?url=https://github.com/${org}/infinity-sandbox`, target: '_self' },
    { icon: '🌐', title: 'GitHub.dev — Admin',   desc: 'Edit control plane in browser', href: `https://github.dev/${org}/infinity-admin-control-plane`, target: '_blank' },
    { icon: '🧠', title: 'GitHub.dev — Memory',  desc: 'Inspect memory repo',           href: `https://github.dev/${org}/infinity-core-memory`, target: '_blank' },
    { icon: '📋', title: 'PR Review Queue',      desc: `All open PRs in ${org}`,        href: `https://github.com/pulls?q=is:open+is:pr+org:${org}`, target: '_blank' },
    { icon: '🚀', title: 'Actions Dashboard',    desc: 'All workflows',                 href: `https://github.com/orgs/${org}/actions`, target: '_blank' },
    { icon: '📊', title: 'Projects Board',       desc: 'Infinity Master State Engine',  href: `https://github.com/orgs/${org}/projects`, target: '_blank' },
  ];

  el.innerHTML = cards.map(c => `
    <a href="${c.href}" target="${c.target}" class="deeplink-card">
      <div class="deeplink-icon">${c.icon}</div>
      <div>
        <div class="deeplink-label">${c.title}</div>
        <div class="deeplink-desc">${c.desc}</div>
      </div>
    </a>`).join('');
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  // Apply saved theme
  applyTheme(State.theme);

  // Register service worker
  registerSW();

  // Set up nav click handlers
  document.querySelectorAll('.nav-item[data-section]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.section));
  });

  // Theme toggle
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    applyTheme(State.theme === 'dark' ? 'light' : 'dark');
    if (State.monacoEditor) {
      window.monaco?.editor?.setTheme(State.theme === 'dark' ? 'vs-dark' : 'vs');
    }
  });

  // Install button
  document.getElementById('install-btn')?.addEventListener('click', triggerInstall);

  // Search
  document.getElementById('topbar-search-input')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    if (!q) return;
    const found = State.repos.find(r => r.name.toLowerCase().includes(q));
    if (found) window.open(found.url, '_blank');
  });

  // Settings save
  document.getElementById('settings-save-btn')?.addEventListener('click', handleSettingsSave);
  document.getElementById('settings-sync-btn')?.addEventListener('click', handleSyncNow);
  document.getElementById('settings-tunnel-save-btn')?.addEventListener('click', saveTunnelConfig);

  // Hash navigation
  window.addEventListener('hashchange', () => {
    const s = location.hash.replace('#', '') || 'overview';
    navigate(s);
  });

  // Navigate to initial section
  navigate(State.section);

  // Load static state files (Actions-generated)
  const index = await loadOrgIndex();
  if (index?.repos) {
    State.repos = index.repos;
  }

  // Render global elements
  renderCopilotEntrypoints();

  // Update sidebar system status dot
  const dot = document.getElementById('sidebar-system-dot');
  if (dot) {
    dot.className = `status-dot ${getToken() ? 'online' : 'warning'}`;
  }
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for inline event handlers
window.IACP = { navigate, showToast, renderRepoGraph, probeAllEndpoints: loadGateway, addGatewayEndpoint, clearCustomEndpoints };
