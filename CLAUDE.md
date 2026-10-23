# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal site for a software engineer who is job hunting, served by GitHub Pages from `master` at the custom domain in `CNAME` (mferet.com). A push to `master` deploys within about a minute, and the repo is public. Commits use the repo-local noreply identity (`MFeret11 <MFeret11@users.noreply.github.com>`).

The site is meant to be **fun, not a résumé**: recruiters get work history from LinkedIn or a résumé PDF. The site leads with an interactive simulator of the author's basement theater and stories from his public projects, [home-assistant-config](https://github.com/MFeret11/home-assistant-config) and [Good_Morning_Dashboard](https://github.com/MFeret11/Good_Morning_Dashboard). [WeatherTunes](https://github.com/MFeret11/WeatherTunes) (served at mferet.com/WeatherTunes/ from its own repo) has a project card on Stories and the home page; check `~/WeatherTunes/README.md` before describing it.

It's plain HTML, CSS and vanilla JS: no framework, build step, package manager or tests, and no CDN scripts. (The 2016 version used Material Design Lite from `code.getmdl.io`; that CDN died in 2026 and took the whole layout with it, which is why there are no runtime dependencies now.) The only external resources are Google Fonts and a SoundCloud embed on the About page.

## Preview and check

```bash
python3 -m http.server 8080   # then open http://localhost:8080 (or http://<pi-ip>:8080 from another machine)
chromium --headless=new --no-sandbox --hide-scrollbars --virtual-time-budget=8000 \
  --window-size=1280,900 --screenshot=out.png http://127.0.0.1:8080/index.html   # 390,844 for phone; add --force-dark-mode for Movie mode
```

Headless screenshots catch CSS transitions mid-fade, so the simulator can look wrong in a screenshot when it isn't. To check simulator state, load `basement.html` in an iframe from a same-origin harness page, inject `*{transition:none!important}`, click buttons, and read the `#log` entries and `#st-*` status fields (`--dump-dom` works for this). The Pi's Chromium has no emoji font, so emoji render as boxes there but are fine in normal browsers.

## Structure

- Pages: `index.html` (home), `basement.html` (simulator), `projects.html` (Stories, the URL kept from the old site), `about.html` (day job in one card, music, skiing, and the `#contact` section). `contact.html` only redirects to `about.html#contact` so old links work.
- There are no templates or includes. Each page has its own copy of the `<head>`, header, nav and footer. Changes to shared chrome go in all four pages, and each page sets `aria-current="page"` on its own nav link.
- `styles.css` holds everything, organized by section (tokens, base, header, home, stories, about, footer, simulator).
- **Theming:** light is "Daily Driver" and dark is "Movie mode". The tokens live on `:root`; dark overrides sit under `:root[data-theme="dark"]`, plus a `prefers-color-scheme` fallback for no-JS. An inline script in every `<head>` sets `data-theme` before first paint (from `localStorage` or the OS setting), and `site.js` wires the header switch, saves the choice, and fires a `themechange` event.
- **`basement.js`** is the simulator: a single state object `S`, `applyLights()` (lighting rules), `render()` (pushes state into the inline SVG, the status panel and the button states), and async action functions (`play`, `togglePause`, `stairs`, `flash`, `endSession`, `pollProjector`). Long waits run `SPEED` (10x) faster through `sleep()`, which also speeds up the sim clock. Flash timings use real time, because they're visual.

## Keep the simulator and stories accurate

The simulator and the Stories page describe real behavior from the two repos: lighting modes, receiver DSP per mode, the 4.0 s pause debounce, the 2% 2000 K stair light, Kelly green `rgb(0,170,35)` brightness-only flashes (100%/15%, touchdown and field-goal cadences), the tuner preemption, the Batocera < 0.05 A for 12 s check, and the projector's 90 s cooldown plus two consecutive readings ≤ 0.06 A (mains stay on if the sensor is unavailable). When changing them, check the source docs instead of inventing details: `~/ha_config/docs/` (`safety-interlocks.md`, `lighting.md`, `theater-audio.md`) and `~/Good_Morning_Dashboard/CLAUDE.md` on this Pi.

The tuner story says preemption has only been tested against an idle tuner. Update it once it has worked during a real game.

## Privacy

Keep these off the site:
- the author's phone number, personal email and town ("Philadelphia area" is fine)
- anything live from the house: presence, what's playing, location
- the commuter's real stations, times or coordinates (call them "partner" or "my household")
- LAN or Tailscale IPs

The contact address is shown obfuscated, as `admin [at] mferet [dot] com`. The simulator must never call the real Home Assistant.

`ResumeV23.pdf` is an old résumé; nothing links to it. A newer PDF hasn't been added yet.
