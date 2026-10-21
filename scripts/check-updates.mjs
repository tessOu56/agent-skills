#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs, todayUtc } from "./lib/cli.mjs";
import { createGithubClient, parseRepoUrl } from "./lib/github.mjs";
import {
  loadLock,
  resolveRepoPaths,
  saveLock,
  vendorStatus,
} from "./lib/lock.mjs";
import { catalogNotes, inspectSkillLicense, vendorSkill } from "./lib/vendor.mjs";

export async function collectUpdates(lock, github) {
  const headCache = new Map();
  const reports = [];

  for (const skill of lock.skills) {
    const { slug } = parseRepoUrl(skill.source);
    if (!headCache.has(slug)) {
      headCache.set(slug, await github.getHeadSha(slug, "HEAD"));
    }
    const head = headCache.get(slug);
    const headInspection = await inspectSkillLicense(github, skill, { commit: head });
    const commitChanged = head !== skill.commit;
    const licenseChanged = headInspection.license !== skill.license
      || Boolean(headInspection.licensePath) !== Boolean(skill.licensePath)
      || headInspection.licensePath !== (skill.licensePath || null);

    reports.push({
      id: skill.id,
      source: skill.source,
      upstreamPath: skill.upstreamPath,
      pinned: skill.commit,
      head,
      commitChanged,
      licenseChanged,
      previousLicense: skill.license,
      currentLicense: headInspection.license,
      previousLicensePath: skill.licensePath || null,
      currentLicensePath: headInspection.licensePath,
      status: vendorStatus(skill),
      redistributable: headInspection.redistributable,
      inspection: headInspection,
    });
  }

  return reports;
}

export function changedReports(reports) {
  return reports.filter((row) => row.commitChanged || row.licenseChanged);
}

export function formatReport(reports) {
  const changed = changedReports(reports);
  const lines = [
    "# Upstream skill update report",
    "",
    `Checked ${reports.length} skills; ${changed.length} changed.`,
    "",
  ];
  if (changed.length === 0) {
    lines.push("All pinned commits and licenses still match upstream HEAD.");
    return lines.join("\n");
  }
  for (const row of changed) {
    lines.push(`## ${row.id}`);
    lines.push("");
    lines.push(`- Source: ${row.source}`);
    lines.push(`- Path: \`${row.upstreamPath}\``);
    if (row.commitChanged) {
      lines.push(`- Commit: \`${row.pinned}\` → \`${row.head}\``);
    } else {
      lines.push(`- Commit: \`${row.pinned}\` (unchanged)`);
    }
    if (row.licenseChanged) {
      lines.push(
        `- License: ${row.previousLicense}${row.previousLicensePath ? ` (${row.previousLicensePath})` : ""} → ${row.currentLicense}${row.currentLicensePath ? ` (${row.currentLicensePath})` : ""}`,
      );
    } else {
      lines.push(`- License: ${row.currentLicense}`);
    }
    if (!row.redistributable) {
      lines.push("- Redistribution: not permitted from a clear upstream LICENSE file; keep as link-only.");
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export async function applyUpdates(lock, reports, github, rootDir, { date = todayUtc() } = {}) {
  const next = structuredClone(lock);
  const applied = [];

  for (const row of reports) {
    if (!row.commitChanged && !row.licenseChanged) continue;
    const skill = next.skills.find((item) => item.id === row.id);
    skill.commit = row.head;
    skill.license = row.currentLicense;
    skill.importedAt = date;
    if (row.currentLicensePath) skill.licensePath = row.currentLicensePath;
    else delete skill.licensePath;

    if (row.redistributable) {
      skill.status = "vendored";
      const result = await vendorSkill(github, skill, rootDir, {
        commit: row.head,
        inspection: row.inspection,
      });
      skill.vendorPath = result.vendorPath;
      const notes = catalogNotes(row.inspection);
      if (notes) skill.notes = notes;
      else delete skill.notes;
    } else {
      skill.status = "link-only";
      delete skill.vendorPath;
      skill.notes = catalogNotes(row.inspection);
    }
    applied.push(skill.id);
  }

  return { lock: next, applied };
}

async function main(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  const { options } = parseArgs(argv, {
    flags: { json: "boolean", apply: "boolean", help: "boolean" },
  });
  if (options.help) {
    console.log(
      "Usage: node scripts/check-updates.mjs [--json] [--out <file>] [--apply] [--lock <path>]",
    );
    return 0;
  }

  const paths = resolveRepoPaths(cwd, { lockPath: options.lock });
  const lock = await loadLock(paths.lockPath);
  const github = createGithubClient();
  const reports = await collectUpdates(lock, github);
  const changed = changedReports(reports);
  const text = formatReport(reports);
  const payload = {
    checked: reports.length,
    changed: changed.map(({ inspection, ...rest }) => rest),
  };

  if (options.out) {
    await writeFile(
      options.out,
      options.json ? `${JSON.stringify(payload, null, 2)}\n` : text,
    );
  }

  if (options.json && !options.out) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(text);
  }

  if (options.apply && changed.length) {
    const { lock: next, applied } = await applyUpdates(lock, reports, github, cwd);
    await saveLock(paths.lockPath, next);
    console.log(`Updated ${applied.length} skill(s) in the lock file and vendor tree.`);
  }

  return changed.length ? 10 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
