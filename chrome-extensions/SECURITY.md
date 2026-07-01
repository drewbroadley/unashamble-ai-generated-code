# Browser Extension Security Guidelines

Security rules that **every** extension in this folder must follow, derived from
the [OWASP Browser Extension Vulnerabilities Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html).

These are enforced automatically by [`tests/owasp-audit.mjs`](tests/owasp-audit.mjs)
— run `npm test` (or `node tests/owasp-audit.mjs`) from this folder. CI / a
pre-commit check should keep it green.

## Manifest & permissions (least privilege)

- **Request only the permissions you use.** Today that means `["storage"]` and
  nothing else. No `tabs`, `scripting`, `webRequest`, `cookies`, `<all_urls>`,
  or broad `host_permissions`.
- **Scope content scripts to the exact sites** you support, and **HTTPS only**.
  Use `https://host/*`, never `*://host/*` or `http://`.
- **Set `"all_frames": false`** explicitly on every content script. We only ever
  touch the top frame; never run privileged logic inside arbitrary iframes
  (guards against the "document_start + iframe manipulation" anti-pattern).
- **Ship a strict Content Security Policy** for extension pages:
  `"script-src 'self'; object-src 'self'; base-uri 'none'"`. No `unsafe-eval`,
  no `unsafe-inline`, no remote origins.
- **Do not set `externally_connectable`** unless genuinely required; it lets web
  pages message the extension.

## Content scripts & DOM handling (no injection)

- **Never use `innerHTML`, `outerHTML`, or `insertAdjacentHTML`.** Build DOM with
  `textContent`, `classList`, `setAttribute`, and `createElement`. Our filters
  only *read* the page and toggle a CSS class — they never write markup.
- **Never use `eval()`, `new Function()`, or `document.write()`.**
- **Never render untrusted page data back into the DOM.** Treat everything read
  from the page as data, not code.
- **Don't put UI in the page.** User-facing controls live in the extension popup
  (an extension-controlled surface), not injected into the host page.
- **Style via a declared `content.css`**, not by building `<style>`/`<script>`
  from strings.

## Message passing

- **Validate the sender.** Every `chrome.runtime.onMessage` listener must check
  `sender.id === chrome.runtime.id` before acting, and ignore anything else.
- **Allowlist actions.** Dispatch on an explicit `msg.type`; ignore unknown
  messages. Never let message contents drive privileged/dynamic behaviour.
- **Treat content scripts as lower-trust** than the popup/background.

## Storage of sensitive data

- **Use `chrome.storage`**, not `localStorage`, for extension state.
  `sessionStorage` is acceptable *only* for non-sensitive, per-tab flags (e.g.
  the Facebook "already redirected" guard).
- **Store nothing sensitive.** These extensions store only boolean UI
  preferences. No tokens, credentials, or personal data.
- **No hardcoded secrets** — no API keys, tokens, or passwords in code.

## Third-party code & dependencies

- **Zero runtime dependencies.** Everything is vanilla JS shipped in the
  extension. This removes supply-chain risk entirely.
- **No remote code.** Never `fetch()`/`import()` and execute scripts from a
  remote server; never add `<script src="https://…third-party…">`. All code is
  bundled and reviewed.
- If a dependency is ever added, run `npm audit` and pin/lock it.

## Network

- **No network calls at all** in these extensions. If one is ever added it must
  be **HTTPS only**, validate the response before use, and send the minimum data
  necessary. Never HTTP.

## Anti-patterns (never do)

- Requesting excessive permissions "just in case".
- Injecting remote scripts via dynamic URLs.
- Storing secrets in code.
- `innerHTML` with page/user input.
- Sending unencrypted sensitive data anywhere.
- Failing to validate message senders.
- Running content scripts in all frames without reason.
