import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyUpdates,
  changedReports,
  collectUpdates,
  formatReport,
} from "../scripts/check-updates.mjs";
import { HEAD, PIN, blob, buf, fakeGithub } from "./helpers.mjs";

const skill = {
  id: "accessibility",
  source: "https://github.com/addyosmani/web-quality-skills",
  upstreamPath: "skills/accessibility",
  commit: PIN,
  license: "MIT",
  importedAt: "2026-01-01",
  targets: ["nx-playground"],
  status: "vendored",
  vendorPath: "vendor/addyosmani/accessibility",
  licensePath: "LICENSE",
};

function github({ head = PIN, licenseText = "MIT License\n" } = {}) {
  const commit = head;
  return fakeGithub({
    heads: { "addyosmani/web-quality-skills": head },
    trees: {
      [`addyosmani/web-quality-skills@${commit}`]: [
        blob("LICENSE"),
        blob("skills/accessibility/SKILL.md"),
      ],
    },
    files: {
      [`addyosmani/web-quality-skills@${commit}:LICENSE`]: buf(licenseText),
      [`addyosmani/web-quality-skills@${commit}:skills/accessibility/SKILL.md`]:
        buf("---\nname: accessibility\n---\n"),
    },
    licenses: {
      [`addyosmani/web-quality-skills@${commit}`]: {
        spdx: "MIT",
        path: "LICENSE",
        content: buf(licenseText),
      },
    },
  });
}

describe("check-updates", () => {
  it("reports no changes when HEAD matches the pin", async () => {
    const reports = await collectUpdates({ skills: [skill] }, github());
    assert.equal(changedReports(reports).length, 0);
    assert.match(formatReport(reports), /still match/);
  });

  it("reports commit and license changes", async () => {
    const client = fakeGithub({
      heads: { "addyosmani/web-quality-skills": HEAD },
      trees: {
        [`addyosmani/web-quality-skills@${HEAD}`]: [
          blob("LICENSE.md"),
          blob("skills/accessibility/SKILL.md"),
        ],
      },
      files: {
        [`addyosmani/web-quality-skills@${HEAD}:LICENSE.md`]: buf("Apache License\nVersion 2.0\n"),
        [`addyosmani/web-quality-skills@${HEAD}:skills/accessibility/SKILL.md`]:
          buf("---\nname: accessibility\n---\n"),
      },
      licenses: {
        [`addyosmani/web-quality-skills@${HEAD}`]: {
          spdx: "Apache-2.0",
          path: "LICENSE.md",
          content: buf("Apache License\nVersion 2.0\n"),
        },
      },
    });

    const reports = await collectUpdates({ skills: [skill] }, client);
    assert.equal(reports[0].commitChanged, true);
    assert.equal(reports[0].licenseChanged, true);
    assert.equal(reports[0].currentLicense, "Apache-2.0");
    assert.match(formatReport(reports), /License: MIT \(LICENSE\) → Apache-2.0/);
  });

  it("applyUpdates rewrites the pin and re-vendors permissive skills", async () => {
    const tmp = await import("node:fs/promises").then(async (fs) => {
      const os = await import("node:os");
      const path = await import("node:path");
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-apply-"));
      return { dir, path };
    });

    const client = fakeGithub({
      heads: { "addyosmani/web-quality-skills": HEAD },
      trees: {
        [`addyosmani/web-quality-skills@${HEAD}`]: [
          blob("LICENSE"),
          blob("skills/accessibility/SKILL.md"),
        ],
      },
      files: {
        [`addyosmani/web-quality-skills@${HEAD}:LICENSE`]: buf("MIT License\nCopyright A\n"),
        [`addyosmani/web-quality-skills@${HEAD}:skills/accessibility/SKILL.md`]:
          buf("# Accessibility\n"),
      },
      licenses: {
        [`addyosmani/web-quality-skills@${HEAD}`]: {
          spdx: "MIT",
          path: "LICENSE",
          content: buf("MIT License\nCopyright A\n"),
        },
      },
    });

    const reports = await collectUpdates({ skills: [skill] }, client);
    const { lock, applied } = await applyUpdates(
      { version: 1, skills: [skill] },
      reports,
      client,
      tmp.dir,
      { date: "2026-10-21" },
    );
    assert.deepEqual(applied, ["accessibility"]);
    assert.equal(lock.skills[0].commit, HEAD);
    assert.equal(lock.skills[0].importedAt, "2026-10-21");
    const written = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        tmp.path.join(tmp.dir, "vendor/addyosmani/accessibility/SKILL.md"),
        "utf8",
      ),
    );
    assert.equal(written, "# Accessibility\n");
  });
});
