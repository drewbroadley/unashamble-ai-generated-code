/*
 * Trade Me: Hide Promoted & Sponsored
 * --------------------------------------------------------------------------
 * Strips Sponsored / Promoted listings and Advertisements out of Trade Me
 * search results and category browsing, leaving the organic listings.
 *
 * Trade Me is an Angular app built from clean, semantic custom elements, so
 * unlike Facebook there's no obfuscation to fight. The signals are stable tags:
 *
 *   - tm-sponsored-listings-tag   the "Sponsored" label that sits in the grid
 *                                 cell (tg-col) of a sponsored/promoted listing
 *   - .tm-marketplace-search-card--super-feature   the promoted listing card
 *   - tm-display-ad-wrapper / tm-fuse-display-ad / tm-adsense   in-page display
 *                                 ("Advertisement") ads
 *   - tm-shell-leaderboard-ad     the top banner ad
 *
 * Each search result lives in a `tg-col` grid cell, so for listings we hide the
 * whole `tg-col` (the grid reflows cleanly); for chrome ads we hide the ad
 * element itself.
 */
(() => {
  "use strict";

  const HIDDEN_CLASS = "tmf-hidden";

  const DEFAULTS = {
    enabled: true,
    hideSponsored: true, // Sponsored / Promoted listings
    hideAds: true, // display ("Advertisement") + leaderboard ads
    dim: false,
  };

  let settings = { ...DEFAULTS };
  let pageHiddenCount = 0;

  // Hide an element (idempotent, counted). Prefer the enclosing grid cell so the
  // results grid reflows without leaving a gap.
  function hide(el) {
    if (!el || el.classList.contains(HIDDEN_CLASS)) return;
    el.classList.add(HIDDEN_CLASS);
    pageHiddenCount++;
  }

  function gridCell(el) {
    return el.closest("tg-col") || el;
  }

  function sweep() {
    if (!settings.enabled) return;

    if (settings.hideSponsored) {
      // The "Sponsored" label marks a sponsored/promoted listing's grid cell.
      document
        .querySelectorAll("tm-sponsored-listings-tag")
        .forEach((tag) => hide(gridCell(tag)));
      // Belt-and-braces: the promoted "super feature" card styling.
      document
        .querySelectorAll(".tm-marketplace-search-card--super-feature")
        .forEach((card) => hide(gridCell(card)));
    }

    if (settings.hideAds) {
      // In-page display ads (occupy a grid cell in results, or stand alone).
      document
        .querySelectorAll("tm-display-ad-wrapper, tm-fuse-display-ad, tm-adsense")
        .forEach((ad) => hide(gridCell(ad)));
      // Top banner / leaderboard ad in the shell.
      document
        .querySelectorAll("tm-shell-leaderboard-ad")
        .forEach((ad) => hide(ad));
    }

    pushCount();
  }

  function setActiveState() {
    const root = document.documentElement;
    root.classList.toggle("tmf-active", settings.enabled);
    root.classList.toggle("tmf-dim", settings.enabled && settings.dim);
    if (settings.enabled) sweep();
  }

  // ---- Count reporting ------------------------------------------------------
  function pushCount() {
    try {
      chrome.runtime?.sendMessage?.({ type: "tmf-count", count: pageHiddenCount });
    } catch (_) {
      /* popup closed / context invalidated */
    }
  }

  // ---- Debounced observer ---------------------------------------------------
  let pending = false;
  function scheduleSweep() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      sweep();
    });
  }

  const observer = new MutationObserver(scheduleSweep);

  function startObserving() {
    if (!document.body) {
      requestAnimationFrame(startObserving);
      return;
    }
    observer.observe(document.body, { childList: true, subtree: true });
    setActiveState();
    sweep();
  }

  // ---- Settings + messaging -------------------------------------------------
  chrome.storage?.sync?.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
    setActiveState();
  });

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "sync") return;
    let touched = false;
    for (const key of Object.keys(DEFAULTS)) {
      if (changes[key]) {
        settings[key] = changes[key].newValue;
        touched = true;
      }
    }
    if (touched) {
      // Un-hide everything, then re-apply with the new settings.
      pageHiddenCount = 0;
      document
        .querySelectorAll("." + HIDDEN_CLASS)
        .forEach((n) => n.classList.remove(HIDDEN_CLASS));
      setActiveState();
    }
  });

  chrome.runtime?.onMessage?.addListener((msg, sender, sendResponse) => {
    // Only trust messages from our own extension pages (the popup).
    if (sender.id !== chrome.runtime.id) return;
    if (msg?.type === "tmf-get-count") sendResponse({ count: pageHiddenCount });
    return true;
  });

  // SPA navigation: reset the per-view count when the path changes.
  let lastPath = location.pathname + location.search;
  setInterval(() => {
    const now = location.pathname + location.search;
    if (now !== lastPath) {
      lastPath = now;
      pageHiddenCount = 0;
    }
  }, 1000);

  startObserving();
})();
