# ai-does-good-shit.md

The standing operating manual for any AI coding agent working in this repo
(Claude, Copilot, OpenAI Codex, Gemini, Cursor, Windsurf, Aider — all of them).

This repo is **unashamedly AI-generated**. That is a feature, not an excuse. The
deal is simple: the AI writes the code, *and* the AI quietly does the boring,
responsible things that make AI-generated code something a stranger can actually
trust and install. This file is what "responsible" means here.

Every tool-specific instruction file in this repo (`CLAUDE.md`,
`.github/copilot-instructions.md`, `AGENTS.md`, `GEMINI.md`, the `.cursor` rules,
`.windsurfrules`, `.aider.conf.yml`) is a thin pointer back to **this** file.
This is the source of truth. If a tool config and this file disagree, this file
wins.

---

## 0. Operating mode: do the work, don't narrate it

This is the headline rule and it governs everything below.

- **Just do these things.** Treat everything in this document as your default
  behaviour, on every task, without being asked. Writing the security docs,
  running the audits, keeping permissions tight — that's baseline hygiene, not a
  feature you propose.
- **Don't talk about it unless asked.** Do **not** announce that you followed
  this playbook, list the hygiene steps you took, add a "Security & Safety" essay
  to your chat reply, or pad your summary with "I also made sure to…". Make the
  change, update the docs, and move on. The user asked for a feature; give them
  the feature.
- **Surface only what the user needs to decide.** The exception is anything that
  genuinely needs a human: a real vulnerability with no clean fix, a permission
  you'd need widened, a security trade-off baked into the design. Those you raise
  plainly and briefly.
- **When asked, be fully transparent.** If the user asks "what did you do for
  security?", "did you run the audit?", "why is this permission denied?" — answer
  completely and honestly. Quiet-by-default is not secrecy; it's signal hygiene.

Short version: **do good shit silently; explain it on request.**

---

## 1. Document how things work — honestly, for the person deciding to install it

Every piece of software in this repo ships with documentation clear enough that a
reasonably careful stranger can decide for themselves whether it's safe to install
and run. When you add or change anything users install or execute (a Chrome
extension, a script, a CLI, a server), the README for that thing must let a reader
answer, without reading the source:

- **What it does** — the actual behaviour, in plain language.
- **What it can touch** — every permission/capability it requests and *why each one
  is needed*. For Chrome extensions: walk through every entry in `manifest.json`
  (`permissions`, `host_permissions`, `content_scripts` match patterns,
  `run_at`). Justify each. If a permission isn't used, remove it.
- **What data it reads, stores, or sends** — be explicit. Name the storage used
  (e.g. `chrome.storage`), what's kept in it, and whether anything leaves the
  machine. If it makes **zero** network requests and sends **zero** data anywhere,
  say that loudly — that's the most reassuring sentence in the doc.
- **What it does NOT do** — call out the scary things it deliberately avoids
  (no analytics, no remote code, no reading page content beyond X, no auth tokens).
- **Honest security caveats** — the real edge cases and limitations. The existing
  extension READMEs already model this (Facebook's ad obfuscation is a moving
  target, right-rail boxes untouched, etc.). Match that honesty. Never oversell
  safety; document the gaps.

Rule of thumb: **least privilege, and prove it in the docs.** The smallest
permission set that makes the feature work, with a written justification for each
one that survives.

---

## 2. Keep dependencies clean — pnpm, uv, and audits, automatically

Whenever this repo grows real dependencies, supply-chain hygiene is non-negotiable
and runs on autopilot.

### Package managers (use these, not others)

- **JavaScript / TypeScript → `pnpm`.** Never `npm install` or `yarn`. Commit the
  `pnpm-lock.yaml`. New tooling lands as `pnpm add -D …`.
- **Python → `uv`.** Never bare `pip`/`poetry`. Use `uv add`, `uv sync`, and commit
  `uv.lock`.

### Audit on every change

- JS: `pnpm audit`
- Python: `uvx pip-audit` (run pip-audit through uv)

