#!/usr/bin/env node
/*
 * Parser tests for facebook-group-player-wanted-alerts.
 *
 * The corpus below is REAL: 39 consecutive posts scraped from
 * facebook.com/groups/110710202292493 (WIS - Indoor Football - Shed 1) while
 * building this extension. That is the whole point — the parser is tuned to
 * how this group actually writes, not to how we imagine they write.
 *
 * Run:  node tests/parser.test.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(
  join(ROOT, "facebook-group-player-wanted-alerts", "parser.js"),
  "utf8"
);
const sandbox = { globalThis: null };
sandbox.globalThis = sandbox;
runInNewContext(src, sandbox);
const { parsePost } = sandbox.PlayerWantedParser;

// [text, expectAlert, expectedTime, expectedPlayerCount]
// expectedPlayerCount === "team" means a whole-team request.
const CORPUS = [
  ["Needing x1 female player for Ball of Fire for our game at 2pm today, free game, please comment if you’re keen.", true, "2pm", 1],
  ["Morena, Seisma is hoping one of you lovely ladies will be able to play in our game at 2pm today. Who’s keen? Div 3, free game.", true, "2pm", 1],
  ["Need one male and one female players for Ipayroll, div 5 dree game by 11 today thanks.", true, null, 2],
  ["Bend It Like Buddle looking for 1x female for 12:30pm kickoff in Div 1 on Monday - free game!", true, "12:30pm", 1],
  ["Still need 1 more - Super Xero need 2 players for a game at 2pm tomorrow (Thurs) anyone keen for a free game?", true, "2pm", null],
  ["Seisma looking for one more player for their 1:30pm game. (Clearly too quick to post the last one!!). Div 3, free. Thanks!!", true, "1:30pm", 1],
  ["Another full team needed at 12pm. $5 to play, comment if you’re keen! GHOST DERBY", true, "12pm", "team"],
  ["Team Winning Bid is looking for 1 lady, and 1-2 substitute players for 12:30 tomorrow (Monday)", true, "12:30pm", null],
  ["Kia our koutou! The Ombuddies need a guy and a gal for our game at 2pm today. FREE GAME.", true, "2pm", 2],
  ["Looking for 1 guy and 1 girl to play for AARA etc, game is at 6:05pm tonight - thanks!", true, "6:05pm", 2],
  ["Boca Seniors (Div 1) need a Goalkeeper for 1.30 game today. Free game. Anyone available?", true, "1:30pm", 1],
  ["The Sealion Scavvies need a female player at 5:30 pm KO tonight! DM me if you're keen for a free game", true, "5:30pm", 1],
  ["Team Winning Bid is looking for one lady to play tomorrow (Tues) at 12:30pm. Mixed div 3. Also one or two subs are welcome, any gender", true, "12:30pm", null],
  ["Tusken Raiders needs one player for the cheery time of 9pm tonight. Free game! Div one. Comment below if you're keen, thanks.", true, "9pm", 1],
  ["Madshoes is looking for a player (or two for a sub as well!) for 20:25 game tonight", true, "8:25pm", null],
  ["Posting this again... feel sad seeing others being approved and not mine! WHAT DID I DO?! NEC FC need 3 players for today's game at 1.30PM - FREE", true, "1:30pm", 3],
  ["Boca Seniors are 1 short for our Div 1 game at 12pm today. Please let me know if keen. Free game.", true, "12pm", 1],
  ["Need one player for 6.05pm game tonight.Team: Tusken RaidersCost: freeWe play in white.", true, "6:05pm", 1],
  ["1 player needed for Queen's Spark Rangers, 12.30 tomorrow (Wednesday), we wear black, div3.", true, "12:30pm", 1],
  ["Hey I'd be super keen to join a team in the bottom division if anyone needs an extra player :))", false, null, null],
  ["Kia ora koutou, Welly Booters need one wahine for a 7:50pm game tomorrow night (tues 28th). appreciated, anyone keen?", true, "7:50pm", 1],
  ["*sorted for players now, thanks whānau* Looking for 2 lads to play with Electric Blue (div 1 mixed) at 1pm today. Who's keen?", false, "1pm", null],
  ["Seisma is hoping two of you lovely ladies can help us out for our game Tuesday (14th) at 12pm. Who’s keen? Free game.", true, "12pm", 2],
  ["Flexi FC one player short for a 12:30pm game today if anyone is keen for a run around", true, "12:30pm", 1],
  ["Hey whānau, Seisma are looking for one extra player for our game today at 12:30. Free Div 3 game. Any takers?", true, "12:30pm", 1],
  ["Argh. Need two for 11.30am game today. Ministry of Football. Free. Rock up and play. Thank you thank you!", true, "11:30am", 2],
  ["Kia Ora, COAH FC are needing 2 guys for a game tonight @7.15 please. If youd be happy to pay 5-10 bucks that would be great! Cheers!", true, "7:15pm", 2],
  ["PikPok Legends are looking for one player for a free game at 1:30 at the more casual end of the leagues. Any takers?", true, "1:30pm", 1],
  ["Kia Ora, Ombuddies need 1 female player for our game tomorrow (Tuesday) at 11:30am. Div 2, FREE game", true, "11:30am", 1],
  ["Hey! My friend and I are keen to join a social/casual futsal team- we’re both looking for something fun and low-pressure rather than super competitive.", false, null, null],
  ["Not sure what happened to my previous post but anyhoo! NEC FC looking for 3x players TODAY at 11am. FREE GAME", true, "11am", 3],
  ["NEC FC need 4x players for today's game at 12:30. Yup, just me playing so far. FREE GAME", true, "12:30pm", 4],
  ["Hey folks, anyone needing a player for a lunch time league team? Happy to play mixed or mens, just looking for a consistent weekly game", false, null, null],
  ["Hey folks, Flexi FC have a 1pm game today we're 2 players short for, let me know if you can help out cheers", true, "1pm", 2],
  ["Kia ora whanau, Welly Booters need one tāne (guy) player for an 8:25pm game tonight appreciated but not necessary we just need boots on the ground!", true, "8:25pm", null],
  ["Hey is there anyone out there keen to join a men's team for the season starting on Monday? We are the Princesses and will likely be in Div 3 this season", false, null, null],
  ["Hi everyone. If there's any teams looking for new players, I'm looking to join a team on Tuesday and Thursday evenings.", false, null, null],
  ["Morena Whanau. FULL TEAM wanted for 1pm today, $5 to play, comment if you’re down to clown!", true, "1pm", "team"],
  ["Update: this 11am game is cancelled What a day for some INDOOR footy! Full team needed at 11am today! $5 to play, comment if keen!", false, "11am", null],
  ["NEC FC need 2x players for today's game at 1PM - FREE 😀", true, "1pm", 2],
];

let pass = 0;
let fail = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) pass++;
  else {
    fail++;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  }
}

for (const [text, expectAlert, expectTime, expectCount] of CORPUS) {
  const snippet = text.slice(0, 52).replace(/\s+/g, " ");
  const r = parsePost(text);

  check(
    `alert? "${snippet}…"`,
    r.isCall === expectAlert,
    `got isCall=${r.isCall} (${r.reason}), expected ${expectAlert}`
  );

  if (expectTime !== null) {
    check(
      `time "${snippet}…"`,
      r.time && r.time.display === expectTime,
      `got ${r.time ? r.time.display : "none"}, expected ${expectTime}`
    );
  }

  if (expectCount === "team") {
    check(`full team "${snippet}…"`, r.players.fullTeam === true, "fullTeam not detected");
  } else if (typeof expectCount === "number") {
    check(
      `count "${snippet}…"`,
      r.players.count === expectCount,
      `got ${r.players.count}, expected ${expectCount}`
    );
  }
}


// ---- Second corpus: another 20 posts pulled from the same group a day later,
// deliberately chosen for the awkward phrasings the first pass got wrong.
const CORPUS_2 = [
  ["The Humble Bees need 1 male player for tonight (Tuesday 18th) game at 18.40", true, "6:40pm", 1],
  ["Hey, COAH FC after 2x guys to play for us tonight at 8.25. Free game! Cheers!", true, "8:25pm", 2],
  ["Full mixed team needed at 1:30pm today. $5 to play, comment if you\u2019re keen!", true, "1:30pm", "team"],
  ["Free game for 2 players at 1pm!! 1 woman + 1 player of any gender", true, "1pm", null],
  ["Ombuddies looking for one male player (free game) Kick off at 1 pm", true, "1pm", 1],
  ["MFAT FC need 1 or 2 women players for tomorrow (Tuesday 18th) game at 12.30 Please comment if keen!", true, "12:30pm", 2],
  ["One needed for Dengue Fever at 1pm. Free.", true, "1pm", 1],
  ["Pants need 2 for a div 2 game at 2.00pm today. Who can help us out?", true, "2pm", 2],
  ["Hi there! Looking for 1 female to play for 6:40pm today", true, "6:40pm", 1],
  ["Stout Street Hooligans needs 1 elite player for a div 3 game at 12pm today", true, "12pm", 1],
  ["Queens Spark Rangers needs 2 people for 1pm. We wear black", true, "1pm", 2],
  ["Need 2 players for WSP United, tomorrow at 11.", true, "11am", 2],
  ["Cobra Kai need a player for a div 1 game tonight at 7 15pm. Anyone keen?", true, "7:15pm", 1],
  ["Hello. Bomberos need three for a game tomorrow at 12:30. Thanks.", true, "12:30pm", 3],
  ["BDO need x1 girl at 11.30 if anyone is keen. Fun and free", true, "11:30am", 1],
  ["Three needed for Dengue Fever at 12:30 today (Friday). Free.", true, "12:30pm", 3],
  ["Free game Toit\u016b Te Whenua are after one player for a game at 1:30 today - div 3", true, "1:30pm", 1],
  ["Kickabouts are looking for another player for 11:30am (Div 6)", true, "11:30am", 1],
  ["Black swans need one player at 1. Div 2. Free game", true, "1pm", 1],
  ["1 Player Needed Kia ora all! We\u2019re looking for 1 player to join Rivals FC for our 4:55 PM game today.", true, "4:55pm", 1],
  ["Full team needed 2pm today, $5 to play, comment if keen whanau!!!!", true, "2pm", "team"],
  ["Cotality FC looking for 2 players tomorrow at 2pm. Anyone keen?", true, "2pm", 2],
];

for (const [text, expectAlert, expectTime, expectCount] of CORPUS_2) {
  const snippet = text.slice(0, 52).replace(/\s+/g, " ");
  const r = parsePost(text);
  check(`alert? "${snippet}\u2026"`, r.isCall === expectAlert, `got ${r.isCall} (${r.reason})`);
  if (expectTime !== null) {
    check(
      `time "${snippet}\u2026"`,
      r.time && r.time.display === expectTime,
      `got ${r.time ? r.time.display : "none"}, expected ${expectTime}`
    );
  }
  if (expectCount === "team") {
    check(`full team "${snippet}\u2026"`, r.players.fullTeam === true, "fullTeam not detected");
  } else if (typeof expectCount === "number") {
    check(
      `count "${snippet}\u2026"`,
      r.players.count === expectCount,
      `got ${r.players.count}, expected ${expectCount}`
    );
  }
}

// ---- Targeted unit checks -------------------------------------------------

const t = (s) => sandbox.PlayerWantedParser.findTime(s);
check("bare 'Div 3' is not a time", t("Div 3, free game") === null);
check("'(tues 28th)' is not a time", t("game tomorrow night (tues 28th)") === null);
check("'$5 to play' is not a time", t("$5 to play, comment if keen") === null);
check("'1-2 substitute players' is not a time", t("1-2 substitute players") === null);
check("24h '20:25' -> 8:25pm", t("20:25 game")?.display === "8:25pm");
check("'9am' stays am", t("game at 9am")?.display === "9am");
check("bare '11.30' -> am", t("11.30 game today")?.display === "11:30am");
check("bare '1.30' -> pm", t("1.30 game today")?.display === "1:30pm");

console.log(`\n${pass}/${pass + fail} parser checks passed.`);
if (fail) {
  console.error("\n✗ Failures:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("✓ All parser checks passed.");
