// Basement simulator.
// A simplified, in-browser copy of the rules in github.com/MFeret11/home-assistant-config
// (basement.py, theater.py, sports.py). It never talks to the real house.
(function () {
  "use strict";

  var SPEED = 10; // long waits (cooldowns, timers) run this many times faster
  var WARM = "#ffcf96"; // Adaptive Lighting's evening warm white
  var CANDLE = "#ff9a4a"; // 2000 K "stealth" stair light
  var GREEN = "#00aa23"; // Eagles Kelly green, rgb(0, 170, 35)
  var SYNTH = ["#ff9a0d", "#ff1ee8", "#0de2ff", "#ff2a9a"]; // Synthwave palette, one color per room zone
  var CIRCADIAN = 0.45; // Adaptive Lighting brightness at 8 PM
  var GLOW = 0.03; // GLOW_PCT = 3
  var NS = "http://www.w3.org/2000/svg";
  var REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Permalinks into the public repo, pinned to a commit so the line numbers stay right.
  var REPO = "https://github.com/MFeret11/home-assistant-config/blob/c1f5e84ce9be0d1441bb63ce18d28d74e4ba2d4a/pyscript/";
  var RULES = {
    empty: ["Empty basement", "Nobody's downstairs, so every light is off.", "basement.py", 597],
    doorDown: ["Someone's coming down", "The stair door opened with no recent motion at the bottom, so it's an arrival. Stairs on at the Adaptive Lighting level; they time out after 3 minutes if nobody arrives.", "basement.py", 413],
    arrive: ["Made it down", "Motion at the foot of the stairs while the stairs are lit: the room lights come on at the evening circadian level, and the stairs go off 30 s later.", "basement.py", 480],
    heading: ["Heading up?", "Motion at the bottom with the stairs dark: light them for 45 s in case someone's about to climb.", "basement.py", 480],
    doorUp: ["Someone's leaving?", "The door opened within 25 s of motion at the bottom of the stairs. That order usually means someone walked up and out. If it was really someone arriving, the walk-out check catches it.", "basement.py", 420],
    walkWait: ["Walk-out check", "The door closed behind someone leaving. Wait 20 s: new motion at the bottom or the door reopening cancels the shutoff.", "basement.py", 575],
    stillGap: ["The wasp got lost", "Nothing moved near the stairs for 20 s after the door closed, so the lights went off, with someone still on the couch. A motion sensor can't see a person sitting still. mmWave presence sensors are next.", "basement.py", 575],
    walkCancel: ["Still someone here", "Motion at the bottom of the stairs after the door closed: someone's down here, so the lights stay on.", "basement.py", 575],
    group: ["A group coming down", "The door opened, motion at the bottom, then the door closed: that's the last person shutting it behind the first. Not a walk-out.", "basement.py", 565],
    stealth: ["Stealth stairs", "A show is on: stairs fade to 2% candlelight (2000 K) for 60 s. Enough to see the steps without washing out the screen. The room lights stay off.", "basement.py", 372],
    preshow: ["Pre-show", "The theater is on but nothing's playing yet: the dimmer holds a 3% glow, the rest of the basement is dark, bias lights on.", "basement.py", 701],
    showtime: ["Showtime", "Something is playing: full blackout. Only the bias lights behind the screen stay on.", "basement.py", 686],
    pauseWait: ["Pause debounce", "Paused. Wait 4 s before touching the lights, so a menu blip doesn't flicker them.", "basement.py", 692],
    intermission: ["Intermission", "Still paused after 4 s: the dimmer comes up to a 3% glow. The lounge and bar stay off.", "basement.py", 692],
    music: ["Music", "Music stays fully dark, playing or paused. No glow state, by design.", "basement.py", 667],
    sports: ["Game day", "An Eagles game switches on Social mode and paints the room and stairs solid Kelly green at 100%.", "basement.py", 641],
    social: ["Social mode", "In Social mode the theater never touches the lights, and nothing times out. Good for cards night during a movie.", "basement.py", 661],
    socialStairs: ["Social stairs", "Social mode: opening the door turns the stairs on in the current palette and leaves them on. No timeouts.", "basement.py", 441],
    tuner: ["Tuner preemption", "Both TV tuners are busy, so tuner 1 is force-released over its TCP control protocol, then there's a 0.6 s settle before live TV launches.", "theater.py", 2171],
    flash: ["Score flash", "Pulse brightness between 100% and 15% in solid green. The color never changes, so the Zigbee mesh isn't flooded with commands.", "sports.py", 115],
    sessionEnd: ["Ordered shutdown", "House lights up first, then the TV box, receiver and Batocera shut down in order.", "theater.py", 2211],
    curtain: ["Curtain call", "House lights rise to 20% warm white for 10 minutes so people can find their way out. Walking out turns everything off 1.5 s after the door closes.", "basement.py", 708],
    curtainOut: ["Curtain call walk-out", "Someone walked out during the curtain call: 1.5 s later the whole basement turns off.", "basement.py", 543],
    cooldown: ["Projector cooldown", "The lamp is off but its fans need power. Wait 90 s, then poll the current every 10 s and cut mains only after two readings in a row at or below 0.06 A.", "theater.py", 1855],
    cooldownCancel: ["Cooldown cancelled", "A new show started, so the cooldown is cancelled and the projector keeps its power.", "theater.py", 1950],
    sensorFail: ["Fail safe", "The current sensor isn't answering. Without a reading, the projector's power stays on: a plug left on costs cents, a cut mid-cooldown costs a lamp.", "theater.py", 1878],
    batocera: ["Batocera power", "Batocera gets a clean shutdown command; its relay opens only after it draws under 0.05 A for 12 s straight.", "theater.py", 1828]
  };

  var MODES = {
    movie: { label: "Movie", input: "HDMI1", dsp: "Standard", app: "Stremio", spill: "#ffae6b" },
    game: { label: "Retro game", input: "HDMI2", dsp: "Straight", app: "Batocera", spill: "#6d9dff" },
    music: { label: "Music", input: "HDMI1", dsp: "7ch Stereo", app: "Spotify", spill: "#1db954" },
    sports: { label: "Eagles game", input: "HDMI1", dsp: "Sports", app: "the HDHomeRun app", spill: "#58c25e" }
  };
  var ACTIVE = { movie: 1, game: 1, sports: 1 }; // modes that cancel a projector cooldown

  var $ = function (id) {
    return document.getElementById(id);
  };
  var roomEl = $("room");

  // ---------- state ----------
  var S;
  function freshState() {
    return {
      people: [],
      walking: 0,
      door: false,
      motion: false,
      inUse: false,
      mode: null,
      media: "off", // loading | playing | paused (movie, music) | idle (game)
      social: false,
      socialSource: null,
      palette: false,
      sportsGreen: false,
      curtain: false,
      projector: "off", // off | on | cooling | polling | fans
      amps: 0,
      rx: null,
      batocera: false,
      room: [0, 0, 0, 0, 0, 0, 0, 0, 0].map(function () {
        return { bri: 0, color: WARM };
      }),
      dimmer: 0,
      stairs: { bri: 0, color: WARM },
      bias: false,
      score: { phi: 0, nyg: 0 },
      busy: false,
      flashing: false,
      rule: "empty",
      stranded: false
    };
  }
  S = freshState();
  var T = { door: -1e9, motionStart: -1e9, motionClear: -1e9 }; // sim seconds
  var direction = "none";
  var tourOn = false;

  // ---------- time ----------
  // epoch: bumping it cancels every running action (their waits never resolve).
  // tourEpoch: bumping it stops only the tour script.
  var epoch = 0;
  var tourEpoch = 0;
  var simMs = 20 * 3600 * 1000;
  var fastWaits = 0;
  var lastTick = performance.now();
  var timers = {};

  function now() {
    return simMs / 1000;
  }

  function clockText() {
    var t = Math.floor(simMs / 1000) % 86400;
    var pad = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    return pad(Math.floor(t / 3600)) + ":" + pad(Math.floor((t % 3600) / 60)) + ":" + pad(t % 60);
  }

  setInterval(function () {
    var t = performance.now();
    // Walking runs the clock 5x too, so a trip down the stairs takes about as long as the real one.
    simMs += (t - lastTick) * (fastWaits > 0 ? SPEED : S.walking > 0 ? 5 : 1);
    lastTick = t;
    $("st-clock").textContent = clockText();
  }, 200);

  function wait(ms, fast, which) {
    var e = which === "tour" ? tourEpoch : epoch;
    if (fast) fastWaits++;
    return new Promise(function (resolve) {
      setTimeout(
        function () {
          if (fast) fastWaits--;
          if ((which === "tour" ? tourEpoch : epoch) === e) resolve();
        },
        fast ? ms / SPEED : ms
      );
    });
  }
  function sleep(simDelay) {
    return wait(simDelay, true);
  }
  function realSleep(ms) {
    return wait(ms, false);
  }
  function tourSleep(ms) {
    return wait(ms, false, "tour");
  }

  // Named background timers in sim time. Setting one replaces the old one (like task.unique).
  // `fast` timers also speed up the clock while they run, for waits the log talks about.
  function timer(name, simDelay, fn, fast) {
    cancel(name);
    var e = epoch;
    if (fast) fastWaits++;
    timers[name] = {
      fast: fast,
      id: setTimeout(function () {
        if (fast) fastWaits--;
        delete timers[name];
        if (e === epoch) fn();
      }, simDelay / SPEED)
    };
  }
  function realTimer(name, ms, fn) {
    timer(name, ms * SPEED, fn);
  }
  function cancel(name) {
    var t = timers[name];
    if (!t) return;
    clearTimeout(t.id);
    if (t.fast) fastWaits--;
    delete timers[name];
  }

  function log(msg, cls) {
    var li = document.createElement("li");
    if (cls) li.className = cls;
    var time = document.createElement("time");
    time.textContent = clockText();
    li.appendChild(time);
    li.appendChild(document.createTextNode(msg));
    var list = $("log");
    list.insertBefore(li, list.firstChild);
    while (list.children.length > 60) list.removeChild(list.lastChild);
  }

  function rule(id) {
    S.rule = id;
    var r = RULES[id];
    $("rule-name").textContent = r[0];
    $("rule-text").textContent = r[1];
    var link = $("rule-link");
    link.href = REPO + r[2] + "#L" + r[3];
    link.textContent = r[2] + ":" + r[3];
    var box = $("rule");
    box.classList.remove("fresh");
    void box.offsetWidth; // restart the highlight animation
    box.classList.add("fresh");
  }

  // ---------- build the fixtures ----------
  var BULBS = [62, 120, 178, 236, 294, 506, 564, 622, 690]; // nine Zigbee bulbs
  var ZONE = [0, 0, 1, 1, 1, 2, 2, 3, 3]; // which palette zone each bulb belongs to
  var CANS = [150, 650]; // the theater dimmer
  var pools = $("pools");
  var bulbsG = $("bulbs");
  var defs = roomEl.querySelector("defs");
  var bulbEls = [];
  var canEls = [];

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // A downward wall-wash gradient whose color can change per light.
  function washGradient(id) {
    var g = el("radialGradient", { id: id }, defs); // centered on the fixture, fades to 0 at the edge
    var a = el("stop", { offset: "0", "stop-color": WARM, "stop-opacity": "0.95" }, g);
    var b = el("stop", { offset: "0.35", "stop-color": WARM, "stop-opacity": "0.35" }, g);
    el("stop", { offset: "1", "stop-color": WARM, "stop-opacity": "0" }, g);
    return [a, b];
  }

  CANS.forEach(function (x, i) {
    washGradient("g-can" + i);
    canEls.push({
      pool: el("ellipse", { class: "fx", cx: x, cy: 22, rx: 110, ry: 400, fill: "url(#g-can" + i + ")", opacity: 0 }, pools),
      lamp: el("rect", { class: "fx-fill", x: x - 20, y: 16, width: 40, height: 5, rx: 2, fill: "#6b6370" }, bulbsG)
    });
  });

  BULBS.forEach(function (x, i) {
    var stops = washGradient("g-bulb" + i);
    el("line", { x1: x, y1: 18, x2: x, y2: 28, stroke: "#5b5160", "stroke-width": 2 }, bulbsG);
    bulbEls.push({
      stops: stops,
      pool: el("ellipse", { class: "fx", cx: x, cy: 34, rx: 80, ry: 360, fill: "url(#g-bulb" + i + ")", opacity: 0 }, pools),
      halo: el("circle", { class: "fx", cx: x, cy: 34, r: 15, fill: WARM, filter: "url(#blur-sm)", opacity: 0 }, bulbsG),
      bulb: el("circle", { class: "fx-fill", cx: x, cy: 34, r: 6.5, fill: "#6b6370" }, bulbsG)
    });
  });

  var eq = roomEl.querySelector(".eq");
  for (var i = 0; i < 22; i++) {
    el("rect", { x: 246 + i * 14.4, y: 140 + (i % 5) * 6, width: 9, height: 110 - (i % 5) * 6, rx: 2 }, eq);
  }

  // ---------- people ----------
  var SHIRTS = ["#3d6a9a", "#9a4f84", "#4f8a5b"];
  var SEATS = [400, 318, 482];
  var peopleG = $("people");

  function makePerson(n) {
    var g = el("g", { class: "person" }, peopleG);
    el("rect", { x: -8, y: -24, width: 7, height: 24, rx: 3, fill: "#2b2633" }, g);
    el("rect", { x: 1, y: -24, width: 7, height: 24, rx: 3, fill: "#2b2633" }, g);
    el("path", { d: "M-12 -22 V-38 Q-12 -46 -4 -46 H4 Q12 -46 12 -38 V-22 Z", fill: SHIRTS[n % 3] }, g);
    el("circle", { cx: 0, cy: -54, r: 8.5, fill: "#e0b48f" }, g);
    el("path", { d: "M-8.5 -55 Q-8 -64 0 -64 Q8 -64 8.5 -55 Q4 -59 0 -59 Q-4 -59 -8.5 -55 Z", fill: ["#3a2a20", "#1e1a1a", "#7a4e2a"][n % 3] }, g);
    return { g: g, x: 784, y: 190, s: 0.95, seat: null };
  }

  function place(p, bob) {
    p.g.setAttribute("transform", "translate(" + p.x.toFixed(1) + " " + (p.y - (bob || 0)).toFixed(1) + ") scale(" + p.s.toFixed(3) + ")");
  }

  // Walk through waypoints {x, y, s, at}; `at` runs when the point is reached.
  function walk(p, pts, speed) {
    var e = epoch;
    speed = speed || 170;
    return new Promise(function (resolve) {
      var idx = 0;
      function next() {
        if (e !== epoch) return;
        if (idx >= pts.length) return resolve();
        var to = pts[idx++];
        var from = { x: p.x, y: p.y, s: p.s };
        var dist = Math.hypot(to.x - from.x, to.y - from.y);
        var dur = Math.max(60, (dist / speed) * 1000);
        var t0 = performance.now();
        function frame(t) {
          if (e !== epoch) return;
          var k = Math.min(1, (t - t0) / dur);
          p.x = from.x + (to.x - from.x) * k;
          p.y = from.y + (to.y - from.y) * k;
          p.s = from.s + ((to.s || from.s) - from.s) * k;
          var bob = REDUCED || to.sit ? 0 : Math.abs(Math.sin(((t - t0) / 1000) * 9)) * 2;
          place(p, bob);
          if (k < 1) setTimeout(tick, 16);
          else {
            if (to.at) to.at();
            next();
          }
        }
        function tick() {
          frame(performance.now());
        }
        setTimeout(tick, 16);
      }
      next();
    });
  }

  function freeSeat() {
    for (var i = 0; i < SEATS.length; i++) {
      var taken = S.people.some(function (p) {
        return p.seat === i;
      });
      if (!taken) return i;
    }
    return -1;
  }

  async function walkDown() {
    var seat = freeSeat();
    if (seat < 0) return;
    var p = makePerson(S.people.length);
    p.seat = seat;
    S.people.push(p);
    S.walking++;
    p.g.setAttribute("opacity", "0");
    place(p);
    if (!S.door) doorOpened();
    await realSleep(350);
    p.g.setAttribute("opacity", "1");
    var sx = SEATS[seat];
    await walk(p, [
      { x: 770, y: 190 },
      { x: 755, y: 220, at: doorClosed },
      { x: 725, y: 250 },
      { x: 695, y: 280 },
      { x: 665, y: 310, at: motionSeen },
      { x: 636, y: 342, s: 1 },
      { x: sx + 28, y: 352, s: 1.05 },
      { x: sx, y: 406, s: 1.3, sit: true }
    ]);
    S.walking--;
    render();
  }

  async function walkUp(p) {
    S.walking++;
    var sx = SEATS[p.seat];
    p.seat = null;
    await walk(p, [
      { x: sx, y: 356, s: 1.05, sit: true },
      { x: 636, y: 342, s: 1 },
      { x: 665, y: 310, at: motionSeen },
      { x: 695, y: 280 },
      { x: 725, y: 250 },
      { x: 755, y: 220 },
      {
        x: 776,
        y: 190,
        s: 0.95,
        at: function () {
          if (!S.door) doorOpened();
        }
      }
    ]);
    await realSleep(250);
    p.g.remove();
    S.people.splice(S.people.indexOf(p), 1);
    await realSleep(700);
    S.walking--;
    if (!S.walking) doorClosed(); // the last one out shuts the door
    render();
  }

  // ---------- light helpers ----------
  function setRoom(bri, color) {
    S.room.forEach(function (b) {
      b.bri = bri;
      b.color = color;
    });
  }
  function applyPalette() {
    S.room.forEach(function (b, i) {
      b.bri = [0.7, 0.55, 0.45, 0.4][ZONE[i]];
      b.color = SYNTH[ZONE[i]];
    });
  }
  function roomOn() {
    return S.room.some(function (b) {
      return b.bri > 0;
    });
  }
  function allOff() {
    setRoom(0, WARM);
    S.dimmer = 0;
    S.stairs = { bri: 0, color: WARM };
    S.bias = false;
  }
  function theaterActive() {
    return S.inUse || !!S.mode;
  }

  // ---------- sensor handlers (basement.py) ----------
  function ping(id) {
    var g = $(id);
    g.classList.remove("fire");
    void g.getBoundingClientRect();
    g.classList.add("fire");
  }

  function doorOpened() {
    S.door = true;
    T.door = now();
    var since = T.door - T.motionStart;
    direction = since > 0 && since < 25 ? "up" : "down";
    ping("sensor-door");
    if (theaterActive() && !S.social) {
      log("Stair door opened during a show");
      stealthStairs();
    } else if (!S.social) {
      S.stairs = { bri: CIRCADIAN, color: WARM };
      if (direction === "up") {
        log("Stair door opened " + Math.round(since) + " s after motion at the bottom: probably someone leaving");
        rule("doorUp");
      } else {
        log("Stair door opened, no motion at the bottom: someone's coming down. Stairs on");
        rule("doorDown");
      }
      timer("stairPeek", 180000, function () {
        if (!S.motion && !S.social && S.stairs.bri > 0) {
          S.stairs.bri = 0;
          log("Nobody arrived within 3 minutes: stairs off");
          render();
        }
      });
    } else {
      S.stairs =
        S.socialSource === "sports" ? { bri: 1, color: GREEN } : S.palette ? { bri: 0.4, color: SYNTH[1] } : { bri: CIRCADIAN, color: WARM };
      log("Stair door opened in Social mode: stairs on, and they stay on");
      rule("socialStairs");
    }
    render();
  }

  function recentMotion() {
    var last = Math.max(T.motionStart, T.motionClear);
    return S.motion || now() - last < 25;
  }

  function doorClosed() {
    S.door = false;
    var closeTs = now();
    if (S.curtain) {
      direction = "none";
      log("Door closed during the curtain call: someone walked out");
      rule("curtainOut");
      timer("curtainOut", 1500, function () {
        S.curtain = false;
        cancel("curtain");
        allOff();
        log("Whole basement off", "good");
        if (!S.people.length) rule("empty");
        render();
      });
      render();
      return;
    }
    if (S.social || theaterActive()) {
      direction = "none";
      render();
      return;
    }
    if (direction !== "up" && !recentMotion()) {
      render();
      return;
    }
    if (direction === "down" && closeTs - T.door < 180 && T.motionStart >= T.door) {
      direction = "none";
      log("Door closed by the last of a group coming down: not a walk-out");
      rule("group");
      render();
      return;
    }
    direction = "none";
    log("Door closed right after activity at the bottom. Waiting 20 s to make sure nobody's still downstairs");
    rule("walkWait");
    timer("walkout", 20000, function () {
      if (T.motionStart > closeTs || T.door > closeTs) {
        log("Motion downstairs after the door closed, so the walk-out is cancelled", "good");
        rule("walkCancel");
        render();
        return;
      }
      if (!S.social && !S.inUse) {
        allOff();
        if (S.people.length) {
          log("Nothing moved near the stairs for 20 s: basement off, with someone still on the couch", "warn");
          S.stranded = true;
          rule("stillGap");
        } else {
          log("Nothing moved for 20 s: basement off", "good");
          rule("empty");
        }
        render();
      }
    }, true);
    render();
  }

  function motionSeen() {
    S.motion = true;
    T.motionStart = now();
    ping("sensor-motion");
    timer("motionClear", 9000, function () {
      S.motion = false;
      T.motionClear = now();
      render();
    });
    if (S.social) {
      render();
      return; // Social mode is the presence lock: nothing automated happens
    }
    cancel("stairPeek");
    if (theaterActive()) {
      stealthStairs();
      render();
      return;
    }
    if (S.stairs.bri > 0) {
      setRoom(CIRCADIAN, WARM);
      S.dimmer = CIRCADIAN;
      log("Motion at the foot of the stairs with the stairs lit: room lights on at the evening circadian level");
      rule("arrive");
      timer("stairs", 30000, function () {
        if (!S.social && !theaterActive() && !S.curtain && S.stairs.bri > 0) {
          S.stairs.bri = 0;
          log("Stairs off");
          render();
        }
      });
    } else {
      S.stairs = { bri: CIRCADIAN, color: WARM };
      log("Motion at the bottom with the stairs dark: stairs on for 45 s");
      rule("heading");
      timer("stairs", 45000, function () {
        if (!S.social && !theaterActive() && S.stairs.bri > 0) {
          S.stairs.bri = 0;
          log("Stairs off");
          render();
        }
      });
    }
    render();
  }

  function stealthStairs() {
    S.stairs = { bri: 0.02, color: CANDLE };
    log("Stairs to 2% candlelight for 60 s. The room lights stay off");
    rule("stealth");
    timer("stealth", 60000, function () {
      if (!S.curtain && !S.social && S.stairs.bri > 0) {
        S.stairs.bri = 0;
        log("Stealth stairs back off");
        render();
      }
    });
  }

  // ---------- theater_lighting_sync() ----------
  function sync() {
    if (S.curtain || !S.inUse) return;
    if (S.mode === "sports") {
      if (S.sportsGreen && S.social && S.socialSource === "manual") return;
      S.sportsGreen = true;
      S.social = true;
      S.socialSource = "sports";
      S.palette = false;
      setRoom(1, GREEN);
      S.stairs = { bri: 1, color: GREEN };
      S.dimmer = 0;
      S.bias = true;
      rule("sports");
      return;
    }
    if (S.social) {
      rule("social");
      return;
    }
    cancel("intermission");
    S.bias = true;
    setRoom(0, WARM);
    if (S.mode === "music") {
      S.dimmer = 0;
      rule("music");
    } else if (S.media === "playing") {
      S.dimmer = 0;
      rule("showtime");
    } else if (S.mode === "movie" && S.media === "paused") {
      rule("pauseWait");
      realTimer("intermission", 4000, function () {
        if (S.media === "paused" && !S.social) {
          S.dimmer = GLOW;
          log("Still paused after 4 s: dimmer to a 3% glow");
          rule("intermission");
          render();
        }
      });
    } else {
      S.dimmer = GLOW;
      rule("preshow");
    }
  }

  // ---------- rendering ----------
  // Low brightness is hard to see in a cartoon, so map 3% to something visible.
  function vis(b) {
    return b <= 0 ? 0 : 0.32 + 0.68 * Math.min(1, b);
  }

  var lastSpill = null;
  function render() {
    var roomMax = 0;
    bulbEls.forEach(function (b, i) {
      var L = S.room[i];
      var v = vis(L.bri);
      roomMax = Math.max(roomMax, v);
      b.stops[0].setAttribute("stop-color", L.color);
      b.stops[1].setAttribute("stop-color", L.color);
      b.pool.setAttribute("opacity", (v * 0.75).toFixed(3));
      b.halo.setAttribute("opacity", v.toFixed(3));
      b.halo.setAttribute("fill", L.color);
      b.bulb.setAttribute("fill", v > 0 ? L.color : "#6b6370");
    });
    var dimV = vis(S.dimmer);
    canEls.forEach(function (c) {
      c.pool.setAttribute("opacity", (dimV * 0.9).toFixed(3));
      c.lamp.setAttribute("fill", dimV > 0 ? WARM : "#6b6370");
    });

    var stairV = vis(S.stairs.bri);
    $("stairlight").setAttribute("opacity", stairV.toFixed(3));
    $("stairlight").setAttribute("stroke", S.stairs.color);
    $("stairglow").setAttribute("opacity", (stairV * 0.9).toFixed(3));
    $("stairglow").setAttribute("stroke", S.stairs.color);

    $("door-panel").setAttribute("width", S.door ? "6" : "32");
    $("door-knob").setAttribute("opacity", S.door ? "0" : "1");
    $("door-lit").setAttribute("opacity", S.door ? "0.9" : "0");
    $("door-spill").setAttribute("opacity", S.door ? "0.35" : "0");

    var screenOn = S.rx && S.projector === "on" && S.mode;
    var loading = screenOn && S.media === "loading";
    var ambient = Math.max(roomMax * 0.95, S.dimmer > 0 && S.dimmer < 0.1 ? 0.24 : dimV * 0.75, stairV * 0.12, S.door ? 0.08 : 0, S.bias ? 0.1 : 0);
    var darkness = Math.min(0.9, Math.max(0.05, 0.9 * (1 - ambient)));
    $("dark").setAttribute("opacity", darkness.toFixed(3));
    $("bias").setAttribute("opacity", S.bias ? "0.6" : "0");
    $("beam").setAttribute("opacity", screenOn ? "0.12" : "0");
    $("lens").setAttribute("fill", S.projector === "on" ? "#fff8e1" : S.projector === "off" ? "#444" : "#ff8a65");

    var spillColor = screenOn ? (S.flashing ? "#2fd36b" : MODES[S.mode].spill) : null;
    if (spillColor && spillColor !== lastSpill) {
      roomEl.querySelectorAll("#g-spill stop").forEach(function (s) {
        s.setAttribute("stop-color", spillColor);
      });
      lastSpill = spillColor;
    }
    var spill = !screenOn ? 0 : loading ? 0.18 : S.media === "playing" || S.mode === "sports" ? 0.42 : 0.2;
    $("spill").setAttribute("opacity", spill.toFixed(2));

    ["movie", "game", "music", "sports"].forEach(function (m) {
      $("scr-" + m).setAttribute("opacity", screenOn && !loading && S.mode === m ? "1" : "0");
    });
    $("scr-loading").setAttribute("opacity", loading ? "1" : "0");
    $("scr-paused").setAttribute("opacity", screenOn && (S.media === "paused" || S.media === "idle") ? "1" : "0");
    roomEl.classList.toggle("paused", S.media !== "playing");
    roomEl.classList.toggle("movie-on", !!screenOn && S.media === "playing");
    $("score").textContent = "PHI " + S.score.phi + " · NYG " + S.score.nyg;

    if (S.stranded && (roomOn() || S.dimmer > 0 || !S.people.length)) S.stranded = false;
    var bubble = $("bubble");
    if (S.stranded) {
      var sp = S.people[0];
      bubble.setAttribute("transform", "translate(" + sp.x.toFixed(1) + " " + (sp.y - 96).toFixed(1) + ") scale(1.3)");
    }
    bubble.setAttribute("opacity", S.stranded ? "1" : "0");

    var rx = $("rx-text");
    rx.textContent = S.rx ? S.rx.input + " · " + S.rx.dsp.toUpperCase() : "STANDBY";
    rx.setAttribute("opacity", S.rx ? "1" : "0.15");

    // The page around the sim follows the room's lights.
    var house = $("house");
    house.style.opacity = S.inUse ? Math.max(0, Math.min(1, (darkness - 0.35) / 0.5)).toFixed(3) : "0";
    var green = S.room[0].color === GREEN && S.room[0].bri > 0 ? (S.flashing ? S.room[0].bri : 0.35) : 0;
    $("edge").style.opacity = (REDUCED ? Math.min(green, 0.35) : green).toFixed(2);

    // status panel
    var modeText = S.mode
      ? MODES[S.mode].label.toLowerCase() + ({ paused: " (paused)", idle: " (idle)", loading: " (starting)" }[S.media] || "")
      : S.inUse
        ? "on"
        : "off";
    $("st-mode").textContent = modeText;
    $("st-lighting").textContent = S.curtain
      ? "Curtain call"
      : S.social
        ? "Social" + (S.socialSource === "sports" ? " (game day)" : S.palette ? " · Synthwave" : "")
        : "Daily Driver";
    $("st-door").textContent = S.door ? "open" : "closed";
    $("st-motion").textContent = S.motion ? "detected" : "clear";
    $("st-rx").textContent = S.rx ? S.rx.input + " · " + S.rx.dsp : "off";
    $("st-proj").textContent = { off: "off", on: "on", cooling: "cooling down", polling: "checking current", fans: "ON (fans protected)" }[S.projector];
    $("st-amps").textContent = S.amps === null ? "unavailable" : S.amps.toFixed(2) + " A";
    $("st-bias").textContent = S.bias ? "on" : "off";

    // controls (during the tour every control stays clickable, so any press can take over)
    if (tourOn) {
      document.querySelectorAll("#controls .btn").forEach(function (b) {
        b.disabled = false;
      });
      document.querySelectorAll("#mode-buttons .btn").forEach(function (b) {
        b.setAttribute("aria-pressed", String(S.mode === b.dataset.mode));
      });
      $("btn-social").setAttribute("aria-pressed", String(S.social));
      $("btn-pause").textContent = S.mode && S.media !== "playing" && S.media !== "loading" ? "▶ Play" : "⏸ Pause";
      return;
    }
    var locked = S.busy || S.flashing || S.walking > 0;
    document.querySelectorAll("#mode-buttons .btn").forEach(function (b) {
      b.setAttribute("aria-pressed", String(S.mode === b.dataset.mode));
      b.disabled = locked;
    });
    $("btn-down").disabled = locked || freeSeat() < 0;
    $("btn-up").disabled = locked || !S.people.length || S.inUse;
    $("btn-one").disabled = locked || S.people.length < 2 || S.inUse;
    $("btn-pause").disabled = !S.mode || locked || S.media === "loading";
    $("btn-pause").textContent = S.mode && S.media !== "playing" && S.media !== "loading" ? "▶ Play" : "⏸ Pause";
    $("btn-td").disabled = S.mode !== "sports" || locked;
    $("btn-fg").disabled = S.mode !== "sports" || locked;
    $("btn-social").disabled = locked;
    $("btn-social").setAttribute("aria-pressed", String(S.social));
    $("btn-end").disabled = !S.inUse || locked;
  }

  // ---------- projector current chart ----------
  var CH = { w: 260, h: 84, max: 340 }; // 90 s cooldown + 25 polls x 10 s
  var chartPts = [];
  function ay(a) {
    return CH.h - Math.sqrt(Math.min(a, 2) / 2) * (CH.h - 6); // square-root scale so 0.06 A is visible
  }
  function ax(t) {
    return (Math.min(t, CH.max) / CH.max) * CH.w;
  }
  function chartReset() {
    chartPts = [];
    $("amps-line").setAttribute("points", "");
    $("amps-dots").textContent = "";
    $("amps-cool").setAttribute("width", "0");
    $("amps-cool-label").setAttribute("opacity", "0");
    $("amps-empty").setAttribute("opacity", "1");
    var y = ay(0.06);
    $("amps-thresh").setAttribute("y1", y);
    $("amps-thresh").setAttribute("y2", y);
    $("amps-thresh-label").setAttribute("y", y - 3);
  }
  function chartStart() {
    chartReset();
    $("amps-empty").setAttribute("opacity", "0");
    $("amps-cool").setAttribute("width", ax(90));
    $("amps-cool-label").setAttribute("opacity", "1");
  }
  function chartPoint(t, a) {
    if (a === null) {
      chartPts.push(null);
    } else {
      chartPts.push([ax(t), ay(a)]);
    }
    $("amps-line").setAttribute(
      "points",
      chartPts
        .filter(Boolean)
        .map(function (p) {
          return p[0].toFixed(1) + "," + p[1].toFixed(1);
        })
        .join(" ")
    );
  }
  function chartDot(t, a, cls) {
    el("circle", { cx: ax(t), cy: a === null ? CH.h - 2 : ay(a), r: 3, class: "amps-dot " + cls }, $("amps-dots"));
  }

  // Lamp-off current: fans run hard, then spin down to standby.
  function fanAmps(t) {
    var a = t < 100 ? 0.9 - t * 0.004 : Math.max(0.04, 0.5 * Math.exp(-(t - 100) / 12));
    return Math.round(a * 100) / 100;
  }

  // ---------- actions ----------
  async function ensureSomeoneHome() {
    if (!S.people.length) await walkDown();
  }

  async function play(mode) {
    if (S.busy || S.flashing || S.walking || S.mode === mode) return;
    S.busy = true;
    render();
    await ensureSomeoneHome();
    var m = MODES[mode];
    var wasCurtain = S.curtain;
    S.curtain = false;
    cancel("curtain");
    if (wasCurtain) log("New session: curtain call over");

    if (S.mode === "sports" && mode !== "sports" && S.socialSource === "sports") {
      S.social = false;
      S.socialSource = null;
      log("Switched away from the game, so the game-day Social mode drops back to Daily Driver");
    }
    if (!S.inUse) log("Theater session started");
    S.inUse = true;
    S.mode = mode;
    S.media = "loading";

    var projectorUp = S.projector === "on";
    if (mode === "music" && !projectorUp) {
      log("Music with the projector off: it stays off, and the phone streams straight to the receiver");
      S.rx = { input: m.input, dsp: m.dsp };
    } else {
      if (S.projector === "cooling" || S.projector === "polling" || S.projector === "fans") {
        log("New show during the projector cooldown: cooldown cancelled, power stays on, lamp back on", "good");
        rule("cooldownCancel");
        S.projector = "on";
        await realSleep(1400);
      }
      if (S.projector !== "on") {
        S.projector = "on";
        log("Projector relay closed, lamp warming up");
      }
      S.amps = 1.92;
      S.rx = { input: m.input, dsp: m.dsp };
      $("loading-text").textContent = "Launching " + m.app + "…";
    }
    if (mode === "game") S.batocera = true;
    log(m.label + ": receiver to " + m.input + ", " + m.dsp);
    sync();
    render();

    if (mode === "sports" && $("opt-tuners").checked) {
      log("Both HDHomeRun tuners are busy", "warn");
      rule("tuner");
      render();
      log("Force-releasing tuner 1 over the tuner's TCP control protocol (port 65001)");
      await realSleep(1200);
      log("Waited 0.6 s for the tuner to settle, then launched live TV");
      log("Phone notification: tuner 1 preempted for the basement", "good");
    }
    await realSleep(mode === "music" ? 600 : 1600);
    S.media = "playing";
    if (mode === "sports") {
      log("Kickoff: Social mode on, room and stairs Kelly green at 100%");
    } else if (S.social) {
      log("Social mode is on, so the theater leaves the lights alone");
    } else {
      log(mode === "music" ? "Music playing: room stays fully dark" : "Now playing: blackout, bias lights on");
    }
    sync();
    S.busy = false;
    render();
  }

  function togglePause() {
    if (!S.mode || S.busy || S.flashing || S.media === "loading") return;
    var playing = S.media === "playing";
    S.media = playing ? (S.mode === "game" ? "idle" : "paused") : "playing";
    if (playing) {
      if (S.social) log("Paused. Social mode is on, so the lights don't move");
      else if (S.mode === "music") log("Paused. Music stays fully dark by design");
      else if (S.mode === "movie") log("Paused. Waiting 4 s before changing the lights");
      else log("Game idle: dimmer to a 3% glow");
    } else {
      if (S.mode === "movie" && !S.social && S.dimmer === 0) log("Resumed within 4 s, so the lights never moved");
      else if (!S.social && S.mode !== "music") log("Playing: back to blackout");
      else log("Playing");
    }
    sync();
    render();
  }

  async function toggleSocial() {
    if (S.busy || S.flashing || S.walking) return;
    if (S.social) {
      S.social = false;
      S.socialSource = null;
      S.palette = false;
      log("Social mode off: back to Daily Driver" + (S.inUse ? ", theater rules apply again" : ""));
      if (S.inUse) {
        sync();
      } else {
        setRoom(CIRCADIAN, WARM);
        S.dimmer = CIRCADIAN;
        S.stairs = { bri: 0, color: WARM };
        rule("arrive");
      }
    } else {
      S.busy = true;
      render();
      await ensureSomeoneHome();
      S.busy = false;
      S.social = true;
      S.socialSource = "manual";
      S.palette = true;
      applyPalette();
      S.dimmer = 0.35;
      S.stairs = { bri: 0.4, color: SYNTH[1] };
      cancel("stairs");
      log("Social mode on, Synthwave palette picked. The theater won't touch the lights and nothing times out");
      rule("social");
    }
    render();
  }

  async function someoneDown() {
    if (S.busy || S.flashing || S.walking || freeSeat() < 0) return;
    await walkDown();
  }

  async function oneLeaves() {
    if (S.busy || S.flashing || S.walking || S.people.length < 2 || S.inUse) return;
    await walkUp(S.people[S.people.length - 1]);
  }

  async function everyoneUp() {
    if (S.busy || S.flashing || S.walking || !S.people.length || S.inUse) return;
    var ps = S.people.slice();
    var walks = ps.map(function (p, i) {
      return realSleep(i * 900).then(function () {
        return walkUp(p);
      });
    });
    await Promise.all(walks);
  }

  async function flash(kind) {
    if (S.mode !== "sports" || S.flashing || S.busy) return;
    S.flashing = true;
    roomEl.classList.add("flashing");
    var td = kind === "td";
    $("flash-text").textContent = td ? "TOUCHDOWN" : "FIELD GOAL";
    $("scr-flash").setAttribute("opacity", "1");
    rule("flash");
    log(td ? "Touchdown! Six surges between 100% and 15%, then E-A-G-L-E-S" : "Field goal: three pulses between 100% and 15%");
    render();

    function bri(b) {
      setRoom(b, GREEN);
      S.stairs = { bri: b, color: GREEN };
      render();
    }
    var reps = td ? 6 : 3;
    var hi = td ? 650 : 550;
    var lo = td ? 450 : 400;
    for (var i = 0; i < reps; i++) {
      bri(1);
      await realSleep(hi);
      bri(0.15);
      await realSleep(lo);
    }
    if (td) {
      await realSleep(550); // anticipation breath
      bri(1);
      await realSleep(650);
      bri(0.15);
      await realSleep(450);
      bri(1);
      await realSleep(650);
      S.score.phi += 7;
    } else {
      S.score.phi += 3;
    }
    bri(1);
    S.flashing = false;
    roomEl.classList.remove("flashing");
    $("scr-flash").setAttribute("opacity", "0");
    log("Holding solid Kelly green, because the game's still on", "good");
    rule("sports");
    render();
  }

  async function cooldown() {
    S.projector = "cooling";
    rule("cooldown");
    chartStart();
    log("Projector lamp off, fans still running. Mandatory 90 s cooldown");
    var t = 0;
    for (; t < 90; t += 5) {
      if (S.mode && ACTIVE[S.mode]) return;
      S.amps = fanAmps(t);
      chartPoint(t, S.amps);
      render();
      await sleep(5000);
    }
    S.projector = "polling";
    var low = 0;
    var failShown = false;
    for (var n = 1; n <= 25; n++, t += 10) {
      if (S.mode && ACTIVE[S.mode]) return;
      if ($("opt-sensor").checked) {
        low = 0;
        S.amps = null;
        chartPoint(t, null);
        chartDot(t, null, "bad");
        log("Poll " + n + "/25: current sensor unavailable, retrying", "warn");
        if (!failShown) rule("sensorFail");
        failShown = true;
        render();
        await sleep(10000);
        continue;
      }
      var a = fanAmps(t);
      S.amps = a;
      low = a <= 0.06 ? low + 1 : 0;
      chartPoint(t, a);
      chartDot(t, a, a <= 0.06 ? "ok" : "");
      log("Poll " + n + "/25: " + a.toFixed(2) + " A" + (a <= 0.06 ? " (" + low + " of 2 low readings in a row)" : ""));
      render();
      if (low >= 2) {
        S.projector = "off";
        S.amps = 0;
        log("Two readings in a row at or below 0.06 A: projector relay open", "good");
        render();
        return;
      }
      await sleep(10000);
    }
    S.projector = "fans";
    log("No confirmed reading in 25 tries: mains stay ON so the fans keep running", "warn");
    rule("sensorFail");
    render();
  }

  async function batoceraOff() {
    log("Batocera: clean software shutdown");
    await sleep(5000);
    log("Batocera drawing under 0.05 A, holding for 12 s");
    await sleep(12000);
    S.batocera = false;
    log("Under 0.05 A for 12 s straight: Batocera relay open", "good");
    render();
  }

  async function endSession() {
    if (!S.inUse || S.busy || S.flashing) return;
    S.busy = true;
    cancel("intermission");
    var gaming = S.mode === "game" || S.batocera;
    log("Session end: house lights up first");
    S.curtain = true;
    S.dimmer = 0.2;
    S.stairs = { bri: 0.2, color: WARM };
    S.bias = false;
    if (!S.social) setRoom(0.2, WARM);
    rule("sessionEnd");
    render();
    await sleep(1500);
    if (S.batocera) {
      rule("batocera");
      batoceraOff();
    }
    log(gaming ? "TV box: CEC sleep only (never HOME after gaming)" : "TV box: HOME, then CEC sleep");
    await sleep(2000);
    log("Receiver to AUDIO1 to cut HDMI pass-through, then off with zone 2");
    S.mode = null;
    S.media = "off";
    S.rx = null;
    if (S.projector === "on") S.amps = 0.9;
    render();
    await sleep(2000);
    S.inUse = false;
    if (S.social) {
      S.social = false;
      S.socialSource = null;
      S.palette = false;
      setRoom(0.2, WARM);
    }
    S.sportsGreen = false;
    log("Center channel trim reset to 0.0 dB. Lighting back to Daily Driver");
    log("Curtain call: house lights at 20% for 10 minutes");
    rule("curtain");
    timer("curtain", 600000, function () {
      if (S.curtain) {
        S.curtain = false;
        allOff();
        log("Curtain call over: basement off");
        render();
      }
    });
    S.busy = false;
    render();
    if (S.projector === "on") {
      await sleep(2500);
      cooldown();
    }
  }

  // ---------- reset, tour and takeover ----------

  function reset() {
    epoch++;
    Object.keys(timers).forEach(cancel);
    peopleG.textContent = "";
    S = freshState();
    T = { door: -1e9, motionStart: -1e9, motionClear: -1e9 };
    direction = "none";
    roomEl.classList.remove("flashing");
    $("scr-flash").setAttribute("opacity", "0");
    $("opt-tuners").checked = false;
    $("opt-sensor").checked = false;
    $("log").textContent = "";
    chartReset();
    rule("empty");
    log("Basement empty. Daily Driver, every light off");
    render();
  }

  function setTour(on, label) {
    tourOn = on;
    $("tour-badge").hidden = !on;
    if (label) $("tour-label").textContent = "Playing: " + label;
    roomEl.classList.toggle("touring", on);
    render();
  }

  // Put someone on the couch with the room lit, skipping the walk.
  function seatNow() {
    var p = makePerson(S.people.length);
    p.seat = freeSeat();
    p.x = SEATS[p.seat];
    p.y = 406;
    p.s = 1.3;
    place(p);
    S.people.push(p);
    setRoom(CIRCADIAN, WARM);
    S.dimmer = CIRCADIAN;
    log("Someone's on the couch, room lights on");
    render();
  }

  async function waitForProjector() {
    while (S.projector === "on" || S.projector === "cooling" || S.projector === "polling") await tourSleep(400);
  }

  // One short scripted scenario per chapter.
  var SCENES = {
    1: [
      "Coming or going?",
      async function () {
        await tourSleep(700);
        await walkDown(); // door, then motion: an arrival
        await tourSleep(400);
        await walkDown(); // a second arrival right behind looks like a departure at first
        await tourSleep(3500);
        await oneLeaves(); // motion, then door: a walk-out. The one still sitting is invisible to it
        await tourSleep(4000);
      }
    ],
    2: [
      "Don't flicker the lights",
      async function () {
        seatNow();
        await play("movie");
        await tourSleep(2500);
        togglePause(); // a quick blip: the lights never move
        await tourSleep(1500);
        togglePause();
        await tourSleep(2500);
        togglePause(); // a real pause: 4 s later, the glow
        await tourSleep(6500);
        togglePause();
        await tourSleep(2500);
        await play("sports");
        await tourSleep(2000);
        await flash("td");
        await tourSleep(1500);
      }
    ],
    3: [
      "When in doubt, leave it on",
      async function () {
        seatNow();
        await play("movie");
        await tourSleep(2000);
        await endSession();
        await waitForProjector();
        await tourSleep(1500);
      }
    ]
  };

  var current = null; // chapter on screen: 1, 2, 3 or "free"

  async function runScene(id) {
    var n = parseInt(id, 10);
    var scene = SCENES[n];
    reset();
    var e = ++tourEpoch;
    setTour(true, scene[0]);
    if (id === "3u") {
      $("opt-sensor").checked = true;
      log("Current sensor unplugged");
    }
    await scene[1]();
    if (e === tourEpoch) setTour(false);
  }

  // Any control press ends a running scene. If an action is mid-flight, start clean.
  function takeOver() {
    if (!tourOn) return;
    tourEpoch++;
    setTour(false);
    if (S.busy || S.flashing || S.walking) reset();
    log("You're in control");
    render();
  }

  function on(id, fn) {
    $(id).addEventListener("click", function () {
      takeOver();
      fn();
    });
  }

  document.querySelectorAll("#mode-buttons .btn").forEach(function (b) {
    b.addEventListener("click", function () {
      takeOver();
      play(b.dataset.mode);
    });
  });
  on("btn-down", someoneDown);
  on("btn-up", everyoneUp);
  on("btn-one", oneLeaves);
  on("btn-pause", togglePause);
  on("btn-td", function () {
    flash("td");
  });
  on("btn-fg", function () {
    flash("fg");
  });
  on("btn-social", toggleSocial);
  on("btn-end", endSession);
  ["opt-tuners", "opt-sensor"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      var v = this.checked;
      takeOver();
      this.checked = v;
    });
  });
  $("tour-badge").addEventListener("click", takeOver);
  document.querySelectorAll("[data-play]").forEach(function (b) {
    b.addEventListener("click", function () {
      current = parseInt(b.dataset.play, 10);
      markActive();
      runScene(b.dataset.play);
    });
  });

  // ---------- chapters follow the scroll ----------
  var sections = [].slice.call(document.querySelectorAll(".chapter, .freeplay"));

  function markActive() {
    sections.forEach(function (sec) {
      var id = sec.dataset.ch ? parseInt(sec.dataset.ch, 10) : "free";
      sec.classList.toggle("active", id === current);
    });
  }

  function activate(id) {
    if (id === current) return;
    current = id;
    markActive();
    if (id === "free") takeOver();
    else runScene(String(id));
  }

  reset();
  current = 1;
  markActive();
  setTimeout(function () {
    if (current === 1 && !tourOn && !S.people.length) runScene("1");
  }, 600);

  // The section crossing a line just below the middle of the screen is the active one.
  function pick() {
    var line = window.innerHeight * 0.55;
    for (var i = sections.length - 1; i >= 0; i--) {
      var r = sections[i].getBoundingClientRect();
      if (r.top <= line) {
        if (r.bottom > line || i === sections.length - 1) {
          var sec = sections[i];
          activate(sec.dataset.ch ? parseInt(sec.dataset.ch, 10) : "free");
        }
        return;
      }
    }
  }
  var pickQueued = false;
  window.addEventListener(
    "scroll",
    function () {
      if (pickQueued) return;
      pickQueued = true;
      setTimeout(function () {
        pickQueued = false;
        pick();
      }, 150);
    },
    { passive: true }
  );
  setInterval(pick, 1000);
})();
