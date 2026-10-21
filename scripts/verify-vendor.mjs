#!/usr/bin/env node
import { parseArgs } from "./lib/cli.mjs";
import { createGithubClient } from "./lib/github.mjs";
import { loadLock, resolveRepoPaths } from "./lib/lock.mjs";
import { verifySkill } from "./lib/vendor.mjs";

export async function verifyCatalog(lock, rootDir, github) {
  const results = [];
  for (const skill of lock.skills) {
    results.push(await verifySkill(github, skill, rootDir));
  }
  return results;
}

async function main(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  const { options } = parseArgs(argv, {
    flags: { help: "boolean" },
  });
  if (options.help) {
    console.log("Usage: node scripts/verify-vendor.mjs [--lock <path>]");
    return 0;
  }

  const paths = resolveRepoPaths(cwd, { lockPath: options.lock });
  const lock = await loadLock(paths.lockPath);
  const github = createGithubClient();
  const results = await verifyCatalog(lock, cwd, github);
  let failed = 0;
  for (const result of results) {
    if (result.ok) {
      console.log(`ok  ${result.id}`);
    } else {
      failed += 1;
      console.error(`FAIL ${result.id}`);
      for (const error of result.errors) console.error(`  - ${error}`);
    }
  }
  if (failed) {
    console.error(`${failed} skill(s) did not match the pinned upstream commit.`);
    return 1;
  }
  console.log(`All ${results.length} skills match their pinned commits.`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
