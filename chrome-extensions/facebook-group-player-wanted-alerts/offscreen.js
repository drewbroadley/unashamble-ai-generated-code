/*
 * Offscreen audio document.
 *
 * A Manifest V3 service worker has no DOM and therefore no way to make a
 * sound. This tiny offscreen page exists purely so the alert can be heard.
 * The chime is synthesised with the Web Audio API — no audio file is bundled,
 * downloaded, or fetched.
 */
"use strict";

let ctx = null;

function beep(startAt, frequency, duration, gainPeak) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainPeak, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

// Three rising two-tone chirps — deliberately urgent, ~1.5s total.
function chime() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  const t0 = ctx.currentTime + 0.05;
  for (let i = 0; i < 3; i++) {
    const at = t0 + i * 0.45;
    beep(at, 880, 0.16, 0.35);
    beep(at + 0.18, 1320, 0.22, 0.35);
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg?.type === "pw-play-chime") chime();
});
