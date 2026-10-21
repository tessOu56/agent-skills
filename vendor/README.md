# Vendored skills

Each directory under `vendor/<source>/<skill>/` is a verbatim copy of an upstream skill at the commit recorded in [`skills.lock.json`](../skills.lock.json).

When a skill is covered by a repository-root license file, that file is copied next to the skill so the vendored tree can be redistributed on its own. Skill-local license files are kept as they appear upstream.

Skills without a clear, redistribution-friendly license are **not** copied here. They are recorded in the lock file as `link-only`.
