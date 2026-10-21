#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "./lib/cli.mjs";
import { copyDir, pathExists } from "./lib/fs-utils.mjs";
import {
  loadLock,
  resolveRepoPaths,
  skillsForTarget,
  vendorStatus,
} from "./lib/lock.mjs";

const DEFAULT_DESTINATIONS = [
  { id: "agents", relative: ".agents/skills" },
  { id: "cursor", relative: ".cursor/skills" },
];

export function selectSkills(lock, repo) {
  return skillsForTarget(lock, repo);
}

export async function syncSkills({
  lock,
  rootDir,
  dest,
  repo,
  destinations = DEFAULT_DESTINATIONS,
  dryRun = false,
}) {
  const selected = selectSkills(lock, repo);
  const actions = [];

  for (const skill of selected) {
    const status = vendorStatus(skill);
    if (status !== "vendored") {
      actions.push({
        id: skill.id,
        status: "skipped-link-only",
        source: skill.source,
        upstreamPath: skill.upstreamPath,
      });
      continue;
    }

    const from = path.join(rootDir, skill.vendorPath);
    if (!(await pathExists(from))) {
      actions.push({
        id: skill.id,
        status: "missing-vendor",
        vendorPath: skill.vendorPath,
      });
      continue;
    }

    for (const destination of destinations) {
      const to = path.join(dest, destination.relative, skill.id);
      if (!dryRun) {
        await copyDir(from, to);
      }
      actions.push({
        id: skill.id,
        status: dryRun ? "would-copy" : "copied",
        from: skill.vendorPath,
        to: path.join(destination.relative, skill.id),
        layout: destination.id,
      });
    }
  }

  return { selected: selected.map((skill) => skill.id), actions };
}

function parseDestinations(options) {
  if (options["agents-only"]) return DEFAULT_DESTINATIONS.filter((item) => item.id === "agents");
  if (options["cursor-only"]) return DEFAULT_DESTINATIONS.filter((item) => item.id === "cursor");
  return DEFAULT_DESTINATIONS;
}

async function main(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  const { options } = parseArgs(argv, {
    flags: {
      "dry-run": "boolean",
      "agents-only": "boolean",
      "cursor-only": "boolean",
      help: "boolean",
    },
  });
  if (options.help) {
    console.log(
      "Usage: node scripts/sync-skills.mjs --repo <name> --dest <target-repo-path> [--dry-run] [--agents-only|--cursor-only]",
    );
    return 0;
  }
  if (!options.repo || !options.dest) {
    console.error("Both --repo and --dest are required.");
    return 1;
  }

  const paths = resolveRepoPaths(cwd, { lockPath: options.lock });
  const lock = await loadLock(paths.lockPath);
  const result = await syncSkills({
    lock,
    rootDir: cwd,
    dest: path.resolve(cwd, options.dest),
    repo: options.repo,
    destinations: parseDestinations(options),
    dryRun: Boolean(options["dry-run"]),
  });

  if (result.selected.length === 0) {
    console.error(`No skills target "${options.repo}".`);
    return 1;
  }

  for (const action of result.actions) {
    if (action.status === "copied" || action.status === "would-copy") {
      console.log(`${action.status} ${action.id} -> ${action.to}`);
    } else if (action.status === "skipped-link-only") {
      console.log(
        `skipped ${action.id} (link-only; no clear LICENSE to copy)`,
      );
      console.log(`  ${action.source}/tree/HEAD/${action.upstreamPath}`);
    } else {
      console.error(`${action.status} ${action.id}`);
    }
  }

  const failed = result.actions.filter((action) => action.status === "missing-vendor");
  return failed.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
