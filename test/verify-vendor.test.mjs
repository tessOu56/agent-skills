import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { inspectSkillLicense, verifySkill } from "../scripts/lib/vendor.mjs";
import { PIN, blob, buf, fakeGithub } from "./helpers.mjs";

const skill = {
  id: "accessibility",
  source: "https://github.com/addyosmani/web-quality-skills",
  upstreamPath: "skills/accessibility",
  commit: PIN,
  license: "MIT",
  importedAt: "2026-10-21",
  targets: ["nx-playground"],
  status: "vendored",
  vendorPath: "vendor/addyosmani/accessibility",
  licensePath: "LICENSE",
};

function client(skillMd = "# Accessibility\n", license = "MIT License\n") {
  return fakeGithub({
    trees: {
      [`addyosmani/web-quality-skills@${PIN}`]: [
        blob("LICENSE"),
        blob("skills/accessibility/SKILL.md"),
      ],
    },
    files: {
      [`addyosmani/web-quality-skills@${PIN}:LICENSE`]: buf(license),
      [`addyosmani/web-quality-skills@${PIN}:skills/accessibility/SKILL.md`]: buf(skillMd),
    },
  });
}

describe("verify-vendor", () => {
  it("passes when local files match the pinned commit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skills-verify-"));
    const dest = path.join(root, skill.vendorPath);
    await mkdir(dest, { recursive: true });
    await writeFile(path.join(dest, "SKILL.md"), "# Accessibility\n");
    await writeFile(path.join(dest, "LICENSE"), "MIT License\n");
    const result = await verifySkill(client(), skill, root);
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
  });

  it("fails on content drift, missing files, and unexpected extras", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skills-verify-bad-"));
    const dest = path.join(root, skill.vendorPath);
    await mkdir(path.join(dest, "extra"), { recursive: true });
    await writeFile(path.join(dest, "SKILL.md"), "# Changed\n");
    await writeFile(path.join(dest, "extra/note.md"), "nope\n");
    const result = await verifySkill(client(), skill, root);
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /content mismatch SKILL.md/);
    assert.match(result.errors.join("\n"), /unexpected local file extra\/note.md/);
  });

  it("does not treat a declared license without a LICENSE file as redistributable", async () => {
    const info = await inspectSkillLicense(
      fakeGithub({
        trees: {
          [`vercel-labs/agent-skills@${PIN}`]: [
            blob("skills/react-best-practices/SKILL.md"),
          ],
        },
        files: {
          [`vercel-labs/agent-skills@${PIN}:skills/react-best-practices/SKILL.md`]:
            buf("---\nlicense: MIT\n---\n# React\n"),
        },
      }),
      {
        source: "https://github.com/vercel-labs/agent-skills",
        upstreamPath: "skills/react-best-practices",
        commit: PIN,
      },
    );
    assert.equal(info.license, "MIT");
    assert.equal(info.declaredWithoutFile, true);
    assert.equal(info.redistributable, false);
  });

  it("skips link-only skills without a vendor tree", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skills-verify-link-"));
    const result = await verifySkill(
      fakeGithub(),
      {
        ...skill,
        id: "react-best-practices",
        status: "link-only",
        vendorPath: undefined,
      },
      root,
    );
    assert.equal(result.ok, true);
  });
});
