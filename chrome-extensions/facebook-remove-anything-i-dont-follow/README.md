# Facebook Feed: Only Friends & Follows

A Chrome extension that strips your Facebook home feed down to just the content
you actually want: posts from **friends**, **Pages/people you follow**, and
**groups you're in**. It removes **Sponsored ads**, **Suggested for you**,
**People you may know**, **Reels**, and posts from accounts you don't follow.

It's the Facebook sibling of the LinkedIn feed filter in this repo.

## Why Facebook is harder than LinkedIn

Facebook actively fights feed scraping / ad blocking, so naive text matching
fails. This extension works around three specific tricks:

1. **No stable anchors.** Class names are randomized and there's no
   `role="feed"` or `data-pagelet`. The feed list is found heuristically (the
   element whose children are the post cards, each containing an "Actions for
   this post" menu), and its direct children are treated as posts.

2. **Decoy text + scrambled "Sponsored".** Facebook injects hidden spans
   repeating `"Facebook"` to poison `textContent`, and renders the
   "Sponsored"/"Ad" label as a span full of single-character child spans — the
   real letters plus ~50 decoy characters, CSS-reordered and pushed outside the
   label's clip box. It even seeds decoy "Sponsored" letters into **non-ads** as
   a honeypot. So we never trust raw text. Instead we **reconstruct the visible
   label** by keeping only the characters whose box lies inside the container's
   box, read left-to-right — which yields the true label (`"Ad"` / `"Sponsored"`
   for ads, a timestamp like `"52m"` for everything else).

3. **Clean accessibility labels.** Mercifully, Facebook keeps aria-labels clean
   for screen readers, so we use those for the reliable signals:
   - ad call-to-action buttons → `aria-label="Order now"` / `"Shop now"` …
   - module headers → `aria-label="People you may know"` / `"Reels"` …
   - not-yet-followed actors → a `"Follow"` / `"Add friend"` / `"Join"` button

## What gets hidden

| Signal | How it's detected |
|--------|-------------------|
| **Sponsored / Ads** | reconstructed visible `"Ad"`/`"Sponsored"` label, or an ad CTA aria-label |
| **People you may know / Suggested / Reels / Pages for you** | module header `aria-label` |
| **Accounts you don't follow** | a `Follow` / `Add friend` / `Join` button in the post header |

Everything else — friends, Pages/people you already follow, groups you're in,
and your own posts — is kept.

It also **forces the home feed to "Most recent" (chronological)** instead of the
algorithmic "Top"/recommended feed, by redirecting `facebook.com/` to
`facebook.com/?sk=h_chr`. This runs once per tab session (so it can never get
stuck in a reload loop if Facebook strips the parameter) and can be turned off
in the popup.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this folder
   (`facebook-remove-anything-i-dont-follow`).
4. Open [Facebook](https://www.facebook.com/). It filters automatically,
   including as you scroll (the feed is virtualized, so cards are classified as
   they render).

## Options (toolbar popup)

- **Filter feed** — master on/off.
- **Hide Sponsored / Ads**
- **Hide Suggested & Reels**
- **Hide accounts I don't follow**
- **Dim instead of remove** — fade & collapse hidden posts (hover to peek).
- A live counter of how many posts were hidden on the current page.

## Caveats

- Facebook's ad obfuscation is a moving target. The visible-label reconstruction
  is robust today, but if Facebook changes the technique the `renderedLabel()` /
  `hasSponsoredLabel()` functions in [`content.js`](content.js) are where to
  adjust. For bullet-proof ad blocking specifically, a dedicated blocker like
  uBlock Origin with maintained filter lists is still the gold standard.
- Right-rail "Sponsored" boxes are outside the main feed and are left untouched.
- A friend who is also a 3rd-party suggested follow is an edge case; relationship
  is read from the header buttons, so toggle "Hide accounts I don't follow" off
  if you find it too aggressive.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest, content script + popup |
| `content.js` | Feed discovery, classifier, visible-label de-obfuscation, observer |
| `content.css` | `display:none` (and optional dim) styling, gated on `html.fbf-active` |
| `popup.html` / `popup.css` / `popup.js` | Toolbar settings + hidden counter |
