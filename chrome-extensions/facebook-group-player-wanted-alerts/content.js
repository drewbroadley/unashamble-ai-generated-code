/*
 * Facebook Group: Player Wanted Alerts — content script
 * --------------------------------------------------------------------------
 * Runs only on https://www.facebook.com/groups/*. Reads the group feed that is
 * already on screen, pulls out each post's id / author / body / posted-at, runs
 * it through parser.js, and reports the "team needs players" ones to the
 * service worker. It never writes to the page, never clicks anything, never
 * sends a network request of its own.
 *
 * How we read Facebook reliably (its class names are randomised and it injects
 * decoy text specifically to defeat scrapers):
 *
 *  - The feed is `[role="feed"]`; its direct children are post cards. Facebook
 *    virtualises the list, so only cards near the viewport have real content —
 *    that's fine, new posts are at the top.
 *  - The post body is `[data-ad-preview="message"]` (a11y/ads plumbing that
 *    Facebook keeps clean). Reading the card's innerText instead would give you
 *    a wall of decoy "Facebook Facebook Facebook…" spans.
 *  - The visible timestamp is scrambled per-character, BUT the permalink anchor
 *    carries an unscrambled `aria-label` with the absolute time
 *    ("Thursday 9 July 2026 at 11:07"). That's what we use to age posts.
 */
