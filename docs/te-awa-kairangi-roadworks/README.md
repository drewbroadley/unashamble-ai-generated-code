# Te Awa Kairangi Roadworks

An interactive map of the weekly roadworks email for the SH2 Melling Transport
Improvements / Te Wai Takamori o Te Awa Kairangi programme (formerly RiverLink)
in Lower Hutt. Live at
[unashamedai.broadley.org.nz/te-awa-kairangi-roadworks/](https://unashamedai.broadley.org.nz/te-awa-kairangi-roadworks/).

NZTA sends a long, wordy email every Friday listing what will be closed, one-way,
under traffic management or resurfaced overnight in the coming week. This page
turns that into a map you can actually plan a trip with.

## What it does

- Draws every street, bridge, roundabout and path named in the week's email on a
  vector map of the Lower Hutt CBD and Melling, coloured by what is happening:
  road/lane closed, one-way only, traffic management, night works, reduced
  parking, footpath/trail closed, long-term closure (to ~2029), signed detour.
- Click any line, pin or list entry for the wording from the email, the days and
  hours it applies, and which email it came from.
- **Week selector** in the header steps between weekly emails.
- **Changes this week** dims everything that was already in place last week and
  flags what is *new*, *updated* or *finished* since the previous email.
- Long-term closures (Queens Drive, Pharazyn Street, the western river trail,
  Melling Station and the rest) are carried on every week.
- Works the email mentions outside the CBD (Naenae Road and friends) and around
  the wider region (Terrace Tunnel, Remutaka Hill, events) are listed in the
  sidebar; the ones with a location can be panned to.
- Pan, wheel-zoom and pinch-zoom; keyboard focus works on the list.

## What it can touch

One static HTML file. No build step, no framework, no service worker, no cookies,
no `localStorage`.

- **Network:** exactly one outbound request, to Google Fonts
  (`fonts.googleapis.com` / `fonts.gstatic.com`) for Barlow and Barlow Condensed.
  If that is blocked the page falls back to system fonts and works unchanged.
  Nothing else is fetched and nothing is sent anywhere.
- **Data:** the basemap (about 830 simplified street, rail, river and park
  shapes) and every week's roadworks list are embedded in the file. The page reads
  pointer position for pan/zoom and hover, and nothing else.

## What it does NOT do

No analytics, no tracking, no remote code, no storage, no map-tile requests to a
third party, no access to location, clipboard or anything beyond the page.

## Updating it each week

All the content lives in two arrays near the top of the last `<script>` block in
`index.html`:

- `SITES` — one entry per place, with a stable id, a display name, a category and
  its geometry (`line`, `lines`, `point` or `poly` in `[lat, lon]`).
- `UPDATES` — one entry per weekly email: `week` (the Sunday it commences),
  `emailDate`, the `items` (each `{ site, text, when }` referencing a site id),
  any `region` notes, and the email's own weather/Saturday caveat in `notes`.

To add a week: append a new object to `UPDATES` (add any new place to `SITES`
first). The page diffs consecutive weeks itself, so "Changes this week" needs no
extra work. Long-term closures live in `LONG_TERM` and only change when the email
changes them.

## Data and caveats

- Roadworks content is transcribed from the NZTA / Te Wai Takamori o Te Awa
  Kairangi "Roadworks update" emails (4 and 11 September 2026 at time of writing).
  Wording is kept close to the source; extents along a street are a reading of the
  email, not a survey.
- Street alignments are from [OpenStreetMap](https://www.openstreetmap.org/)
  (© OpenStreetMap contributors, ODbL), simplified to roughly 5–10 m. The western
  Hutt River Trail is not in OSM any more, so its closed extent is drawn as an
  offset of the river bank and marked approximate.
- Two places the email names could not be pinned down (Fleet Street, Whiorau Bay)
  and are listed without a location.
- The map is not a substitute for the on-site signage. Works move at short notice
  with the weather; the email says so every week and so does the page.

## Credits

Built by Claude from Drew's inbox, described by a human.
