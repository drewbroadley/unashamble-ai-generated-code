# LinkedIn Feed: Only 1st Connections & Follows

A Chrome extension that strips your LinkedIn home feed down to **only** the
content you actually asked for: posts from your **1st-degree connections** and
**accounts you already follow**. Everything else — promoted ads, "Suggested"
posts, 2nd/3rd-degree people, and posts surfaced only because someone reposted,
liked, or commented on them — is hidden.

## How it works

LinkedIn's current feed uses **rotating, obfuscated CSS class names** (e.g.
`e4c6b5f3`, `_5bba7`) and no stable `data-urn`, so normal selectors break
constantly. This extension instead keys off two durable signals:

1. **Post boundary** — every feed item is wrapped in an element with
   `data-lazy-mount-id`, and real posts begin their text with `"Feed post"`.
2. **Connection degree** — the actor header shows `• 1st` / `• 2nd` / `• 3rd+`.
   1st-degree posts are *always* kept.
3. **Relationship buttons** — for non-1st actors, the decision is read from the
   actual action buttons LinkedIn renders (matched on `aria-label`, e.g.
   `"Follow Marcel van Oost"` or `"Invite Jonathan Jansen to connect"`), which is
   far more robust than scraping inline text:
   - `Following` / `Unfollow` → you already follow → **kept**
   - `Follow …` → not followed → **hidden**
   - `Invite … to connect` → not connected → **hidden**
   - no relationship button at all → your own post / a followed page → **kept**

On top of that, the following are always removed:

- **Ads** — `Promoted by …`, `Sponsored`, or a `Promoted` label on a degree-less
  company post. (A real connection's post that merely *contains* the word
  "Promoted" is **not** hidden — that exact false positive was found and fixed.)
- **`Suggested` posts** — matched both at the start of the card and as a
  standalone "Suggested" label element.
- **`… follows this Page`** — a Page surfaced only because a connection follows
  it (you don't follow it yourself).
- **Recommendation modules** — `Jobs recommended for you`, `Recommended for
  you`, `People you may know`, `Add to your feed`, etc., even when LinkedIn wraps
  them inside a `"Feed post"` shell.

It can also **auto-switch the feed sort from "Top" to "Recent"** — only when the
feed is currently on "Top", so a manual choice is never overridden.

This makes it resilient to LinkedIn shuffling their class names, because it reads
rendered text, the degree badge, and real buttons rather than fragile selectors.

> Note: `textContent` concatenates inline elements with no whitespace
> (`postSuggestedVennie`, `FollowAI`), so matching uses substrings anchored to
> the header region rather than `\b` word boundaries.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this folder
   (`linkedin-remove-anything-i-dont-follow`).
4. Open [your LinkedIn feed](https://www.linkedin.com/feed/). It filters
   automatically, including as you scroll.

## Options (toolbar popup)

- **Filter feed** — master on/off switch.
- **Hide reposts & reactions** — stricter mode; also drops posts surfaced
  because someone reposted/liked/commented, even from your connections, leaving
  only their own original posts. *(Off by default.)*
- **Dim instead of remove** — fade & collapse hidden posts (hover to peek)
  instead of removing them, so you can spot-check what's being filtered.
- A live counter of how many posts have been hidden on the current page.

Settings sync via `chrome.storage.sync` and apply instantly.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest, content script + popup registration |
| `content.js` | Feed scanner, classifier, and `MutationObserver` for infinite scroll |
| `content.css` | The `display:none` (and optional dim) styling, gated on `html.lirf-active` |
| `popup.html` / `popup.css` / `popup.js` | Toolbar settings UI + hidden counter |

## Tuning

The whole policy lives in `classify()` in [`content.js`](content.js). If LinkedIn
changes its wording, adjust the regexes there — particularly the Promoted /
Suggested labels and the `Follow` / `Connect` affordance checks.
