/*
 * Facebook Group: Player Wanted Alerts — service worker
 * --------------------------------------------------------------------------
 * Owns three jobs:
 *   1. Decide which reported posts are NEW (never alerted, and recent enough).
 *   2. Fire a sticky desktop notification + an audible chime for each one.
 *   3. Keep the feed fresh — poke an open group tab on a timer, and (optionally)
 *      open a throwaway background tab when no group tab is open at all.
 *
 * State lives in chrome.storage.local. Nothing is sent anywhere off-device.
 */
"use strict";

const DEFAULTS = {
  enabled: true,
  groupId: "110710202292493",
  intervalMinutes: 3,
  maxAgeMinutes: 90,
  sound: true,
  backgroundCheck: true, // open a hidden tab when no group tab is open
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
async function poll() {
  const s = await getSettings();
  if (!s.enabled) return;

  const state = await getLocal({ groupTabId: null, tempTabId: null });

  if (state.groupTabId != null) {
    const ok = await pokeTab(state.groupTabId);
    if (ok) {
      await setLocal({ lastCheck: Date.now() });
      return;
    }
    await setLocal({ groupTabId: null });
  }

  if (!s.backgroundCheck) return;
  if (state.tempTabId != null) return; // one already in flight

  try {
    const tab = await chrome.tabs.create({ url: groupUrl(s.groupId), active: false });
    await setLocal({ tempTabId: tab.id, lastCheck: Date.now() });
    // Give Facebook time to render, then bin the tab. An alarm (not a timer)
    // because the service worker can be suspended at any moment.
    chrome.alarms.create(CLOSE_ALARM, { delayInMinutes: 1 });
  } catch (_) {
    /* tab creation blocked — nothing we can do from here */
  }
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
  await setLocal({ tempTabId: null });
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
    poll().then(() => sendResponse({ ok: true }));
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

  // Remember a real (user-owned) group tab so we can poke it next time.
  if (tabId != null && tabId !== state.tempTabId && state.groupTabId !== tabId) {
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
    unseen: (state.unseen || 0) + fresh.length,
  });

  for (const post of fresh) await notifyPost(post, s.sound);

  if (fresh.length) {
    const total = (state.unseen || 0) + fresh.length;
    chrome.action.setBadgeBackgroundColor({ color: "#e11d48" });
    chrome.action.setBadgeText({ text: String(Math.min(total, 99)) });
  }

  // If this report came from our throwaway tab, we're done with it.
  if (tabId != null && tabId === state.tempTabId) closeTempTab();

  return { ok: true, new: fresh.length, scanned: (msg.posts || []).length };
}

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
