# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal site for a software engineer who is job hunting, served by GitHub Pages from `master` at the custom domain in `CNAME` (mferet.com). A push to `master` deploys within about a minute, and the repo is public. Commits use the repo-local noreply identity (`MFeret11 <MFeret11@users.noreply.github.com>`).

The site is meant to be **fun, not a résumé**: recruiters get work history from LinkedIn or a résumé PDF. The site presents the author's side projects as one of many, none dominating: the basement theater (with an interactive simulator) is one of them, alongside the stories from his public projects, [home-assistant-config](https://github.com/MFeret11/home-assistant-config) and [Good_Morning_Dashboard](https://github.com/MFeret11/Good_Morning_Dashboard). [WeatherTunes](https://github.com/MFeret11/WeatherTunes) (served at mferet.com/WeatherTunes/ from its own repo) has a project card on Stories and the home page; check `~/WeatherTunes/README.md` before describing it.

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
- **`basement.js`** is the simulator: a single state object `S`; sensor handlers that copy `basement.py` (`doorOpened`, `motionSeen`, `doorClosed`, `stealthStairs`); `sync()`, a copy of `theater_lighting_sync()`; `render()` (pushes state into the inline SVG, the rule caption, the status panel, the current chart and the page dimmer); and async actions (`walkDown`, `walkUp`, `play`, `togglePause`, `toggleSocial`, `flash`, `endSession`, `cooldown`). People walk the stairs and fire the door and motion sensors, so the approach lighting comes from the same rules as the real house. `RULES` maps each rule to a caption and a permalink into home-assistant-config pinned to a commit; when the pyscript files change, re-check the line numbers and update the commit in `REPO`. The page is an explainer: three short chapters (`.chapter`, `data-ch`) scroll beside a sticky room, and each runs a scripted scene from `SCENES` when it crosses the middle of the screen (`pick()`), with a Free play section (all controls, status, logbook) at the end. Keep chapter text to two or three short sentences. Any control press ends a running scene (`takeOver()`). Bumping `epoch` cancels every running action. Long waits run `SPEED` (10x) faster through `sleep()`, which also speeds up the sim clock; flash timings use real time, because they're visual. For headless checks, scroll the iframe to a chapter (`scrollIntoView`) or click its `[data-play]` button; chapter 1 starts on load.

## Keep the simulator and stories accurate

The simulator and the Stories page describe real behavior from the two repos: the approach lighting (door then motion = arriving, motion then door = leaving, the 20 s walk-out check, the 3-minute stair timeout, and its known gap: the walk-out shutoff can't see someone sitting still on the couch. Chapter 1 says mmWave presence sensors are coming; update the chapter, the `stillGap` rule and the scene once they're installed and `basement.py` uses them), lighting modes, the 3% pause glow, receiver DSP per mode, the 4.0 s pause debounce, the curtain call (20% for 10 minutes), the 2% 2000 K stair light, Kelly green `rgb(0,170,35)` brightness-only flashes (100%/15%, touchdown and field-goal cadences), the tuner preemption, the Batocera < 0.05 A for 12 s check, and the projector's 90 s cooldown plus up to 25 polls needing two consecutive readings ≤ 0.06 A (mains stay on if the sensor is unavailable; a new non-music show cancels the cooldown). When changing them, check the source docs instead of inventing details: `~/ha_config/docs/` (`safety-interlocks.md`, `lighting.md`, `theater-audio.md`) and `~/Good_Morning_Dashboard/CLAUDE.md` on this Pi.

The tuner story says preemption has only been tested against an idle tuner. Update it once it has worked during a real game.

## Privacy

Keep these off the site:
- the author's phone number, personal email and town ("Philadelphia area" is fine)
- anything live from the house: presence, what's playing, location
- the commuter's real stations, times or coordinates (call them "partner" or "my household")
- LAN or Tailscale IPs

The contact address is shown obfuscated, as `admin [at] mferet [dot] com`. The simulator must never call the real Home Assistant.

`Matthew_Feret_Resume.pdf` is the current résumé, linked from the About day-job card, the About contact buttons, and every page footer. It shows only the obfuscated contact address.
