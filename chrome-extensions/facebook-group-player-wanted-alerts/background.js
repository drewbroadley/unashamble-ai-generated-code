/*
 * Facebook Group: Player Wanted Alerts — service worker
 * --------------------------------------------------------------------------
 * Owns three jobs:
 *   1. Decide which reported posts are NEW (never alerted, and recent enough).
 *   2. Fire a sticky desktop notification + an audible chime for each one, and
 *      (if you turned it on) push the same alert to your phone via ntfy.
 *   3. Keep the feed fresh — poke an open group tab on a timer, and (optionally)
 *      open a throwaway background tab when no group tab is open at all.
 *
 * State lives in chrome.storage.local. The only outbound request this extension
 * ever makes is the optional ntfy push, and only while it is switched on.
 */
"use strict";

importScripts("push.js");

const DEFAULTS = {
  enabled: true,
  groupId: "110710202292493",
  intervalMinutes: 3,
  maxAgeMinutes: 90,
  sound: true,
  backgroundCheck: true, // open a hidden tab when no group tab is open
  // Phone push (ntfy). Off until you give it a topic — see push.js.
  phonePush: false,
  ntfyServer: "https://ntfy.sh",
  ntfyTopic: "",
  ntfyToken: "",
  pushIncludeText: true,
};

const POLL_ALARM = "pw-poll";
const CLOSE_ALARM = "pw-close-temp-tab";
const SEEN_LIMIT = 500;

function groupUrl(groupId) {
  return `https://www.facebook.com/groups/${groupId}/?sorting_setting=CHRONOLOGICAL`;
}

function getSettings() {
  return new Promise((resolve) => chrome.storage.sync.get(DEFAULTS, resolve));
}

function getLocal(defaults) {
  return new Promise((resolve) => chrome.storage.local.get(defaults, resolve));
}

function setLocal(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

// ---- Alarms ---------------------------------------------------------------

async function rescheduleAlarm() {
  const s = await getSettings();
  await chrome.alarms.clear(POLL_ALARM);
  if (!s.enabled) return;
  const period = Math.max(1, Number(s.intervalMinutes) || 3);
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: period, delayInMinutes: period });
}

chrome.runtime.onInstalled.addListener(rescheduleAlarm);
chrome.runtime.onStartup.addListener(rescheduleAlarm);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.intervalMinutes || changes.enabled) rescheduleAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) poll();
  if (alarm.name === CLOSE_ALARM) closeTempTab();
});

// ---- Polling --------------------------------------------------------------

/**
 * Ask the known group tab to refresh itself. If we don't have one (or it's
 * gone), optionally open a temporary background tab, let its content script
 * report, then close it again.
 */
const TEMP_TAB_STALE_MS = 3 * 60000;

async function poll(force) {
  const s = await getSettings();
  if (!s.enabled) return { ok: false, why: "disabled" };

  const state = await getLocal({ groupTabId: null, tempTabId: null, tempTabAt: 0 });

  // A temp tab that never got cleaned up (user closed it, Chrome dropped the
  // alarm, service worker died mid-flight) used to latch background checks off
  // permanently. Time-box it instead.
  if (state.tempTabId != null) {
    const stale = !state.tempTabAt || Date.now() - state.tempTabAt > TEMP_TAB_STALE_MS;
    const alive = await tabExists(state.tempTabId);
    if (stale || !alive) {
      await closeTempTab();
    } else if (!force) {
      return { ok: false, why: "background check already in flight" };
    }
  }

  if (!force && state.groupTabId != null) {
    // Confirm the tab is still there AND still has our content script in it
    // before trusting it as our eyes on the feed.
    if (await tabExists(state.groupTabId)) {
      const ok = await pokeTab(state.groupTabId);
      if (ok) {
        await setLocal({ lastCheck: Date.now(), lastSource: "open tab" });
        return { ok: true, why: "poked open group tab" };
      }
    }
    await setLocal({ groupTabId: null });
  }

  if (!s.backgroundCheck && !force) return { ok: false, why: "background check is off" };

  try {
    const tab = await chrome.tabs.create({ url: groupUrl(s.groupId), active: false });
    await setLocal({
      tempTabId: tab.id,
      tempTabAt: Date.now(),
      tempTabReported: false,
      lastCheck: Date.now(),
      lastSource: "background tab",
    });
    // Hard backstop in case the tab never reports. The tab is normally closed
    // as soon as it has reported at least once (see handleReport).
    chrome.alarms.create(CLOSE_ALARM, { delayInMinutes: 1 });
    return { ok: true, why: "opened background tab" };
  } catch (e) {
    await setLocal({ lastError: `could not open background tab: ${e && e.message}` });
    return { ok: false, why: "tab creation failed" };
  }
}

