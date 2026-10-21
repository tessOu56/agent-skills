import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyLicense,
  filesUnderPrefix,
  findLicensePath,
  parseFrontmatterLicense,
  parseRepoUrl,
} from "../scripts/lib/github.mjs";

describe("github helpers", () => {
  it("parses GitHub repo URLs", () => {
    assert.deepEqual(parseRepoUrl("https://github.com/openai/skills"), {
      owner: "openai",
      repo: "skills",
      slug: "openai/skills",
    });
    assert.throws(() => parseRepoUrl("https://gitlab.com/openai/skills"));
  });

  it("lists blobs under a skill prefix", () => {
    const tree = [
      { path: "skills/seo/SKILL.md", type: "blob", size: 10 },
      { path: "skills/seo/references/a.md", type: "blob", size: 10 },
      { path: "skills/seo", type: "tree" },
      { path: "skills/performance/SKILL.md", type: "blob", size: 10 },
    ];
    assert.deepEqual(
      new Set(filesUnderPrefix(tree, "skills/seo").map((file) => file.relative)),
      new Set(["SKILL.md", "references/a.md"]),
    );
  });

  it("prefers a skill-local license file over the repo root", () => {
    const tree = [
      { path: "LICENSE", type: "blob", size: 10 },
      { path: "skills/demo/LICENSE.txt", type: "blob", size: 10 },
      { path: "skills/demo/SKILL.md", type: "blob", size: 10 },
    ];
    assert.equal(findLicensePath(tree, "skills/demo"), "skills/demo/LICENSE.txt");
    assert.equal(findLicensePath(tree, "skills/missing"), "LICENSE");
  });

  it("reads license frontmatter and classifies SPDX ids", () => {
    assert.equal(
      parseFrontmatterLicense("---\nname: x\nlicense: MIT\n---\n# Title\n"),
      "MIT",
    );
    assert.equal(parseFrontmatterLicense("# no frontmatter\n"), null);
    assert.equal(classifyLicense("MIT"), "permissive");
    assert.equal(classifyLicense("UNCLEAR"), "unclear");
    assert.equal(classifyLicense("AGPL-3.0"), "other");
  });
});
