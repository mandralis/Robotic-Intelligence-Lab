# Robotic Intelligence Lab logo options

All marks share one visual language: open circles are agents or variables,
the solid circle is what they share or produce. Each SVG is cropped tightly
to its drawing, so it lines up exactly with the top of the lab name and the
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
| lar-step.svg | For "Learning and Adaptive Robotics": a step response that overshoots and settles on its target |
| lar-spiral.svg | For "Learning and Adaptive Robotics": iterations spiralling in on a solution |
| lar-valley.svg | For "Learning and Adaptive Robotics": a ball rolling into a minimum |
| ril-arm.svg | For "Robotic Intelligence Lab": a robot arm drawn as a graph, joints open, the object it reaches solid |
| ril-net.svg | For "Robotic Intelligence Lab": a small neural network, inputs to one output |
| ril-ri.svg | For "Robotic Intelligence Lab": the letters R and I drawn as graphs |
| m-arms.svg | Two robot arms forming an M, meeting on one shared object |
| m-arms-base.svg | The same, standing on pedestal bases |
| m-arms-grip.svg | Two arms forming an M, each gripper closing on the shared object |
| m-arms-full.svg | Pedestal bases and grippers together |
| m-serial.svg | One robot arm whose links trace an M: base on the ground, joints open, end-effector solid |
| m-serial-light.svg | The same with the middle joint left plain |
| m-reach.svg | A looser M: the arm reaching forward, end raised |
| m-span.svg | A wide, shallow M, the end-effector coming down to the ground |

`logo-options.png` shows the first nine side by side; `lar-logo-options.png`, `ril-logo-options.png` `m-arms-options.png` and `m-serial-options.png` show the lar-, ril-, m-arms and m-serial marks in the header.

## Trying and switching logos

* Try one in the browser without editing anything: add `?logo=NAME` to any lab
  page address, e.g. `http://localhost:4000/lab/?logo=loop`. It stays while you
  click around in that tab; `?logo=reset` returns to the default.
* Switch for good: open `logo.js` in this folder and change the line
  `var LOGO = "lift";` to another file name (without `.svg`).
* Add your own: drop a new SVG in this folder (crop its viewBox tightly to the
  drawing) and use its file name the same way.

## Switching the lab name

The names the site can use are listed in `logo.js` (BRANDS): `mandralis`
(Mandralis Lab), `ril` (Robotic Intelligence Lab), `lar-lab` (Learning and Adaptive Robotics Lab) and `lar-group`
(Learning and Adaptive Robotics Group), each with its logo.

* Try one without editing anything: add `?brand=lar-lab` to the address
  (combine with a logo: `?brand=lar-group&logo=lar-spiral`). `?brand=reset` goes back.
* Switch for good: in the site folder run `python3 brand.py lar-lab`. It rewrites
  every page (header, footer, page titles, intro, news) and sets the logo.
  `python3 brand.py mandralis` switches back; `python3 brand.py` shows the options.
