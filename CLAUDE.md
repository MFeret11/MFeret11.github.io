# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal portfolio site for a software engineer who is job hunting, served by GitHub Pages from `master` at the custom domain in `CNAME` (mferet.com). It's plain static HTML and CSS: there's no build step, package manager, linter or tests. A push to `master` deploys, and the repo is public. Commits use the repo-local noreply identity (`MFeret11 <MFeret11@users.noreply.github.com>`).

Preview locally, and check visually with headless Chromium (installed on the Pi):

```bash
python3 -m http.server 8080   # then open http://localhost:8080 (or http://<pi-ip>:8080 from another machine)
chromium --headless=new --no-sandbox --hide-scrollbars --virtual-time-budget=8000 \
  --window-size=1280,900 --screenshot=out.png http://127.0.0.1:8080/index.html   # use 390,844 for phone width
```

After changing links or assets, check that every local `src`/`href`/`url()` still points at an existing file, and that CDN URLs return 200.

## Structure

- Four standalone pages: `index.html`, `projects.html`, `about.html`, `contact.html`. There are no templates or includes, so the `<head>`, header, nav drawer and footer are copy-pasted into each page. A change to the shared chrome has to be made in all four files, and the active nav link (`is-active`) differs per page.
- UI is **Material Design Lite (MDL) 1.3.0** (`mdl-layout`, `mdl-card`, `mdl-grid`, `mdl-js-*` ripple classes), plus Roboto and Material Icons from Google Fonts. MDL is unmaintained, so expect to work around it rather than upgrade it. Load MDL and jQuery from **cdnjs**: the official `code.getmdl.io` CDN started returning 403 in 2026, which left the whole site unstyled.
- `styles.css` is the only local stylesheet and overrides MDL. Its utility classes have terse names: `.a` (social icons), `.b` (GitHub project links), `.c` (nav link hover gradient), `.readmore` (card buttons).
- `projects.html` also loads jQuery for show/hide toggles: clicking a `.d` element hides it and fades in the next sibling `.hide`.
- Images: `images/` holds originals and `images/compressed/` holds the optimized copies used for photos and logos. Favicons and the web manifest exist only in `images/favicon/`; `images/compressed/favicon/` holds just the `mf-logo` PNGs used by the header logo.
- Every page starts with `<body class="loading">` (`visibility: hidden` in CSS) so MDL can finish upgrading the DOM before anything shows. An inline script removes the class on `window.load`, with a 3-second fallback so a stalled CDN can't leave the page blank.
- Each page's drawer nav (the mobile menu) marks its own link with `is-active` and `aria-current="page"`.
- Avoid `will-change`/`translateZ(0)` on MDL's header elements: transforms there interfere with its waterfall/compact header. They were removed in 2026-10.
- `ResumeV23.pdf` is in the repo, but its link on the About page is commented out.

## Repo notes

The README's TODO list holds wanted features: a ripple on mobile nav links, a social-button footer on Home and Projects, and Read-more buttons that widen on hover.
