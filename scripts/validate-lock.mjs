#!/usr/bin/env node
import { parseArgs } from "./lib/cli.mjs";
import {
  loadLock,
  loadSchema,
  resolveRepoPaths,
  validateLock,
  vendorStatus,
} from "./lib/lock.mjs";

export function extraLockRules(lock) {
  const errors = [];
  const ids = new Set();
  for (const [index, skill] of lock.skills.entries()) {
    const prefix = `#/skills/${index}`;
    if (ids.has(skill.id)) {
      errors.push(`${prefix}: duplicate id "${skill.id}"`);
    }
    ids.add(skill.id);

    const status = vendorStatus(skill);
    if (status === "vendored" && !skill.vendorPath) {
      errors.push(`${prefix}: vendored skill "${skill.id}" is missing vendorPath`);
    }
    if (status === "link-only" && skill.vendorPath) {
      errors.push(`${prefix}: link-only skill "${skill.id}" must not set vendorPath`);
    }
  }
  return errors;
}

export function validateLockDocument(lock, schema) {
  return [...validateLock(lock, schema), ...extraLockRules(lock)];
}

async function main(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  const { options } = parseArgs(argv, {
    flags: { help: "boolean" },
  });
  if (options.help) {
    console.log("Usage: node scripts/validate-lock.mjs [--lock <path>] [--schema <path>]");
    return 0;
  }

  const paths = resolveRepoPaths(cwd, {
    lockPath: options.lock,
    schemaPath: options.schema,
  });
  const [lock, schema] = await Promise.all([
    loadLock(paths.lockPath),
    loadSchema(paths.schemaPath),
  ]);
  const errors = validateLockDocument(lock, schema);
  if (errors.length) {
    for (const error of errors) console.error(error);
    return 1;
  }
  console.log(`Lock file is valid (${lock.skills.length} skills).`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
