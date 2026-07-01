# Reddit: Hide Promoted & Keep Rising

A Chrome extension that removes **Promoted / Sponsored** ads from the Reddit home
feed and **keeps the feed sorted by Rising** instead of the default "Best".

## How it works

Reddit's current UI ("shreddit") is built from clean semantic web components, so
no de-obfuscation is needed:

- **Hide ads** — every feed ad is a `<shreddit-ad-post>` element (a direct child
  of `<shreddit-feed>`, carrying a `promoted` attribute), separated from real
  posts by `<hr>` rules. Organic posts are `<article>` wrappers around
  `<shreddit-post>`. The extension hides each `<shreddit-ad-post>` plus its
  trailing `<hr>` so no double divider is left behind.
- **Keep Rising** — the home feed defaults to "Best"; the Rising sort lives at
  the stable URL `/rising/`. Whenever you land on or navigate back to the default
  home feed (`/`, `?feed=home`, or `/best/`) the extension redirects to
  `/rising/`. No loop risk: `/rising/` isn't a redirect target, and explicit
  sorts you pick (`/hot/`, `/new/`, `/top/`, …) are left alone.

A `MutationObserver` re-applies the ad filter as you scroll and as the feed
lazy-loads more posts.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this folder
   (`reddit-remove-promoted-keep-rising`).
4. Open [Reddit](https://www.reddit.com/). The home feed opens on Rising with ads
   stripped.

## Options (toolbar popup)

- **Enable** — master on/off.
- **Hide Promoted / Sponsored** — remove ad posts.
- **Keep feed sorted by Rising** — redirect default home (Best) → Rising.
- **Dim instead of remove** — fade & collapse hidden posts (hover to peek).
- A live counter of how many promoted posts were hidden on the page.

## Security

Follows the shared [security guidelines](../SECURITY.md) (OWASP Browser
Extension Vulnerabilities Cheat Sheet): `storage`-only permission, HTTPS-only
top-frame content script, strict CSP, no `innerHTML`/`eval`, no remote code, no
network calls, and `sender.id`-validated messaging. Enforced by
`npm test` (`../tests/owasp-audit.mjs`).

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest, content script + popup |
| `content.js` | Ad hiding, Rising-sort redirect, `MutationObserver` |
| `content.css` | `display:none` (and optional dim) styling, gated on `html.rrf-active` |
| `popup.html` / `popup.css` / `popup.js` | Toolbar settings + hidden counter |

## Notes

- If Reddit renames the ad element, adjust the selector in
  [`content.js`](content.js) (`shreddit-ad-post`).
- Only the new `www.reddit.com` design is supported (not `old.reddit.com`).
