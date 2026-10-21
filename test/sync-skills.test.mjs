import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { syncSkills } from "../scripts/sync-skills.mjs";

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "skills-sync-"));
  const vendor = path.join(root, "vendor", "addyosmani", "accessibility");
  await mkdir(vendor, { recursive: true });
  await writeFile(path.join(vendor, "SKILL.md"), "# Accessibility\n");
  await writeFile(path.join(vendor, "LICENSE"), "MIT License\n");
  return root;
}

const lock = {
  version: 1,
  skills: [
    {
      id: "accessibility",
      source: "https://github.com/addyosmani/web-quality-skills",
      upstreamPath: "skills/accessibility",
      commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      license: "MIT",
      importedAt: "2026-10-21",
      targets: ["ai-search-portal", "explore-design-sdk"],
      status: "vendored",
      vendorPath: "vendor/addyosmani/accessibility",
    },
    {
      id: "seo",
      source: "https://github.com/addyosmani/web-quality-skills",
      upstreamPath: "skills/seo",
      commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      license: "MIT",
      importedAt: "2026-10-21",
      targets: ["ai-search-portal"],
      status: "vendored",
      vendorPath: "vendor/addyosmani/seo",
    },
    {
      id: "react-best-practices",
      source: "https://github.com/vercel-labs/agent-skills",
      upstreamPath: "skills/react-best-practices",
      commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      license: "MIT",
      importedAt: "2026-10-21",
      targets: ["ai-search-portal", "explore-design-sdk"],
      status: "link-only",
      notes: "No LICENSE file.",
    },
  ],
};

describe("sync-skills", () => {
  it("copies vendored skills for a target into both agent layouts", async () => {
    const root = await fixtureRoot();
    const dest = await mkdtemp(path.join(tmpdir(), "skills-dest-"));
    const result = await syncSkills({
      lock,
      rootDir: root,
      dest,
      repo: "explore-design-sdk",
    });

    assert.deepEqual(result.selected, ["accessibility", "react-best-practices"]);
    assert.equal(
      await readFile(path.join(dest, ".agents/skills/accessibility/SKILL.md"), "utf8"),
      "# Accessibility\n",
    );
    assert.equal(
      await readFile(path.join(dest, ".cursor/skills/accessibility/LICENSE"), "utf8"),
      "MIT License\n",
    );
    assert.ok(
      result.actions.some((action) => action.status === "skipped-link-only"),
    );
    assert.ok(
      result.actions.every(
        (action) => action.id !== "seo" || action.status === "skipped-link-only",
      ),
    );
  });

  it("does not write files during a dry run", async () => {
    const root = await fixtureRoot();
    const dest = await mkdtemp(path.join(tmpdir(), "skills-dry-"));
    const result = await syncSkills({
      lock,
      rootDir: root,
      dest,
      repo: "ai-search-portal",
      dryRun: true,
    });
    assert.ok(result.actions.every((action) => action.status !== "copied"));
    await assert.rejects(
      readFile(path.join(dest, ".agents/skills/accessibility/SKILL.md")),
    );
  });
});
