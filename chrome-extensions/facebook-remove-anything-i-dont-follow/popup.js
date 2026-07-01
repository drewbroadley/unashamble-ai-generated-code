const DEFAULTS = {
  enabled: true,
  hideSponsored: true,
  hideSuggested: true,
  hideNonFollowed: true,
  sortRecent: true,
  dim: false,
};
const KEYS = Object.keys(DEFAULTS);

const els = Object.fromEntries(KEYS.map((k) => [k, document.getElementById(k)]));
const countEl = document.getElementById("count");

chrome.storage.sync.get(DEFAULTS, (s) => {
  for (const k of KEYS) els[k].checked = !!s[k];
});

for (const k of KEYS) {
  els[k].addEventListener("change", () => {
    chrome.storage.sync.set({ [k]: els[k].checked });
  });
}

function refreshCount() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !/^https:\/\/www\.facebook\.com\//.test(tab.url || "")) {
      countEl.textContent = "—";
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "fbf-get-count" }, (resp) => {
      countEl.textContent = chrome.runtime.lastError || !resp ? "0" : resp.count;
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id) return; // only our own content script
  if (msg?.type === "fbf-count") countEl.textContent = msg.count;
});

refreshCount();
