import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateAgainstSchema } from "./schema.mjs";

export const DEFAULT_LOCK_REL = "skills.lock.json";
export const DEFAULT_SCHEMA_REL = "schema/skills.lock.schema.json";

export async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function loadLock(lockPath) {
  return loadJson(lockPath);
}

export async function loadSchema(schemaPath) {
  return loadJson(schemaPath);
}

export function validateLock(lock, schema) {
  return validateAgainstSchema(lock, schema);
}

export async function saveLock(lockPath, lock) {
  const text = `${JSON.stringify(lock, null, 2)}\n`;
  await writeFile(lockPath, text);
}

export function skillsForTarget(lock, target) {
  return lock.skills.filter((skill) => skill.targets.includes(target));
}

export function vendorStatus(skill) {
  return skill.status || (skill.vendorPath ? "vendored" : "link-only");
}

export function sourceSlugFromUrl(source) {
  return source.replace("https://github.com/", "");
}

export function defaultVendorPath(skill) {
  const { owner } = parseOwnerRepo(skill.source);
  return `vendor/${owner}/${skill.id}`;
}

export function parseOwnerRepo(source) {
  const slug = sourceSlugFromUrl(source);
  const [owner, repo] = slug.split("/");
  return { owner, repo, slug };
}

export function resolveRepoPaths(rootDir, options = {}) {
  return {
    rootDir,
    lockPath: options.lockPath || path.join(rootDir, DEFAULT_LOCK_REL),
    schemaPath: options.schemaPath || path.join(rootDir, DEFAULT_SCHEMA_REL),
  };
}
