/**
 * Shared GitHub helpers for Research Hub cloud APIs.
 * Requires Vercel env: GITHUB_TOKEN (contents:write + actions:write)
 * Optional: GITHUB_REPO=owner/name (default elabaglama/researchhub)
 */

const DEFAULT_REPO = "elabaglama/researchhub";
const DEFAULT_BRANCH = "main";

export function repoParts() {
  const full = process.env.GITHUB_REPO || DEFAULT_REPO;
  const [owner, repo] = full.split("/");
  return { owner, repo, full };
}

export function token() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
}

export async function gh(path, { method = "GET", body } = {}) {
  const auth = token();
  if (!auth) {
    const err = new Error(
      "Cloud sync is not configured yet. Add a GitHub token in Vercel → Project → Settings → Environment Variables as GITHUB_TOKEN."
    );
    err.status = 503;
    throw err;
  }
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "research-hub",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const err = new Error(data?.message || `GitHub API ${res.status}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

export async function getFile(path) {
  const { owner, repo } = repoParts();
  const ref = process.env.GITHUB_BRANCH || DEFAULT_BRANCH;
  try {
    return await gh(`/repos/${owner}/${repo}/contents/${path}?ref=${ref}`);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function putFile(path, content, message) {
  const { owner, repo } = repoParts();
  const ref = process.env.GITHUB_BRANCH || DEFAULT_BRANCH;
  const existing = await getFile(path);
  const encoded = Buffer.from(content, "utf8").toString("base64");
  return gh(`/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    body: {
      message,
      content: encoded,
      branch: ref,
      ...(existing?.sha ? { sha: existing.sha } : {}),
    },
  });
}

export async function readJsonFile(path, fallback) {
  const file = await getFile(path);
  if (!file?.content) return fallback;
  const raw = Buffer.from(String(file.content).replace(/\n/g, ""), "base64").toString(
    "utf8"
  );
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function triggerScrapeWorkflow({
  url = "",
  sourceId = "",
  removeSourceId = "",
  name = "",
  mode = "one",
} = {}) {
  const { owner, repo } = repoParts();
  const ref = process.env.GITHUB_BRANCH || DEFAULT_BRANCH;
  await gh(`/repos/${owner}/${repo}/actions/workflows/scrape.yml/dispatches`, {
    method: "POST",
    body: {
      ref,
      inputs: {
        url: url || "",
        source_id: sourceId || "",
        name: name || "",
        mode: mode || "one",
        // keep legacy input key empty (workflow no longer uses remove_source_id)
      },
    },
  });
  return {
    pending: true,
    message:
      "Scrape queued. Your feed updates when the cloud worker finishes writing Firestore.",
  };
}

export function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function nameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
