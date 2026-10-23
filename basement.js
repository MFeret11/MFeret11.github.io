// Basement theater simulator.
// A simplified, in-browser copy of the rules in github.com/MFeret11/home-assistant-config
// (theater.py, basement.py, sports.py). It never talks to the real house.
(function () {
  "use strict";

  var SPEED = 10; // long waits (cooldowns, timers) run this many times faster
  var WARM = "#ffd9a8"; // adaptive warm white
  var CANDLE = "#ff9a4a"; // 2000 K "stealth" stair light
  var GREEN = "#00aa23"; // Eagles Kelly green, rgb(0, 170, 35)
  var SOCIAL = "#ffc477";
  var NS = "http://www.w3.org/2000/svg";

  var MODES = {
    movie: { label: "Movie", input: "HDMI1", dsp: "Standard", app: "the streaming app" },
    game: { label: "Retro game", input: "HDMI2", dsp: "Straight", app: "Batocera" },
    music: { label: "Music", input: "HDMI1", dsp: "7ch Stereo", app: "Spotify" },
    sports: { label: "Eagles game", input: "HDMI1", dsp: "Sports", app: "the HDHomeRun app" }
  };

  var S = {
    inUse: false,
    mode: null,
    playing: false,
    pauseCommitted: false,
    social: false,
    socialSource: null,
    projector: "off", // off | on | cooling | polling | fans
    amps: 0,
    rx: null,
    batocera: false,
    dimmer: 0.6,
    room: { bri: 0.75, color: WARM },
    stairs: { bri: 0, color: WARM },
    bias: false,
    score: { phi: 0, nyg: 0 },
    busy: false,
    flashing: false
  };

  var $ = function (id) {
    return document.getElementById(id);
  };
  var roomEl = $("room");
  var pauseTimer = null;
  var stairTimer = null;

  // ---------- sim clock: runs at SPEED while a long wait is in progress ----------
  var simMs = 20 * 3600 * 1000;
  var fastWaits = 0;
  var lastTick = performance.now();

  function clockText() {
    var t = Math.floor(simMs / 1000) % 86400;
    var pad = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    return pad(Math.floor(t / 3600)) + ":" + pad(Math.floor((t % 3600) / 60)) + ":" + pad(t % 60);
  }

  setInterval(function () {
    var now = performance.now();
    simMs += (now - lastTick) * (fastWaits > 0 ? SPEED : 1);
    lastTick = now;
    $("st-clock").textContent = clockText();
  }, 200);

  function sleep(simDelay) {
    fastWaits++;
    return new Promise(function (resolve) {
      setTimeout(function () {
        fastWaits--;
        resolve();
      }, simDelay / SPEED);
    });
  }

  function realSleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // Background timers (like the stair light) also run fast, but don't speed up the clock.
  function simTimeout(simDelay, fn) {
    return setTimeout(fn, simDelay / SPEED);
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

  // ---------- build the light fixtures ----------
  var BULBS = [60, 112, 175, 238, 300, 500, 562, 625, 688]; // nine Zigbee bulbs
  var CANS = [140, 660]; // the theater dimmer
  var pools = $("pools");
  var bulbs = $("bulbs");
  var bulbEls = [];
  var canEls = [];

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  }

  CANS.forEach(function (x) {
    canEls.push({
      pool: el("ellipse", { class: "pool", cx: x, cy: 170, rx: 120, ry: 170, fill: WARM, filter: "url(#blur-lg)", opacity: 0 }, pools),
      lamp: el("rect", { class: "light", x: x - 24, y: 12, width: 48, height: 6, rx: 2, fill: "#666" }, bulbs)
    });
  });

  BULBS.forEach(function (x) {
    el("line", { x1: x, y1: 12, x2: x, y2: 22, stroke: "#5b5160", "stroke-width": 2 }, bulbs);
    bulbEls.push({
      pool: el("ellipse", { class: "pool", cx: x, cy: 130, rx: 70, ry: 120, fill: WARM, filter: "url(#blur-lg)", opacity: 0 }, pools),
      halo: el("circle", { class: "light", cx: x, cy: 28, r: 14, fill: WARM, filter: "url(#blur-sm)", opacity: 0 }, bulbs),
      bulb: el("circle", { class: "light", cx: x, cy: 28, r: 7, fill: "#777" }, bulbs)
    });
  });

  var eq = roomEl.querySelector(".eq");
  for (var i = 0; i < 24; i++) {
    el("rect", { x: 236 + i * 14, y: 150 + (i % 5) * 6, width: 9, height: 120 - (i % 5) * 6, rx: 2 }, eq);
  }

  // ---------- lighting rules ----------
  function applyLights() {
    if (S.flashing) return;
    if (S.social) {
      var sports = S.socialSource === "sports";
      S.room = { bri: sports ? 1 : 0.8, color: sports ? GREEN : SOCIAL };
      S.dimmer = sports ? 0 : 0.35;
      if (sports) S.stairs = { bri: 1, color: GREEN };
      S.bias = S.inUse;
      return;
    }
    if (!S.inUse) {
      S.room = { bri: 0.75, color: WARM };
      S.dimmer = 0.6;
      S.bias = false;
      if (S.stairs.color === GREEN) S.stairs = { bri: 0, color: WARM };
      return;
    }
    // Daily Driver with the theater in use: the theater governs the whole basement.
    S.bias = true;
    S.room = { bri: 0, color: WARM };
    if (S.stairs.color === GREEN) S.stairs = { bri: 0, color: WARM };
    S.dimmer = S.mode !== "music" && !S.playing && S.pauseCommitted ? 0.01 : 0;
  }

  // Low brightness is hard to see in a cartoon, so map 1% to something visible.
  function vis(b) {
    return b <= 0 ? 0 : 0.15 + 0.85 * b;
  }

  function render() {
    var roomV = vis(S.room.bri);
    var dimV = vis(S.dimmer);
    bulbEls.forEach(function (b) {
      b.pool.setAttribute("opacity", (roomV * 0.55).toFixed(3));
      b.pool.setAttribute("fill", S.room.color);
      b.halo.setAttribute("opacity", roomV.toFixed(3));
      b.halo.setAttribute("fill", S.room.color);
      b.bulb.setAttribute("fill", roomV > 0 ? S.room.color : "#6b6370");
    });
    canEls.forEach(function (c) {
      c.pool.setAttribute("opacity", (dimV * 0.9).toFixed(3));
      c.lamp.setAttribute("fill", dimV > 0 ? WARM : "#6b6370");
    });

    var stairV = vis(S.stairs.bri);
    ["stairlight", "stairglow"].forEach(function (id) {
      $(id).setAttribute("opacity", stairV.toFixed(3));
      $(id).setAttribute("stroke", S.stairs.color);
    });

    var screenOn = S.rx && S.projector === "on" && S.mode;
    var ambient = Math.max(roomV * 0.9, dimV * 0.7, stairV * 0.12, S.bias ? 0.1 : 0, screenOn ? 0.08 : 0);
    $("dark").setAttribute("opacity", Math.min(0.9, Math.max(0.04, 0.92 * (1 - ambient))).toFixed(3));
    $("bias").setAttribute("opacity", S.bias ? "0.55" : "0");
    $("beam").setAttribute("opacity", screenOn ? "0.13" : "0");
    $("lens").setAttribute("fill", S.projector === "on" ? "#fff8e1" : S.projector === "off" ? "#444" : "#ff8a65");

    ["movie", "game", "music", "sports"].forEach(function (m) {
      $("scr-" + m).setAttribute("opacity", screenOn && S.mode === m ? "1" : "0");
    });
    $("scr-paused").setAttribute("opacity", screenOn && !S.playing ? "1" : "0");
    roomEl.classList.toggle("paused", !S.playing);
    $("score").textContent = "PHI " + S.score.phi + " · NYG " + S.score.nyg;

    var rx = $("rx-text");
    rx.textContent = S.rx ? S.rx.input + " · " + S.rx.dsp.toUpperCase() : "STANDBY";
    rx.setAttribute("opacity", S.rx ? "1" : "0.15");

    // status panel
    $("st-mode").textContent = S.mode ? MODES[S.mode].label.toLowerCase() + (S.playing ? "" : " (paused)") : S.inUse ? "on" : "off";
    $("st-lighting").textContent = S.social ? "Social" + (S.socialSource === "sports" ? " (game day)" : "") : "Daily Driver";
    $("st-rx").textContent = S.rx ? S.rx.input + " · " + S.rx.dsp : "off";
    $("st-proj").textContent =
      { off: "off", on: "on", cooling: "cooling down", polling: "checking current", fans: "ON (fans protected)" }[S.projector];
    $("st-amps").textContent = S.amps === null ? "unavailable" : S.amps.toFixed(2) + " A";
    $("st-bias").textContent = S.bias ? "on" : "off";

    // controls
    var locked = S.busy || S.flashing;
    document.querySelectorAll("#mode-buttons .btn").forEach(function (b) {
      b.setAttribute("aria-pressed", String(S.mode === b.dataset.mode));
      b.disabled = locked;
    });
    $("btn-pause").disabled = !S.mode || locked;
    $("btn-pause").textContent = S.playing || !S.mode ? "⏸ Pause" : "▶ Play";
    $("btn-td").disabled = S.mode !== "sports" || locked;
    $("btn-fg").disabled = S.mode !== "sports" || locked;
    $("btn-stairs").disabled = S.flashing;
    $("btn-social").disabled = locked;
    $("btn-social").setAttribute("aria-pressed", String(S.social));
    $("btn-end").disabled = !S.inUse || locked;
  }

  // ---------- actions ----------
  async function play(mode) {
    if (S.busy || S.flashing || S.mode === mode) return;
    var m = MODES[mode];
    if (!S.inUse) {
      S.inUse = true;
      log("Theater session started");
    }
    if (S.projector !== "on") {
      S.projector = "on";
      S.amps = 1.92;
      log("Projector relay closed, lamp warming up");
    }
    if (S.mode === "sports" && mode !== "sports" && S.socialSource === "sports") {
      S.social = false;
      S.socialSource = null;
      log("Switched away from the game, so the game-day Social mode drops back to Daily Driver");
    }
    clearTimeout(pauseTimer);
    S.mode = mode;
    S.playing = true;
    S.pauseCommitted = false;
    S.rx = { input: m.input, dsp: m.dsp };
    if (mode === "game") S.batocera = true;
    log(m.label + ": receiver to " + m.input + ", " + m.dsp + ", launching " + m.app);

    if (mode === "sports") {
      if ($("opt-tuners").checked) {
        S.busy = true;
        render();
        log("Both HDHomeRun tuners are busy", "warn");
        log("Force-releasing tuner 1 over the tuner's TCP control protocol (port 65001)");
        await sleep(600);
        log("Waited 0.6 s for the tuner to settle, then launched live TV");
        log("ntfy: tuner 1 preempted for the basement", "good");
        S.busy = false;
      }
      S.social = true;
      S.socialSource = "sports";
      log("Kickoff: Social mode on, room and stairs Kelly green at 100%");
    } else if (S.social) {
      log("Social mode is on, so the theater leaves the lights alone");
    } else {
      log("Daily Driver: blackout, bias lights on");
    }
    applyLights();
    render();
  }

  function togglePause() {
    if (!S.mode || S.busy || S.flashing) return;
    S.playing = !S.playing;
    clearTimeout(pauseTimer);
    if (!S.playing) {
      if (S.social) {
        log("Paused. Social mode is on, so the lights don't move");
      } else if (S.mode === "music") {
        log("Paused. Music stays fully dark by design");
      } else if (S.mode === "movie") {
        log("Paused. Waiting 4.0 s before changing the lights, so a menu blip doesn't flicker them");
        pauseTimer = setTimeout(function () {
          S.pauseCommitted = true;
          log("Still paused: dimmer up to a 1% glow, lounge and bar stay off");
          applyLights();
          render();
        }, 4000);
      } else {
        S.pauseCommitted = true;
        log("Game idle: dimmer up to a 1% glow");
      }
    } else {
      if (S.pauseCommitted && !S.social) log("Playing: back to blackout");
      else if (S.mode === "movie" && !S.social) log("Resumed within 4 s, so the lights never moved");
      else log("Playing");
      S.pauseCommitted = false;
    }
    applyLights();
    render();
  }

  function toggleSocial() {
    if (S.busy || S.flashing) return;
    if (S.social) {
      S.social = false;
      S.socialSource = null;
      log("Social mode off: back to Daily Driver" + (S.inUse ? ", theater rules apply again" : ""));
    } else {
      S.social = true;
      S.socialSource = "manual";
      log("Social mode on: lights stay on and the theater stops touching them");
    }
    applyLights();
    render();
  }

  function stairs() {
    clearTimeout(stairTimer);
    if (S.social) {
      S.stairs = { bri: 1, color: S.socialSource === "sports" ? GREEN : SOCIAL };
      log("Stair door opened: in Social mode the stair lights just stay on");
    } else if (S.inUse) {
      S.stairs = { bri: 0.02, color: CANDLE };
      log("Stair door opened mid-show: stairs to 2% candlelight (2000 K) for 60 s, enough to see the steps without washing out the screen");
      stairTimer = simTimeout(60000, function () {
        if (!S.social) {
          S.stairs.bri = 0;
          log("Stair lights back off");
          render();
        }
      });
    } else {
      S.stairs = { bri: 0.8, color: WARM };
      log("Door, then motion at the bottom within 18 s: someone is coming down. Stairs on");
      stairTimer = simTimeout(60000, function () {
        if (!S.social && !S.inUse) {
          S.stairs.bri = 0;
          log("Stair lights off");
          render();
        }
      });
    }
    render();
  }

  async function flash(kind) {
    if (S.mode !== "sports" || S.flashing || S.busy) return;
    S.flashing = true;
    roomEl.classList.add("flashing");
    var td = kind === "td";
    $("flash-text").textContent = td ? "TOUCHDOWN" : "FIELD GOAL";
    $("scr-flash").setAttribute("opacity", "1");
    log(
      td
        ? "Touchdown! Six surges between 100% and 15%, then E-A-G-L-E-S. The color never changes, so the Zigbee mesh isn't flooded"
        : "Field goal: three pulses between 100% and 15%, same solid green"
    );
    render();

    function bri(b) {
      S.room = { bri: b, color: GREEN };
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
      for (var j = 0; j < 2; j++) {
        bri(1);
        await realSleep(650);
        if (j === 0) {
          bri(0.15);
          await realSleep(450);
        }
      }
      S.score.phi += 7;
    } else {
      S.score.phi += 3;
    }
    bri(1);
    S.flashing = false;
    roomEl.classList.remove("flashing");
    $("scr-flash").setAttribute("opacity", "0");
    log("Holding solid Kelly green, because the game's still on", "good");
    render();
  }

  async function pollProjector() {
    var readings = [0.41, 0.18, 0.07, 0.05, 0.04];
    var low = 0;
    S.projector = "polling";
    for (var n = 1; n <= 15; n++) {
      if ($("opt-sensor").checked) {
        S.projector = "fans";
        S.amps = null;
        log("Poll " + n + "/15: current sensor unavailable", "warn");
        log("Can't confirm the lamp has cooled, so mains stay ON and the fans keep running. Plug the sensor back in to retry", "warn");
        render();
        return;
      }
      var a = readings[Math.min(n - 1, readings.length - 1)];
      S.amps = a;
      low = a <= 0.06 ? low + 1 : 0;
      log("Poll " + n + "/15: " + a.toFixed(2) + " A" + (a <= 0.06 ? " (" + low + " of 2 low readings in a row)" : ""));
      render();
      if (low >= 2) {
        S.projector = "off";
        S.amps = 0;
        log("Two readings in a row at or below 0.06 A: projector relay open. Goodnight", "good");
        render();
        return;
      }
      await sleep(10000);
    }
  }

  async function endSession() {
    if (!S.inUse || S.busy || S.flashing) return;
    S.busy = true;
    clearTimeout(pauseTimer);
    render();
    log("Session end: running the ordered shutdown");
    log("CEC sleep to the TV box");
    await sleep(2500);
    S.rx = null;
    S.mode = null;
    S.playing = false;
    log("Receiver main zone and zone 2 off");
    render();

    if (S.batocera) {
      log("Batocera: clean software shutdown first");
      await sleep(5000);
      log("Batocera drawing under 0.05 A, holding for 12 s");
      await sleep(12000);
      S.batocera = false;
      log("Under 0.05 A for 12 s straight: Batocera relay open", "good");
    }

    S.social = false;
    S.socialSource = null;
    S.inUse = false;
    S.pauseCommitted = false;
    applyLights();
    log("Lighting back to Daily Driver, adaptive lighting on");
    log("Center channel trim reset to 0.0 dB");
    S.playing = true;
    render();

    S.projector = "cooling";
    log("Projector lamp off, fans still running. Mandatory 90 s cooldown");
    for (var t = 0; t < 9; t++) {
      S.amps = 0.95 - t * 0.05;
      render();
      await sleep(10000);
    }
    await pollProjector();
    S.busy = false;
    render();
  }

  // ---------- wire up ----------
  document.querySelectorAll("#mode-buttons .btn").forEach(function (b) {
    b.addEventListener("click", function () {
      play(b.dataset.mode);
    });
  });
  $("btn-pause").addEventListener("click", togglePause);
  $("btn-td").addEventListener("click", function () {
    flash("td");
  });
  $("btn-fg").addEventListener("click", function () {
    flash("fg");
  });
  $("btn-stairs").addEventListener("click", stairs);
  $("btn-social").addEventListener("click", toggleSocial);
  $("btn-end").addEventListener("click", endSession);
  $("opt-sensor").addEventListener("change", async function () {
    if (!this.checked && S.projector === "fans" && !S.busy) {
      log("Current sensor back online, checking the projector again");
      S.busy = true;
      render();
      await pollProjector();
      S.busy = false;
      render();
    }
  });

  S.playing = true;
  log("Basement idle. Daily Driver: adaptive lighting on");
  render();
})();