These run **locally before you finish a task** that touched dependencies, and they
run **in CI on every push/PR to the master/main branch** via
[`.github/workflows/security-audit.yml`](.github/workflows/security-audit.yml),
which calls [`scripts/security-audit.mjs`](scripts/security-audit.mjs).

### The 2-week exception strategy (this is the important bit)

A failing audit should not be able to wedge `master` the instant some transitive
dependency gets a CVE that has no patch yet. So the gate is **time-aware**:

1. **Freshly-disclosed vulns get a grace window.** If an advisory was *published
   within the last 14 days*, it is treated as a **temporary exception**: CI logs a
   loud ⚠️ warning and records it, but the build **passes**. This is the breathing
   room to wait for an upstream fix or schedule the upgrade.
2. **Older vulns are hard failures.** A vulnerability published *more than 14 days
   ago* fails the build. Two weeks is enough time; fix it, upgrade it, or waive it
   deliberately.
3. **Deliberate, documented waivers.** Anything you want to allow beyond the
   automatic grace window goes in
   [`.audit-exceptions.json`](.audit-exceptions.json) with an advisory ID, a
   reason, who approved it, and an `expires` date. Expired waivers fail the build.
   Waivers are reviewed, not forgotten.

When you touch dependencies: run the audits, fix what's cleanly fixable, and only
reach for an exception when a fix genuinely isn't available yet — then say so to
the user (per §0, this is a "needs a human" item).

---

## 3. Stay inside the fence — permissions & unsafe commands

Each AI tool in this repo runs under a project-level permission/sandbox config
(see the table in §4). Those configs exist to stop an agent auto-running something
destructive or exfiltrating data. Respect them in spirit, not just by the letter:

**Never auto-run, ever — stop and ask a human first:**

- Destructive filesystem ops: `rm -rf`, recursive deletes, `mkfs`, disk/format
  commands, `git clean -fdx`, mass overwrites outside the working change.
- History/remote rewrites: `git push`, `git push --force`, `git reset --hard` on
  shared branches, tag/branch deletion, force-pushing `master`/`main`.
- Privilege escalation: `sudo`, `su`, changing system config, editing things
  outside the repo.
- **Pipe-to-shell / remote code execution:** `curl … | sh`, `wget … | bash`,
  `iex(...)`, running downloaded scripts. This is the classic supply-chain footgun.
- Credential & secret access: reading or printing `.env`, `.env.*`, `~/.ssh`,
  `~/.aws`, keychains, tokens; committing secrets; echoing env vars that look like
  keys.
- Outbound network calls that send repo contents or data anywhere, and installing
  global/system packages.

**Safe to do without ceremony:** read files, search, run the local test/lint/build,
`pnpm audit` / `uvx pip-audit`, `git status` / `git diff` / `git log`, and edits
within the working change.

**The principle:** default-deny anything destructive, irreversible, or
network-egressing; ask before crossing the fence; keep the granted permission set
as small as the task needs. If you need a wider permission to do the job, ask for
it explicitly and narrowly — don't quietly work around the sandbox.

---

## 4. Where this is wired in

| Tool | Instructions file (points here) | Permissions / sandbox config |
|------|-------------------------------|------------------------------|
| Claude Code | `CLAUDE.md` | `.claude/settings.json` (allow/ask/deny) |
| GitHub Copilot | `.github/copilot-instructions.md` | `.vscode/settings.json` (chat tool autoapprove off) |
| OpenAI Codex | `AGENTS.md` | `.codex/config.toml` (approval + sandbox) |
| Google Gemini CLI | `GEMINI.md` | `.gemini/settings.json` |
| Cursor | `.cursor/rules/ai-does-good-shit.mdc` | `.cursor/rules/` + editor settings |
| Windsurf | `.windsurfrules` | editor settings |
| Aider | `.aider.conf.yml` | `.aider.conf.yml` (auto-commit/yes off) |
| CI gate | — | `.github/workflows/security-audit.yml` + `scripts/security-audit.mjs` |

All roads lead back to this file. Keep it that way.
