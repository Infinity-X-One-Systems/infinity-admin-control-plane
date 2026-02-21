# ∞ Infinity Admin Control Plane (IACP)

> **Sovereign command dashboard for the Infinity Invention Machine.**
> GitHub-native · PWA · Dark/Light mode · Monaco Editor · GraphQL-powered

[![Deploy Dashboard](https://github.com/Infinity-X-One-Systems/infinity-admin-control-plane/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/Infinity-X-One-Systems/infinity-admin-control-plane/actions/workflows/deploy-pages.yml)
[![Org Index Sync](https://github.com/Infinity-X-One-Systems/infinity-admin-control-plane/actions/workflows/sync-org-index.yml/badge.svg)](https://github.com/Infinity-X-One-Systems/infinity-admin-control-plane/actions/workflows/sync-org-index.yml)

---

## What is IACP?

The **Infinity Admin Control Plane** is a GitHub-native enterprise command dashboard. It is:

| It **IS** | It is **NOT** |
|---|---|
| A GitHub-native command dashboard | A magical AI runtime |
| A Projects-driven state visualizer | A bypass of GitHub governance |
| A PR validation matrix viewer | A replacement for persistent compute |
| A repo index with categorization | A vendor-locked SaaS |
| A deployment tracker | An always-on server |
| A Monaco-powered editor | |
| A Copilot-aware workspace hub | |

**Live dashboard:** `https://infinity-x-one-systems.github.io/infinity-admin-control-plane/`

---

## Architecture

```
GitHub is source of truth
GitHub Projects is state engine
GitHub App (infinity-orchestrator) is automation layer
GitHub Pages is dashboard UI
Self-hosted runners provide persistence
Memory is stored in infinity-core-memory
```

```
infinity-admin-control-plane/
│
├── dashboard/               # PWA dashboard (deployed to GitHub Pages)
│   ├── index.html           # Main shell — SPA with 11 sections
│   ├── app.js               # Core logic: routing, rendering, state
│   ├── github-api.js        # GitHub GraphQL + REST client
│   └── styles/
│       └── main.css         # Full enterprise CSS (dark + light themes)
│
├── pwa/
│   ├── manifest.json        # PWA manifest (installable on mobile)
│   └── service-worker.js    # Cache-first + stale-while-revalidate
│
├── .github/
│   ├── CODEOWNERS           # Branch protection ownership
│   └── workflows/
│       ├── deploy-pages.yml           # Deploy dashboard to GitHub Pages
│       ├── sync-org-index.yml         # Nightly org repo index (GraphQL)
│       ├── memory-sync.yml            # Sync from infinity-core-memory
│       ├── project-sync.yml           # Sync GitHub Projects V2 state
│       └── validator-status-sync.yml  # PAT + security validation sweep
│
├── _STATE/                  # Auto-committed state files (written by Actions)
│   ├── org-index.json       # All org repos with metadata
│   ├── project-map.json     # GitHub Projects V2 Kanban state
│   ├── memory-snapshot.json # Snapshot from infinity-core-memory
│   └── validator-status.json# PAT, branch protection, security checks
│
├── .vscode/
│   └── settings.json        # VS Code workspace settings
├── singularity.code-workspace # Multi-root workspace (all Infinity repos)
└── README.md
```

---

## Dashboard Sections

| Section | Description |
|---|---|
| **Overview** | KPI cards, repo activity table, system status, webhook feed, org graph |
| **Projects** | Kanban board from GitHub Projects V2 (`_STATE/project-map.json`) |
| **Roadmap** | 5-phase interactive checklist with progress tracking |
| **Discovery** | Pipeline visualization + discovery repo monitoring |
| **Sandbox** | Sandbox build status and AI runtime integration links |
| **Validation** | Governance matrix (PAT, CodeQL, Dependabot, GHAS…) + open PR table |
| **Industry** | All repos grouped by category (core/discovery/sandbox/industry/memory/tools) |
| **Memory** | Timeline from `infinity-core-memory` (decisions, deployments, risks, benchmarks) |
| **Vault** | Security panel (secret scanning, CodeQL, branch protection, endpoint status) |
| **Editor** | Monaco embedded editor (loaded from CDN, YAML/JSON syntax highlighting) |
| **Settings** | GitHub PAT, org context, AI endpoints (Ollama/Groq/Gemini/Vertex AI), VS Code links |

---

## Quick Start

### 1. Enable GitHub Pages

Go to **Settings → Pages → Source → GitHub Actions**, then push to `main`.
The `deploy-pages.yml` workflow will build and publish the dashboard.

### 2. Add the PAT secret

Create a fine-grained PAT with scopes:
- `read:org` — list org repos and members
- `repo` — read repository metadata and PRs
- `read:project` — read Projects V2 boards
- `security_events` — read secret scanning / CodeQL alerts

Add as org secret named **`GH_ORG_READ_TOKEN`**.

### 3. Configure the dashboard

Open the live dashboard → **Settings** → enter your PAT → click **Save & Validate Token**.

Your token is stored in **localStorage only** — never transmitted to any third party.

### 4. Run the sync workflows

Trigger manually from **Actions**:
- `sync-org-index.yml` — populates `_STATE/org-index.json`
- `memory-sync.yml` — pulls from `infinity-core-memory`
- `project-sync.yml` — syncs GitHub Projects V2 state

These also run on schedule (nightly / every 30 min / every 6h).

---

## Local Development

```bash
# Serve the dashboard locally
python3 -m http.server 5500
# Open: http://localhost:5500/dashboard/
```

Or use VS Code Live Server extension with the included `.vscode/settings.json`.

Open the full workspace with:

```bash
code singularity.code-workspace
```

---

## GitHub Capabilities Utilized

✔ GitHub Projects V2 (state engine)
✔ GitHub Issues (command intake)
✔ GitHub Actions (workflow automation)
✔ GitHub Pages (dashboard PWA)
✔ GitHub Environments (deployment gating)
✔ GitHub Advanced Security (GHAS)
✔ CodeQL (static analysis)
✔ Dependabot (dependency updates)
✔ Secret Scanning
✔ Required status checks
✔ CODEOWNERS
✔ GraphQL API (repo index, projects)
✔ REST API (PRs, workflows, webhooks)
✔ Repository dispatch / Workflow dispatch

---

## Integrated Systems

| System | Role |
|---|---|
| `infinityxai.com` | Infinity Orchestrator GitHub App |
| `vizual-x.com` | Cloudflare tunnel + gateway (partial) |
| `infinity-core-memory` | Persistent memory (decisions, risks, benchmarks) |
| `infinity-core` | Core infrastructure |
| `infinity-vision` | Strategic documents |
| `infinity-tools` | Developer tooling |
| `infinity-sandbox` | Experiments and AI integrations |
| `infinity-experiment` | Rapid hypothesis testing |
| `infinity-template-infinity-gitops` | GitOps templates |
| Ollama | Local LLM runtime (endpoint in Settings) |
| Groq | Ultra-fast inference (API key in Settings) |
| Gemini | Google AI Studio (API key in Settings) |
| Vertex AI | GCP project: `infinity-x-one-systems` |
| C:\AI\SINGULARITY_PRIME | Local workspace (in VS Code workspace) |

---

## Security

- All credentials stored in **localStorage** only (never transmitted to third parties)
- Org secret `GH_ORG_READ_TOKEN` used by Actions (never exposed to the browser)
- GHAS, secret scanning, CodeQL, and Dependabot active on this repo
- Branch protection on `main` with required reviews
- Contact: **info@infinityxonesystems.com**

---

## License

Proprietary — Infinity X One Systems. All rights reserved.
