// Movie-mode switch: dark theme = "bias lights only".
// The inline script in each <head> sets data-theme before first paint;
// this wires up the button and remembers the choice.
(function () {
  var root = document.documentElement;
  var btn = document.querySelector(".lights");
  if (!btn) return;

  function current() {
    return root.dataset.theme === "dark" ? "dark" : "light";
  }

  function sync() {
    var dark = current() === "dark";
    btn.setAttribute("aria-pressed", String(dark));
    btn.title = dark ? "Lights up (Daily Driver)" : "Movie mode: dim the lights";
  }

  btn.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch (e) {
      /* private mode: the choice just won't persist */
    }
    sync();
    document.dispatchEvent(new CustomEvent("themechange", { detail: next }));
  });

  sync();
})();

// Phones: the links sit behind a Menu button, so every page is one tap away.
// Without this script the nav stays a strip you can swipe sideways.
(function () {
  var header = document.querySelector(".site-header");
  var nav = header && header.querySelector(".site-nav");
  if (!nav) return;

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "menu-btn";
  btn.setAttribute("aria-expanded", "false");
  nav.id = nav.id || "site-nav";
  btn.setAttribute("aria-controls", nav.id);
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>Menu</span>';
  nav.parentNode.insertBefore(btn, nav);
  header.classList.add("has-menu");

  function set(open) {
    nav.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
  }

  btn.addEventListener("click", function () {
    set(!nav.classList.contains("open"));
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.classList.contains("open")) {
      set(false);
      btn.focus();
    }
  });
  document.addEventListener("click", function (e) {
    if (!header.contains(e.target)) set(false);
  });
})();
