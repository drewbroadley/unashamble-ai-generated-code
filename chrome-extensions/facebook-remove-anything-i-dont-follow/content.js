/*
 * Facebook Feed: Only Friends & Follows
 * --------------------------------------------------------------------------
 * Keep your home feed to just posts from friends and Pages/people you already
 * follow. Hide Sponsored ads, "Suggested for you", "People you may know",
 * "Reels", and content from accounts you don't follow.
 *
 * Why this is hard on Facebook (and how we deal with it):
 *
 *  - Class names are randomized and there is no `role="feed"` /
 *    `data-pagelet` to anchor on. We find the feed list heuristically (the
 *    element whose children are the post cards — each card contains an
 *    "Actions for this post" menu) and treat its direct children as posts.
 *
 *  - Facebook injects decoy text (hidden spans repeating "Facebook") and
 *    SCRAMBLES the "Sponsored" label (e.g. "Ssoopetnrd35i466Ati8404lc13f")
 *    using CSS ordering + decoy characters, specifically to defeat ad blockers.
 *    So we never trust the raw text of the label. Instead we rely on signals
 *    Facebook leaves clean for accessibility:
 *      • ad call-to-action buttons expose aria-label="Order now" / "Shop now" …
 *      • module headers expose aria-label="People you may know" / "Reels" …
 *      • not-yet-followed actors expose a "Follow" / "Add friend" / "Join" CTA
 *    Plus a robust scrambled-"Sponsored" fallback that matches on the *set* of
 *    letters (which survives the scramble) rather than their order.
 */
