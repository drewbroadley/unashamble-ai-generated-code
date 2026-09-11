#!/usr/bin/env python3
"""Generate docs/<extension>/index.html for each Chrome extension.

Content is hand-written below from each extension's README and manifest.json,
so the page says exactly what the README says. Re-run after editing:

    python3 scripts/build-extension-pages.py
"""
import html, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "https://github.com/drewbroadley/unashamedai"

CSS = """
  :root{--bg:#F7F8F9;--card:#FFFFFF;--ink:#1F2A30;--ink-2:#5B676D;--ink-3:#8A959A;--line:#E3E7E9;--blue:#0A93D1;--blue-soft:#E4F3FB;--warn:#FFF4E0;--warn-ink:#8A5A00;
    --title:"Poppins","Helvetica Neue",Arial,sans-serif;--body:"Lexend Deca","Helvetica Neue",Arial,sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:300 16px/1.7 var(--body);-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column}
  .wrap{width:min(92vw,880px);margin:0 auto}
  header{padding:28px 0 0;display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap}
  .brand{font:600 14px/1 var(--title);letter-spacing:.04em;text-decoration:none;color:var(--ink-2)}
  .brand span{color:var(--blue)}
  .crumb{font-size:13.5px;color:var(--ink-3)}
  .crumb a{color:var(--ink-2);text-decoration:none;border-bottom:1px solid var(--line)}
  .crumb a:hover{color:var(--blue);border-color:var(--blue)}
  .hero{padding:clamp(40px,8vh,80px) 0 clamp(24px,5vh,44px)}
  .tag{font:500 11.5px/1.4 var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--blue);background:var(--blue-soft);padding:3px 8px;border-radius:4px;display:inline-block;margin-bottom:14px}
  .hero h1{font:600 clamp(26px,4.2vw,40px)/1.15 var(--title);margin:0 0 14px;text-wrap:balance;letter-spacing:-.01em;max-width:22ch}
  .hero p{margin:0;font-size:17.5px;max-width:58ch;color:var(--ink-2)}
  .hero p b{color:var(--ink);font-weight:500}
  .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:28px}
  .fact{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  .fact b{display:block;font:600 11.5px/1.4 var(--title);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:4px}
  .fact span{font-size:14.5px;font-weight:400}
  main{flex:1;padding-bottom:clamp(40px,8vh,80px)}
  section{margin-top:40px}
  h2{font:600 13px/1.3 var(--title);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin:0 0 14px}
  h3{font:600 17px/1.3 var(--title);margin:22px 0 8px}
  p{margin:0 0 12px;max-width:66ch}
  ul,ol{margin:0 0 12px;padding-left:22px;max-width:66ch}
  li{margin:4px 0}
  li::marker{color:var(--blue)}
  b,strong{font-weight:500;color:var(--ink)}
  code{font:400 13.5px var(--mono);background:var(--card);border:1px solid var(--line);border-radius:4px;padding:1px 5px;color:var(--ink)}
  pre{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;overflow-x:auto;font:400 13px/1.55 var(--mono);margin:0 0 12px}
  pre code{border:0;padding:0;background:none}
  table{border-collapse:collapse;width:100%;font-size:14.5px;margin:0 0 12px;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .tablewrap{overflow-x:auto}
  th,td{text-align:left;padding:10px 14px;border-top:1px solid var(--line);vertical-align:top}
  th{font:600 11.5px/1.4 var(--title);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);border-top:0;background:var(--bg)}
  td:first-child{white-space:nowrap;font-weight:400}
  .callout{background:var(--blue-soft);border-radius:10px;padding:14px 18px;margin:0 0 12px;max-width:66ch;font-weight:400}
  .callout.warn{background:var(--warn);color:var(--warn-ink)}
  .callout.warn b{color:inherit}
  a{color:var(--blue)}
  .cta{display:inline-block;margin-top:8px;font:500 14px/1 var(--body);color:var(--blue);text-decoration:none;border:1px solid var(--blue);border-radius:8px;padding:11px 16px}
  .cta:hover{background:var(--blue);color:#fff}
  footer{border-top:1px solid var(--line);padding:26px 0 36px;font-size:13.5px;line-height:1.8;color:var(--ink-3)}
  footer a{color:var(--ink-2);text-decoration:none;border-bottom:1px solid var(--line)}
  footer a:hover{color:var(--blue);border-color:var(--blue)}
"""

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@600&family=Lexend+Deca:wght@300;400;500&display=swap">
<style>{css}</style>
</head>
<body>
<header class="wrap">
  <a class="brand" href="../">unashamed<span>/</span>ai</a>
  <div class="crumb"><a href="../">All projects</a> · Chrome extension</div>
