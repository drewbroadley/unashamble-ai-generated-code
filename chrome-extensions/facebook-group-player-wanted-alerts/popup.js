"use strict";

const DEFAULTS = {
  enabled: true,
  groupId: "110710202292493",
  intervalMinutes: 3,
  maxAgeMinutes: 90,
  sound: true,
  backgroundCheck: true,
};

const TOGGLES = ["enabled", "sound", "backgroundCheck"];
const SELECTS = ["intervalMinutes", "maxAgeMinutes"];

const el = (id) => document.getElementById(id);

function groupUrl(id) {
  return `https://www.facebook.com/groups/${id}/?sorting_setting=CHRONOLOGICAL`;
}

chrome.storage.sync.get(DEFAULTS, (s) => {
  for (const k of TOGGLES) el(k).checked = !!s[k];
  for (const k of SELECTS) el(k).value = String(s[k]);
  el("groupId").value = s.groupId;
  el("grouplink").href = groupUrl(s.groupId);
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

el("checkNow").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "pw-poll-now" }, () => void chrome.runtime.lastError);
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

chrome.storage.local.get({ recent: [], lastCheck: 0 }, (st) => {
  el("lastCheck").textContent = ago(st.lastCheck);
  renderRecent(st.recent);
});

chrome.runtime.sendMessage({ type: "pw-clear-badge" }, () => void chrome.runtime.lastError);