function tabExists(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.get(tabId, (tab) => resolve(!chrome.runtime.lastError && !!tab));
    } catch (_) {
      resolve(false);
    }
  });
}

function pokeTab(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: "pw-refresh" }, () => {
        resolve(!chrome.runtime.lastError);
      });
    } catch (_) {
      resolve(false);
    }
  });
}

async function closeTempTab() {
  const { tempTabId } = await getLocal({ tempTabId: null });
  if (tempTabId == null) return;
  await setLocal({ tempTabId: null, tempTabAt: 0, tempTabReported: false });
  try {
    await chrome.tabs.remove(tempTabId);
  } catch (_) {
    /* already closed by the user */
  }
}

// ---- Incoming reports -----------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return; // ignore anything not ours

  if (msg?.type === "pw-posts") {
    handleReport(msg, sender).then((r) => sendResponse(r));
    return true;
  }
  if (msg?.type === "pw-poll-now") {
    poll(msg.force === true).then((r) => sendResponse(r || { ok: true }));
    return true;
  }
  if (msg?.type === "pw-test-alert") {
    notifyPost(
      {
        id: "test",
        url: groupUrl(DEFAULTS.groupId),
        author: "Test",
        headline: "1:30pm today — 2 players needed",
        subline: "1 female + 1 male · Div 3 · free",
        text: "This is what a real alert looks like.",
      },
      true
    ).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "pw-test-push") {
    pushPost({
      id: "test",
      url: groupUrl(DEFAULTS.groupId),
      author: "Test",
      headline: "1:30pm today — 2 players needed",
      subline: "1 female + 1 male · Div 3 · free",
      text: "This is what a real alert looks like on your phone.",
    }).then((r) => sendResponse(r));
    return true;
  }
  if (msg?.type === "pw-clear-badge") {
    chrome.action.setBadgeText({ text: "" });
    setLocal({ unseen: 0 }).then(() => sendResponse({ ok: true }));
    return true;
  }
  return undefined;
});

async function handleReport(msg, sender) {
  const s = await getSettings();
  if (!s.enabled) return { ok: false, reason: "disabled" };

  const tabId = sender.tab ? sender.tab.id : null;
  const state = await getLocal({
    seen: {},
    initialised: false,
    recent: [],
    unseen: 0,
    tempTabId: null,
    groupTabId: null,
  });
  const fromTempTab = tabId != null && tabId === state.tempTabId;

  // Remember a real (user-owned) group tab so we can poke it next time.
  if (tabId != null && !fromTempTab && state.groupTabId !== tabId) {
    await setLocal({ groupTabId: tabId });
  }

  const seen = state.seen || {};
  const now = Date.now();
  const maxAge = Number(s.maxAgeMinutes) || 0; // 0 / blank = no age limit

  const fresh = [];
  for (const post of msg.posts || []) {
    if (seen[post.id]) continue;
    seen[post.id] = now;

    // First run ever: everything currently on screen is "old". This is what
    // stops the extension screaming about a month of backlog on install.
    if (!state.initialised) continue;

    // Age gate: a post we only just scrolled into view shouldn't ring the bell
    // hours after kick-off. Unknown age (null) is treated as new — better a
    // rare extra ping than a missed game.
    if (maxAge > 0 && post.ageMinutes != null && post.ageMinutes > maxAge) continue;

    fresh.push(post);
  }

  // Keep the seen-set bounded.
  const entries = Object.entries(seen).sort((a, b) => b[1] - a[1]);
  const trimmed = Object.fromEntries(entries.slice(0, SEEN_LIMIT));

  const recent = [
    ...fresh.map((p) => ({
      id: p.id,
      url: p.url,
      author: p.author,
      headline: p.headline,
      subline: p.subline,
      at: now,
    })),
    ...(state.recent || []),
  ].slice(0, 20);

  await setLocal({
    seen: trimmed,
    initialised: true,
    recent,
    lastCheck: now,
    lastSource: fromTempTab ? "background tab" : "open tab",
    lastResult: {
      at: now,
      source: fromTempTab ? "background tab" : "open tab",
      trigger: msg.trigger || "?",
      hidden: !!msg.hidden,
      feedSeen: !!msg.feedSeen,
      scanned: (msg.posts || []).length,
      fresh: fresh.length,
      baseline: !state.initialised,
    },
    unseen: (state.unseen || 0) + fresh.length,
  });

  for (const post of fresh) {
    await notifyPost(post, s.sound);
    // Phone push is best-effort and deliberately AFTER the desktop notification:
    // a dead network must never cost you the alert on the machine you're at.
    await pushPost(post, s);
  }

  if (fresh.length) {
    const total = (state.unseen || 0) + fresh.length;
    chrome.action.setBadgeBackgroundColor({ color: "#e11d48" });
    chrome.action.setBadgeText({ text: String(Math.min(total, 99)) });
  }

  // If this came from our throwaway tab, close it — but only once it has
  // actually seen the feed. An early report from a page that hasn't rendered
  // yet used to close the tab before the posts existed. The CLOSE_ALARM is the
  // backstop if the feed never turns up at all.
  if (fromTempTab && msg.feedSeen) closeTempTab();

  return { ok: true, new: fresh.length, scanned: (msg.posts || []).length };
}

