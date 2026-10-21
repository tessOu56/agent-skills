const API = "https://api.github.com";
const USER_AGENT = "agent-skills-catalog";

export const PERMISSIVE_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "CC0-1.0",
  "Unlicense",
  "0BSD",
]);

export function parseRepoUrl(source) {
  const match = String(source).match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/,
  );
  if (!match) {
    throw new Error(`Unsupported source repo URL: ${source}`);
  }
  return { owner: match[1], repo: match[2], slug: `${match[1]}/${match[2]}` };
}

export function githubToken(env = process.env) {
  return env.GITHUB_TOKEN || env.GH_TOKEN || "";
}

export function createGithubClient({
  fetchFn = globalThis.fetch,
  token = githubToken(),
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  async function request(url, { raw = false, retries = 4 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const headers = { "User-Agent": USER_AGENT };
      if (!raw) headers.Accept = "application/vnd.github+json";
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetchFn(url, { headers });
      if (response.status === 404) {
        return { ok: false, status: 404, body: null };
      }
      if (response.status === 403 || response.status === 429) {
        const waitMs = 500 * 2 ** attempt;
        lastError = new Error(
          `GitHub rate limited (${response.status}) for ${url}`,
        );
        await sleepFn(waitMs);
        continue;
      }
      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `GitHub request failed ${response.status} ${url}: ${text.slice(0, 300)}`,
        );
      }
      if (raw) {
        return { ok: true, status: response.status, body: Buffer.from(await response.arrayBuffer()) };
      }
      return { ok: true, status: response.status, body: await response.json() };
    }
    throw lastError;
  }

  async function api(pathname) {
    return request(`${API}/${pathname.replace(/^\/+/, "")}`);
  }

  return {
    async getHeadSha(slug, ref = "HEAD") {
      const result = await api(`repos/${slug}/commits/${encodeURIComponent(ref)}`);
      if (!result.ok) {
        throw new Error(`Could not resolve ${slug}@${ref}`);
      }
      return result.body.sha;
    },

    async getTree(slug, commit) {
      const result = await api(
        `repos/${slug}/git/trees/${commit}?recursive=1`,
      );
      if (!result.ok) {
        throw new Error(`Could not read tree for ${slug}@${commit}`);
      }
      return result.body.tree || [];
    },

    async getRawFile(slug, commit, filePath) {
      const encodedPath = filePath
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
      const result = await api(
        `repos/${slug}/contents/${encodedPath}?ref=${encodeURIComponent(commit)}`,
      );
      if (!result.ok) return null;
      if (result.body?.encoding === "base64" && result.body.content) {
        return Buffer.from(result.body.content.replace(/\n/g, ""), "base64");
      }
      if (typeof result.body?.content === "string") {
        return Buffer.from(result.body.content);
      }
      return null;
    },

    async getRepoLicense(slug, ref = "HEAD") {
      const result = await api(
        `repos/${slug}/license?ref=${encodeURIComponent(ref)}`,
      );
      if (!result.ok) return null;
      const body = result.body;
      const content =
        body.content && body.encoding === "base64"
          ? Buffer.from(body.content, "base64")
          : null;
      return {
        spdx: body.license?.spdx_id || null,
        path: body.path || null,
        content,
      };
    },
  };
}

export function filesUnderPrefix(tree, prefix) {
  const normalized = prefix.replace(/\/+$/, "");
  return tree
    .filter(
      (entry) =>
        entry.type === "blob" &&
        (entry.path === normalized ||
          entry.path.startsWith(`${normalized}/`)),
    )
    .map((entry) => ({
      path: entry.path,
      relative: entry.path === normalized
        ? pathBasename(entry.path)
        : entry.path.slice(normalized.length + 1),
      size: entry.size ?? 0,
    }))
    .sort((a, b) => a.relative.localeCompare(b.relative));
}

function pathBasename(filePath) {
  const parts = filePath.split("/");
  return parts[parts.length - 1];
}

export function findLicensePath(tree, skillPrefix) {
  const skillFiles = filesUnderPrefix(tree, skillPrefix);
  const inSkill = skillFiles.find((file) =>
    /^(license|licence)(\..+)?$/i.test(file.relative.split("/").pop()),
  );
  if (inSkill) return inSkill.path;

  const root = tree.find(
    (entry) =>
      entry.type === "blob" &&
      /^(license|licence)(\..+)?$/i.test(entry.path),
  );
  return root ? root.path : null;
}

export function parseFrontmatterLicense(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = text.slice(3, end);
  const match = block.match(/^license:\s*["']?([^\s"']+)/m);
  return match ? match[1] : null;
}

export function classifyLicense(spdx) {
  if (!spdx || spdx === "NOASSERTION" || spdx === "NONE" || spdx === "UNCLEAR") {
    return "unclear";
  }
  if (PERMISSIVE_LICENSES.has(spdx)) return "permissive";
  return "other";
}
