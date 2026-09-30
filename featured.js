/* Featured research carousel (About page): one slide per research direction,
   each linking to its page in research/.
   - cross-fading slides, dots + arrows, swipe, keyboard arrows
   - auto-advances every 7 s; pauses on hover/focus, when the carousel is
     off-screen or the tab is hidden, and never runs for reduced-motion visitors */
(function () {
  "use strict";
  var root = document.getElementById("featured");
  if (!root) return;

  var slides = root.querySelectorAll(".fx-slide");
  var dots = root.querySelectorAll(".fx-dot");
  var n = slides.length;
  if (!n) return;

  var DELAY = 7000;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var current = 0, timer = null;
  var hovering = false, focused = false, visible = true;

  root.style.setProperty("--fx-delay", DELAY + "ms");

  // Coming back from a direction page (#featured or the browser's back
  // button): show the slide that was left.
  try {
    var saved = +sessionStorage.getItem("fx-slide");
    if (saved > 0 && saved < n) swap(saved);
  } catch (e) {}

  function swap(i) {
    slides[current].classList.remove("is-active");
    slides[current].setAttribute("aria-hidden", "true");
    dots[current].classList.remove("is-active");
    dots[current].removeAttribute("aria-current");
    current = i;
    slides[i].classList.add("is-active");
    slides[i].removeAttribute("aria-hidden");
    dots[i].classList.add("is-active");
    dots[i].setAttribute("aria-current", "true");
  }

  function show(i) {
    i = (i + n) % n;
    if (i !== current) swap(i);
    restart();
  }

  /* ---------- autoplay ---------- */
  function running() {
    return !reduce && n > 1 && !hovering && !focused && visible && !document.hidden;
  }
  function restart() {
    clearTimeout(timer);
    root.classList.remove("fx-playing");   // restart the fill on the active dot
    void root.offsetWidth;
    if (running()) {
      root.classList.add("fx-playing");
      timer = setTimeout(function () { show(current + 1); }, DELAY);
    }
  }

  root.addEventListener("mouseenter", function () { hovering = true; restart(); });
  root.addEventListener("mouseleave", function () { hovering = false; restart(); });
  root.addEventListener("focusin", function () { focused = true; restart(); });
  root.addEventListener("focusout", function (e) {
    if (!root.contains(e.relatedTarget)) { focused = false; restart(); }
  });
  document.addEventListener("visibilitychange", restart);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; restart(); }, { threshold: 0.3 }).observe(root);
  }

  /* ---------- controls ---------- */
  root.querySelector(".fx-prev").addEventListener("click", function () { show(current - 1); });
  root.querySelector(".fx-next").addEventListener("click", function () { show(current + 1); });
  dots.forEach(function (d) {
    d.addEventListener("click", function () { show(+d.getAttribute("data-go")); });
  });
  var vp = root.querySelector(".fx-viewport");
  vp.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { show(current - 1); e.preventDefault(); }
    if (e.key === "ArrowRight") { show(current + 1); e.preventDefault(); }
  });

  // remember the slide when a visitor follows a link into a direction page
  vp.addEventListener("click", function (e) {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.target.closest("a")) { try { sessionStorage.setItem("fx-slide", current); } catch (err) {} }
  }, true);

  // swipe (touch / pen); a clear horizontal drag changes slide instead of opening it
  var sx = null, sy = null, suppressClick = false;
  vp.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") { sx = e.clientX; sy = e.clientY; } });
  vp.addEventListener("pointerup", function (e) {
    if (sx === null) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    sx = sy = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 350);
      show(current + (dx < 0 ? 1 : -1));
    }
  });

  restart();
})();