// Keep our tab bookkeeping honest when tabs disappear underneath us.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getLocal({ groupTabId: null, tempTabId: null });
  const patch = {};
  if (state.groupTabId === tabId) patch.groupTabId = null;
  if (state.tempTabId === tabId) {
    patch.tempTabId = null;
    patch.tempTabAt = 0;
    patch.tempTabReported = false;
  }
  if (Object.keys(patch).length) await setLocal(patch);
});

// ---- Notifications --------------------------------------------------------

const pending = new Map(); // notificationId -> post url

async function notifyPost(post, withSound) {
  const notificationId = `pw-${post.id}-${Date.now()}`;
  pending.set(notificationId, post.url);

  const lines = [];
  if (post.subline) lines.push(post.subline);
  if (post.text) lines.push(post.text.slice(0, 180));

  await new Promise((resolve) => {
    chrome.notifications.create(
      notificationId,
      {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: `⚽ ${post.headline}`,
        message: lines.join("\n"),
        contextMessage: post.author ? `Posted by ${post.author}` : undefined,
        priority: 2,
        requireInteraction: true, // stays on screen until you deal with it
        silent: false,
        buttons: [{ title: "Open post" }],
      },
      resolve
    );
  });

  if (withSound) playChime();
}

chrome.notifications.onClicked.addListener((id) => openFor(id));
chrome.notifications.onButtonClicked.addListener((id) => openFor(id));

function openFor(id) {
  const url = pending.get(id);
  pending.delete(id);
  chrome.notifications.clear(id);
  chrome.action.setBadgeText({ text: "" });
  setLocal({ unseen: 0 });
  if (url) chrome.tabs.create({ url, active: true });
}

chrome.notifications.onClosed.addListener((id) => pending.delete(id));

// ---- Phone push (ntfy) ----------------------------------------------------

/**
 * Send one alert to the phone. Silently does nothing unless phone push is on
 * and configured. The outcome (including the error text) is recorded in
 * chrome.storage.local so the popup can show you when delivery is broken —
 * a push you think is working but isn't is worse than one you know is off.
 */
async function pushPost(post, settings) {
  const s = settings || (await getSettings());
  if (!s.phonePush) return { ok: false, error: "phone push is off" };

  const result = await PlayerWantedPush.send({
    server: s.ntfyServer,
    topic: s.ntfyTopic,
    token: s.ntfyToken,
    includeText: s.pushIncludeText !== false,
    post,
  });

  await setLocal({
    lastPush: { at: Date.now(), ok: !!result.ok, error: result.ok ? "" : result.error || "failed" },
  });
  return result;
}

// ---- Sound (via an offscreen document — service workers have no audio) -----

let creatingOffscreen = null;

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existing.length) return;
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play an alert chime when a new player-wanted post appears.",
  });
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function playChime() {
  try {
    await ensureOffscreen();
    chrome.runtime.sendMessage({ type: "pw-play-chime" });
  } catch (_) {
    /* audio is a nice-to-have; the notification is the real signal */
  }
}
