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
