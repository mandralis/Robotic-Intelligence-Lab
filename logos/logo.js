/* Which logo (and, for previews, which lab name) the lab site shows.
 *
 * LOGO: the mark next to the lab name. To change it for good, set it to another
 * file name in this folder (without ".svg"): graph-m, lift, loop, fusion,
 * experience, diamond, formation, mesh, branch, lar-step, lar-valley, lar-spiral,
 * ril-arm, ril-net, ril-ri, m-arms, m-arms-base, m-arms-grip, m-arms-full,
 * m-serial, m-serial-light, m-reach, m-span.
 *
 * BRANDS: the lab names the site can switch between. To switch the whole site
 * for good, run   python3 brand.py ril   (or lar-lab, lar-group, mandralis)
 * in the site folder; it rewrites every page and sets LOGO below.
 *
 * To try things without editing anything, add to the address:
 *   ?logo=NAME            e.g. http://localhost:4000/?logo=lar-spiral
 *   ?brand=NAME           e.g. http://localhost:4000/?brand=ril
 * Both stick while you click around (this browser tab only).
 * ?logo=reset and ?brand=reset go back to what the pages say.
 */
(function () {
  "use strict";
  var LOGO = "ril-arm";

  // brands:start  (read by brand.py; keep it valid JSON)
  var BRANDS = {
    "mandralis": { "name": "Mandralis Lab", "kind": "robotics group", "logo": "graph-m" },
    "lar-lab":   { "name": "Learning and Adaptive Robotics Lab", "kind": "research group", "logo": "lar-step" },
    "lar-group": { "name": "Learning and Adaptive Robotics Group", "kind": "research group", "logo": "lar-step" },
    "ril":       { "name": "Robotic Intelligence Lab", "kind": "robotics group", "logo": "ril-arm" }
  };
  // brands:end

  function param(key, store) {
    try {
      var q = new URLSearchParams(location.search).get(key);
      if (q === "reset") sessionStorage.removeItem(store);
      else if (q) sessionStorage.setItem(store, q);
      return sessionStorage.getItem(store);
    } catch (e) { return null; }
  }

  // which brand the pages were written for: the name in the header
  var nameEl = document.querySelector(".brand-name");
  var current = null;
  Object.keys(BRANDS).forEach(function (k) {
    if (nameEl && nameEl.textContent.trim() === BRANDS[k].name) current = k;
  });

  // ?brand= preview: swap the name in the page text, title and description
  var want = param("brand", "lab-brand");
  var preview = want && BRANDS[want] && current && want !== current ? BRANDS[want] : null;
  if (preview) {
    var from = BRANDS[current];
    var pairs = [
      ["The " + from.name + " is a " + from.kind, "The " + preview.name + " is a " + preview.kind],
      [from.name, preview.name]
    ];
    var swap = function (s) {
      pairs.forEach(function (p) { s = s.split(p[0]).join(p[1]); });
      return s;
    };
    var walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (var n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.nodeValue.indexOf(from.name) !== -1) n.nodeValue = swap(n.nodeValue);
    }
    document.title = swap(document.title);
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = swap(meta.content);
    document.documentElement.classList.add("brand-" + want);
  }

  var pick = param("logo", "lab-logo") || (preview ? preview.logo : LOGO);
  var base = document.currentScript ? document.currentScript.src.replace(/logo\.js.*$/, "") : "logos/";
  document.querySelectorAll(".brand-mark").forEach(function (img) {
    img.src = base + pick + ".svg";
  });
})();
