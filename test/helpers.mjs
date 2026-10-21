export function buf(text) {
  return Buffer.from(text);
}

export function fakeGithub({
  heads = {},
  trees = {},
  files = {},
  licenses = {},
} = {}) {
  return {
    async getHeadSha(slug) {
      if (!heads[slug]) throw new Error(`no head for ${slug}`);
      return heads[slug];
    },
    async getTree(slug, commit) {
      const key = `${slug}@${commit}`;
      if (!trees[key]) throw new Error(`no tree for ${key}`);
      return trees[key];
    },
    async getRawFile(slug, commit, filePath) {
      return files[`${slug}@${commit}:${filePath}`] ?? null;
    },
    async getRepoLicense(slug, ref) {
      return licenses[`${slug}@${ref}`] ?? null;
    },
  };
}

export function blob(path, size = 1) {
  return { path, type: "blob", size };
}

export const PIN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const HEAD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
