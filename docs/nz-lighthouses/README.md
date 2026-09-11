# Lighthouses of New Zealand

An animated night chart of New Zealand's coastal lights. Live at
[unashamedai.broadley.org.nz/nz-lighthouses/](https://unashamedai.broadley.org.nz/nz-lighthouses/).

## What it does

- Draws 86 coastal lights (80 active, 6 preserved historic towers) on a Mercator
  chart of the North, South and Stewart Islands.
- Every active light runs on one shared clock and flashes to its **published
  characteristic**: `Fl(2) W 20s` really is two white flashes every twenty seconds,
  so neighbouring lights fall in and out of step exactly as they would from a ship.
- Classic towers with rotating lenses **sweep** a 45° cone of light, one beam per
  flash in the group. Small modern beacons **glow**. Fixed and occulting lights hold
  a steady glow that eclipses on schedule. Which lights sweep is a heuristic based
  on tower type; no NZ source states which optics still rotate.
- **No land is drawn.** Beams and glows are ray-traced against the real coastline
  (720 rays per light, precomputed once at load), so light stops at the shore and
  the outline of the country appears only where light strikes it.
- Hover a light for its name, Māori name, characteristic in plain words, a rhythm
  bar with a live cursor, focal height, year first lit, and whether it sweeps or glows.
- Controls: elapsed clock, 1× / 3× speed, pause.

## What it can touch

It is one static HTML file. No build step, no framework, no service worker, no
cookies, no `localStorage`.

- **Network:** exactly one outbound request, to Google Fonts
  (`fonts.googleapis.com` / `fonts.gstatic.com`) for IBM Plex Mono and Poppins. If
  that request is blocked the page falls back to system fonts and works unchanged.
  Nothing else is fetched and nothing is sent anywhere.
- **Data:** the coastline (about 2,300 vertices) and all 86 light records are
  embedded in the file. The page reads mouse position for the hover card and
  nothing else.

## What it does NOT do

No analytics, no tracking, no remote code, no storage, no access to location,
camera, clipboard or anything beyond the page itself.

## Data and caveats

- Light characteristics, focal heights, years and tower descriptions are from
  [The Lighthouse Directory](https://www.ibiblio.org/lighthouse/) (ibiblio.org).
  Periods and group counts are real; flash durations are illustrative.
- Positions were entered by hand to roughly 0.05° and are **not chart-accurate**.
  Lights that landed inland on the simplified coastline are snapped to the nearest
  shore. Do not navigate by this.
- Coastline: Stats NZ digital boundaries via
  [geoBoundaries](https://www.geoboundaries.org/) (CC BY 4.0), simplified with a
  0.012° tolerance. Chatham, Kermadec and subantarctic lights are outside the extent.
- Godley Head's modern LED rhythm is described as 2-4-2-4-2-12 seconds and is
  rendered as a 26 second group of three.

## Credits

Style after *Lighthouses of New England* by
[Aaron J. Becker](https://mapped.earth/lighthouses) (mapped.earth), shared on
r/MapPorn by u/vladgrinch. Built by Claude, described by a human.
