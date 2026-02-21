/**
 * INFINITY ADMIN CONTROL PLANE — GitHub API Client
 * Handles GraphQL + REST API calls to GitHub.
 * Token is stored in localStorage and never transmitted
 * to any third-party service.
 */

/* ============================================================
   TOKEN MANAGEMENT
   ============================================================ */
const TOKEN_KEY = 'iacp_gh_token';
const ORG_KEY   = 'iacp_gh_org';

export function getToken()   { return localStorage.getItem(TOKEN_KEY) || ''; }
export function getOrg()     { return localStorage.getItem(ORG_KEY)   || 'Infinity-X-One-Systems'; }
export function setToken(t)  { localStorage.setItem(TOKEN_KEY, t); }
export function setOrg(o)    { localStorage.setItem(ORG_KEY, o); }

function authHeaders() {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/* ============================================================
   CORE FETCH HELPERS
   ============================================================ */
async function ghFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: authHeaders(),
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function graphql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

/* ============================================================
   TOKEN VALIDATION
   ============================================================ */
export async function validateToken() {
  try {
    const data = await ghFetch('https://api.github.com/user');
    return { valid: true, user: data };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/* ============================================================
   ORG REPO INDEX (GraphQL)
   Fetches all repos in the org, paginated.
   ============================================================ */
const ORG_REPOS_QUERY = `
query OrgRepos($org: String!, $after: String) {
  organization(login: $org) {
    repositories(first: 50, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        description
        url
        isPrivate
        isArchived
        isFork
        stargazerCount
        forkCount
        pushedAt
        primaryLanguage { name color }
        defaultBranchRef { name }
        repositoryTopics(first: 10) {
          nodes { topic { name } }
        }
        openPullRequests: pullRequests(states: OPEN) { totalCount }
        openIssues: issues(states: OPEN)              { totalCount }
      }
    }
  }
}`;

export async function fetchOrgRepos(org = getOrg()) {
  const repos = [];
  let after = null;
  let hasNext = true;
  while (hasNext) {
    const data = await graphql(ORG_REPOS_QUERY, { org, after });
    const page = data.organization.repositories;
    repos.push(...page.nodes);
    hasNext = page.pageInfo.hasNextPage;
    after   = page.pageInfo.endCursor;
  }
  return repos;
}

/* ============================================================
   CATEGORIZE REPOS BY TOPIC / NAME CONVENTION
   ============================================================ */
const CATEGORY_RULES = {
  core:      /core|admin|control/i,
  discovery: /discovery|research|explore/i,
  sandbox:   /sandbox|experiment|test/i,
  industry:  /industry|sector|market/i,
  memory:    /memory|knowledge|journal/i,
  tools:     /tools?|util|helper|cli/i,
  archive:   /archive|legacy|deprecated/i,
};

export function categorizeRepo(repo) {
  const topics = repo.repositoryTopics?.nodes?.map(n => n.topic.name).join(' ') || '';
  const str = `${repo.name} ${topics}`.toLowerCase();
  if (repo.isArchived) return 'archive';
  for (const [cat, rx] of Object.entries(CATEGORY_RULES)) {
    if (rx.test(str)) return cat;
  }
  return 'other';
}

/* ============================================================
   GITHUB PROJECTS V2 (GraphQL)
   ============================================================ */
const ORG_PROJECTS_QUERY = `
query OrgProjects($org: String!, $after: String) {
  organization(login: $org) {
    projectsV2(first: 20, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        number
        url
        shortDescription
        updatedAt
        items(first: 50) {
          totalCount
          nodes {
            id
            type
            fieldValues(first: 8) {
              nodes {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field { ... on ProjectV2SingleSelectField { name } }
                }
                ... on ProjectV2ItemFieldTextValue {
                  text
                  field { ... on ProjectV2Field { name } }
                }
              }
            }
            content {
              ... on Issue      { title number state url repository { name } }
              ... on PullRequest { title number state url repository { name } }
              ... on DraftIssue  { title }
            }
          }
        }
      }
    }
  }
}`;

export async function fetchOrgProjects(org = getOrg()) {
  try {
    const projects = [];
    let after = null;
    let hasNext = true;
    while (hasNext) {
      const data = await graphql(ORG_PROJECTS_QUERY, { org, after });
      const page = data.organization.projectsV2;
      projects.push(...page.nodes);
      hasNext = page.pageInfo.hasNextPage;
      after   = page.pageInfo.endCursor;
    }
    return projects;
  } catch {
    return [];
  }
}

/* ============================================================
   OPEN PULL REQUESTS (REST paginated)
   ============================================================ */
export async function fetchOpenPRs(org = getOrg(), repos = []) {
  const results = [];
  const targets = repos.length ? repos : [];
  for (const repo of targets) {
    try {
      const prs = await ghFetch(
        `https://api.github.com/repos/${org}/${repo}/pulls?state=open&per_page=25`
      );
      results.push(...prs.map(pr => ({ ...pr, repoName: repo })));
    } catch { /* skip inaccessible repos */ }
  }
  return results;
}

/* ============================================================
   WORKFLOW RUNS (Actions status)
   ============================================================ */
export async function fetchWorkflowRuns(org, repo, limit = 10) {
  try {
    const data = await ghFetch(
      `https://api.github.com/repos/${org}/${repo}/actions/runs?per_page=${limit}`
    );
    return data.workflow_runs || [];
  } catch {
    return [];
  }
}

/* ============================================================
   SECRET SCANNING ALERTS
   ============================================================ */
export async function fetchSecretAlerts(org = getOrg(), repo) {
  try {
    const url = repo
      ? `https://api.github.com/repos/${org}/${repo}/secret-scanning/alerts?state=open&per_page=30`
      : `https://api.github.com/orgs/${org}/secret-scanning/alerts?state=open&per_page=30`;
    return await ghFetch(url);
  } catch {
    return [];
  }
}

/* ============================================================
   CODE SCANNING ALERTS
   ============================================================ */
export async function fetchCodeAlerts(org = getOrg(), repo) {
  try {
    return await ghFetch(
      `https://api.github.com/repos/${org}/${repo}/code-scanning/alerts?state=open&per_page=30`
    );
  } catch {
    return [];
  }
}

/* ============================================================
   WEBHOOKS (org-level, requires admin)
   ============================================================ */
export async function fetchOrgWebhooks(org = getOrg()) {
  try {
    return await ghFetch(`https://api.github.com/orgs/${org}/hooks`);
  } catch {
    return [];
  }
}

/* ============================================================
   ORG MEMBERS
   ============================================================ */
export async function fetchOrgMembers(org = getOrg()) {
  try {
    return await ghFetch(`https://api.github.com/orgs/${org}/members?per_page=50`);
  } catch {
    return [];
  }
}

/* ============================================================
   STATE FILE LOADERS (from _STATE/ in the repo)
   These load pre-computed state files committed by Actions.
   ============================================================ */
// _STATE/ is served alongside dashboard/ (both at site root after deploy).
// When running locally from repo root (python3 -m http.server), _STATE/ is
// one level up from dashboard/; the workflow copies _STATE/ next to dashboard/.
const STATE_BASE = location.pathname.includes('/dashboard/') ? '../' : './';

export async function loadStateFile(filename) {
  try {
    const res = await fetch(`${STATE_BASE}_STATE/${filename}?t=${Date.now()}`);
    if (!res.ok) throw new Error(res.status);
    return res.json();
  } catch {
    return null;
  }
}

export async function loadOrgIndex()       { return loadStateFile('org-index.json'); }
export async function loadProjectMap()     { return loadStateFile('project-map.json'); }
export async function loadMemorySnapshot() { return loadStateFile('memory-snapshot.json'); }

/* ============================================================
   RATE LIMIT CHECK
   ============================================================ */
export async function fetchRateLimit() {
  try {
    return await ghFetch('https://api.github.com/rate_limit');
  } catch {
    return null;
  }
}
