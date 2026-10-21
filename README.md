# agent-skills

Curated catalog of agent skills for code review, security, web quality, and backend work. Upstream skills are pinned to a specific commit, copied only when the license allows redistribution, and synced into target repositories as needed.

- `vendor/<source>/<skill>/` — verbatim upstream copies plus their license files
- `skills/` — reserved for first-party or modified skills
- `skills.lock.json` — pin file (id, source, path, commit, license, import date, targets)
- `scripts/` — lock validation, vendor verification, update checks, and sync

## How to sync

Copy the skills assigned to a target repository into that repo's `.agents/skills/` and `.cursor/skills/` directories:

```bash
node scripts/sync-skills.mjs --repo ai-search-portal --dest ../ai-search-portal
```

Useful flags:

- `--dry-run` — print the copy plan without writing files
- `--agents-only` / `--cursor-only` — limit the destination layout

Target names currently used in the lock file: `ai-search-portal`, `nx-playground`, `metalcraft-platform`, `explore-design-sdk`, `polyglot-labs`.

Link-only entries are listed during sync and are not copied.

## How to update

Check pinned commits against each upstream default branch and report license changes:

```bash
node scripts/check-updates.mjs
```

Re-fetch changed skills and rewrite the lock file:

```bash
node scripts/check-updates.mjs --apply
```

Re-vendor the current pins (or one skill) without moving HEAD:

```bash
node scripts/vendor-skills.mjs
node scripts/vendor-skills.mjs --id accessibility
```

A monthly GitHub Action runs the update checker and opens an issue or pull request when upstream has moved.

## Development

```bash
npm test
npm run validate
npm run verify
```

CI validates `skills.lock.json` against `schema/skills.lock.schema.json`, checks that every vendored file matches its pinned commit, and runs the unit tests.

## Credits

This repository's own tooling is MIT licensed. Vendored skills remain under their upstream terms:

| Skill | Source | License | Notes |
| --- | --- | --- | --- |
| react-best-practices | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices) | MIT (declared) | No `LICENSE` file at the pinned commit; recorded as a link only |
| accessibility | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills/tree/afa8da942115f2961fdbfa80807ea0b232ff6c00/skills/accessibility) | MIT | |
| core-web-vitals | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills/tree/afa8da942115f2961fdbfa80807ea0b232ff6c00/skills/core-web-vitals) | MIT | |
| performance | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills/tree/afa8da942115f2961fdbfa80807ea0b232ff6c00/skills/performance) | MIT | |
| seo | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills/tree/afa8da942115f2961fdbfa80807ea0b232ff6c00/skills/seo) | MIT | |
| security-threat-model | [openai/skills](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-threat-model) | Apache-2.0 | |
| postgres-best-practices | [supabase/agent-skills](https://github.com/supabase/agent-skills/tree/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices) | MIT | Upstream path is `skills/supabase-postgres-best-practices` |
| api-design-principles | [wshobson/agents](https://github.com/wshobson/agents/tree/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/backend-development/skills/api-design-principles) | MIT | |
| security-audit | [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill/tree/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit) | MIT | |

Copyright holders: Addy Osmani; Cloudflare, Inc.; OpenAI contributors; Seth Hobson; Supabase; Vercel and contributors to `vercel-labs/agent-skills`.
