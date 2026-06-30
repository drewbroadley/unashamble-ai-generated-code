#!/usr/bin/env node
// Time-aware supply-chain audit for this repo.
//
// Runs `pnpm audit` (JS) and `uvx pip-audit` (Python) when those ecosystems are
// present, then applies the 2-week exception strategy from ai-does-good-shit.md §2:
//
//   • Vulnerability published within the last 14 days  -> GRACE  (warn, build PASSES)
//   • Vulnerability published more than 14 days ago     -> FAIL   (build FAILS)
//   • Listed in .audit-exceptions.json (and not expired) -> WAIVED (build PASSES)
//   • Publish date can't be determined                  -> FAIL   (fail closed)
//
// No npm dependencies — plain Node 18+ (uses global fetch for OSV date lookups).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRACE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

const log = (...a) => console.log(...a);
const warn = (...a) => console.log('⚠️ ', ...a);

// ---- manual, deliberate waivers ------------------------------------------------
function loadExceptions() {
  const path = join(ROOT, '.audit-exceptions.json');
  if (!existsSync(path)) return [];
  try {
    const { exceptions = [] } = JSON.parse(readFileSync(path, 'utf8'));
    return exceptions;
  } catch (e) {
    warn(`Could not parse .audit-exceptions.json: ${e.message}`);
    return [];
  }
}
const EXCEPTIONS = loadExceptions();

function findWaiver(ids) {
  return EXCEPTIONS.find((ex) => {
    const matches = ids.includes(ex.id);
    if (!matches) return false;
    if (ex.expires && Date.parse(ex.expires) < now) {
      warn(`Waiver for ${ex.id} EXPIRED on ${ex.expires} — no longer honoured.`);
      return false;
    }
    return true;
  });
}

// ---- best-effort publish-date lookup via OSV.dev -------------------------------
const dateCache = new Map();
async function publishDate(ids, fallbackISO) {
  if (fallbackISO && !Number.isNaN(Date.parse(fallbackISO))) return Date.parse(fallbackISO);
  for (const id of ids) {
    if (!id) continue;
    if (dateCache.has(id)) return dateCache.get(id);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, {
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const body = await res.json();
      const ms = Date.parse(body.published || body.modified);
      if (!Number.isNaN(ms)) {
        dateCache.set(id, ms);
        return ms;
      }
    } catch {
      /* OSV unreachable for this id — try the next alias */
    }
  }
  return null;
}

// ---- run an audit tool, tolerate "vulns found" non-zero exit -------------------
function runJSON(cmd, args) {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    // audit tools exit non-zero when they find vulns; stdout still holds the JSON.
    if (e.stdout) return e.stdout.toString();
    throw e;
  }
}

// ---- collect findings from each ecosystem --------------------------------------
async function auditPnpm() {
  if (!existsSync(join(ROOT, 'package.json')) && !existsSync(join(ROOT, 'pnpm-lock.yaml'))) {
    log('• pnpm: no package.json / pnpm-lock.yaml — skipping.');
    return [];
  }
  log('• pnpm audit …');
  let parsed;
  try {
    parsed = JSON.parse(runJSON('pnpm', ['audit', '--json']));
  } catch (e) {
    warn(`pnpm audit could not run (${e.message}). Treating as a failure.`);
    return [{ ecosystem: 'pnpm', ids: ['pnpm-audit-error'], pkg: '(tool)', severity: 'unknown', title: 'pnpm audit failed to run', date: null }];
  }
  const advisories = parsed.advisories || {};
  return Object.values(advisories).map((a) => ({
    ecosystem: 'pnpm',
    ids: [a.github_advisory_id, ...(a.cves || []), String(a.id)].filter(Boolean),
    pkg: a.module_name,
    severity: a.severity,
    title: a.title,
    date: a.created || null,
  }));
}

async function auditPython() {
  const hasPy = existsSync(join(ROOT, 'pyproject.toml')) || existsSync(join(ROOT, 'uv.lock')) || existsSync(join(ROOT, 'requirements.txt'));
  if (!hasPy) {
    log('• uv/pip-audit: no pyproject.toml / uv.lock — skipping.');
    return [];
  }
  log('• uvx pip-audit …');
  let parsed;
  try {
    parsed = JSON.parse(runJSON('uvx', ['pip-audit', '--format', 'json']));
  } catch (e) {
    warn(`pip-audit could not run (${e.message}). Treating as a failure.`);
    return [{ ecosystem: 'pip', ids: ['pip-audit-error'], pkg: '(tool)', severity: 'unknown', title: 'pip-audit failed to run', date: null }];
  }
  const deps = parsed.dependencies || parsed || [];
  const out = [];
  for (const d of deps) {
    for (const v of d.vulns || []) {
      out.push({
        ecosystem: 'pip',
        ids: [v.id, ...(v.aliases || [])].filter(Boolean),
        pkg: d.name,
        severity: 'unknown',
        title: v.description ? v.description.slice(0, 80) : v.id,
        date: null, // pip-audit omits dates; OSV lookup fills it in
      });
    }
  }
  return out;
}

// ---- classify & report ---------------------------------------------------------
async function main() {
  log(`\n🔒 Security audit — 2-week grace window (${GRACE_DAYS} days)\n`);

  const findings = [...(await auditPnpm()), ...(await auditPython())];

  if (findings.length === 0) {
    log('\n✅ No known vulnerabilities. Clean.\n');
    return 0;
  }

  let failures = 0;
  const rows = [];
  for (const f of findings) {
    const waiver = findWaiver(f.ids);
    const ms = await publishDate(f.ids, f.date);
    let status;
    let note = '';

    if (waiver) {
      status = 'WAIVED';
      note = `${waiver.reason} (by ${waiver.approvedBy || '?'}${waiver.expires ? `, expires ${waiver.expires}` : ''})`;
    } else if (ms === null) {
      status = 'FAIL';
      note = 'publish date unknown — fail closed; fix or add a waiver';
      failures++;
    } else {
      const ageDays = Math.floor((now - ms) / DAY_MS);
      if (ageDays <= GRACE_DAYS) {
        status = 'GRACE';
        note = `disclosed ${ageDays}d ago — within ${GRACE_DAYS}d grace window`;
      } else {
        status = 'FAIL';
        note = `disclosed ${ageDays}d ago — older than ${GRACE_DAYS}d, must be fixed/waived`;
        failures++;
      }
    }
    rows.push({ status, f, note });
  }

  const icon = { WAIVED: '🟡', GRACE: '⚠️ ', FAIL: '❌' };
  for (const { status, f, note } of rows) {
    log(`${icon[status]} [${status}] ${f.ecosystem}:${f.pkg} ${f.ids[0]} — ${f.title}`);
    log(`        ${note}`);
  }

  log(`\nSummary: ${rows.filter((r) => r.status === 'FAIL').length} failing, ` +
      `${rows.filter((r) => r.status === 'GRACE').length} in grace, ` +
      `${rows.filter((r) => r.status === 'WAIVED').length} waived.`);

  if (failures > 0) {
    log('\n❌ Audit failed. Fix the vulnerable packages, or add a reviewed waiver to .audit-exceptions.json.\n');
    return 1;
  }
  log('\n✅ Audit passed (issues are within the grace window or explicitly waived).\n');
  return 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error('Audit crashed:', e);
  process.exit(1);
});
