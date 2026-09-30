# Mandralis Lab logo options

All marks share one visual language: open circles are agents or variables,
the solid circle is what they share or produce. Each SVG is cropped tightly
to its drawing, so it lines up exactly with the top of "Mandralis Lab" and the
bottom of "University of Cambridge" in the header.

| File | Idea |
|---|---|
| lift.svg | Two drones carrying one payload; two causes and one effect (current) |
| graph-m.svg | An M drawn as a graph: four agents and one shared state |
| loop.svg | A sense–act–learn cycle; learning from experience |
| fusion.svg | Three inputs fused into one: multimodal sensing or several ways of moving |
| experience.svg | Nodes that fill step by step: continual learning |
| diamond.svg | A small Bayesian network: one cause, two paths, one outcome |
| formation.svg | Four vehicles around one load, from above: cooperative transport |
| mesh.svg | Three agents linked to each other and a shared model |
| branch.svg | One root growing into several skills |

`logo-options.png` shows all of them side by side.

## Trying and switching logos

* Try one in the browser without editing anything: add `?logo=NAME` to any lab
  page address, e.g. `http://localhost:4000/lab/?logo=loop`. It stays while you
  click around in that tab; `?logo=reset` returns to the default.
* Switch for good: open `logo.js` in this folder and change the line
  `var LOGO = "lift";` to another file name (without `.svg`).
* Add your own: drop a new SVG in this folder (crop its viewBox tightly to the
  drawing) and use its file name the same way.
