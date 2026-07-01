#!/usr/bin/env node
/*
 * OWASP browser-extension security audit.
 *
 * Statically checks every extension in this repo against the rules in
 * ../SECURITY.md (derived from the OWASP Browser Extension Vulnerabilities
 * Cheat Sheet). No dependencies — run with:  node tests/owasp-audit.mjs
 * Exits non-zero if any check fails.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const ALLOWED_PERMISSIONS = new Set(["storage"]);
const REQUIRED_CSP = ["script-src 'self'", "object-src 'self'"];
const FORBIDDEN_CSP = ["unsafe-eval", "unsafe-inline", "http:"];

// Dangerous code patterns (DOM injection / dynamic code / insecure transport).
const CODE_FORBIDDEN = [
  [/\binnerHTML\b/, "innerHTML"],
  [/\bouterHTML\b/, "outerHTML"],
  [/insertAdjacentHTML/, "insertAdjacentHTML"],
  [/document\.write\s*\(/, "document.write()"],
  [/\beval\s*\(/, "eval()"],
  [/new\s+Function\s*\(/, "new Function()"],
  [/\blocalStorage\b/, "localStorage (use chrome.storage)"],
  [/https?:\/\/[^\s"'`]*\.(?:js)\b/, "remote script URL"],
  [/http:\/\//, "insecure http:// URL"],
];
// Very rough hardcoded-secret detector.
const SECRET_RE =
  /(api[_-]?key|secret|password|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{8,}["']/i;

let failures = 0;
const results = [];
function check(ext, name, ok, detail = "") {
  results.push({ ext, name, ok, detail });
  if (!ok) failures++;
}

function listExtensions() {
  return readdirSync(ROOT)
    .map((d) => join(ROOT, d))
    .filter((p) => statSync(p).isDirectory() && existsSync(join(p, "manifest.json")));
}

function jsAndHtmlFiles(dir) {
  return readdirSync(dir).filter((f) => /\.(js|mjs|html)$/.test(f));
}

for (const dir of listExtensions()) {
  const ext = basename(dir);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  } catch (e) {
    check(ext, "manifest.json parses", false, String(e.message));
    continue;
  }

  // 1. MV3
  check(ext, "manifest_version is 3", manifest.manifest_version === 3);

  // 2. Least-privilege permissions
  const perms = manifest.permissions || [];
  const extra = perms.filter((p) => !ALLOWED_PERMISSIONS.has(p));
  check(ext, "permissions are least-privilege", extra.length === 0, extra.join(", "));
  check(
    ext,
    "no broad host_permissions",
    !manifest.host_permissions || manifest.host_permissions.length === 0,
    JSON.stringify(manifest.host_permissions || [])
  );
  check(ext, "no externally_connectable", !manifest.externally_connectable);

  // 3. Content scripts: HTTPS-only matches + explicit all_frames:false
  const scripts = manifest.content_scripts || [];
  check(ext, "declares content_scripts", scripts.length > 0);
  for (const cs of scripts) {
    const matches = cs.matches || [];
    const insecure = matches.filter((m) => !m.startsWith("https://"));
    check(ext, "content_script matches are HTTPS-only", insecure.length === 0, insecure.join(", "));
    check(ext, "content_script all_frames is explicitly false", cs.all_frames === false);
  }

  // 4. Strict CSP
  const csp =
    (manifest.content_security_policy && manifest.content_security_policy.extension_pages) || "";
  check(
    ext,
    "defines strict extension_pages CSP",
    REQUIRED_CSP.every((d) => csp.includes(d)),
    csp || "(missing)"
  );
  const badCsp = FORBIDDEN_CSP.filter((d) => csp.includes(d));
  check(ext, "CSP has no unsafe directives", badCsp.length === 0, badCsp.join(", "));

  // 5. Static code checks
  let senderValidated = true;
  for (const file of jsAndHtmlFiles(dir)) {
    const src = readFileSync(join(dir, file), "utf8");

    for (const [re, label] of CODE_FORBIDDEN) {
      check(ext, `no ${label} in ${file}`, !re.test(src));
    }
    check(ext, `no hardcoded secrets in ${file}`, !SECRET_RE.test(src));

    // 5a. Inline <script> in HTML is forbidden; scripts must load local src.
    if (file.endsWith(".html")) {
      const scriptTags = [...src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
      for (const [, attrs, body] of scriptTags) {
        const hasSrc = /\bsrc\s*=\s*["'][^"']+["']/i.test(attrs);
        const remoteSrc = /\bsrc\s*=\s*["']https?:\/\//i.test(attrs);
        check(ext, `no inline <script> in ${file}`, hasSrc && body.trim() === "");
        check(ext, `no remote <script src> in ${file}`, !remoteSrc);
      }
    }

    // 5b. Any onMessage listener must validate the sender.
    if (/onMessage\.addListener/.test(src) && !/sender\.id/.test(src)) {
      senderValidated = false;
    }
  }
  check(ext, "onMessage listeners validate sender.id", senderValidated);
}

// ---- Report ---------------------------------------------------------------
const byExt = {};
for (const r of results) (byExt[r.ext] ||= []).push(r);
for (const ext of Object.keys(byExt).sort()) {
  console.log(`\n${ext}`);
  for (const r of byExt[ext]) {
    const mark = r.ok ? "  ✓" : "  ✗";
    console.log(`${mark} ${r.name}${!r.ok && r.detail ? `  — ${r.detail}` : ""}`);
  }
}

const total = results.length;
console.log(
  `\n${total - failures}/${total} checks passed across ${listExtensions().length} extensions.`
);
if (failures) {
  console.error(`\n✗ ${failures} security check(s) FAILED.`);
  process.exit(1);
}
console.log("\n✓ All OWASP security checks passed.");