</header>
"""

FOOT = """
<footer>
  <div class="wrap">
    Source, README and every line of code: <a href="{src}">{srcshort}</a><br>
    Part of <a href="../">unashamedly AI-generated</a>, a <a href="https://wearebroadleyspeaking.com/">BROADLEY/SPEAKING</a> side project. Built by AI, described by a human.
  </div>
</footer>
</body>
</html>
"""

# ---------------------------------------------------------------------------
# Each entry: slug (docs folder + chrome-extensions folder), tag, title, lede,
# facts, and a list of (heading, html) sections.  HTML here is hand-authored;
# keep it to what the extension's README actually says.
# ---------------------------------------------------------------------------

SHARED_SECURITY = """
<p>Follows the repo's shared <a href="{repo}/blob/main/chrome-extensions/SECURITY.md">security guidelines</a> (the OWASP Browser Extension Vulnerabilities Cheat Sheet): <code>storage</code> is the only permission, the content script runs HTTPS-only in the top frame, a strict CSP forbids remote code, no <code>innerHTML</code> or <code>eval</code>, no network calls, and popup&#8596;page messaging checks <code>sender.id</code>. A static audit (<code>tests/owasp-audit.mjs</code>) enforces all of that on every extension in the repo.</p>
"""

def install(folder):
    return f"""
<ol>
  <li>Download or clone the <a href="{REPO}">repo</a>.</li>
  <li>Open <code>chrome://extensions</code> and turn on <b>Developer mode</b> (top right).</li>
  <li>Click <b>Load unpacked</b> and choose the <code>chrome-extensions/{folder}</code> folder.</li>
</ol>
<a class="cta" href="{REPO}/tree/main/chrome-extensions/{folder}">View the source and README →</a>
"""

def touch_table(rows):
    body = "".join(f"<tr><td><code>{html.escape(k)}</code></td><td>{v}</td></tr>" for k, v in rows)
    return f'<div class="tablewrap"><table><tr><th>Manifest entry</th><th>Why it is there</th></tr>{body}</table></div>'

FEED_FILTER_TOUCH = lambda site, match: touch_table([
    ('permissions: ["storage"]', "Your popup settings, kept in <code>chrome.storage.sync</code>. That is the only permission requested."),
    ("host_permissions", "<b>None.</b> Not requested, not needed."),
    (f'content_scripts.matches: ["{match}"]', f"HTTPS only, and only {site}. No other site is touched."),
    ("content_scripts.all_frames: false", "Top-level document only; nothing is injected into embedded iframes."),
    ('run_at: "document_start"', "So the page is filtered as it renders rather than flashing unfiltered first."),
    ("content_security_policy", "<code>script-src 'self'</code>: no remote code, no <code>eval</code>, no inline script."),
])

NO_NETWORK = """<div class="callout"><b>Zero network requests, zero data sent anywhere.</b> No analytics, no telemetry, no remote config, no remote script. The only network traffic is the site itself loading, exactly as it would without the extension. Your settings live in <code>chrome.storage.sync</code> (so they follow your Chrome profile) and nothing else is stored.</div>"""

EXTENSIONS = [
  dict(
    slug="facebook-remove-anything-i-dont-follow",
    tag="Chrome extension · Facebook",
    title="Facebook Feed: Only Friends & Follows",
    desc="Strips your Facebook home feed down to friends, Pages and people you follow, and groups you are in. Hides Sponsored ads, Suggested for you, People you may know and Reels.",
    lede="Strips your Facebook home feed down to just the content you asked for: posts from <b>friends</b>, <b>Pages and people you follow</b>, and <b>groups you are in</b>. Sponsored ads, Suggested for you, People you may know, Reels and posts from accounts you don't follow are removed.",
    facts=[("Version","1.0.0"),("Permissions","storage only"),("Runs on","www.facebook.com, HTTPS, top frame"),("Network","None")],
    sections=[
      ("What gets hidden", """
