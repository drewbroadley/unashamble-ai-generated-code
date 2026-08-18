/*
 * Player-Wanted post parser
 * --------------------------------------------------------------------------
 * Pure text -> structured data. No DOM, no chrome APIs, no network. Lives in
 * its own file so `tests/parser.test.mjs` can exercise it against a corpus of
 * real posts scraped from the group.
 *
 * The job: given the body text of a Facebook group post, decide
 *   (a) is a TEAM asking for FILL-IN PLAYERS?  (as opposed to a player asking
 *       to join a team, a league announcement, or a "sorted, thanks" update)
 *   (b) what time is the game?
 *   (c) how many players do they need, and of what kind?
 *
 * Everything is best-effort and deliberately conservative: if we can't find a
 * kick-off time we don't alert, because "2pm today" is the whole point of the
 * notification and a time-less alert is just noise.
 */
(function (root) {
  "use strict";

  // ---- Vocabulary ---------------------------------------------------------

  // Nouns that mean "a person to play". Includes te reo Māori (wahine/tāne)
  // and the local slang this group actually uses.
  const NOUN =
    "players?|guys?|lads?|blokes?|dudes?|girls?|gals?|ladies|lady|females?|males?|women|woman|men|man|wahine|w[aā]hine|t[aā]ne|subs?|substitutes?|goalkeepers?|goalies?|keepers?|gks?|bodies|humans?|ringers?|people|persons?";

  const WORD_NUM = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    couple: 2,
    another: 1,
  };

  // "we're 2 players short", "one short", "1 player down"
  const SHORT_RE =
    /\b(?:(\d+)|(a|an|one|two|three|four|five|six|couple))\s+(?:(?:more|extra)\s+)?(?:(?:NOUN)\s+)?(?:short|down)\b/gi;

  // "need 2 players", "looking for 1x female", "after a couple of subs"
  const COUNT_RE =
    /\b(?:x\s*(\d+)|(\d+)\s*x|(\d+)|(a|an|another|one|two|three|four|five|six|couple))\s*(?:more|extra|additional|further)?\s*(NOUN)\b/gi;

  // "Need two for the 11.30 game" — a number with no noun attached at all.
  // The negative lookahead stops "need a game"/"need a hand" counting as people.
  const FALLBACK_COUNT_RE =
    /\b(?:need(?:s|ed|ing)?|looking for|after|want(?:s|ed|ing)?|hoping for|chasing|missing)\s+(?:another\s+|an?\s+extra\s+)?(\d+|a|an|one|two|three|four|five|six|couple)\b(?!\s*(?:game|team|side|squad|hand|favou?r|goal|win|miracle|help|min|hour|week|day|dollar|buck|\$))/i;

  // The mirror of FALLBACK_COUNT_RE, with the verb after the number:
  // "One needed for Dengue Fever", "Three needed", "1 Player Needed".
  const REVERSED_COUNT_RE =
    /\b(\d+|a|an|another|one|two|three|four|five|six|couple)\s+(?:more\s+)?(?:(?:NOUN)\s+)?(?:needed|wanted|required|short)\b/i;

  // "hoping one of you lovely ladies", "two of our regulars".
  const OF_YOU_RE = /\b(\d+|a|an|one|two|three|four|five|six|couple)\s+of\s+(?:you|your|our|the)\b/i;

  // Whole-team requests — a different (and bigger) ask.
  const FULL_TEAM_RE =
    /\b(?:full|whole|entire|complete)\s+(?:\w+\s+)?team\b|\bteam\s+(?:needed|wanted|required)\b/i;

  // The post is a team asking for help.
  const WANTED_RE =
    /\b(need(?:s|ed|ing)?|looking for|after|want(?:ed|ing)?|short|require[sd]?|chasing|keen for|missing|down|hoping)\b|\bfree (?:game|spot|space)\b/i;

  // The post is a PLAYER asking to join a team — the mirror image. Never alert.
  const SEEKING_TEAM_RE =
    /\b(?:looking|keen|want(?:ing)?|hoping|happy|available|free)\s+(?:to\s+)?(?:join|play for|pick up|find)\b|\b(?:join|joining)\s+(?:a|any|an?other)\s+(?:team|side|squad)\b|\blooking for a (?:team|side|squad|game)\b|\banyone\s+need(?:ing|s)?\s+(?:a|an|another)?\s*(?:NOUN)\b|\bi'?m\s+(?:a\s+)?(?:new|keen)\b/i;

  // Already resolved / cancelled — the notification would be a lie.
  const RESOLVED_RE =
    /\b(?:all\s+)?sorted\b|\bcancell?ed\b|\bno longer (?:needed|required|looking)\b|\bwe'?re good\b|\bfilled\b|\bfound (?:someone|a player|players)\b|\bignore this\b|\bdisregard\b/i;

  // Cost signals.
  const FREE_RE = /\bfree\b|\bno (?:cost|charge)\b|\bon us\b/i;
  const PAID_RE = /\$\s?(\d+(?:[-–]\d+)?)|\b(\d+(?:[-–]\d+)?)\s*(?:bucks|dollars)\b/i;

  const DIV_RE = /\bdiv(?:ision)?\s*\.?\s*(\d+|one|two|three|four|five|six)\b/i;

  const DAY_NAMES = [
    ["sunday|sun\\b", "Sunday"],
    ["monday|mon\\b", "Monday"],
    ["tuesday|tues\\b|tue\\b", "Tuesday"],
    ["wednesday|weds\\b|wed\\b", "Wednesday"],
    ["thursday|thurs\\b|thur\\b|thu\\b", "Thursday"],
    ["friday|fri\\b", "Friday"],
    ["saturday|sat\\b", "Saturday"],
  ];

  function expand(src) {
    return src.replace(/NOUN/g, NOUN);
  }

  function rx(src, flags) {
    return new RegExp(expand(src), flags);
  }

  // ---- Time ---------------------------------------------------------------

  /**
   * Games here run roughly 09:00–21:30. When a poster writes a bare "12.30" or
   * "1:30" they mean the daytime league slot, not the middle of the night. So:
   *   9, 10, 11        -> am
   *   12, 1..8         -> pm
   *   13..23           -> already 24-hour, leave alone
   * An explicit am/pm always wins.
   */
  function normaliseHour(hour, meridiem) {
    // "15pm" isn't a time — someone typed "7 15pm". Ignore the meridiem and
    // treat the number as 24-hour rather than producing hour 27.
    if (meridiem && hour > 12) return hour;
    if (meridiem) {
      const pm = /p/i.test(meridiem);
      if (hour === 12) return pm ? 12 : 0;
      return pm ? hour + 12 : hour;
    }
    if (hour >= 13) return hour; // 24-hour clock, e.g. "20:25"
    if (hour === 12) return 12; // midday slot
    if (hour >= 9) return hour; // 9/10/11 -> morning
    return hour + 12; // 1..8 -> afternoon/evening
  }

  function formatTime(h24, minutes) {
    const suffix = h24 >= 12 ? "pm" : "am";
    let h = h24 % 12;
    if (h === 0) h = 12;
    return minutes ? `${h}:${String(minutes).padStart(2, "0")}${suffix}` : `${h}${suffix}`;
  }

  // Matches "2pm", "12:30", "1.30PM", "6:05 pm", "20:25", "@7.15".
  // A bare hour with no minutes MUST carry am/pm, otherwise "Div 3" and
  // "(tues 28th)" start looking like kick-off times.
  const TIME_WITH_MINUTES = /\b(\d{1,2})\s*[:.]\s*([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)?/gi;
  // "7 15pm" — a missing colon. Only counts when am/pm is present.
  const TIME_SPACED = /\b(\d{1,2})\s+([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)/gi;
  const TIME_HOUR_ONLY = /\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)/gi;
  // Last resort: a bare hour introduced by a time preposition — "by 11 today",
  // "@ 7", "kick off at 12". Only consulted when nothing else in the post looks
  // like a clock, so "Div 1" and "1-2 subs" can't hijack it.
  const TIME_BARE_HOUR =
    /(?:\bat\b|\bby\b|\bfrom\b|\baround\b|\babout\b|@|\bko\b|\bkick[\s-]?off(?:\s+at)?)\s*(\d{1,2})\b(?!\s*[:.]\s*\d)(?!\s*(?:st|nd|rd|th|%|k\b|mins?\b|minutes?\b|players?\b))/gi;

  function findTime(text) {
    const candidates = [];

    TIME_WITH_MINUTES.lastIndex = 0;
    let m;
    while ((m = TIME_WITH_MINUTES.exec(text))) {
      const hour = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (hour > 23) continue;
      candidates.push({ index: m.index, h24: normaliseHour(hour, m[3]), min, raw: m[0].trim() });
    }

    TIME_SPACED.lastIndex = 0;
    while ((m = TIME_SPACED.exec(text))) {
      const hour = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (hour > 12) continue; // "20 25pm" is not a thing
      if (candidates.some((c) => m.index >= c.index - 1 && m.index <= c.index + c.raw.length)) {
        continue;
      }
      candidates.push({ index: m.index, h24: normaliseHour(hour, m[3]), min, raw: m[0].trim() });
    }

    TIME_HOUR_ONLY.lastIndex = 0;
    while ((m = TIME_HOUR_ONLY.exec(text))) {
      const hour = parseInt(m[1], 10);
      if (hour > 23) continue;
      // Skip if this overlaps a hh:mm match we already took (e.g. "6:05pm").
      if (candidates.some((c) => m.index >= c.index - 1 && m.index <= c.index + c.raw.length)) {
        continue;
      }
      candidates.push({ index: m.index, h24: normaliseHour(hour, m[2]), min: 0, raw: m[0].trim() });
    }

    if (!candidates.length) {
      TIME_BARE_HOUR.lastIndex = 0;
      while ((m = TIME_BARE_HOUR.exec(text))) {
        const hour = parseInt(m[1], 10);
        if (hour < 1 || hour > 23) continue;
        candidates.push({ index: m.index, h24: normaliseHour(hour, null), min: 0, raw: m[0].trim() });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.index - b.index);
    const best = candidates[0];
    return {
      hour: best.h24,
      minute: best.min,
      display: formatTime(best.h24, best.min),
    };
  }

  function findDay(text) {
    if (/\btonight\b/i.test(text)) return "tonight";
    if (/\btomorrow\b/i.test(text)) {
      const named = matchDayName(text);
      return named ? `tomorrow (${named})` : "tomorrow";
    }
    if (/\btoday\b|\bthis (?:morning|arvo|afternoon|evening)\b/i.test(text)) return "today";
    const named = matchDayName(text);
    return named || null;
  }

  function matchDayName(text) {
    for (const [pattern, label] of DAY_NAMES) {
      if (new RegExp(`\\b(?:${pattern})`, "i").test(text)) return label;
    }
    return null;
  }

  // ---- Players ------------------------------------------------------------

  function numberFrom(digits, word) {
    if (digits) {
      const n = parseInt(digits, 10);
      return n > 0 && n <= 20 ? n : 0;
    }
    if (word) return WORD_NUM[word.toLowerCase()] || 0;
    return 0;
  }

  function describeNoun(noun) {
    const n = noun.toLowerCase();
    if (/^(girls?|gals?|ladies|lady|females?|women|woman|w[aā]hine)/.test(n)) return "female";
    if (/^(guys?|lads?|blokes?|dudes?|males?|men|man|t[aā]ne)/.test(n)) return "male";
    if (/^(goalkeepers?|goalies?|keepers?|gks?)/.test(n)) return "goalkeeper";
    if (/^(subs?|substitutes?)/.test(n)) return "sub";
    return "player";
  }

  function findPlayers(text) {
    const parts = [];

    const shortRe = rx(SHORT_RE.source, "gi");
    let m;
    while ((m = shortRe.exec(text))) {
      const n = numberFrom(m[1], m[2]);
      if (n) parts.push({ n, kind: "player" });
    }

    const countRe = rx(COUNT_RE.source, "gi");
    while ((m = countRe.exec(text))) {
      const n = numberFrom(m[1] || m[2] || m[3], m[4]);
      if (!n) continue;
      // "2 players short" was already counted by SHORT_RE above.
      const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 12);
      if (/^\s*(short|down)\b/i.test(tail)) continue;
      parts.push({ n, kind: describeNoun(m[5]) });
    }

    // Fallbacks for posts that name a number but no noun beside it:
    //   "Need two for 11.30am game"        -> 2
    //   "One needed for Dengue Fever"      -> 1
    //   "hoping one of you lovely ladies"  -> 1 female
    if (!parts.length) {
      const fb =
        FALLBACK_COUNT_RE.exec(text) ||
        rx(REVERSED_COUNT_RE.source, "i").exec(text) ||
        OF_YOU_RE.exec(text);
      if (fb) {
        const n = numberFrom(/^\d+$/.test(fb[1]) ? fb[1] : null, fb[1]);
        if (n) {
          // Look just past the match for a gendered noun ("…of you lovely ladies").
          const tail = text.slice(fb.index, fb.index + fb[0].length + 40);
          const nounHit = rx("\\b(NOUN)\\b", "i").exec(tail);
          parts.push({ n, kind: nounHit ? describeNoun(nounHit[1]) : "player" });
        }
      }
    }

    const fullTeam = FULL_TEAM_RE.test(text);
    const deduped = dedupeRestatements(parts);
    if (!deduped.length) {
      return fullTeam
        ? { count: null, fullTeam: true, summary: "A FULL TEAM", detail: "" }
        : { count: null, fullTeam: false, summary: "", detail: "" };
    }

    // Merge by kind so "1 guy and 1 girl" reads nicely.
    const byKind = new Map();
    for (const p of deduped) byKind.set(p.kind, (byKind.get(p.kind) || 0) + p.n);

    let total = 0;
    for (const n of byKind.values()) total += n;

    const kinds = [...byKind.entries()].filter(([k]) => k !== "player");
    const detail = kinds.length
      ? kinds.map(([k, n]) => `${n} ${k}${n > 1 ? "s" : ""}`).join(" + ")
      : "";

    return {
      count: total,
      fullTeam,
      summary: `${total} player${total > 1 ? "s" : ""}`,
      detail,
    };
  }

  // People restate the ask — "1 Player Needed … we're looking for 1 player to
  // join Rivals FC" is one player, not two. An identical (number, kind) pair
  // seen twice is a restatement; genuinely different asks ("1 guy and 1 girl")
  // differ in kind, and nobody writes "2 subs and 2 subs".
  function dedupeRestatements(parts) {
    const seen = new Set();
    const out = [];
    for (const p of parts) {
      const key = `${p.n}|${p.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  }

  // ---- Cost / division ----------------------------------------------------

  function findCost(text) {
    const paid = PAID_RE.exec(text);
    if (paid) return `$${paid[1] || paid[2]}`;
    if (FREE_RE.test(text)) return "free";
    return null;
  }

  function findDivision(text) {
    const m = DIV_RE.exec(text);
    if (!m) return null;
    const raw = m[1].toLowerCase();
    const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
    return `Div ${words[raw] || raw}`;
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * @param {string} raw post body text
   * @returns {{
   *   isCall: boolean, reason: string, time: object|null, day: string|null,
   *   players: object, cost: string|null, division: string|null,
   *   headline: string, subline: string
   * }}
   */
  function parsePost(raw) {
    const text = String(raw || "")
      .replace(/ /g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const time = findTime(text);
    const day = findDay(text);
    const players = findPlayers(text);
    const cost = findCost(text);
    const division = findDivision(text);

    const base = { time, day, players, cost, division };

    if (!text) return { ...base, isCall: false, reason: "empty", headline: "", subline: "" };
    if (RESOLVED_RE.test(text))
      return { ...base, isCall: false, reason: "resolved-or-cancelled", headline: "", subline: "" };
    if (rx(SEEKING_TEAM_RE.source, "i").test(text))
      return { ...base, isCall: false, reason: "player-seeking-team", headline: "", subline: "" };
    if (!WANTED_RE.test(text))
      return { ...base, isCall: false, reason: "no-request-verb", headline: "", subline: "" };
    if (!players.count && !players.fullTeam)
      return { ...base, isCall: false, reason: "no-player-count", headline: "", subline: "" };
    if (!time)
      return { ...base, isCall: false, reason: "no-kickoff-time", headline: "", subline: "" };

    const when = day ? `${time.display} ${day}` : time.display;
    const headline = `${when} — ${players.summary} needed`;

    const bits = [];
    if (players.detail) bits.push(players.detail);
    if (division) bits.push(division);
    if (cost) bits.push(cost);
    const subline = bits.join(" · ");

    return { ...base, isCall: true, reason: "ok", headline, subline };
  }

  root.PlayerWantedParser = { parsePost, findTime, findPlayers, findDay, formatTime };
})(typeof globalThis !== "undefined" ? globalThis : this);
