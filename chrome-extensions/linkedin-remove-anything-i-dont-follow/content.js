/*
 * LinkedIn Feed: Only 1st Connections & Follows
 * --------------------------------------------------------------------------
 * LinkedIn's current feed ships fully obfuscated, rotating CSS class names
 * (e.g. `e4c6b5f3`, `_5bba7`) and no `data-urn`, so selector-based targeting
 * is brittle. This extension instead works off two stable signals:
 *
 *   1. Each feed item is wrapped in an element with `data-lazy-mount-id`, and
 *      real posts begin their text content with "Feed post".
 *   2. The relationship affordance LinkedIn renders in the actor header:
 *        - 1st-degree connections        -> no "Follow"/"Connect" button
 *        - accounts you already follow    -> no "Follow" button (or "Following")
 *        - everyone else (2nd, 3rd+,      -> a "• Follow" or "• Connect" action
 *          suggested, reactions, reposts)
 *
 * So the rule is simply: keep a post only if it's from someone you're already
 * connected to (1st) or already following; hide promoted, suggested, and any
 * post that surfaces an actor you don't yet follow/connect with.
 *
 * NOTE: textContent concatenates inline elements with NO whitespace
 * ("postSuggestedVennie", "FollowAI"), so matching uses substrings anchored to
 * the header region rather than \b word boundaries.
 */
