/*
 * Facebook Group: Player Wanted Alerts — phone push (ntfy)
 * --------------------------------------------------------------------------
 * The ONLY part of this extension that talks to a server other than Facebook,
 * and it is off until you turn it on and give it a topic.
 *
 * Delivery is ntfy (https://ntfy.sh, or your own ntfy server). A publish is a
 * single HTTPS POST of a small JSON object. The topic name is the address AND
 * the password — anyone who knows it can read your alerts and send you fake
 * ones — which is why `randomTopic()` exists and why the popup nudges you to
 * use it.
 *
 * Everything except `send()` is pure so it can be tested in node
 * (see ../tests/push.test.mjs).
 */
"use strict";

(function (root) {
  const DEFAULT_SERVER = "https://ntfy.sh";

  // ntfy's own rule for topic names, minus the ambiguous ones.
  const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/;

  // ntfy.sh caps a message at 4KB. Stay well under, and leave the desktop
  // notification as the place to read the whole post.
  const MAX_TEXT = 700;

  const TIMEOUT_MS = 10000;
  const RETRY_DELAY_MS = 2000;

  /**
   * Reduce whatever the user typed to a bare HTTPS origin, or null if it isn't
   * one. Plain-text HTTP is rejected outright: an alert sent in the clear on
   * someone else's wifi is worse than no alert.
   */
  function normaliseServer(server) {
    const raw = String(server == null ? "" : server).trim();
    if (!raw) return DEFAULT_SERVER;
    let url;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch (_) {
      return null;
    }
    if (url.protocol !== "https:") return null; // TLS or nothing
    return url.origin;
  }

  function validTopic(topic) {
    return TOPIC_RE.test(String(topic == null ? "" : topic).trim());
  }

  /** A topic nobody is going to guess. 20 chars of base32-ish alphabet. */
  function randomTopic(cryptoImpl) {
    const c = cryptoImpl || (typeof crypto !== "undefined" ? crypto : null);
    const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // no l/o/0/1
    const bytes = new Uint8Array(20);
    c.getRandomValues(bytes);
    let out = "pw-";
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
  }

  /**
   * Turn a post into the exact HTTPS request we'd send.
   * Returns { ok: true, url, headers, body } or { ok: false, error }.
   */
  function buildRequest(cfg) {
    const opts = cfg || {};
    const origin = normaliseServer(opts.server);
    if (!origin) return { ok: false, error: "server must be an https:// URL" };

    const topic = String(opts.topic == null ? "" : opts.topic).trim();
    if (!validTopic(topic))
      return { ok: false, error: "topic must be 1–64 letters, digits, - or _" };

    const post = opts.post || {};
    const lines = [];
    if (post.subline) lines.push(String(post.subline));
    if (opts.includeText && post.text) lines.push(String(post.text).slice(0, MAX_TEXT));
    if (post.author) lines.push(`— ${post.author}`);

    const payload = {
      topic,
      // Mirrors the desktop notification so the two read as one alert.
      title: `⚽ ${post.headline || "New player-wanted post"}`,
      message: lines.join("\n") || "New player-wanted post in the group.",
      // ntfy max priority: the whole point is that it gets through.
      priority: 5,
      tags: ["soccer"],
    };

    // `click` opens the post when you tap the phone notification. Only ever an
    // https link, never whatever a post happened to contain.
    const click = String(post.url || "");
    if (/^https:\/\//.test(click)) payload.click = click;

    const headers = { "Content-Type": "application/json" };
    const token = String(opts.token == null ? "" : opts.token).trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    // ntfy's JSON publish endpoint is the server root; the topic is in the body.
    return { ok: true, url: `${origin}/`, headers, body: JSON.stringify(payload) };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Publish. One retry, because a phone alert missed to a flaky second of wifi
   * is the failure mode that matters. A 4xx (bad topic, bad token) is not
   * retried — it will fail identically the second time.
   */
  async function send(cfg, fetchImpl) {
    const req = buildRequest(cfg);
    if (!req.ok) return req;
    const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!doFetch) return { ok: false, error: "no fetch available" };

    let last = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await sleep(RETRY_DELAY_MS);
      try {
        const init = { method: "POST", headers: req.headers, body: req.body };
        // A hung socket must not leave the alert in limbo forever. Guarded
        // because AbortSignal.timeout is newer than the rest of what we use.
        if (typeof AbortSignal !== "undefined" && AbortSignal.timeout)
          init.signal = AbortSignal.timeout(TIMEOUT_MS);
        const res = await doFetch(req.url, init);
        if (res.ok) return { ok: true };
        last = `server said ${res.status}`;
        if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
      } catch (e) {
        last = (e && e.message) || String(e);
      }
    }
    return { ok: false, error: last || "no response" };
  }

  root.PlayerWantedPush = {
    DEFAULT_SERVER,
    MAX_TEXT,
    normaliseServer,
    validTopic,
    randomTopic,
    buildRequest,
    send,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
