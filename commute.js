// Good Morning Dashboard demo: a kitchen display, a phone and the trip plan, driven one click at a time.
// The cards copy the Home Assistant kitchen dashboard templates, the pushes copy
// app/afternoon_check.py, and the pairing copies _plan_connection() in app/commute.py
// (Good_Morning_Dashboard). Lines and stations are real SEPTA ones, but not the household's;
// train numbers and times are made up.
(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  // ---------- Time ----------

  function hm(h, m) {
    return h * 60 + m;
  }

  function fmt(t, ampm) {
    var h = Math.floor(t / 60), m = t % 60;
    var s = (h % 12 || 12) + ":" + (m < 10 ? "0" : "") + m;
    return ampm === false ? s : s + (h < 12 ? " AM" : " PM");
  }

  // ---------- The two commutes ----------

  var WALK = 5;
  var MISSED_FLOOR = -5; // MISSED_CONNECTION_BUFFER_MINUTES: a connection that left more than 5 min ago is gone
  var STATIONS = ["Jefferson Station", "Suburban Station", "30th Street Station"];

  // Times are for Suburban Station; the other Center City stops shift them.
  // Morning trains come in from the north (Jefferson first); evening ones from the west (30th Street first).
  var TRIPS = {
    am: {
      from: "Hatboro", to: "Wayne", track: "1",
      offset: { "Jefferson Station": -4, "Suburban Station": 0, "30th Street Station": 5 },
      leg1: { train: "2417", line: "Warminster", dep: hm(6, 58), arr: hm(7, 38) },
      leg2: [
        { train: "9536", line: "Paoli/Thorndale", dep: hm(7, 45), arr: hm(8, 14), track: "2" },
        { train: "9540", line: "Paoli/Thorndale", dep: hm(8, 15), arr: hm(8, 44), track: "2" }
      ]
    },
    pm: {
      from: "Wayne", to: "Hatboro", track: "4",
      offset: { "Jefferson Station": 4, "Suburban Station": 0, "30th Street Station": -5 },
      leg1: { train: "9563", line: "Paoli/Thorndale", dep: hm(17, 12), arr: hm(17, 41) },
      leg2: [
        { train: "2560", line: "Warminster", dep: hm(17, 50), arr: hm(18, 31), track: "3" },
        { train: "2564", line: "Warminster", dep: hm(18, 20), arr: hm(19, 1), track: "3" }
      ]
    }
  };

  // Mirrors _plan_connection: the first connection that can still be caught, compared with the
  // one that would be caught if everything ran on schedule.
  function plan(kind, station, d1, d2) {
    var T = TRIPS[kind], off = T.offset[station];
    function catchable(arrival, live) {
      for (var i = 0; i < T.leg2.length; i++) {
        var c = T.leg2[i], late = live && i === 0 ? d2 : 0;
        var dep = c.dep + off + late;
        if (dep - arrival >= MISSED_FLOOR) return { c: c, dep: dep, arr: c.arr + late, buffer: dep - arrival };
      }
      return null;
    }
    var arrival = T.leg1.arr + off + d1;
    var live = catchable(arrival, true);
    var sched = catchable(T.leg1.arr + off, false);
    return {
      T: T, station: station, d1: d1,
      dep1: T.leg1.dep + d1, arr1: arrival, leaveBy: T.leg1.dep + d1 - WALK,
      conn: live.c, dep2: live.dep, arr2: live.arr, buffer: live.buffer,
      planned: sched.arr, missed: live.c !== sched.c,
      atRisk: live.buffer < 0,
      total: Math.max(0, live.arr - sched.arr)
    };
  }

  // ---------- Kitchen cards (kitchen.yaml) ----------

  var WEATHER_AM = "🌡️ <b>41°F</b> now · AM 41° / PM 55° · Light jacket / sweater 🧥";

  function amCard(p, clock) {
    var leaveNow = clock >= p.leaveBy - 3;
    var level = leaveNow || p.missed ? "alert" : p.atRisk || p.total > 0 ? "warn" : "ok";
    var train = "Train " + p.T.leg1.train + " · Track " + p.T.track;
    var head = leaveNow
      ? "<h3 class=\"k-h1\">🚨 LEAVE NOW</h3><p class=\"k-h3\">" + train + " departs at <b>" + fmt(p.dep1) + "</b></p>"
      : "<h3 class=\"k-h1\">🕐 Leave by <b>" + fmt(p.leaveBy) + "</b></h3><p class=\"k-h3\">" + train + " · Departs <b>" + fmt(p.dep1) + "</b></p>";
    var status;
    if (p.missed) status = "🚨 Misses the planned connection · next is train " + p.conn.train + " at " + fmt(p.dep2) + " · arrive " + fmt(p.arr2);
    else if (p.atRisk) status = "⚠️ Tight connection at " + p.station + " · arrive " + fmt(p.arr2);
    else if (p.total > 0) status = (p.total >= 10 ? "🔴 " : "🟡 ") + p.total + " min late · arrive " + fmt(p.arr2);
    else status = "🟢 On time · arrive " + fmt(p.arr2);
    return { level: level, html: head + "<p>" + status + "</p><hr><p>" + WEATHER_AM + "</p>" };
  }

  function pmCard(p, stale) {
    var level = p.missed || p.total >= 10 ? "alert" : p.atRisk || p.total > 0 ? "warn" : "ok";
    var head;
    if (p.missed) head = "<h3 class=\"k-h1\">🚨 MISSED CONNECTION</h3><p class=\"k-h3\">Next connection: train " + p.conn.train + " at " + fmt(p.dep2) + "</p>";
    else if (p.atRisk) head = "<h3 class=\"k-h1\">⚠️ Tight connection</h3><p class=\"k-h3\">Train " + p.conn.train + " leaves " + p.station + " at " + fmt(p.dep2) + " · Track " + p.conn.track + "</p>";
    else if (p.total > 0) head = "<h3 class=\"k-h1\">" + (p.total >= 10 ? "🔴" : "🟡") + " Delayed " + p.total + " min</h3>";
    else head = "<h3 class=\"k-h1\">🟢 On Time</h3>";
    var home = "🏡 <b>Home by " + fmt(p.arr2) + "</b>" + (p.total > 0 ? " (planned " + fmt(p.planned) + ")" : "");
    return {
      level: level,
      html: head +
        "<p>Train " + p.T.leg1.train + " at " + fmt(p.dep1) + " · " + p.T.leg1.line + " → " + p.conn.line +
        " via " + p.station + " · Track " + p.conn.track + "</p><hr>" +
        "<p>" + home + "</p>" +
        "<p>☔ Rain likely (60%) on the way home</p>" +
        (stale ? "<p>⏳ SEPTA didn't respond just now; times are from a few minutes ago.</p>" : "")
    };
  }

  function idleCard() {
    return {
      level: "idle",
      html: "<h3 class=\"k-h1\">Have a great day!</h3><p class=\"k-h3\">Light jacket / sweater 🧥</p><p>🌡️ <b>52°F</b> · High 55° / Low 38°</p>"
    };
  }

  // ---------- Pushes (afternoon_check.py) ----------

  var RAIN = "Weather: Rain likely (60%) on the way home.";
  var STALE_NOTE = "SEPTA didn't respond just now; train times are from a few minutes ago.";

  function late(n) {
    return n ? " (" + n + " min late)" : "";
  }

  function pushFor(p, opts) {
    opts = opts || {};
    var prefix = opts.update ? "Update: " : "";
    var head = "Train " + p.T.leg1.train + " · Track " + p.T.track + " departs " + fmt(p.dep1);
    var n;
    if (p.missed) {
      n = {
        icon: "🚨", level: "alert", title: "Missed Connection Alert",
        body: "Train " + p.T.leg1.train + " reaches " + p.station + " too late for the planned connection. Next connection is train " +
          p.conn.train + " at " + fmt(p.dep2) + ", arriving " + fmt(p.arr2) + " (planned " + fmt(p.planned) + ")."
      };
    } else if (!p.d1 && !p.total) {
      n = { icon: "✅", title: "Commute looks good", body: head + ", on time, arriving " + fmt(p.arr2) + "." };
    } else {
      n = { icon: "🟡", title: "Minor delay today", body: head + late(p.d1) + ", arriving " + fmt(p.arr2) + late(p.total) + "." };
    }
    var parts = [n.body];
    if (opts.stale) parts.push(STALE_NOTE);
    if (opts.weather) parts.push(RAIN);
    return { icon: n.icon, level: n.level, title: prefix + n.title, body: parts.join("\n\n") };
  }

  var FAILED = {
    icon: "⚠️", level: "warn", title: "Commute check failed",
    body: "The commute check hit an error and couldn't read train data. Check SEPTA manually."
  };

  // ---------- State and rendering ----------

  var S;

  function reset(o) {
    S = {
      clock: o.clock,
      date: o.date || "Tuesday, March 3",
      kind: o.kind,            // which trip the plan strip shows
      card: o.card || "trip",  // "trip" or "idle"
      d1: 0, d2: 0,
      stale: false,
      pushes: [],
      log: [],
      showLog: !!o.showLog
    };
  }

  var station = "Suburban Station";

  function current() {
    return plan(S.kind, station, S.d1, S.d2);
  }

  function push(n) {
    S.pushes.unshift({ n: n, time: fmt(S.clock), fresh: true });
  }

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function stop(name, time, cls) {
    return "<div class=\"tp-stop" + (cls ? " " + cls : "") + "\"><span class=\"tp-name\">" + name + "</span><span class=\"tp-time\">" + time + "</span></div>";
  }

  function leg(line, train, note) {
    return "<div class=\"tp-leg\"><span class=\"tp-line\">" + line.replace("/", "/<wbr>") + "<span class=\"ln\"> Line</span></span><span class=\"tp-train\">train " + train + (note ? " · " + note : "") + "</span></div>";
  }

  function renderPlan(p) {
    var T = p.T;
    var transferNote = p.missed ? "missed the " + fmt(p.T.leg2[0].dep + p.T.offset[p.station], false) + ", next one"
      : p.atRisk ? "tight: " + (-p.buffer) + " min after it's due out"
      : p.buffer + " min to change";
    var cls = p.missed ? "bad" : p.atRisk ? "warn" : "";
    $("tp-route").innerHTML =
      stop(T.from, fmt(p.dep1, false)) +
      leg(T.leg1.line, T.leg1.train, p.d1 ? p.d1 + " min late" : "") +
      stop(p.station.replace(" Station", ""), fmt(p.arr1, false) + " → " + fmt(p.dep2, false), "tp-x " + cls) +
      leg(p.conn.line, p.conn.train, transferNote) +
      stop(T.to, fmt(p.arr2, false));
    $("tp-title").textContent = S.kind === "am" ? "Morning trip plan" : "Evening trip plan";
    document.querySelectorAll("[data-station]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.station === station));
    });
  }

  function render() {
    var p = current();
    $("k-clock").textContent = fmt(S.clock);
    $("k-date").textContent = S.date;
    var card = S.card === "idle" ? idleCard() : S.kind === "am" ? amCard(p, S.clock) : pmCard(p, S.stale);
    $("k-card").dataset.level = card.level;
    $("k-card").innerHTML = card.html;
    $("p-time").textContent = fmt(S.clock, false);
    renderPlan(p);

    var list = $("p-list");
    list.innerHTML = "";
    S.pushes.forEach(function (x, i) {
      var li = document.createElement("li");
      li.className = "p-note" + (x.fresh ? " fresh" : "") + (x.n.level ? " " + x.n.level : "") + (i >= 2 ? " older" : "");
      li.innerHTML =
        "<p class=\"p-app\"><span aria-hidden=\"true\">" + x.n.icon + "</span> ntfy · " + x.time + "</p>" +
        "<p class=\"p-title\">" + esc(x.n.title) + "</p>" +
        "<p class=\"p-body\">" + esc(x.n.body).replace(/\n\n/g, "<br>") + "</p>";
      list.appendChild(li);
      x.fresh = false;
    });
    $("p-empty").hidden = S.pushes.length > 0;

    var log = $("cm-log");
    log.hidden = !S.showLog || !S.log.length;
    log.innerHTML = "";
    S.log.slice(-3).forEach(function (l) {
      var li = document.createElement("li");
      li.innerHTML = "<span class=\"t\">" + l[0] + "</span> " + l[1] + " · <b>" + l[2] + "</b>";
      log.appendChild(li);
    });
  }

  // ---------- Chapters ----------

  function morning() {
    reset({ clock: hm(6, 40), kind: "am" });
  }

  function beforeFour() {
    reset({ clock: hm(15, 59), kind: "pm", card: "idle", showLog: true });
  }

  var SETUP = [
    morning,
    morning,
    morning,
    beforeFour,
    function () {
      reset({ clock: hm(16, 15), kind: "pm", showLog: true });
      S.clock = hm(16, 0);
      push(pushFor(current(), { weather: true }));
      S.pushes[0].fresh = false;
      S.clock = hm(16, 15);
      S.log = [["4:00 PM", "Afternoon check", "pushed"], ["4:05–4:15", "Follow-ups: no change", "quiet"]];
    },
    beforeFour,
    function () {
      reset({ clock: hm(16, 45), kind: "pm" });
      S.d1 = 20; S.d2 = 5;
    }
  ];

  var TASKS = {
    late10: {
      run: function () { S.clock = hm(6, 44); S.d1 = 10; }
    },
    late14: {
      after: "late10",
      run: function () { S.clock = hm(6, 48); S.d1 = 14; }
    },
    late5: {
      run: function () { S.clock = hm(6, 44); S.d1 = 5; }
    },
    leaveNow: {
      after: "late5",
      run: function () { S.clock = hm(6, 56); }
    },
    pmPush: {
      run: function () {
        S.clock = hm(16, 0);
        S.card = "trip";
        push(pushFor(current(), { weather: true }));
        S.log.push(["4:00 PM", "Afternoon check: on time", "pushed"]);
      }
    },
    slip3: {
      run: function () {
        S.clock = hm(16, 20);
        S.d2 = 3;
        push(pushFor(current(), { update: true }));
        S.log.push(["4:20 PM", "Connection 3 min late, worse than “looks good”", "pushed"]);
      }
    },
    slip5: {
      after: "slip3",
      run: function () {
        S.clock = hm(16, 30);
        S.d2 = 5;
        S.log.push(["4:30 PM", "5 min late, same kind of news", "quiet"]);
      }
    },
    missed: {
      after: "slip5",
      run: function () {
        S.clock = hm(16, 45);
        S.d1 = 20;
        push(pushFor(current(), { update: true }));
        S.log.push(["4:45 PM", "Misses the connection, worse", "pushed"]);
      }
    },
    stale: {
      run: function () {
        S.clock = hm(16, 0);
        S.card = "trip";
        S.stale = true;
        push(pushFor(current(), { stale: true, weather: true }));
        S.log.push(["4:00 PM", "SEPTA timed out, used the last answer", "pushed, flagged"]);
      }
    },
    crash: {
      after: "stale",
      run: function () {
        S.date = "Wednesday, March 4";
        S.stale = false; // the display is fine; only the push job crashed
        push(FAILED);
        S.log.push(["Wed 4:00 PM", "Check crashed", "pushed “check failed”"]);
      }
    }
  };

  var done = {};
  var steps = [].slice.call(document.querySelectorAll(".step"));
  var HASH = ["", "step-1", "step-2", "step-3", "step-4", "step-5", "step-6"];
  var REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var step = 0;

  // Show one "Try it" button at a time, plus the notes for what has happened.
  function syncTasks() {
    steps[step].querySelectorAll("[data-task]").forEach(function (b) {
      var t = TASKS[b.dataset.task];
      var isDone = !!done[b.dataset.task];
      var next = (!t.after || done[t.after]) && !isDone;
      b.closest("li").hidden = !(isDone || next);
      b.classList.toggle("done", isDone);
      b.disabled = isDone;
    });
    steps[step].querySelectorAll("[data-after]").forEach(function (n) {
      n.hidden = !done[n.dataset.after];
    });
  }

  document.querySelectorAll("[data-task]").forEach(function (b) {
    b.addEventListener("click", function () {
      var id = b.dataset.task;
      if (done[id]) return;
      TASKS[id].run();
      done[id] = true;
      render();
      syncTasks();
    });
  });

  // Picking a transfer station re-plans the trip on the spot; earlier pushes stay as they were sent.
  document.querySelectorAll("[data-station]").forEach(function (b) {
    b.addEventListener("click", function () {
      station = b.dataset.station;
      render();
    });
  });

  function goTo(n, fromClick) {
    step = n;
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
    SETUP[n]();
    render();
    syncTasks();
    try {
      history.replaceState(null, "", HASH[n] ? "#" + HASH[n] : location.pathname + location.search);
    } catch (e) {}
    if (!fromClick) return;
    steps[n].querySelector("h2").focus({ preventScroll: true });
    var phone = matchMedia("(max-width: 900px)").matches;
    var limit = phone ? document.querySelector(".stage-sticky").offsetHeight + 8 : 90;
    var top = $("guide").getBoundingClientRect().top;
    if (top < limit) window.scrollBy({ top: top - limit, behavior: REDUCED ? "auto" : "smooth" });
  }

  document.querySelectorAll("[data-go]").forEach(function (b) {
    b.addEventListener("click", function () { goTo(parseInt(b.dataset.go, 10), true); });
  });
  document.querySelectorAll("[data-next]").forEach(function (b) {
    b.addEventListener("click", function () { goTo(Math.min(step + 1, steps.length - 1), true); });
  });
  document.querySelectorAll("[data-back]").forEach(function (b) {
    b.addEventListener("click", function () { goTo(Math.max(step - 1, 0), true); });
  });
  document.querySelectorAll("[data-redo]").forEach(function (b) {
    b.addEventListener("click", function () { goTo(step, false); });
  });

  var start = HASH.indexOf(location.hash.slice(1));
  goTo(start > 0 ? start : 0, false);
})();
