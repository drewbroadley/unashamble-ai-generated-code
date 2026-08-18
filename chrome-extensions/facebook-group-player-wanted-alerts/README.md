# Facebook Group: Player Wanted Alerts

Watches one Facebook group's chronological feed and, the moment a **new** post
appears from a team looking for fill-in players, fires a loud desktop
notification that tells you **what time the game is** and **how many players
they need**.

Built for [WIS - Indoor Football - Shed 1](https://www.facebook.com/groups/110710202292493/)
(Wellington Indoor Sports), but the group ID is configurable in the popup.

> ⚽ **1:30pm today — 2 players needed**
> 1 female + 1 male · Div 3 · free
> Posted by Daniel Harrold
> _NEC FC need 2x players for today's game at 1.30PM - FREE_
> `[ Open post ]`

---

## What it does

1. **Reads the group feed** you already have open (or opens it briefly in a
   background tab — see below) and pulls out each post's id, author, body text
   and age.
2. **Classifies the post.** Only "a team needs fill-in players" posts alert.
   It deliberately stays quiet for:
   - players looking to *join* a team ("keen to join a side in Div 3")
   - posts that have already been resolved or cancelled ("*sorted, thanks*",
     "this 11am game is cancelled")
   - anything with no kick-off time in it — a time-less alert is just noise
3. **Extracts the useful bits**: kick-off time, day, number of players, whether
   they want a specific gender or a goalkeeper, division, and cost.
4. **Alerts once, obviously.** A sticky Chrome notification (`requireInteraction`,
   priority 2 — it stays on screen until you deal with it), a three-beep chime,
   and a red badge on the toolbar icon. Clicking it opens the post.

### Only new posts, never a backlog

Three separate guards, because getting this wrong is the difference between
useful and unusable:

- **A seen-set.** Every post id it has ever looked at is remembered in
  `chrome.storage.local` (most recent 500). A post alerts at most once, ever.
- **A baseline on first run.** The very first scan after you install marks
  everything currently in the feed as already-seen and alerts for none of it.
  You will not get 40 notifications about last month's games.
- **An age gate.** Posts older than your chosen window (default 1.5 hours) are
  ignored, so scrolling back through the feed can't trigger anything. Set it to
  "Any age" if you'd rather rely on the seen-set alone.

**A note on how age is measured.** This group holds posts for admin approval,
so a post can be *written* at 2pm yesterday and only *appear* in the feed 15
minutes ago. Facebook exposes both clocks — an absolute timestamp in the
permalink's `aria-label`, and the visible relative stamp ("15m"). The extension
takes whichever is **smaller**, so an approval-delayed post still counts as new.

### Keeping the feed fresh

- If you have the group open in a tab, the extension pokes that tab on a timer
  (default every 3 minutes) and reloads it — **unless the tab currently has
  focus**, in which case it just re-scans what's rendered rather than yanking
  the page out from under you.
- If no group tab is open, **background check** (on by default) opens the group
  in an inactive background tab, lets it load, reads it, and closes it again
  about a minute later. You never have to keep a tab open.

---

## Install

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Allow notifications for Chrome if macOS/Windows prompts. On macOS also check
   **System Settings → Notifications → Google Chrome** is set to **Alerts**
   (not Banners) so the alert stays on screen.
4. Click the extension icon → **Test alert** to confirm the notification and
   chime both land.

---

## What it can touch — every manifest entry, justified

| Manifest entry | Why it's there |
|---|---|
| `permissions: ["storage"]` | Your settings (`chrome.storage.sync`) and the seen-post set + recent alert list (`chrome.storage.local`). |
| `permissions: ["notifications"]` | The entire feature is a desktop notification. |
| `permissions: ["alarms"]` | An MV3 service worker is killed within seconds of going idle. `chrome.alarms` is the only supported way to run a poll on a schedule. |
| `permissions: ["offscreen"]` | Service workers have no DOM and therefore cannot play audio. A tiny offscreen document exists purely to sound the chime. |
| `host_permissions` | **None.** Not requested, not needed. |
| `content_scripts.matches: ["https://www.facebook.com/groups/*"]` | HTTPS only, and only group pages. Your Facebook home feed, Messenger, Marketplace, profiles and every other site are never touched. |
| `content_scripts.all_frames: false` | Top-level document only — no injection into embedded iframes. |
| `run_at: "document_idle"` | Nothing to do until the feed has rendered. |
| `content_security_policy` | `script-src 'self'; object-src 'self'; base-uri 'none'` — no remote code, no `eval`, no inline script. |
| `action.default_popup` | The settings popup. |
| `background.service_worker` | Owns the timer, the seen-set and the notifications. |

`chrome.tabs` is used (reload / create / remove / sendMessage) but the **`tabs`
permission is deliberately not requested** — those specific calls don't need it,
and it would grant read access to the URL and title of every tab you have open.
The tab it reloads is one that reported itself to us from inside the group; the
tab it creates is one it just opened itself.

## What data it reads, stores, or sends

- **Reads:** the text, author name, post id and timestamp of posts in the
  configured Facebook group, only while a group page is open in a tab.
- **Stores** (all local to your browser):
  - `chrome.storage.sync` — your settings: on/off, group id, check interval,
    max age, sound, background-check.
  - `chrome.storage.local` — up to 500 post ids you've already been shown, the
    last 20 alert headlines, the id of your group tab, and the last check time.
- **Sends: nothing, anywhere.** The extension makes **zero network requests of
  its own**. No analytics, no telemetry, no server, no remote config, no remote
  script. The only network traffic is Chrome loading facebook.com, exactly as it
  would if you refreshed the tab yourself.

## What it does NOT do

- Does not post, comment, react, DM, or click anything on your behalf.
- Does not read your Facebook home feed, messages, friends list, or any page
  outside `/groups/`.
- Does not read cookies, tokens, or credentials.
- Does not modify the Facebook page — it only reads the rendered DOM.
- Does not use `innerHTML`, `eval`, `new Function`, `localStorage`, or any
  remotely-loaded code.
- No bundled audio or image downloads — the chime is synthesised with the Web
  Audio API at runtime.

---

## Honest limitations

- **Facebook's DOM is a moving target.** The extension anchors on
  `[role="feed"]`, the post body's `data-ad-preview="message"` /
  `data-ad-comet-preview="message"` / `data-ad-rendering-role="story_message"`
  attributes, and the permalink `aria-label`. These were verified live against
  the real group while building it, but Facebook can rename any of them without
  notice. If alerts stop, that's the first thing to check.
- **Facebook actively fights scraping.** Post bodies are surrounded by hidden
  decoy spans repeating "Facebook", and timestamps are rendered as scrambled
  single-character spans. That's why the body is read from a specific attribute
  rather than the card's text, and why the relative timestamp falls back to the
  absolute `aria-label` when it can't be read cleanly. A post whose body sits in
  a layout without any of those three attributes is skipped rather than guessed
  at.
- **Long posts get truncated by "See more".** If the kick-off time is hidden
  behind the fold, the post is skipped rather than mis-reported. The extension
  does not click "See more" — it doesn't click anything.
- **The parser is heuristic**, tuned against 60+ real posts from this group (see
  `../tests/parser.test.mjs`). It will occasionally miscount an unusual phrasing.
  The notification always includes the original post text so you can check.
- **Bare times are guessed by league hours.** "12.30" becomes 12:30**pm** and
  "1.30" becomes 1:30**pm**, because these leagues run roughly 9am–9:30pm. A
  genuine 1:30am game would be reported wrong.
- **Photo-only posts** (a picture with no text body) are never detected.
- **Background check opens a real tab.** It's inactive and closes itself after
  about a minute, but it will briefly appear in your tab strip and will show up
  in your Facebook activity as a page view. Turn it off in the popup if you'd
  rather only ever scan a tab you opened yourself.
- **The service worker can be asleep.** Chrome may delay alarms when the machine
  is on battery saver or the browser is idle, so "every 3 minutes" is a target,
  not a guarantee.
- **It only works while Chrome is running.** No Chrome, no alerts.

## Tests

From `chrome-extensions/`:

```
node tests/parser.test.mjs    # 175 checks over 60+ real posts from the group
node tests/owasp-audit.mjs    # static security audit of every extension here
```
