import path from "node:path";
import {
  classifyLicense,
  filesUnderPrefix,
  findLicensePath,
  parseFrontmatterLicense,
  parseRepoUrl,
} from "./github.mjs";
import {
  emptyDir,
  pathExists,
  readBinary,
  sha256,
  walkFiles,
  writeBinary,
} from "./fs-utils.mjs";
import { defaultVendorPath, vendorStatus } from "./lock.mjs";

const LICENSE_BASENAME = /^(license|licence)(\..+)?$/i;

export async function inspectSkillLicense(github, skill, { commit } = {}) {
  const { slug } = parseRepoUrl(skill.source);
  const sha = commit || skill.commit;
  const tree = await github.getTree(slug, sha);
  const licensePath = findLicensePath(tree, skill.upstreamPath);
  let spdx = null;
  let licenseBuffer = null;

  const repoLicense = await github.getRepoLicense(slug, sha);
  if (repoLicense?.spdx && repoLicense.spdx !== "NOASSERTION") {
    spdx = repoLicense.spdx;
  }

  if (licensePath) {
    licenseBuffer = await github.getRawFile(slug, sha, licensePath);
    spdx = inferSpdxFromText(licenseBuffer?.toString("utf8") || "") || spdx;
  } else {
    const skillMd = filesUnderPrefix(tree, skill.upstreamPath).find(
      (file) => file.relative === "SKILL.md",
    );
    if (skillMd) {
      const body = await github.getRawFile(slug, sha, skillMd.path);
      const fromMatter = body
        ? parseFrontmatterLicense(body.toString("utf8"))
        : null;
      if (fromMatter) spdx = fromMatter;
    }
  }

  const classification = classifyLicense(spdx);
  const declaredWithoutFile = !licensePath && classification === "permissive";
  const redistributable = Boolean(licensePath) && classification === "permissive";
  return {
    slug,
    commit: sha,
    tree,
    licensePath,
    licenseBuffer,
    license: spdx || "UNCLEAR",
    classification: redistributable
      ? "permissive"
      : declaredWithoutFile
        ? "unclear"
        : classification,
    declaredWithoutFile,
    redistributable,
  };
}

function inferSpdxFromText(text) {
  if (/Apache License/i.test(text) && /Version 2\.0/.test(text)) return "Apache-2.0";
  if (/MIT License/i.test(text) || /Permission is hereby granted, free of charge/i.test(text)) {
    return "MIT";
  }
  if (/BSD 3-Clause/i.test(text)) return "BSD-3-Clause";
  if (/BSD 2-Clause/i.test(text)) return "BSD-2-Clause";
  if (/\bISC License\b/i.test(text)) return "ISC";
  return null;
}

export function catalogNotes(inspection) {
  if (inspection.redistributable) return undefined;
  if (inspection.declaredWithoutFile) {
    return `Upstream declares ${inspection.license === "UNCLEAR" ? "a permissive license" : inspection.license} without a LICENSE file. Recorded as a link only.`;
  }
  return "No clear redistribution license was found upstream. Recorded as a link only.";
}

export async function vendorSkill(github, skill, rootDir, { commit, inspection } = {}) {
  const info = inspection || await inspectSkillLicense(github, skill, { commit });
  const { slug } = info;
  const sha = info.commit;
  const files = filesUnderPrefix(info.tree, skill.upstreamPath);
  if (files.length === 0) {
    throw new Error(`No files at ${slug}:${skill.upstreamPath}@${sha}`);
  }

  const vendorRel = skill.vendorPath || defaultVendorPath(skill);
  const vendorAbs = path.join(rootDir, vendorRel);
  await emptyDir(vendorAbs);

  for (const file of files) {
    const buffer = await github.getRawFile(slug, sha, file.path);
    if (!buffer) {
      throw new Error(`Missing blob ${slug}@${sha}:${file.path}`);
    }
    await writeBinary(path.join(vendorAbs, file.relative), buffer);
  }

  if (info.licensePath && info.licenseBuffer) {
    const alreadyPresent = files.some((file) => file.path === info.licensePath);
    if (!alreadyPresent) {
      const name = info.licensePath.split("/").pop();
      await writeBinary(path.join(vendorAbs, name), info.licenseBuffer);
    }
  }

  return {
    vendorPath: vendorRel,
    fileCount: files.length,
  };
}

export async function verifySkill(github, skill, rootDir) {
  const status = vendorStatus(skill);
  if (status === "link-only") {
    const vendorAbs = skill.vendorPath ? path.join(rootDir, skill.vendorPath) : null;
    if (vendorAbs && await pathExists(vendorAbs)) {
      const leftover = await walkFiles(vendorAbs);
      if (leftover.length > 0) {
        return {
          id: skill.id,
          ok: false,
          errors: [`link-only skill has vendored files under ${skill.vendorPath}`],
        };
      }
    }
    return { id: skill.id, ok: true, errors: [] };
  }

  const { slug } = parseRepoUrl(skill.source);
  const tree = await github.getTree(slug, skill.commit);
  const upstreamFiles = filesUnderPrefix(tree, skill.upstreamPath);
  const vendorAbs = path.join(rootDir, skill.vendorPath);
  const localFiles = await walkFiles(vendorAbs);
  const errors = [];
  const localSet = new Set(localFiles);
  const allowedExtras = new Set();

  if (skill.licensePath) {
    const licenseName = skill.licensePath.split("/").pop();
    const alreadyUpstream = upstreamFiles.some(
      (file) => file.relative === licenseName || file.path === skill.licensePath,
    );
    if (!alreadyUpstream) allowedExtras.add(licenseName);
  }

  for (const file of upstreamFiles) {
    if (!localSet.has(file.relative)) {
      errors.push(`missing ${file.relative}`);
      continue;
    }
    const expected = await github.getRawFile(slug, skill.commit, file.path);
    const actual = await readBinary(path.join(vendorAbs, file.relative));
    if (!expected) {
      errors.push(`upstream missing ${file.path}`);
      continue;
    }
    if (sha256(expected) !== sha256(actual)) {
      errors.push(`content mismatch ${file.relative}`);
    }
  }

  for (const local of localFiles) {
    const isUpstream = upstreamFiles.some((file) => file.relative === local);
    if (isUpstream) continue;
    if (allowedExtras.has(local) && LICENSE_BASENAME.test(local)) {
      const expected = await github.getRawFile(slug, skill.commit, skill.licensePath);
      const actual = await readBinary(path.join(vendorAbs, local));
      if (!expected || sha256(expected) !== sha256(actual)) {
        errors.push(`copied license mismatch ${local}`);
      }
      continue;
    }
    errors.push(`unexpected local file ${local}`);
  }

  return { id: skill.id, ok: errors.length === 0, errors };
}
