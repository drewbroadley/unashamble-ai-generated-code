const DEFAULTS = { enabled: true, dim: false, hideAmplified: false };
const KEYS = Object.keys(DEFAULTS);

const els = Object.fromEntries(KEYS.map((k) => [k, document.getElementById(k)]));
const countEl = document.getElementById("count");

// Load current settings into the toggles.
chrome.storage.sync.get(DEFAULTS, (s) => {
  for (const k of KEYS) els[k].checked = !!s[k];
});

// Persist on change.
for (const k of KEYS) {
  els[k].addEventListener("change", () => {
    chrome.storage.sync.set({ [k]: els[k].checked });
  });
}

// Ask the active LinkedIn tab how many posts it's hidden.
function refreshCount() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !/^https:\/\/www\.linkedin\.com\//.test(tab.url || "")) {
      countEl.textContent = "—";
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "lirf-get-count" }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        countEl.textContent = "0";
        return;
      }
      countEl.textContent = resp.count;
    });
  });
}

// Live updates while the popup is open.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "lirf-count") countEl.textContent = msg.count;
});

refreshCount();
