/*
 * Reddit: Hide Promoted & Keep Hot
 * --------------------------------------------------------------------------
 * Two jobs on the Reddit ("shreddit") home feed:
 *
 *   1. Remove Promoted / Sponsored ads. Reddit renders every feed ad as a
 *      <shreddit-ad-post> element (a direct child of <shreddit-feed>, with a
 *      `promoted` attribute), separated from real posts by <hr> rules. Organic
 *      posts are <article> wrappers around <shreddit-post>. So we simply hide
 *      each <shreddit-ad-post> (and its trailing <hr> so no double divider).
 *
 *   2. Keep the feed sorted by Hot. The home feed defaults to "Best"; the Hot
 *      sort lives at the stable URL /hot/. So when you land on the default home
 *      feed we redirect it to /hot/ (once per tab session, to avoid any loop and
 *      to respect a later manual sort choice).
 */
(() => {
  "use strict";

  const HIDDEN_CLASS = "rrf-hidden";

  const DEFAULTS = {
    enabled: true,
    hidePromoted: true, // <shreddit-ad-post> ads
    sortHot: true, // redirect the default home feed to /hot/
    dim: false,
  };

  let settings = { ...DEFAULTS };
  let pageHiddenCount = 0;

  function hide(el) {
    if (!el || el.classList.contains(HIDDEN_CLASS)) return;
    el.classList.add(HIDDEN_CLASS);
    pageHiddenCount++;
  }

  function sweep() {
    if (!settings.enabled || !settings.hidePromoted) return;
    // Ad posts (and a defensive fallback for any promoted <shreddit-post>).
    document
      .querySelectorAll("shreddit-ad-post, shreddit-post[promoted]")
      .forEach((ad) => {
        hide(ad);
        // Drop the trailing separator so we don't leave a double divider.
        const next = ad.nextElementSibling;
        if (next && next.tagName === "HR") hide(next);
      });
    pushCount();
  }

  function setActiveState() {
    const root = document.documentElement;
    root.classList.toggle("rrf-active", settings.enabled);
    root.classList.toggle("rrf-dim", settings.enabled && settings.dim);
    if (settings.enabled) sweep();
  }

  // ---- Keep the feed on Hot -------------------------------------------------
  // The default home feed ("/", "?feed=home", or "/best/") sorts by Best; the
  // Hot sort is the stable path /hot/. Redirect there every time you land on or
  // navigate back to the default home feed. No loop risk: /hot/ is not a
  // redirect target, so it never bounces.
  function enforceHotSort() {
    if (!settings.sortHot) return;
    const p = location.pathname;
    const isDefaultHome = p === "/" || p === "/best" || p === "/best/";
    if (!isDefaultHome) return; // leave /hot/, /new/, /top/, /r/*, comments, etc.
    location.replace(location.origin + "/hot/");
  }

  // ---- Count reporting ------------------------------------------------------
  function pushCount() {
    try {
      chrome.runtime?.sendMessage?.({ type: "rrf-count", count: pageHiddenCount });
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
    enforceHotSort(); // redirect before rendering the wrong sort, if needed
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
      if (changes.sortHot && changes.sortHot.newValue) enforceHotSort();
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
    if (msg?.type === "rrf-get-count") sendResponse({ count: pageHiddenCount });
    return true;
  });

  // Reddit is a single-page app: clicking "Home" navigates client-side without
  // reloading this script. Poll for path changes so we re-apply the Hot sort
  // (and reset the per-view count) whenever you land back on the home feed.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      pageHiddenCount = 0;
      enforceHotSort();
    }
  }, 400);

  startObserving();
})();
