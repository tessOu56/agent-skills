import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAgainstSchema } from "../scripts/lib/schema.mjs";
import { extraLockRules, validateLockDocument } from "../scripts/validate-lock.mjs";
import { skillsForTarget, vendorStatus } from "../scripts/lib/lock.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadCatalog() {
  const lock = JSON.parse(await readFile(path.join(root, "skills.lock.json"), "utf8"));
  const schema = JSON.parse(
    await readFile(path.join(root, "schema/skills.lock.schema.json"), "utf8"),
  );
  return { lock, schema };
}

function sampleSkill(overrides = {}) {
  return {
    id: "sample-skill",
    source: "https://github.com/example/skills",
    upstreamPath: "skills/sample",
    commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    license: "MIT",
    importedAt: "2026-10-21",
    targets: ["nx-playground"],
    status: "vendored",
    vendorPath: "vendor/example/sample-skill",
    ...overrides,
  };
}

describe("lock schema", () => {
  it("accepts the catalog lock file", async () => {
    const { lock, schema } = await loadCatalog();
    assert.deepEqual(validateLockDocument(lock, schema), []);
  });

  it("rejects a bad commit SHA and unknown fields", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["version"],
      properties: { version: { type: "integer", const: 1 } },
    };
    assert.deepEqual(validateAgainstSchema({ version: 1 }, schema), []);
    assert.match(
      validateAgainstSchema({ version: 2 }, schema).join("\n"),
      /expected 1/,
    );
    assert.match(
      validateAgainstSchema({ version: 1, extra: true }, schema).join("\n"),
      /unexpected property/,
    );
  });

  it("requires vendorPath for vendored skills and forbids it for link-only", async () => {
    const { schema } = await loadCatalog();
    const vendored = { version: 1, skills: [sampleSkill({ vendorPath: undefined })] };
    delete vendored.skills[0].vendorPath;
    assert.match(
      validateLockDocument(vendored, schema).join("\n"),
      /vendorPath/,
    );

    const linkOnly = {
      version: 1,
      skills: [
        sampleSkill({
          status: "link-only",
          vendorPath: "vendor/example/sample-skill",
        }),
      ],
    };
    assert.match(
      validateLockDocument(linkOnly, schema).join("\n"),
      /link-only/,
    );
  });

  it("rejects duplicate ids", () => {
    const lock = {
      version: 1,
      skills: [sampleSkill(), sampleSkill()],
    };
    assert.match(extraLockRules(lock).join("\n"), /duplicate id/);
  });

  it("filters skills by target repo", async () => {
    const { lock } = await loadCatalog();
    const explore = skillsForTarget(lock, "explore-design-sdk").map((s) => s.id);
    assert.deepEqual(explore.sort(), ["accessibility", "react-best-practices"]);
    assert.equal(vendorStatus(lock.skills[0]), "link-only");
  });
});
