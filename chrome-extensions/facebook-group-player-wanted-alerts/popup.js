"use strict";

const DEFAULTS = {
  enabled: true,
  groupId: "110710202292493",
  intervalMinutes: 3,
  maxAgeMinutes: 90,
  sound: true,
  backgroundCheck: true,
  phonePush: false,
  ntfyServer: "https://ntfy.sh",
  ntfyTopic: "",
  ntfyToken: "",
  pushIncludeText: true,
};

const TOGGLES = ["enabled", "sound", "backgroundCheck", "phonePush", "pushIncludeText"];
const SELECTS = ["intervalMinutes", "maxAgeMinutes"];
const TEXTS = ["ntfyTopic", "ntfyServer", "ntfyToken"];

const el = (id) => document.getElementById(id);

function groupUrl(id) {
  return `https://www.facebook.com/groups/${id}/?sorting_setting=CHRONOLOGICAL`;
}

chrome.storage.sync.get(DEFAULTS, (s) => {
  for (const k of TOGGLES) el(k).checked = !!s[k];
  for (const k of SELECTS) el(k).value = String(s[k]);
  el("groupId").value = s.groupId;
  el("grouplink").href = groupUrl(s.groupId);
  for (const k of TEXTS) el(k).value = s[k] || "";
});

for (const k of TOGGLES) {
  el(k).addEventListener("change", () => chrome.storage.sync.set({ [k]: el(k).checked }));
}
for (const k of SELECTS) {
  el(k).addEventListener("change", () => chrome.storage.sync.set({ [k]: Number(el(k).value) }));
}
el("groupId").addEventListener("change", () => {
  const clean = el("groupId").value.replace(/[^0-9A-Za-z._-]/g, "").slice(0, 60);
  el("groupId").value = clean;
  el("grouplink").href = groupUrl(clean);
  chrome.storage.sync.set({ groupId: clean });
});

for (const k of TEXTS) {
  el(k).addEventListener("change", () => {
    chrome.storage.sync.set({ [k]: el(k).value.trim() }, refreshPushState);
  });
}

// ---- Phone push -----------------------------------------------------------

const NTFY_ORIGIN = "https://ntfy.sh/*";

/**
 * Ask for host access to the push server. Must be called straight off a click:
 * awaiting anything first costs us the user gesture Chrome requires.
 *
 * Only ntfy.sh is declared in optional_host_permissions, so that is the only
 * origin we can ask for. A self-hosted server falls back to the plain CORS
 * path, which works because ntfy allows cross-origin publishing by default.
 */
function requestHostAccess() {
  return new Promise((resolve) => {
    try {
      chrome.permissions.request({ origins: [NTFY_ORIGIN] }, (granted) =>
        resolve(!chrome.runtime.lastError && granted)
      );
    } catch (_) {
      resolve(false);
    }
  });
}

el("phonePush").addEventListener("click", () => {
  if (el("phonePush").checked) requestHostAccess();
});

el("genTopic").addEventListener("click", () => {
  const topic = PlayerWantedPush.randomTopic();
  el("ntfyTopic").value = topic;
  chrome.storage.sync.set({ ntfyTopic: topic }, refreshPushState);
});

el("testPush").addEventListener("click", () => {
  requestHostAccess();
  el("pushDetail").textContent = "sending…";
  chrome.runtime.sendMessage({ type: "pw-test-push" }, (r) => {
    if (chrome.runtime.lastError) return;
    el("pushDetail").textContent = r && r.ok ? "test push sent" : `failed: ${(r && r.error) || "?"}`;
  });
});

function renderPushState(s, lastPush) {
  const topicOk = PlayerWantedPush.validTopic(s.ntfyTopic);
  const serverOk = PlayerWantedPush.normaliseServer(s.ntfyServer) !== null;

  if (!s.phonePush) {
    el("pushState").textContent = "Phone push is off";
    el("pushDetail").textContent = "nothing leaves this machine";
    return;
  }
  if (!topicOk || !serverOk) {
    el("pushState").textContent = "Phone push needs setup";
    el("pushDetail").textContent = !serverOk
      ? "server must be an https:// URL"
      : "pick a topic, then subscribe to it in the ntfy app";
    return;
  }

  el("pushState").textContent = `Pushing to ${s.ntfyTopic}`;
  if (!lastPush || !lastPush.at) {
    el("pushDetail").textContent = "no pushes sent yet — try Test phone push";
  } else if (lastPush.ok) {
    el("pushDetail").textContent = `last push delivered ${ago(lastPush.at)}`;
  } else {
    el("pushDetail").textContent = `⚠ last push failed ${ago(lastPush.at)}: ${lastPush.error}`;
  }
}

function refreshPushState() {
  chrome.storage.sync.get(DEFAULTS, (s) => {
    chrome.storage.local.get({ lastPush: null }, (st) => renderPushState(s, st.lastPush));
  });
}

el("checkNow").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "pw-poll-now" }, () => void chrome.runtime.lastError);
  setTimeout(refreshStatus, 1200);
});
// Bypasses the "use the open tab" path so you can test the background route
// on demand instead of waiting for a tick.
el("forceBg").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "pw-poll-now", force: true }, () => void chrome.runtime.lastError);
  setTimeout(refreshStatus, 4000);
});
el("test").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "pw-test-alert" }, () => void chrome.runtime.lastError);
});

function ago(ts) {
  if (!ts) return "—";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function renderRecent(recent) {
  const list = el("recent");
  while (list.firstChild) list.removeChild(list.firstChild);

  if (!recent || !recent.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nothing yet.";
    list.appendChild(li);
    return;
  }

  for (const item of recent.slice(0, 8)) {
    const li = document.createElement("li");

    const a = document.createElement("a");
    a.href = item.url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = item.headline || "New post";
    li.appendChild(a);

    const meta = document.createElement("small");
    const bits = [];
    if (item.subline) bits.push(item.subline);
    if (item.author) bits.push(item.author);
    bits.push(ago(item.at));
    meta.textContent = bits.join(" · ");
    li.appendChild(meta);

    list.appendChild(li);
  }
}

function describeResult(r) {
  if (!r) return "last checked";
  const bits = [`via ${r.source}`];
  if (r.baseline) bits.push("baseline (no alerts)");
  else bits.push(`${r.scanned} matching post${r.scanned === 1 ? "" : "s"}, ${r.fresh} new`);
  if (!r.feedSeen) bits.push("⚠ feed not found");
  return bits.join(" · ");
}

function refreshStatus() {
  chrome.storage.local.get({ recent: [], lastCheck: 0, lastResult: null }, (st) => {
    el("lastCheck").textContent = ago(st.lastCheck);
    el("lastResult").textContent = describeResult(st.lastResult);
    renderRecent(st.recent);
  });
  refreshPushState();
}

refreshStatus();

chrome.runtime.sendMessage({ type: "pw-clear-badge" }, () => void chrome.runtime.lastError);
