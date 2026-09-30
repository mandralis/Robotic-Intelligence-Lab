/* Which logo the lab site shows next to "Mandralis Lab".
 *
 * To change it for good: edit LOGO below to another file name in this folder
 * (without ".svg"): lift, graph-m, loop, fusion, experience, diamond,
 * formation, mesh, branch.
 *
 * To try one without editing anything: add ?logo=NAME to the address, e.g.
 *   http://localhost:4000/lab/?logo=loop
 * The choice sticks while you click around (this browser tab only).
 * ?logo=reset goes back to the default below.
 */
(function () {
  "use strict";
  var LOGO = "graph-m";

  var pick = LOGO;
  try {
    var q = new URLSearchParams(location.search).get("logo");
    if (q === "reset") sessionStorage.removeItem("lab-logo");
    else if (q) sessionStorage.setItem("lab-logo", q);
    pick = sessionStorage.getItem("lab-logo") || LOGO;
  } catch (e) {}
  var base = document.currentScript ? document.currentScript.src.replace(/logo\.js.*$/, "") : "logos/";
  document.querySelectorAll(".brand-mark").forEach(function (img) {
    img.src = base + pick + ".svg";
  });
})();
