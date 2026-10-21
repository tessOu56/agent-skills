#!/usr/bin/env node
import { parseArgs, todayUtc } from "./lib/cli.mjs";
import { createGithubClient } from "./lib/github.mjs";
import {
  defaultVendorPath,
  loadLock,
  resolveRepoPaths,
  saveLock,
} from "./lib/lock.mjs";
import { catalogNotes, inspectSkillLicense, vendorSkill } from "./lib/vendor.mjs";

export async function refreshSkill(github, skill, rootDir, { date = todayUtc() } = {}) {
  const inspection = await inspectSkillLicense(github, skill, { commit: skill.commit });
  const next = { ...skill };
  next.license = inspection.license;
  next.importedAt = date;
  if (inspection.licensePath) next.licensePath = inspection.licensePath;
  else delete next.licensePath;

  if (inspection.redistributable) {
    next.status = "vendored";
    next.vendorPath = skill.vendorPath || defaultVendorPath(skill);
    await vendorSkill(github, next, rootDir, { inspection });
    const notes = catalogNotes(inspection);
    if (notes) next.notes = notes;
    else delete next.notes;
  } else {
    next.status = "link-only";
    delete next.vendorPath;
    next.notes = catalogNotes(inspection);
  }
  return next;
}

async function main(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  const { options } = parseArgs(argv, {
    flags: { help: "boolean" },
  });
  if (options.help) {
    console.log("Usage: node scripts/vendor-skills.mjs [--id <skill-id>] [--lock <path>]");
    return 0;
  }

  const paths = resolveRepoPaths(cwd, { lockPath: options.lock });
  const lock = await loadLock(paths.lockPath);
  const github = createGithubClient();
  const selected = options.id
    ? lock.skills.filter((skill) => skill.id === options.id)
    : lock.skills;

  if (options.id && selected.length === 0) {
    console.error(`Unknown skill id: ${options.id}`);
    return 1;
  }

  const nextSkills = [];
  for (const skill of lock.skills) {
    if (!selected.includes(skill)) {
      nextSkills.push(skill);
      continue;
    }
    const updated = await refreshSkill(github, skill, cwd);
    console.log(
      `${updated.status === "vendored" ? "vendored" : "link-only"} ${updated.id} @ ${updated.commit} (${updated.license})`,
    );
    nextSkills.push(updated);
  }

  await saveLock(paths.lockPath, { ...lock, skills: nextSkills });
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
