# Trade Me: Hide Promoted & Sponsored

A Chrome extension that removes **Sponsored / Promoted listings** and
**Advertisements** from Trade Me search results and category browsing, leaving
only the organic listings. Works in both **List** and **Gallery** views.

## How it works

Unlike Facebook, Trade Me is an Angular app built from clean, semantic custom
elements, so no de-obfuscation is needed — the signals are stable tag names:

| Target | Selector | Action |
|--------|----------|--------|
| Sponsored / Promoted listing | `tm-sponsored-listings-tag` (the "Sponsored" label) | hide its `tg-col` grid cell |
| Promoted "super feature" card | `.tm-marketplace-search-card--super-feature` | hide its `tg-col` grid cell |
| Display ad ("Advertisement") | `tm-display-ad-wrapper`, `tm-fuse-display-ad`, `tm-adsense` | hide its `tg-col` (or the ad) |
| Top banner ad | `tm-shell-leaderboard-ad` | hide the banner |

Each listing lives in a `tg-col` grid cell, so hiding the whole cell lets the
results grid reflow cleanly with no gaps. A `MutationObserver` re-applies the
filter as you paginate, change filters, or switch List/Gallery view.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this folder
   (`trademe-remove-promoted-listings`).
4. Open any [Trade Me](https://www.trademe.co.nz/) search or browse page.

## Options (toolbar popup)

- **Declutter listings** — master on/off.
- **Hide Sponsored / Promoted** — sponsored & promoted listings.
- **Hide Advertisements** — display ads + the top banner ad.
- **Dim instead of remove** — fade & collapse hidden items (hover to peek).
- A live counter of how many items were hidden on the current page.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest, content script + popup |
| `content.js` | Selector-based hiding + `MutationObserver` |
| `content.css` | `display:none` (and optional dim) styling, gated on `html.tmf-active` |
| `popup.html` / `popup.css` / `popup.js` | Toolbar settings + hidden counter |

## Notes

- Trade Me's component tag names are stable, but if they ever rename them the
  selectors in [`content.js`](content.js) are where to adjust.
- This hides promoted/sponsored *listings* — i.e. paid placement. Organic
  listings (including ones that merely have a "Save 20%" discount badge) are
  kept.
