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
  // A rule can pin its own commit (5th field), e.g. the mmWave rules that came later.
  var REPO = "https://github.com/MFeret11/home-assistant-config/blob/";
  var OLD = "c1f5e84ce9be0d1441bb63ce18d28d74e4ba2d4a"; // before the mmWave sensor
  var NEW = "8cab0de"; // mmWave presence added to basement.py
  var RULES = {
    doorOnly: ["First version: door only", "The door opened, so the lights came on. A door can't tell someone arriving from someone leaving, so nothing ever turns them off.", null],
    empty: ["Empty basement", "Nobody's downstairs, so every light is off.", "basement.py", 597],
    doorDown: ["Someone's coming down", "The stair door opened with no recent motion at the bottom, so it's an arrival. Stairs on at the Adaptive Lighting level; they time out after 3 minutes if nobody arrives.", "basement.py", 413],
    arrive: ["Made it down", "Motion at the foot of the stairs while the stairs are lit: the room lights come on at the evening circadian level, and the stairs go off 30 s later.", "basement.py", 480],
    heading: ["Heading up?", "Motion at the bottom with the stairs dark: light them for 45 s in case someone's about to climb.", "basement.py", 480],
    doorUp: ["Someone's leaving?", "The door opened within 25 s of motion at the bottom of the stairs. That order usually means someone walked up and out. If it was really someone arriving, the walk-out check catches it.", "basement.py", 420],
    walkWait: ["Walk-out check", "The door closed behind someone leaving. Wait 20 s: new motion at the bottom or the door reopening cancels the shutoff.", "basement.py", 575],
    stillGap: ["The wasp got lost", "Nothing moved near the stairs for 20 s after the door closed, so the lights went off, with someone still on the couch. A motion sensor can't see a person sitting still. (This is the code before the mmWave sensor.)", "basement.py", 575],
    mmwaveHold: ["Still someone here", "The door closed behind someone leaving, but the mmWave sensor still sees a person on the couch, so the walk-out is cancelled. If the sensor goes offline, the door and stairs rules take over.", "basement.py", 602, NEW],
    walkCancel: ["Still someone here", "Motion at the bottom of the stairs after the door closed: someone's down here, so the lights stay on.", "basement.py", 575],
    group: ["A group coming down", "The door opened, motion at the bottom, then the door closed: that's the last person shutting it behind the first. Not a walk-out.", "basement.py", 565],
    stealth: ["Stealth stairs", "A show is on: stairs fade to 2% candlelight (2000 K) for 60 s. Enough to see the steps without washing out the screen. The room lights stay off.", "basement.py", 372],
    preshow: ["Pre-show", "The theater is on but nothing's playing yet: the dimmer holds a 3% glow, the rest of the basement is dark, bias lights on.", "basement.py", 701],
    showtime: ["Showtime", "Something is playing: full blackout. Only the bias lights behind the screen stay on.", "basement.py", 686],
    intermission: ["Intermission", "Paused: the dimmer comes up to a 3% glow (after 4 s in the real room). The lounge and bar stay off.", "basement.py", 692],
    music: ["Music", "Music stays fully dark, playing or paused. No glow state, by design.", "basement.py", 667],
    warmMusic: ["Music, projector still warm", "The projector is already on, so music leaves it running. Cutting its power now would stop the fans cooling the lamp. It shuts down properly when the session ends.", "theater.py", 2005, NEW],
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
  var OPT = { tuners: false, sensor: false }; // "try to break it" switches
  var ACTIVE = { movie: 1, game: 1, sports: 1 }; // modes that cancel a projector cooldown

  var $ = function (id) {
    return document.getElementById(id);
  };
  function setText(id, text) {
    var e = $(id);
    if (e) e.textContent = text;
  }
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
  var FULL = { motion: true, mmwave: true };
  var GEAR = FULL; // sensors installed right now; chapters 1 and 2 start with fewer
  var T = { door: -1e9, motionStart: -1e9, motionClear: -1e9 }; // sim seconds
  var direction = "none";

  // ---------- time ----------
  // epoch: bumping it cancels every running action (their waits never resolve).
  var epoch = 0;
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
    setText("st-clock", clockText());
  }, 200);

  function wait(ms, fast) {
    var e = epoch;
    if (fast) fastWaits++;
    return new Promise(function (resolve) {
      setTimeout(
        function () {
          if (fast) fastWaits--;
          if (epoch === e) resolve();
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
    if (!list) return;
    list.insertBefore(li, list.firstChild);
    while (list.children.length > 60) list.removeChild(list.lastChild);
  }

  function rule(id) {
    S.rule = id;
    var r = RULES[id];
    if (!$("rule")) return; // no caption on the page
    $("rule-name").textContent = r[0];
    $("rule-text").textContent = r[1];
    var link = $("rule-link");
    link.hidden = !r[2];
    if (r[2]) {
      link.href = REPO + (r[4] || OLD) + "/pyscript/" + r[2] + "#L" + r[3];
      link.textContent = r[2] + ":" + r[3];
    }
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
    if (!GEAR.motion && !theaterActive() && !S.social) {
      setRoom(CIRCADIAN, WARM);
      S.dimmer = CIRCADIAN;
      log("Stair door opened: lights on");
      rule("doorOnly");
    } else if (theaterActive() && !S.social) {
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
    if (!GEAR.motion) {
      render(); // the first version only knew about the door opening
      return;
    }
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
      if (GEAR.mmwave && S.people.length) {
        ping("sensor-mmwave");
        log("mmWave still sees someone on the couch, so the walk-out is cancelled", "good");
        rule("mmwaveHold");
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
    if (!GEAR.motion) return; // not installed yet
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
      // The real room waits 4 s first (so menu blips don't flicker the lights); the demo skips the wait.
      S.dimmer = GLOW;
      rule("intermission");
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

    $("sensor-motion").style.display = GEAR.motion ? "" : "none";
    $("sensor-mmwave").style.display = GEAR.mmwave ? "" : "none";

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
    setText("st-mode", modeText);
    setText("st-lighting", S.curtain
      ? "Curtain call"
      : S.social
        ? "Social" + (S.socialSource === "sports" ? " (game day)" : S.palette ? " · Synthwave" : "")
        : "Daily Driver");
    setText("st-door", S.door ? "open" : "closed");
    setText("st-motion", S.motion ? "detected" : "clear");
    setText("st-rx", S.rx ? S.rx.input + " · " + S.rx.dsp : "off");
    setText("st-proj", { off: "off", on: "on", cooling: "cooling down", polling: "checking current", fans: "ON (fans protected)" }[S.projector]);
    setText("st-amps", S.amps === null ? "unavailable" : S.amps.toFixed(2) + " A");
    setText("st-bias", S.bias ? "on" : "off");

    renderGuide();

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

    if (mode === "sports" && OPT.tuners) {
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
    if (mode === "music" && projectorUp) {
      log("Projector already warm: music leaves it running, so the lamp's fans keep their power");
      rule("warmMusic");
    }
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
      else if (S.mode === "movie") log("Paused: dimmer to a 3% glow");
      else log("Game idle: dimmer to a 3% glow");
    } else {
      if (!S.social && S.mode !== "music") log("Playing: back to blackout");
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
      if (OPT.sensor) {
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

  // ---------- reset and instant setups ----------
  // Steps start from a still picture, set up with no animation. Nothing moves until a button is pressed.

  function reset(gear) {
    epoch++;
    GEAR = gear || FULL;
    Object.keys(timers).forEach(cancel);
    peopleG.textContent = "";
    S = freshState();
    T = { door: -1e9, motionStart: -1e9, motionClear: -1e9 };
    direction = "none";
    roomEl.classList.remove("flashing");
    $("scr-flash").setAttribute("opacity", "0");
    OPT.tuners = false;
    OPT.sensor = false;
    if ($("log")) $("log").textContent = "";
    chartReset();
    rule("empty");
    log("Basement empty. Daily Driver, every light off");
    if (!GEAR.motion) log("First version: only the door sensor is installed");
    else if (!GEAR.mmwave) log("Door and stairs motion sensors installed, no mmWave yet");
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
    rule("arrive");
    log("Someone's on the couch, room lights on");
    render();
  }

  // Someone on the couch with a movie already playing.
  function showNow() {
    seatNow();
    var m = MODES.movie;
    S.inUse = true;
    S.mode = "movie";
    S.media = "playing";
    S.projector = "on";
    S.amps = 1.92;
    S.rx = { input: m.input, dsp: m.dsp };
    log("A movie is playing: blackout, bias lights on");
    sync();
    render();
  }

  // ---------- the guide ----------
  var running = 0; // "Try it" steps still playing, including the pauses between their moves
  function idle() {
    return !running && !S.busy && !S.flashing && !S.walking;
  }

  function mode(m) {
    return {
      ok: idle,
      run: function () {
        return play(m);
      },
      pressed: function () {
        return S.mode === m;
      }
    };
  }

  // Each "Try it" button: when it can be pressed, and what it does.
  var done = {};
  var TASKS = {
    // 1. Coming and going: see the problem, then add the fix and try again
    tryDoor: {
      ok: function () { return idle() && !GEAR.motion && S.people.length === 0 && !done.tryDoor; },
      run: async function () {
        await walkDown();
        await realSleep(1000);
        await walkUp(S.people[0]);
      }
    },
    addMotion: {
      resets: true,
      ok: function () { return idle() && !!done.tryDoor && !done.addMotion; },
      run: async function () {
        reset({ motion: true, mmwave: false });
        ping("sensor-motion");
        log("Motion sensor added at the bottom of the stairs", "good");
        await realSleep(900);
        await walkDown();
        await realSleep(1000);
        await walkUp(S.people[0]);
        await sleep(21000); // the walk-out check
      }
    },
    // 2. More than one person
    friendVisit: {
      ok: function () { return idle() && !GEAR.mmwave && S.people.length === 1 && !done.friendVisit; },
      run: async function () {
        await walkDown();
        await realSleep(1200);
        await oneLeaves();
        await sleep(21000);
      }
    },
    addMmwave: {
      resets: true,
      ok: function () { return idle() && !!done.friendVisit && !done.addMmwave; },
      run: async function () {
        reset(FULL);
        seatNow();
        ping("sensor-mmwave");
        log("mmWave presence sensor added. It covers the couch", "good");
        await realSleep(900);
        await walkDown();
        await realSleep(1200);
        await oneLeaves();
        await sleep(21000);
      }
    },
    // 3. During the show (and 5)
    startMovie: { ok: function () { return idle() && !S.mode; }, run: function () { return play("movie"); } },
    snack: {
      ok: function () { return idle() && S.mode === "movie" && S.media === "playing" && S.people.length === 1; },
      run: async function () {
        togglePause(); // pause first: pause icon on screen, dim glow
        await realSleep(1400);
        await walkUp(S.people[0]);
        await realSleep(1500);
        await walkDown();
        await realSleep(900);
        togglePause(); // back on the couch: resume, lights down
      }
    },
    // 4. One button per mode
    movie: mode("movie"),
    game: mode("game"),
    music: mode("music"),
    sports: mode("sports"),
    // 5. Music without the projector
    movieToMusic: {
      ok: function () { return idle() && !S.mode && !done.movieToMusic; },
      run: async function () {
        await play("movie");
        await realSleep(1500);
        await play("music");
      }
    },
    end: { ok: function () { return idle() && S.inUse && !!done.movieToMusic && !done.end; }, run: endSession },
    unplug: {
      resets: true,
      ok: function () { return idle() && !!done.end && !S.inUse; },
      run: async function () {
        reset();
        showNow();
        OPT.sensor = true;
        log("Current sensor unplugged", "warn");
        await realSleep(900);
        await endSession();
      }
    },
    // 6. Game day
    gameday: { ok: function () { return idle() && S.mode !== "sports"; }, run: function () { return play("sports"); } },
    td: { ok: function () { return idle() && S.mode === "sports"; }, run: function () { return flash("td"); } }
  };

  // Notes that appear once their moment has happened, and stay until the step restarts.
  var NOTES = {
    tryDoor: function () { return !!done.tryDoor; },
    addMotion: function () { return !!done.addMotion && S.rule === "empty"; },
    friendVisit: function () { return S.rule === "stillGap"; },
    addMmwave: function () { return S.rule === "mmwaveHold"; },
    movieToMusic: function () { return !!done.movieToMusic; },
    td: function () { return !!done.td; },
    unplug: function () { return S.rule === "sensorFail"; }
  };
  var shown = {};

  function renderGuide() {
    document.querySelectorAll("[data-task]").forEach(function (b) {
      var id = b.dataset.task;
      var t = TASKS[id];
      b.disabled = !t.ok();
      if (t.pressed) b.setAttribute("aria-pressed", String(t.pressed()));
      else b.classList.toggle("done", !!done[id]);
    });
    // Show one "Try it" button at a time: the first one not done yet.
    document.querySelectorAll(".tasks").forEach(function (list) {
      var items = [].slice.call(list.children);
      var cur = items.filter(function (li) {
        return !li.querySelector("[data-task]").classList.contains("done");
      })[0] || items[items.length - 1];
      items.forEach(function (li) {
        li.hidden = li !== cur;
      });
      var label = list.previousElementSibling;
      if (label && label.classList.contains("try") && items.length > 1) {
        label.textContent = "Try it · " + (items.indexOf(cur) + 1) + " of " + items.length;
      }
    });
    var pb = document.querySelector('[data-task="pause"]');
    if (pb) pb.textContent = S.mode === "movie" && S.media === "paused" ? "▶ Play" : "⏸ Pause";
    document.querySelectorAll("[data-after]").forEach(function (n) {
      var id = n.dataset.after;
      if (NOTES[id]()) shown[id] = true;
      n.hidden = !shown[id];
    });
    $("rd-proj").textContent = { off: "off", on: "on", cooling: "cooling down", polling: "checking current", fans: "on (fans protected)" }[S.projector];
    $("rd-rx").textContent = S.rx ? S.rx.input + " · " + S.rx.dsp : "off";
    $("rd-app").textContent = !S.mode
      ? "none"
      : S.mode === "music" && S.projector !== "on"
        ? "none (phone streams to the receiver)"
        : MODES[S.mode].app;
  }

  document.querySelectorAll("[data-task]").forEach(function (b) {
    b.addEventListener("click", async function () {
      var id = b.dataset.task;
      var t = TASKS[id];
      if (!t.ok()) return;
      var e = epoch;
      running++;
      var job = t.run();
      render();
      try {
        await job;
      } finally {
        running--;
      }
      if (e === epoch || t.resets) done[id] = t.finished ? t.finished() : true; // tasks that start with their own reset still count
      render();
    });
  });

  var steps = [].slice.call(document.querySelectorAll(".step"));
  var HASH = ["", "step-1", "step-2", "step-3", "step-4", "step-5", "step-6", "step-7"];
  function seated() {
    reset();
    seatNow();
  }
  var SETUP = [
    reset,
    function () {
      reset({ motion: false, mmwave: false });
    },
    function () {
      reset({ motion: true, mmwave: false });
      seatNow();
    },
    seated,
    seated,
    seated,
    seated,
    seated
  ];
  var step = 0;

  function goTo(n, fromClick) {
    step = n;
    running = 0; // a step cut off mid-play never finishes, so don't wait for it
    steps.forEach(function (s) {
      s.hidden = parseInt(s.dataset.step, 10) !== n;
    });
    document.querySelectorAll(".step-nav [data-go]").forEach(function (b) {
      if (parseInt(b.dataset.go, 10) === n) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
    steps[n].querySelectorAll("[data-task]").forEach(function (b) {
      delete done[b.dataset.task];
    });
    steps[n].querySelectorAll("[data-after]").forEach(function (b) {
      delete shown[b.dataset.after];
    });
    SETUP[n]();
    try {
      history.replaceState(null, "", HASH[n] ? "#" + HASH[n] : location.pathname + location.search);
    } catch (e) {}
    if (!fromClick) return;
    steps[n].querySelector("h2").focus({ preventScroll: true });
    // Bring the top of the new step into view, below the room on phones.
    var phone = matchMedia("(max-width: 900px)").matches;
    var limit = phone ? document.querySelector(".stage-sticky").offsetHeight + 8 : 90;
    var top = $("guide").getBoundingClientRect().top;
    if (top < limit) window.scrollBy({ top: top - limit, behavior: REDUCED ? "auto" : "smooth" });
  }

  document.querySelectorAll("[data-go]").forEach(function (b) {
    b.addEventListener("click", function () {
      goTo(parseInt(b.dataset.go, 10), true);
    });
  });
  document.querySelectorAll("[data-next]").forEach(function (b) {
    b.addEventListener("click", function () {
      goTo(Math.min(step + 1, steps.length - 1), true);
    });
  });
  document.querySelectorAll("[data-back]").forEach(function (b) {
    b.addEventListener("click", function () {
      goTo(Math.max(step - 1, 0), true);
    });
  });
  document.querySelectorAll("[data-redo]").forEach(function (b) {
    b.addEventListener("click", function () {
      goTo(step, false);
    });
  });


  var start = HASH.indexOf(location.hash.slice(1));
  goTo(start > 0 ? start : 0, false);
})();