<div class="tablewrap"><table><tr><th>Signal</th><th>How it is detected</th></tr>
<tr><td>Sponsored / Ads</td><td>The reconstructed <em>visible</em> "Ad" / "Sponsored" label, or an ad call-to-action button such as "Shop now".</td></tr>
<tr><td>People you may know, Suggested, Reels, Pages for you</td><td>The module header's <code>aria-label</code>.</td></tr>
<tr><td>Accounts you don't follow</td><td>A Follow / Add friend / Join button in the post header.</td></tr>
</table></div>
<p>Everything else, meaning friends, Pages and people you already follow, groups you are in and your own posts, is kept. It also switches the home feed to <b>Most recent</b> (chronological) by redirecting <code>facebook.com/</code> to <code>facebook.com/?sk=h_chr</code>, once per tab session so it can never loop; that can be turned off in the popup.</p>
"""),
      ("Why Facebook is the hard one", """
<p>Facebook actively fights feed filtering, so naive text matching fails. Three specific tricks are worked around:</p>
<ul>
<li><b>No stable anchors.</b> Class names are randomised and there is no <code>role="feed"</code>. The feed list is found heuristically as the element whose children are post cards, each containing an "Actions for this post" menu.</li>
<li><b>Decoy text and a scrambled "Sponsored".</b> Hidden spans repeating "Facebook" poison <code>textContent</code>, and the Sponsored label is rendered as dozens of single-character spans, real letters plus ~50 decoys, CSS-reordered and pushed outside the clip box. It even seeds decoy letters into non-ads as a honeypot. So the extension never trusts raw text: it keeps only the characters whose box lies inside the label's box, reads them left to right, and gets the true label ("Ad", "Sponsored", or a timestamp like "52m").</li>
<li><b>Clean accessibility labels.</b> Facebook keeps <code>aria-label</code>s honest for screen readers, so those carry the reliable signals: ad buttons, module headers, and Follow / Add friend / Join buttons.</li>
</ul>
"""),
      ("Options (toolbar popup)", """
<ul>
<li><b>Filter feed</b>: master on/off.</li>
<li><b>Hide Sponsored / Ads</b>, <b>Hide Suggested & Reels</b>, <b>Hide accounts I don't follow</b>: each independently.</li>
<li><b>Dim instead of remove</b>: fade and collapse hidden posts, hover to peek, so you can check what is being filtered.</li>
<li>A live count of posts hidden on the current page.</li>
</ul>
"""),
      ("What it can touch", FEED_FILTER_TOUCH("facebook.com", "https://www.facebook.com/*") + NO_NETWORK),
      ("What it does not do", """
<ul>
<li>Does not post, react, comment, click or follow anything on your behalf.</li>
<li>Does not read messages, your friends list, cookies, tokens or credentials.</li>
<li>Does not touch the right-rail "Sponsored" boxes; they sit outside the main feed and are left alone.</li>
<li>Does not load anything from the network, ever.</li>
</ul>
"""),
      ("Honest caveats", """
<ul>
<li>Facebook's ad obfuscation is a moving target. The visible-label reconstruction is robust today; if Facebook changes the technique, <code>renderedLabel()</code> / <code>hasSponsoredLabel()</code> in <code>content.js</code> are where to adjust. For bullet-proof ad blocking a dedicated blocker with maintained filter lists is still the gold standard.</li>
<li>A friend who is also shown as a suggested follow is an edge case: relationship is read from the header buttons, so turn "Hide accounts I don't follow" off if it feels too aggressive.</li>
</ul>
"""),
      ("Security", SHARED_SECURITY.format(repo=REPO)),
      ("Install", install("facebook-remove-anything-i-dont-follow")),
    ]),

  dict(
    slug="linkedin-remove-anything-i-dont-follow",
    tag="Chrome extension · LinkedIn",
    title="LinkedIn Feed: Only 1st Connections & Follows",
    desc="Hides everything in your LinkedIn feed except posts from your 1st-degree connections and accounts you already follow.",
    lede="Strips your LinkedIn home feed down to <b>only</b> the content you actually asked for: posts from your <b>1st-degree connections</b> and <b>accounts you already follow</b>. Promoted ads, Suggested posts, 2nd and 3rd-degree strangers, and posts that only appeared because someone reposted, liked or commented on them are hidden.",
    facts=[("Version","1.0.0"),("Permissions","storage only"),("Runs on","www.linkedin.com, HTTPS, top frame"),("Network","None")],
    sections=[
      ("How it decides", """