(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    groupId: "110710202292493",
    maxAgeMinutes: 90,
  };

  let settings = { ...DEFAULTS };

  function currentGroupId() {
    const m = location.pathname.match(/^\/groups\/([^/]+)/);
    return m ? m[1] : null;
  }

  function watchingThisGroup() {
    const id = currentGroupId();
    if (!id) return false;
    const want = String(settings.groupId || "").trim();
    return !want || want === id;
  }

  // ---- Extraction ---------------------------------------------------------

  function postIdFrom(anchor) {
    try {
      const m = new URL(anchor.href, location.origin).pathname.match(/\/posts\/(\d+)/);
      return m ? m[1] : null;
    } catch (_) {
      return null;
    }
  }

  // The permalink anchor carries an absolute time in its aria-label
  // ("Thursday 9 July 2026 at 11:07"). Returns age in minutes, or null.
  function absoluteAgeMinutes(anchor) {
    const label = (anchor.getAttribute("aria-label") || "").trim();
    if (!label) return null;
    const t = Date.parse(label.replace(/\bat\b/i, " ").replace(/\s+/g, " "));
    if (!Number.isFinite(t)) return null;
    return Math.round((Date.now() - t) / 60000);
  }

  // The visible relative stamp ("14m", "2h", "5w", "Yesterday").
  const RELATIVE_RE =
    /^(?:just now|now|yesterday|(\d+)\s*(s|m|h|d|w|y|mo|min|mins|hr|hrs))$/i;
  const RELATIVE_UNIT = {
    s: 1 / 60,
    m: 1,
    min: 1,
    mins: 1,
    h: 60,
    hr: 60,
    hrs: 60,
    d: 1440,
    w: 10080,
    mo: 43800,
    y: 525600,
  };

  function relativeAgeMinutes(anchor) {
    const text = (anchor.innerText || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!text || text.length > 12) return null;
    const m = RELATIVE_RE.exec(text);
    if (!m) return null; // scrambled or unrecognised — fall back to the absolute label
    if (/^(just now|now)$/.test(text)) return 0;
    if (text === "yesterday") return 1440;
    const n = parseInt(m[1], 10);
    return Math.round(n * (RELATIVE_UNIT[m[2].toLowerCase()] || 1));
  }

  /**
   * How long ago did this post show up, in minutes?
   *
   * This group holds posts for admin approval, so the two clocks disagree: the
   * aria-label is when the poster WROTE it (which can be a day earlier) while
   * the visible stamp tracks when it went live. A post approved 14 minutes ago
   * but written yesterday is brand new as far as you're concerned, so we take
   * whichever reading is smaller.
   */
  function ageMinutesFrom(anchor) {
    const rel = relativeAgeMinutes(anchor);
    const abs = absoluteAgeMinutes(anchor);
    if (rel == null) return abs;
    if (abs == null) return rel;
    return Math.min(rel, abs);
  }

  function authorFrom(card) {
    const a = card.querySelector('h2 a[href], h3 a[href], h4 a[href], strong a[href]');
    const name = (a && a.textContent ? a.textContent : "").replace(/\s+/g, " ").trim();
    return name.slice(0, 80);
  }

  function bodyFrom(card) {
    const el = card.querySelector(
      '[data-ad-preview="message"],[data-ad-comet-preview="message"],[data-ad-rendering-role="story_message"]'
    );
    if (!el) return "";
    return (el.innerText || "")
      .replace(/\s+/g, " ")
      .replace(/\s*…?\s*See (more|less)\s*$/i, "")
      .trim();
  }

  function scan() {
    if (!settings.enabled || !watchingThisGroup()) return [];
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return [];

    const groupId = currentGroupId();
    const found = [];

    for (const card of feed.children) {
      const body = bodyFrom(card);
      if (!body) continue; // virtualised placeholder, or a photo-only post

      const anchor = card.querySelector('a[href*="/posts/"]');
      if (!anchor) continue;
      const id = postIdFrom(anchor);
      if (!id) continue;

      const parsed = globalThis.PlayerWantedParser.parsePost(body);
      if (!parsed.isCall) continue;

      found.push({
        id,
        groupId,
        url: `https://www.facebook.com/groups/${groupId}/posts/${id}/`,
        author: authorFrom(card),
        text: body.slice(0, 400),
        ageMinutes: ageMinutesFrom(anchor),
        headline: parsed.headline,
        subline: parsed.subline,
        time: parsed.time ? parsed.time.display : null,
        day: parsed.day,
        players: parsed.players.fullTeam && !parsed.players.count ? null : parsed.players.count,
        fullTeam: !!parsed.players.fullTeam,
      });
    }
    return found;
  }

  let reportCount = 0;

  function report(trigger) {
    const posts = scan();
    reportCount++;
    try {
      chrome.runtime?.sendMessage?.({
        type: "pw-posts",
        trigger,
        groupId: currentGroupId(),
        hidden: document.visibilityState === "hidden",
        feedSeen: !!document.querySelector('[role="feed"]'),
        posts,
      });
    } catch (_) {
      /* extension reloaded / context invalidated */
    }
  }

  // ---- Scheduling ---------------------------------------------------------

  const DEBOUNCE_MS = 1500;
  const MAX_WAIT_MS = 5000;

  let pending = null;
  let firstScheduledAt = 0;

  /**
   * Debounce, but with a hard ceiling.
   *
   * Facebook mutates its DOM more or less continuously. A plain debounce can be
   * starved forever by that drip — which is exactly what happened in background
   * tabs: Chrome throttles the page's timers when a tab is hidden, spreading
   * Facebook's work out into a steady trickle of mutations that reset a 1.5s
   * timer indefinitely, so the scan never ran and nothing was ever reported.
   * MAX_WAIT_MS guarantees a report goes out within 5s of the first change.
   */
  function scheduleReport(trigger) {
    const now = Date.now();
    if (!firstScheduledAt) firstScheduledAt = now;

    if (now - firstScheduledAt >= MAX_WAIT_MS) {
      if (pending) clearTimeout(pending);
      pending = null;
      firstScheduledAt = 0;
      report(trigger);
      return;
    }

    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      firstScheduledAt = 0;
      report(trigger);
    }, DEBOUNCE_MS);
  }

  const observer = new MutationObserver(() => scheduleReport("mutation"));

  /**
   * Belt and braces: a background check gets one shot at this page before the
   * service worker closes the tab, so don't rely solely on mutations firing.
   * Scan on a timer too — often at first (while the feed is still rendering),
   * then settling down. The service worker de-duplicates by post id, so extra
   * reports cost nothing but a scan.
   */
  function startHeartbeat() {
    let ticks = 0;
    const tick = () => {
      ticks++;
      if (document.querySelector('[role="feed"]')) report("heartbeat");
      // Every 3s for the first ~45s, then every 30s for as long as the tab lives.
      const next = ticks < 15 ? 3000 : 30000;
      setTimeout(tick, next);
    };
    setTimeout(tick, 2000);
  }

  function start() {
    if (!document.body) {
      setTimeout(start, 300);
      return;
    }
    observer.observe(document.body, { childList: true, subtree: true });
    startHeartbeat();
    scheduleReport("load");
  }

  // ---- Settings + messaging -----------------------------------------------

  chrome.storage?.sync?.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
    start();
  });

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const key of Object.keys(DEFAULTS)) {
      if (changes[key]) settings[key] = changes[key].newValue;
    }
  });

  chrome.runtime?.onMessage?.addListener((msg, sender, sendResponse) => {
    // Only ever trust our own service worker / popup.
    if (sender.id !== chrome.runtime.id) return;

    if (msg?.type === "pw-refresh") {
      // Don't yank the page out from under someone who is reading it — if the
      // tab has focus we just re-scan what's already rendered.
      if (document.hasFocus()) {
        report("refresh-focused");
        sendResponse({ ok: true, reloaded: false });
      } else {
        sendResponse({ ok: true, reloaded: true });
        location.reload();
      }
      return true;
    }

    if (msg?.type === "pw-scan-now") {
      report("manual");
      sendResponse({ ok: true });
      return true;
    }
    return undefined;
  });
})();