(() => {
  "use strict";

  const HIDDEN_CLASS = "fbf-hidden";
  const SEEN_ATTR = "data-fbf";

  const DEFAULTS = {
    enabled: true,
    hideSponsored: true, // ads
    hideSuggested: true, // People you may know / Suggested for you / Reels modules
    hideNonFollowed: true, // posts from accounts you don't follow (Follow/Add friend/Join CTA)
    sortRecent: true, // force the home feed to "Most recent" (chronological) instead of "Top"
    dim: false,
  };

  let settings = { ...DEFAULTS };
  let pageHiddenCount = 0;

  // ---- Detection vocabulary -------------------------------------------------

  // Ad call-to-action buttons. Organic posts never carry these (they live in the
  // button's aria-label even though the visible text is rendered separately).
  const AD_CTA =
    /^(Shop now|Learn more|Sign up|Book now|Get offer|Download|Send message|Send WhatsApp message|Contact us|Get quote|Order now|Subscribe|Play game|Install now|Apply now|Watch more|Get directions|Buy tickets|Open link|See menu|Use app|Listen now|Get showtimes|Donate now|Get tickets|Read more|Watch video)$/i;

  // Injected recommendation modules, read from their (clean) header aria-label.
  const MODULE =
    /^(People you may know|People you might know|Suggested for you|Suggested Reels|Reels|Reels and short videos|Pages for you|Friend suggestions|Suggested groups|Groups you should join|Suggested events|People to follow|Popular near you)\b/i;

  // "Not in your network" actions shown for suggested people/pages/groups.
  const REL_CTA = /^(Follow|Add friend|Join|Like Page)$/i;

  // The rendered ad label. Facebook ALSO injects decoy scrambled-"Sponsored"
  // text into non-ads as a honeypot, so matching letters is a trap — we must
  // read the *actually rendered* label (see renderedLabel()).
  const AD_LABEL = /^(Ad|Sponsored|Paid partnership)$/i;

  // ---- Feed + post discovery -----------------------------------------------
  let feedEl = null;
  function findFeed() {
    if (feedEl && feedEl.isConnected && feedEl.childElementCount > 3) return feedEl;
    let best = null;
    let bestScore = 0;
    for (const e of document.querySelectorAll("div")) {
      const n = e.childElementCount;
      if (n < 4 || n > 80) continue;
      let score = 0;
      for (const c of e.children) {
        if (c.tagName !== "DIV") continue;
        if (
          c.querySelector(
            '[aria-label^="Actions for this post"],[aria-label^="More options for this"]'
          )
        ) {
          score += 2;
        } else if (c.offsetHeight > 180) {
          score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (bestScore >= 6) feedEl = best;
    return feedEl;
  }

  // ---- Per-post detectors ---------------------------------------------------

  function isAd(post) {
    for (const b of post.querySelectorAll('[role="button"],a[role="link"]')) {
      if (AD_CTA.test((b.getAttribute("aria-label") || "").trim())) return true;
    }
    return hasSponsoredLabel(post);
  }

  // Facebook renders the "Sponsored"/"Ad" label (and every post's timestamp) as
  // a span full of single-character child spans: the real characters plus a pile
  // of decoys that are CSS-reordered and pushed OUTSIDE the label's clip box.
  // Reading textContent gives garbage (and Facebook seeds decoy "Sponsored"
  // letters into non-ads on purpose). So we reconstruct the *visible* label:
  // keep only the characters whose box lies within the container's box, read in
  // left-to-right order. That yields the true label — "Ad"/"Sponsored" for ads,
  // a timestamp like "52m" for everything else.
  function hasSponsoredLabel(post) {
    for (const el of post.querySelectorAll("span")) {
      if (el.childElementCount < 8) continue;
      let charKids = 0;
      for (const c of el.children) {
        if (c.childElementCount === 0 && (c.textContent || "").length <= 1) charKids++;
      }
      if (charKids < el.childElementCount * 0.7) continue; // mostly single chars
      const cr = el.getBoundingClientRect();
      if (cr.width < 6 || cr.width > 140 || cr.height < 6) continue; // small inline label
      if (AD_LABEL.test(renderedLabel(el, cr))) return true;
    }
    return false;
  }

  // Reconstruct the visible text of a scrambled char-span container.
  function renderedLabel(el, cr) {
    const chars = [];
    for (const c of el.children) {
      const r = c.getBoundingClientRect();
      if (r.width < 0.5) continue;
      if (r.left >= cr.left - 1 && r.right <= cr.right + 1 && r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1) {
        chars.push([r.left, c.textContent]);
      }
    }
    chars.sort((a, b) => a[0] - b[0]);
    return chars.map((c) => c[1]).join("").trim();
  }

  function isModule(post) {
    for (const el of post.querySelectorAll("[aria-label]")) {
      if (MODULE.test((el.getAttribute("aria-label") || "").trim())) return true;
    }
    return false;
  }

  // A "Follow"/"Add friend"/"Join" action in the post *header* (not buried in a
  // nested reshared card) means the author is someone you don't follow.
  function isNonFollowed(post) {
    const top = post.getBoundingClientRect().top;
    for (const b of post.querySelectorAll('[role="button"],a[role="link"]')) {
      const txt = (b.textContent || "").replace(/\s+/g, " ").trim();
      const aria = (b.getAttribute("aria-label") || "").trim();
      if (!REL_CTA.test(txt) && !REL_CTA.test(aria)) continue;
      // Only count it when it sits in the author/header band near the top.
      if (b.getBoundingClientRect().top - top <= 140) return true;
    }
    return false;
  }

  /**
   * @returns {{hide:boolean, reason:string} | null}  null = undecided (not yet
   * rendered — Facebook virtualizes off-screen cards), retry on a later sweep.
   */
  function classify(post) {
    // Virtualized placeholder with reserved height but no content yet.
    if (!post.querySelector('[aria-label],[role="button"]')) return null;

    if (settings.hideSuggested && isModule(post)) return { hide: true, reason: "module" };
    if (settings.hideSponsored && isAd(post)) return { hide: true, reason: "sponsored" };
    if (settings.hideNonFollowed && isNonFollowed(post))
      return { hide: true, reason: "not-followed" };

    // Friend, followed Page/person, group you're in, or your own post.
    return { hide: false, reason: "kept" };
  }

  // ---- Apply / sweep --------------------------------------------------------
  function apply(post, decision) {
    if (!decision) return;
    const prev = post.getAttribute(SEEN_ATTR);
    if (prev === decision.reason) return;
    post.setAttribute(SEEN_ATTR, decision.reason);
    if (decision.hide) {
      if (!post.classList.contains(HIDDEN_CLASS)) {
        post.classList.add(HIDDEN_CLASS);
        pageHiddenCount++;
      }
    } else {
      post.classList.remove(HIDDEN_CLASS);
    }
  }

  function sweep() {
    if (!settings.enabled) return;
    const feed = findFeed();
    if (!feed) return;
    for (const post of feed.children) {
      if (post.tagName !== "DIV") continue;
      // Re-evaluate only undecided / provisional ("kept") cards; hidden verdicts
      // are stable until settings change (which clears SEEN_ATTR).
      const prev = post.getAttribute(SEEN_ATTR);
      if (prev && prev !== "kept") continue;
      apply(post, classify(post));
    }
    pushCount();
  }

  function setActiveState() {
    const root = document.documentElement;
    root.classList.toggle("fbf-active", settings.enabled);
    root.classList.toggle("fbf-dim", settings.enabled && settings.dim);
    if (settings.enabled) sweep();
  }

  // ---- Force "Most recent" (chronological) sort -----------------------------
  // Facebook's home feed defaults to the algorithmic "Top" feed. The
  // chronological feed lives at `?sk=h_chr`. We redirect the home feed there.
  // Guarded to run at most once per tab session so that — if Facebook ever
  // strips the parameter — we never get stuck in a reload loop.
  function enforceMostRecent() {
    if (!settings.sortRecent) return;
    const path = location.pathname;
    if (path !== "/" && path !== "/home.php") return; // home feed only
    const params = new URLSearchParams(location.search);
    if (params.get("sk") === "h_chr") return; // already chronological
    try {
      if (sessionStorage.getItem("fbf-recent-done")) return;
      sessionStorage.setItem("fbf-recent-done", "1");
    } catch (_) {
      /* storage blocked — fall through and still try once */
    }
    params.set("sk", "h_chr");
    location.replace(location.origin + "/?" + params.toString());
  }

  // ---- Count reporting ------------------------------------------------------
  function pushCount() {
    try {
      chrome.runtime?.sendMessage?.({ type: "fbf-count", count: pageHiddenCount });
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
    enforceMostRecent(); // redirect to chronological feed before doing anything else
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
      // If the user just turned the sort on, let it redirect this view.
      if (changes.sortRecent && changes.sortRecent.newValue) {
        try {
          sessionStorage.removeItem("fbf-recent-done");
        } catch (_) {}
        enforceMostRecent();
      }
      document.querySelectorAll("[" + SEEN_ATTR + "]").forEach((n) => n.removeAttribute(SEEN_ATTR));
      pageHiddenCount = 0;
      document.querySelectorAll("." + HIDDEN_CLASS).forEach((n) => n.classList.remove(HIDDEN_CLASS));
      setActiveState();
    }
  });

  chrome.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "fbf-get-count") sendResponse({ count: pageHiddenCount });
    return true;
  });

  // SPA navigation: reset the per-view count and re-derive the feed.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      pageHiddenCount = 0;
      feedEl = null;
    }
  }, 1000);

  startObserving();
})();