<p>LinkedIn's feed uses rotating, obfuscated class names and no stable post id, so ordinary selectors break constantly. The extension keys off signals that survive:</p>
<ol>
<li><b>Post boundary.</b> Every feed item is wrapped in an element with <code>data-lazy-mount-id</code>, and real posts begin their text with "Feed post".</li>
<li><b>Connection degree.</b> The actor header shows <code>• 1st</code> / <code>• 2nd</code> / <code>• 3rd+</code>. 1st-degree posts are always kept.</li>
<li><b>Relationship buttons.</b> For everyone else the decision is read from the real buttons LinkedIn renders (matched on <code>aria-label</code>): <em>Following</em> / <em>Unfollow</em> means kept, <em>Follow …</em> or <em>Invite … to connect</em> means hidden, and no relationship button at all means your own post or a Page you follow, so kept.</li>
</ol>
<p>Always removed on top of that: ads ("Promoted by …", "Sponsored", or a Promoted label on a degree-less company post; a connection's post that merely <em>contains</em> the word "Promoted" is not hidden, that false positive was found and fixed), "Suggested" posts, "… follows this Page" items, and recommendation modules such as "Jobs recommended for you" and "People you may know". It can also switch the sort from Top to Recent, but only when the feed is on Top, so a manual choice is never overridden.</p>
"""),
      ("Options (toolbar popup)", """
<ul>
<li><b>Filter feed</b>: master on/off.</li>
<li><b>Hide reposts & reactions</b>: stricter mode that also drops posts surfaced because someone reposted, liked or commented, even from connections, leaving only their own original posts. Off by default.</li>
<li><b>Dim instead of remove</b>: fade and collapse hidden posts, hover to peek.</li>
<li>A live count of posts hidden on the current page. Settings sync via <code>chrome.storage.sync</code> and apply instantly.</li>
</ul>
"""),
      ("What it can touch", FEED_FILTER_TOUCH("linkedin.com", "https://www.linkedin.com/*") + NO_NETWORK),
      ("What it does not do", """
<ul>
<li>Does not post, react, comment, connect, follow or message anyone on your behalf.</li>
<li>Does not read your messages, connections list, cookies, tokens or credentials.</li>
<li>Does not load anything from the network, ever.</li>
</ul>
"""),
      ("Honest caveats", """
<ul>
<li>The whole policy lives in <code>classify()</code> in <code>content.js</code>. If LinkedIn changes its wording, the Promoted / Suggested labels and the Follow / Connect button checks are the regexes to adjust.</li>
<li><code>textContent</code> concatenates inline elements with no whitespace ("postSuggestedVennie"), so matching uses substrings anchored to the header region rather than word boundaries; an unusual header layout could slip past.</li>
</ul>
"""),
      ("Security", SHARED_SECURITY.format(repo=REPO)),
      ("Install", install("linkedin-remove-anything-i-dont-follow")),
    ]),

  dict(
    slug="reddit-remove-promoted-keep-rising",
    tag="Chrome extension · Reddit",
    title="Reddit: Hide Promoted & Keep Rising",
    desc="Removes Promoted and Sponsored ads from the Reddit home feed and keeps the feed sorted by Rising instead of Best.",
    lede="Removes <b>Promoted / Sponsored</b> ads from the Reddit home feed and <b>keeps the feed sorted by Rising</b> instead of the default “Best”.",
    facts=[("Version","1.0.0"),("Permissions","storage only"),("Runs on","www.reddit.com, HTTPS, top frame"),("Network","None")],
    sections=[
      ("How it works", """
<p>Reddit's current UI ("shreddit") is built from clean, semantic web components, so nothing needs de-obfuscating:</p>
<ul>
<li><b>Hide ads.</b> Every feed ad is a <code>&lt;shreddit-ad-post&gt;</code> element carrying a <code>promoted</code> attribute, separated from real posts by <code>&lt;hr&gt;</code> rules. The extension hides each ad plus its trailing rule so no double divider is left behind.</li>
<li><b>Keep Rising.</b> The Rising sort lives at the stable URL <code>/rising/</code>. Landing on the default home feed (<code>/</code>, <code>?feed=home</code> or <code>/best/</code>) redirects there. No loop risk: <code>/rising/</code> is never itself redirected, and sorts you pick explicitly (<code>/hot/</code>, <code>/new/</code>, <code>/top/</code>) are left alone.</li>
</ul>
<p>A <code>MutationObserver</code> re-applies the filter as you scroll and as the feed lazy-loads more posts.</p>
"""),
      ("Options (toolbar popup)", """
<ul>
<li><b>Enable</b>: master on/off.</li>
<li><b>Hide Promoted / Sponsored</b> and <b>Keep feed sorted by Rising</b>: each independently.</li>
<li><b>Dim instead of remove</b>: fade and collapse hidden posts, hover to peek.</li>
<li>A live count of promoted posts hidden on the page.</li>
</ul>
"""),
      ("What it can touch", FEED_FILTER_TOUCH("reddit.com", "https://www.reddit.com/*") + NO_NETWORK),
      ("What it does not do", """
<ul>
<li>Does not vote, post, comment or subscribe on your behalf.</li>
<li>Does not read cookies, tokens or credentials.</li>
<li>Does not load anything from the network, ever.</li>
</ul>
"""),
      ("Honest caveats", """
<ul>
<li>Only the current <code>www.reddit.com</code> design is supported, not <code>old.reddit.com</code>.</li>
<li>If Reddit renames the ad element, the <code>shreddit-ad-post</code> selector in <code>content.js</code> is the one line to change.</li>
</ul>
"""),
      ("Security", SHARED_SECURITY.format(repo=REPO)),
      ("Install", install("reddit-remove-promoted-keep-rising")),
    ]),

  dict(
    slug="trademe-remove-promoted-listings",
    tag="Chrome extension · Trade Me",
    title="Trade Me: Hide Promoted & Sponsored",
    desc="Removes Sponsored and Promoted listings and Advertisements from Trade Me search results and browsing, leaving only the organic listings.",
    lede="Removes <b>Sponsored / Promoted listings</b> and <b>Advertisements</b> from Trade Me search results and category browsing, leaving only the organic listings. Works in both List and Gallery views.",
    facts=[("Version","1.0.0"),("Permissions","storage only"),("Runs on","*.trademe.co.nz, HTTPS, top frame"),("Network","None")],
    sections=[
      ("How it works", """
<p>Trade Me is an Angular app built from clean custom elements, so the signals are stable tag names rather than anything that needs de-obfuscating:</p>
<div class="tablewrap"><table><tr><th>Target</th><th>Selector</th><th>Action</th></tr>
<tr><td>Sponsored / Promoted listing</td><td><code>tm-sponsored-listings-tag</code></td><td>hide its <code>tg-col</code> grid cell</td></tr>
<tr><td>Promoted "super feature" card</td><td><code>.tm-marketplace-search-card--super-feature</code></td><td>hide its <code>tg-col</code> grid cell</td></tr>
<tr><td>Display ad</td><td><code>tm-display-ad-wrapper</code>, <code>tm-fuse-display-ad</code>, <code>tm-adsense</code></td><td>hide its <code>tg-col</code> (or the ad)</td></tr>
<tr><td>Top banner ad</td><td><code>tm-shell-leaderboard-ad</code></td><td>hide the banner</td></tr>
</table></div>
<p>Each listing lives in a <code>tg-col</code> grid cell, so hiding the whole cell lets the results grid reflow with no gaps. A <code>MutationObserver</code> re-applies the filter as you paginate, change filters or switch views.</p>
"""),
      ("Options (toolbar popup)", """
<ul>
<li><b>Declutter listings</b>: master on/off.</li>
<li><b>Hide Sponsored / Promoted</b> and <b>Hide Advertisements</b> (display ads plus the top banner): each independently.</li>
<li><b>Dim instead of remove</b>: fade and collapse hidden items, hover to peek.</li>
<li>A live count of items hidden on the current page.</li>
</ul>
"""),
      ("What it can touch", FEED_FILTER_TOUCH("trademe.co.nz", "https://*.trademe.co.nz/*") + NO_NETWORK),
      ("What it does not do", """
<ul>
<li>Does not bid, buy, watch, message or list anything on your behalf.</li>
<li>Does not read cookies, tokens or credentials.</li>
<li>Does not hide organic listings, including ones that merely carry a "Save 20%" discount badge; only paid placement goes.</li>
<li>Does not load anything from the network, ever.</li>
</ul>
"""),
      ("Honest caveats", """
<ul>
<li>Trade Me's component tag names are stable, but if they are ever renamed the selectors in <code>content.js</code> are where to adjust.</li>
</ul>
"""),
      ("Security", SHARED_SECURITY.format(repo=REPO)),
      ("Install", install("trademe-remove-promoted-listings")),
    ]),

  dict(
    slug="facebook-group-player-wanted-alerts",
    tag="Chrome extension · Facebook groups",
    title="Facebook Group: Player Wanted Alerts",
    desc="Watches one Facebook group's feed for new 'team needs players' posts and fires a loud, sticky desktop notification with the kick-off time and how many players are wanted. Optional push to your phone.",
    lede="Watches one Facebook group's chronological feed and, the moment a <b>new</b> post appears from a team looking for fill-in players, fires a loud desktop notification that tells you <b>what time the game is</b> and <b>how many players they need</b>. Optionally, the same alert as a <b>push to your phone</b>. Built for a Wellington indoor football group; the group id is configurable.",
    facts=[("Version","1.2.0"),("Permissions","storage, notifications, alarms, offscreen"),("Runs on","facebook.com/groups/*, HTTPS, top frame"),("Network","None, unless you turn on phone push")],
    sections=[
      ("What it does", """
<div class="callout">⚽ <b>1:30pm today — 2 players needed</b><br>1 female + 1 male · Div 3 · free<br><span style="color:var(--ink-2)">Posted by Daniel Harrold · <em>NEC FC need 2x players for today's game at 1.30PM - FREE</em></span></div>
<ol>
<li><b>Reads the group feed</b> you already have open (or opens it briefly in a background tab) and pulls out each post's id, author, text and age.</li>
<li><b>Classifies the post.</b> Only "a team needs fill-in players" posts alert. It stays quiet for players looking to <em>join</em> a team, posts already sorted or cancelled, and anything with no kick-off time in it.</li>
<li><b>Extracts the useful bits</b>: kick-off time, day, number of players, whether they want a specific gender or a goalkeeper, division and cost.</li>
<li><b>Alerts once, obviously.</b> A sticky Chrome notification that stays until you deal with it, a three-beep chime, and a red badge on the toolbar icon. Clicking it opens the post.</li>
<li><b>Optionally pushes it to your phone</b> via <a href="https://ntfy.sh">ntfy</a>. Off by default, and the only thing this extension ever sends anywhere.</li>
</ol>
<h3>Only new posts, never a backlog</h3>
<ul>
<li><b>A seen-set.</b> Every post id it has looked at is remembered locally (most recent 500). A post alerts at most once, ever.</li>
<li><b>A baseline on first run.</b> The first scan after install marks everything already in the feed as seen and alerts for none of it.</li>
<li><b>An age gate.</b> Posts older than your chosen window (default 1.5 hours) are ignored, so scrolling back can't trigger anything. Because this group holds posts for admin approval, age is the smaller of the post's written time and its visible "15m" stamp, so an approval-delayed post still counts as new.</li>
</ul>
<h3>Keeping the feed fresh</h3>
<p>If the group is open in a tab, that tab is reloaded on a timer (default every 3 minutes) unless it currently has focus, in which case it is just re-scanned. If no group tab is open, <b>background check</b> (on by default) opens the group in an inactive tab, reads it, and closes it about a minute later.</p>
"""),
      ("Phone push (optional)", """
<p>Chrome only alerts the machine it runs on. <b>Also alert my phone</b> sends the same alert through <a href="https://ntfy.sh">ntfy</a>, a free pub/sub notification service with no account and no signup: your desktop publishes to a <em>topic</em>, the ntfy app on your phone is subscribed to it and rings. Setup is about two minutes: install the ntfy app, click <b>Generate a topic</b> in the popup, subscribe to that topic in the app, switch the option on, and <b>Test phone push</b>.</p>
<div class="callout warn"><b>The topic name is both the address and the password.</b> ntfy.sh has no accounts; anyone who knows or guesses your topic can read every alert you receive (including, by default, the post text with team and poster names) and send you fake alerts. That is why the popup generates a 20-character random topic instead of letting you type "football". You can also turn <b>Include the post text</b> off, self-host ntfy (HTTPS only), or use an access token on a protected topic. All three are supported.</div>
<ul>
<li>Push is best-effort; the desktop notification is not. The push is sent <em>after</em> the desktop notification, so a dead network never costs you the alert on the machine you are at.</li>
<li>One retry, then it gives up, and the failure is shown in the popup's status line.</li>
<li>It still needs Chrome running on the desktop. The phone is a second screen, not an independent watcher.</li>
<li>ntfy.sh is a free public service run by a third party; it can be slow, rate-limited or down. Self-host if that matters.</li>
<li>The topic and token live in <code>chrome.storage.sync</code>, so they follow your Chrome profile.</li>
</ul>
"""),
      ("What it can touch", touch_table([
        ('permissions: ["storage"]', "Your settings (<code>chrome.storage.sync</code>) and the seen-post set plus recent alert list (<code>chrome.storage.local</code>)."),
        ('permissions: ["notifications"]', "The entire feature is a desktop notification."),
        ('permissions: ["alarms"]', "An MV3 service worker is killed within seconds of going idle; <code>chrome.alarms</code> is the only supported way to poll on a schedule."),
        ('permissions: ["offscreen"]', "Service workers have no DOM and cannot play audio. A tiny offscreen document exists purely to sound the chime."),
        ("host_permissions", "<b>None.</b> Not requested, not needed."),
        ('optional_host_permissions: ["https://ntfy.sh/*"]', "Phone push only. <b>Optional</b>: not granted at install, requested the moment you switch phone push on, revocable any time from <code>chrome://extensions</code>. One origin, no wildcards. Leave phone push off and it is never granted."),
        ('content_scripts.matches: ["https://www.facebook.com/groups/*"]', "HTTPS only, and only group pages. Your home feed, Messenger, Marketplace, profiles and every other site are never touched."),
        ("content_scripts.all_frames: false", "Top-level document only."),
        ("content_security_policy", "<code>script-src 'self'; object-src 'self'; base-uri 'none'</code>: no remote code, no <code>eval</code>, no inline script."),
      ]) + """
<p>The <code>tabs</code> permission is deliberately <b>not</b> requested even though the extension reloads, creates and closes tabs: those specific calls don't need it, and it would grant read access to the URL and title of every tab you have open.</p>
<h3>What data it reads, stores or sends</h3>
<ul>
<li><b>Reads</b> the text, author name, post id and timestamp of posts in the configured group, only while a group page is open in a tab.</li>
<li><b>Stores</b>, all locally in your browser: your settings, up to 500 already-seen post ids, the last 20 alert headlines, the id of your group tab and the last check time.</li>
<li><b>Sends nothing at all unless you turn on phone push.</b> With phone push off, the default, the extension makes zero network requests of its own. With it on, one HTTPS POST per new alert goes to ntfy.sh (or your own server) carrying the topic, the headline, the summary line, the post text if you allow it, the author's name and a link to the post. Nothing that identifies you, your browser or your machine is included; ntfy sees your IP address, as any server you POST to does.</li>
</ul>
"""),
      ("What it does not do", """
<ul>
<li>Does not post, comment, react, DM or click anything on your behalf. It does not even click "See more".</li>
<li>Does not read your home feed, messages, friends list, or any page outside <code>/groups/</code>.</li>
<li>Does not read cookies, tokens or credentials, and does not modify the Facebook page.</li>
<li>Does not read anything back from ntfy; publishing is one-way and nothing the server returns is parsed or acted on.</li>
<li>No <code>innerHTML</code>, <code>eval</code>, <code>localStorage</code> or remotely loaded code. The chime is synthesised with the Web Audio API; there are no bundled downloads.</li>
</ul>
"""),
      ("Honest limitations", """
<ul>
<li><b>Facebook's DOM is a moving target.</b> The extension anchors on <code>[role="feed"]</code>, three specific post-body attributes and the permalink's <code>aria-label</code>, all verified live against the real group. Facebook can rename any of them without notice; if alerts stop, that is the first thing to check.</li>
<li><b>Facebook fights scraping</b> with decoy spans and scrambled timestamps, which is why the body is read from a specific attribute and a post without one is skipped rather than guessed at.</li>
<li><b>Long posts truncated by "See more"</b> are skipped if the kick-off time is behind the fold, rather than mis-reported.</li>
<li><b>The parser is heuristic</b>, tuned against 60+ real posts (175 checks in <code>tests/parser.test.mjs</code>). It will occasionally miscount an unusual phrasing; the notification always includes the original text so you can check.</li>
<li><b>Bare times are guessed by league hours</b>: "1.30" becomes 1:30pm because these leagues run roughly 9am to 9:30pm. A genuine 1:30am game would be reported wrong.</li>
<li><b>Photo-only posts</b> are never detected.</li>
<li><b>Background check opens a real tab.</b> It is inactive and closes itself, but it will briefly appear in your tab strip and count as a page view on Facebook. Turn it off if you'd rather only scan a tab you opened yourself.</li>
<li><b>The service worker can be asleep.</b> Chrome may delay alarms on battery saver or when idle, so "every 3 minutes" is a target, not a guarantee.</li>
<li><b>It only works while Chrome is running</b>, on the desktop <em>or</em> the phone.</li>
</ul>
"""),
      ("Tests", """
<p>From <code>chrome-extensions/</code>:</p>
<pre><code>node tests/parser.test.mjs    # 175 checks over 60+ real posts from the group
node tests/push.test.mjs      # 54 checks on the ntfy payload builder + retries
node tests/owasp-audit.mjs    # static security audit of every extension here</code></pre>
"""),
      ("Install", install("facebook-group-player-wanted-alerts") + """
<p style="margin-top:14px">Then allow notifications for Chrome if macOS or Windows prompts. On macOS also set <b>System Settings → Notifications → Google Chrome</b> to <b>Alerts</b> (not Banners) so the alert stays on screen, and click <b>Test alert</b> in the popup to confirm the notification and chime both land.</p>
"""),
    ]),
]


def build(ext):
    src = f"{REPO}/tree/main/chrome-extensions/{ext['slug']}"
    out = HEAD.format(title=html.escape(ext["title"]), desc=html.escape(ext["desc"]), css=CSS)
    facts = "".join(f'<div class="fact"><b>{html.escape(k)}</b><span>{html.escape(v)}</span></div>' for k, v in ext["facts"])
    out += f"""
<section class="hero wrap">
  <div class="tag">{html.escape(ext['tag'])}</div>
  <h1>{html.escape(ext['title'])}</h1>
  <p>{ext['lede']}</p>
  <div class="facts">{facts}</div>
</section>
<main class="wrap">
"""
    for heading, body in ext["sections"]:
        out += f"<section>\n<h2>{html.escape(heading)}</h2>\n{body.strip()}\n</section>\n"
    out += "</main>\n"
    out += FOOT.format(src=src, srcshort=f"github.com/drewbroadley/unashamedai/chrome-extensions/{ext['slug']}")
    return out


def readme(ext):
    return f"""# {ext['title']}

The web page for the [{ext['title']}]({REPO}/tree/main/chrome-extensions/{ext['slug']})
Chrome extension, live at
[unashamedai.broadley.org.nz/{ext['slug']}/](https://unashamedai.broadley.org.nz/{ext['slug']}/).

It is a one-file static page that restates the extension's README (what it does,
every permission and why, what data it reads or sends, what it deliberately does
not do, the honest caveats, and how to install it) in the site's house style.
The extension's README remains the source of truth; if the two disagree, fix the
page.

The page is generated by [`scripts/build-extension-pages.py`]({REPO}/blob/main/scripts/build-extension-pages.py);
edit the content there and re-run it rather than editing `index.html` by hand.

## What the page can touch

Static HTML. No build step on the site, no JavaScript, no cookies, no storage.
One outbound request, to Google Fonts for Poppins and Lexend Deca; if that is
blocked the page falls back to system fonts. Nothing else is fetched and nothing
is sent anywhere.
"""


if __name__ == "__main__":
    for ext in EXTENSIONS:
        d = os.path.join(ROOT, "docs", ext["slug"])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w") as f:
            f.write(build(ext))
        with open(os.path.join(d, "README.md"), "w") as f:
            f.write(readme(ext))
        print("wrote docs/" + ext["slug"])
