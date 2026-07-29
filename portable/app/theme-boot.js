// Runs in <head> before first paint so a dark session never flashes white.
(function () {
  var KEY = "dbridge.ui.preferences.v1";
  var mode = "auto";
  var density = "comfortable";
  var sidebar = "pinned";
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object") {
      if (saved.themeMode === "light" || saved.themeMode === "dark" || saved.themeMode === "auto") mode = saved.themeMode;
      if (saved.density === "compact" || saved.density === "comfortable") density = saved.density;
      if (saved.sidebar === "auto" || saved.sidebar === "pinned") sidebar = saved.sidebar;
    }
  } catch (error) { /* storage blocked: fall back to auto */ }

  var prefersDark = false;
  try { prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (error) { /* no matchMedia */ }

  var root = document.documentElement;
  root.dataset.themeMode = mode;
  root.dataset.theme = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;
  root.dataset.density = density;
  root.dataset.sidebar = sidebar;
})();
