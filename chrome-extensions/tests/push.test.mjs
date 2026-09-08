#!/usr/bin/env node
/*
 * Tests for the ntfy push builder in facebook-group-player-wanted-alerts.
 *
 * This is the one part of the extension that sends anything off the machine,
 * so the tests care most about the things that would be bad: publishing over
 * plain http, leaking the post body when the user asked us not to, and putting
 * a non-https `click` target from a Facebook post into the payload.
 *
 * Run:  node tests/push.test.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(
  join(ROOT, "facebook-group-player-wanted-alerts", "push.js"),
  "utf8"
);
const sandbox = { globalThis: null, crypto: webcrypto, URL, Uint8Array, setTimeout, AbortSignal };
sandbox.globalThis = sandbox;
runInNewContext(src, sandbox);
const P = sandbox.PlayerWantedPush;

let pass = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) pass++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}
function eq(name, actual, expected) {
  ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const POST = {
  id: "123",
  url: "https://www.facebook.com/groups/110710202292493/posts/123/",
  author: "Daniel Harrold",
  headline: "1:30pm today — 2 players needed",
  subline: "1 female + 1 male · Div 3 · free",
  text: "NEC FC need 2x players for today's game at 1.30PM - FREE",
};

const base = { server: "https://ntfy.sh", topic: "pw-abc123", includeText: true, post: POST };

// ---- normaliseServer ------------------------------------------------------
eq("blank server falls back to ntfy.sh", P.normaliseServer(""), "https://ntfy.sh");
eq("undefined server falls back to ntfy.sh", P.normaliseServer(undefined), "https://ntfy.sh");
eq("trailing path is stripped to the origin", P.normaliseServer("https://ntfy.example.com/x/y"), "https://ntfy.example.com");
eq("a bare hostname is assumed https", P.normaliseServer("ntfy.example.com"), "https://ntfy.example.com");
eq("http:// is rejected outright", P.normaliseServer("http://ntfy.sh"), null);
eq("non-http schemes are rejected", P.normaliseServer("ftp://ntfy.sh"), null);
eq("garbage is rejected", P.normaliseServer("https://"), null);

// ---- validTopic -----------------------------------------------------------
ok("a normal topic is valid", P.validTopic("pw-abc123"));
ok("underscores are valid", P.validTopic("player_wanted"));
ok("an empty topic is invalid", !P.validTopic(""));
ok("whitespace-only is invalid", !P.validTopic("   "));
ok("a topic with a slash is invalid", !P.validTopic("a/b"));
ok("a topic with a space is invalid", !P.validTopic("my topic"));
ok("a 65-char topic is invalid", !P.validTopic("a".repeat(65)));
ok("a 64-char topic is valid", P.validTopic("a".repeat(64)));

// ---- randomTopic ----------------------------------------------------------
const t1 = P.randomTopic(webcrypto);
const t2 = P.randomTopic(webcrypto);
ok("generated topic is valid", P.validTopic(t1), t1);
ok("generated topic is prefixed", t1.startsWith("pw-"));
ok("generated topics differ", t1 !== t2);
ok("generated topic avoids look-alike chars", !/[lo01]/.test(t1.slice(3)), t1);

// ---- buildRequest ---------------------------------------------------------
const req = P.buildRequest(base);
ok("a good config builds", req.ok, req.error);
eq("publishes to the server root (JSON publish)", req.url, "https://ntfy.sh/");
eq("content type is json", req.headers["Content-Type"], "application/json");
ok("no auth header without a token", !("Authorization" in req.headers));

const body = JSON.parse(req.body);
eq("topic travels in the body", body.topic, "pw-abc123");
eq("title mirrors the desktop headline", body.title, "⚽ 1:30pm today — 2 players needed");
eq("priority is max", body.priority, 5);
eq("click opens the post", body.click, POST.url);
ok("message carries the subline", body.message.includes("1 female + 1 male"));
ok("message carries the post text", body.message.includes("NEC FC need 2x players"));
ok("message credits the author", body.message.includes("Daniel Harrold"));

// Privacy switch: the post body must not leave when it's turned off.
const quiet = JSON.parse(P.buildRequest({ ...base, includeText: false }).body);
ok("post text is withheld when includeText is off", !quiet.message.includes("NEC FC"));
ok("subline still travels when includeText is off", quiet.message.includes("Div 3"));

// A post body is attacker-controlled text; the click target must stay https.
const evil = P.buildRequest({ ...base, post: { ...POST, url: "javascript:alert(1)" } });
ok("javascript: url never becomes a click target", !("click" in JSON.parse(evil.body)));
const insecure = P.buildRequest({ ...base, post: { ...POST, url: "http://example.com/" } });
ok("http url never becomes a click target", !("click" in JSON.parse(insecure.body)));
const noUrl = P.buildRequest({ ...base, post: { ...POST, url: undefined } });
ok("a post with no url still builds", noUrl.ok);

// Truncation keeps us well under ntfy's 4KB message cap.
const longText = "x".repeat(5000);
const long = JSON.parse(P.buildRequest({ ...base, post: { ...POST, text: longText } }).body);
ok("long post text is truncated", long.message.length < 1000, String(long.message.length));

// Token handling.
const withToken = P.buildRequest({ ...base, token: "tk_secret" });
eq("token becomes a bearer header", withToken.headers.Authorization, "Bearer tk_secret");
ok("blank token adds no header", !("Authorization" in P.buildRequest({ ...base, token: "   " }).headers));

// Bad configs are refused before any network call.
ok("http server is refused", !P.buildRequest({ ...base, server: "http://ntfy.sh" }).ok);
ok("missing topic is refused", !P.buildRequest({ ...base, topic: "" }).ok);
ok("bad topic is refused", !P.buildRequest({ ...base, topic: "a b" }).ok);

// An empty post still produces something sendable rather than a blank alert.
const bare = JSON.parse(P.buildRequest({ ...base, post: {} }).body);
ok("an empty post gets a fallback title", bare.title.length > 2);
ok("an empty post gets a fallback message", bare.message.length > 0);

// ---- send -----------------------------------------------------------------
const calls = [];
const fake = (status, throws) => (url, init) => {
  calls.push({ url, init });
  if (throws) return Promise.reject(new Error("network down"));
  return Promise.resolve({ ok: status >= 200 && status < 300, status });
};

calls.length = 0;
eq("a 200 is a success", (await P.send(base, fake(200))).ok, true);
eq("a success sends once", calls.length, 1);

calls.length = 0;
const badTopic = await P.send({ ...base, topic: "" }, fake(200));
ok("a bad config never hits the network", !badTopic.ok && calls.length === 0);

calls.length = 0;
const notFound = await P.send(base, fake(404));
ok("a 4xx fails", !notFound.ok);
eq("a 4xx is not retried", calls.length, 1);

calls.length = 0;
const rateLimited = await P.send(base, fake(429));
ok("a 429 fails after retrying", !rateLimited.ok);
eq("a 429 is retried", calls.length, 2);

calls.length = 0;
const down = await P.send(base, fake(0, true));
ok("a network error fails", !down.ok);
eq("a network error is retried", calls.length, 2);
ok("the error text is reported", /network down/.test(down.error), down.error);

calls.length = 0;
const flaky = await P.send(base, (url, init) => {
  calls.push({ url, init });
  return calls.length === 1
    ? Promise.reject(new Error("blip"))
    : Promise.resolve({ ok: true, status: 200 });
});
ok("a retry can succeed", flaky.ok);

// ---- Report ---------------------------------------------------------------
const total = pass + failures.length;
for (const f of failures) console.error(`  ✗ ${f}`);
console.log(`\n${pass}/${total} push checks passed.`);
if (failures.length) {
  console.error(`\n✗ ${failures.length} push check(s) FAILED.`);
  process.exit(1);
}
console.log("✓ All push checks passed.");
