"""Render the 1200x630 link-preview cards in images/og/ with headless Chromium.

Usage, from the repo root:  python3 tools/og/make_cards.py [name ...]   (no names = all)

card.html is the template (Movie mode colors, the site logo, eyebrow, title, summary,
and an optional screenshot or the three-demo collage). The img-*.png inputs are
screenshots of the basement simulator (game day), the commute demo (4:45 missed
connection) and a WeatherTunes album cover, all taken in Movie mode. Add a new
story to CARDS, run this, then point the page's og:image at the new file.
"""
import http.server, os, shutil, socketserver, subprocess, sys, threading, urllib.parse
from functools import partial

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "images", "og")
# tools/headless.sh in WeatherTunes cleans up Chromium's temp folders; fall back to chromium.
WRAP = os.path.expanduser("~/WeatherTunes/tools/headless.sh")
CHROME = [WRAP] if os.path.exists(WRAP) else ["chromium", "--headless=new", "--no-sandbox", "--disable-gpu"]

CARDS = {
    "home": dict(e="Software engineer", t="Builds things for fun",
        d="Enterprise software by day. Hear your forecast as music, or play with a simulated home theater.", collage="1"),
    "basement": dict(e="Interactive demo", t="Theater Automation",
        d="A playable copy of my basement theater's real rules: lights that know who's there, and one button per mode.",
        img="img-room.png"),
    "commute": dict(e="Interactive demo", t="Good Morning Dashboard",
        d="When to leave for the train: a two-line SEPTA trip, live delays, and pushes only when things get worse.",
        img="img-commute.png"),
    "weathertunes": dict(e="Web app", t="WeatherTunes",
        d="Today's forecast as a short piece of music. The weather picks the notes; music theory keeps them in tune.",
        img="img-wt.png"),
    "stories": dict(e="Stories", t="Projects, and the stories behind them",
        d="A self-running home theater, a commute planner, an app that turns weather into music, and the bugs and decisions behind them."),
    "about": dict(e="About", t="Matt Feret",
        d="Senior software engineer, home-recording musician and skier in the Philadelphia area."),
    "projector-interlock": dict(e="Story · home-assistant-config", t="The projector you must not unplug",
        d="Why my projector now goes to sleep instead of losing power, and the guard that catches it waking up alone."),
    "forecast-to-song": dict(e="Story · WeatherTunes", t="How a forecast becomes a song",
        d="How WeatherTunes maps an hourly forecast onto scale, key, tempo and instruments, and keeps it all in tune."),
    "phone-crackle": dict(e="Story · WeatherTunes", t="The song my phone couldn't play",
        d="Two fixes went after symptoms; the third stopped running the synths live at all."),
    "touchdown-flashes": dict(e="Story · home-assistant-config", t="Touchdown flashes vs. the Zigbee mesh",
        d="Celebrating an Eagles touchdown on twelve Zigbee bulbs without flooding the mesh."),
    "missing-notification": dict(e="Story · Good Morning Dashboard", t="A missing notification reads as “all good”",
        d="SEPTA's API quirks, planning a two-line trip, and the rule that silence is never the answer."),
    "slow-stairs": dict(e="Story · home-assistant-config", t="My slowest trip up the stairs took 18.76 seconds",
        d="Tuning which-way-are-you-going lighting on the basement stairs against real sensor history."),
}


names = sys.argv[1:] or list(CARDS)
os.makedirs(OUT, exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

handler = partial(Quiet, directory=HERE)
with socketserver.TCPServer(("127.0.0.1", 0), handler) as srv:
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    for n in names:
        url = f"http://127.0.0.1:{port}/card.html?" + urllib.parse.urlencode(CARDS[n])
        path = os.path.join(OUT, n + ".png")
        subprocess.run(CHROME + ["--hide-scrollbars", "--window-size=1200,630", "--virtual-time-budget=5000",
                                 "--screenshot=" + os.path.abspath(path), url],
                       stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL, check=True)
        print(n, os.path.getsize(path))
    srv.shutdown()