(() => {
  "use strict";

  const HIDDEN_CLASS = "lirf-hidden";
  const SEEN_ATTR = "data-lirf"; // stores last decision so we can skip stable nodes

  const DEFAULTS = {
    enabled: true,
    dim: false, // dim+collapse instead of fully removing
    hideAmplified: false, // also hide reposts/likes/comments surfaced via others, even 1st-degree
  };

  let settings = { ...DEFAULTS };
  let pageHiddenCount = 0;

  // ---- Injected recommendation / suggestion modules ------------------------
  // These are never "your" content. LinkedIn ships them both as bare mounts and
  // wrapped inside a "Feed post" shell (e.g. "Feed postJobs recommended for
  // you..."), so we match the section header anchored to the START of the item
  // (after any "Feed post" prefix) to avoid false positives from real bodies.
  const MODULE_RE =
    /^(?:Jobs recommended for you|Jobs you may be interested|Recommended for you|People you may know|Add to your feed|Suggested for you|Pages for you|People also viewed|Courses? (?:for|recommended)|Trending\b|Discover more|More (?:posts|suggestions) for you|Promoted by)/;

  // ---- UI chrome that must NEVER be hidden ----------------------------------
  function isProtectedChrome(text) {
    return (
      text.startsWith("Start a post") ||
      text.startsWith("Sort by") ||
      /^New posts?/.test(text)
    );
  }

  // Amplification = the post is in your feed because of someone else's activity
  // (a repost, reaction, or comment) rather than being a direct post.
  const AMPLIFIED_RE =
    /(reposted this|likes this|loves this|celebrates this|supports this|finds this (?:funny|insightful)|follows this|commented on this|\bcommented\b|\breplied\b)/;

  /**
   * Decide what to do with a single feed item.
   * @returns {{hide:boolean, reason:string} | null}  null = undecided, retry later
   */
  function classify(node) {
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return null; // not rendered yet

    if (isProtectedChrome(text)) return { hide: false, reason: "ui-chrome" };

    const inMain = !!node.closest("main");
    const isPost = text.startsWith("Feed post");
    const body = isPost ? text.slice("Feed post".length) : text; // strip wrapper label

    // Injected recommendation / suggestion / jobs / PYMK modules — whether bare
    // or wrapped in a "Feed post" shell. Header is anchored to the start.
    if ((inMain || isPost) && MODULE_RE.test(body)) {
      return { hide: true, reason: "module" };
    }

    // From here on we only judge actual posts.
    if (!isPost) return { hide: false, reason: "non-post" };

    const head = body.slice(0, 220); // actor + meta region
    const degMatch = head.match(/[•·]\s*(1st|2nd|3rd\+?)/);
    const degree = degMatch ? degMatch[1] : null;

    // Sponsored / ads. The ad label is a standalone element reading exactly
    // "Promoted" / "Sponsored" / "Promoted by …", which reliably distinguishes a
    // real ad (incl. ones boosted by a 2nd/3rd-degree person, with a CTA button
    // instead of Follow/Connect) from a genuine connection's post that merely
    // contains the word "Promoted" somewhere in its text.
    if (isSponsored(node)) return { hide: true, reason: "promoted" };

    if (/^\s*Suggested/.test(body)) return { hide: true, reason: "suggested" };

    // Optional stricter mode: drop reposts/reactions/comments even from people
    // you know, leaving only their own original posts.
    if (settings.hideAmplified && AMPLIFIED_RE.test(text.slice(0, 120))) {
      return { hide: true, reason: "amplified" };
    }

    // 1st-degree connections are always kept, regardless of any Follow button
    // (a connection can also show a Follow toggle for their posts).
    if (degree === "1st") return { hide: false, reason: "kept-1st" };

    // For everyone else, the relationship is read from the actual action buttons
    // LinkedIn renders in the post (robust to obfuscated class names):
    //   "Following" / "Unfollow"  -> you already follow  -> keep
    //   "Follow <name>"           -> not followed         -> hide
    //   "Invite <name> to connect"-> not connected        -> hide
    const rel = relationshipButtons(node);
    if (rel.following) return { hide: false, reason: "kept-following" };
    if (rel.follow) return { hide: true, reason: "not-followed" };
    if (rel.connect) return { hide: true, reason: "not-connected" };

    // No Follow/Connect affordance at all -> your own post, an account you
    // already follow (incl. followed 2nd/3rd creators), or a connection.
    return { hide: false, reason: "kept" };
  }

  /**
   * Detect a sponsored post by its standalone ad label element. Matching the
   * exact element text (not a substring of the concatenated post text) avoids
   * false-hiding posts that merely use the word "Promoted" in their body.
   */
  function isSponsored(node) {
    for (const el of node.querySelectorAll("span, a, button, div")) {
      if (el.children.length) continue; // leaf nodes only
      const t = (el.textContent || "").trim();
      if (t === "Promoted" || t === "Sponsored" || /^Promoted by .+/.test(t)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Read the relationship action buttons inside a post. Far more reliable than
   * scraping the inline "• Follow" text, which LinkedIn omits when the action
   * is a top-corner button instead of part of the actor subline.
   */
  function relationshipButtons(node) {
    let follow = false,
      connect = false,
      following = false;
    const btns = node.querySelectorAll('button, a[role="button"]');
    for (const b of btns) {
      const aria = (b.getAttribute("aria-label") || "").trim();
      const txt = (b.textContent || "").replace(/\s+/g, " ").trim();
      if (/^Following\b/i.test(txt) || /^Following\b/i.test(aria) || /^Unfollow\b/i.test(aria)) {
        following = true;
      } else if (txt === "Follow" || txt === "+ Follow" || /^Follow\s+\S/i.test(aria)) {
        follow = true;
      }
      if (txt === "Connect" || /to connect\b/i.test(aria) || /^Invite\b.*connect/i.test(aria)) {
        connect = true;
      }
    }
    return { follow, connect, following };
  }

  function apply(node, decision) {
    if (!decision) return;
    const prev = node.getAttribute(SEEN_ATTR);
    if (prev === decision.reason) return; // unchanged, nothing to do
    node.setAttribute(SEEN_ATTR, decision.reason);

    if (decision.hide) {
      if (!node.classList.contains(HIDDEN_CLASS)) {
        node.classList.add(HIDDEN_CLASS);
        pageHiddenCount++;
      }
    } else {
      node.classList.remove(HIDDEN_CLASS);
    }
  }

  function sweep() {
    if (!settings.enabled) return;
    const nodes = document.querySelectorAll("[data-lazy-mount-id]");
    for (const node of nodes) {
      // Already given a stable decision -> nothing to recompute. (Settings
      // changes clear SEEN_ATTR so everything is re-evaluated then.) "kept" is
      // the one provisional verdict — a post whose Follow/Connect buttons may
      // not have rendered yet — so we keep re-checking those.
      const prev = node.getAttribute(SEEN_ATTR);
      if (prev && prev !== "kept") continue;

      // Skip zero-size placeholders that haven't rendered their content yet.
      if (node.offsetHeight === 0 && !node.classList.contains(HIDDEN_CLASS)) {
        const t = (node.textContent || "").trim();
        if (!t) continue;
      }
      apply(node, classify(node));
    }
    pushCount();
  }

  function setActiveState() {
    const root = document.documentElement;
    root.classList.toggle("lirf-active", settings.enabled);
    root.classList.toggle("lirf-dim", settings.enabled && settings.dim);
    if (settings.enabled) {
      sweep();
    }
  }

  // ---- Count reporting for the popup ---------------------------------------
  function pushCount() {
    try {
      chrome.runtime?.sendMessage?.({ type: "lirf-count", count: pageHiddenCount });
    } catch (_) {
      /* popup not open / context invalidated */
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

  const observer = new MutationObserver(() => scheduleSweep());

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
      // Re-evaluate everything: clear cached decisions so toggles re-apply.
      document
        .querySelectorAll("[" + SEEN_ATTR + "]")
        .forEach((n) => n.removeAttribute(SEEN_ATTR));
      pageHiddenCount = 0;
      document
        .querySelectorAll("." + HIDDEN_CLASS)
        .forEach((n) => n.classList.remove(HIDDEN_CLASS));
      setActiveState();
    }
  });

  chrome.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "lirf-get-count") {
      sendResponse({ count: pageHiddenCount });
    }
    return true;
  });

  // LinkedIn is an SPA; route changes don't reload the content script. Reset
  // the page count when navigating to a different view.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      pageHiddenCount = 0;
    }
  }, 1000);

  startObserving();
})();
