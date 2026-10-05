# Robotic Intelligence Lab website

A plain static site: every page is an ordinary HTML file in this folder.
It has no dependencies and no build step, and shares no code with the personal site (mandralis.github.io).

## Going live (GitHub Pages)

The site is published straight from this repository (github.com/mandralis/robotic-intelligence-lab):
GitHub Pages serves the `main` branch as it is, with no build step (`.nojekyll` turns Jekyll off).

- Address: **https://mandralis.github.io/robotic-intelligence-lab/**
- One-time setup: on GitHub, open the repository's **Settings → Pages**, set **Source** to
  "Deploy from a branch", pick **main** and **/ (root)**, and save. The repository must be public
  (Pages on private repositories needs a paid plan).
- After that, every `git push` to `main` updates the site within a minute or two.
- All links between pages are relative, so the site works both under `/robotic-intelligence-lab/` and on a
  custom domain later (add a `CNAME` file with the domain and point its DNS at GitHub).

## Preview

From this folder:

    python3 serve.py

It prints http://localhost:4000/; Cmd-click it to open the site. Refresh the browser after each edit.

## Layout

- `index.html`, `research.html`, `people.html`, `publications.html`, `teaching.html`, `openings.html`: the pages
- `research-<topic>.html`: the pages the featured carousel links to
- `lab.css`: all styles; `featured.js`: the carousel
- `logos/`: logo options (see `logos/README.md`)
- `brand.py`: switch the lab name and logo, e.g. `python3 brand.py lar-lab` (see `logos/README.md`)
- `media/`, `images/`, `videos/`: pictures and videos used by the pages

## Project briefs

Student project briefs made in Project Desk (`Faculty/Projects`) are listed under their
research direction on `research.html`, and the open ones also in the Student projects
section of `openings.html`. Compile the brief in Project Desk first, then either
double-click **Publish brief.command** in Finder or run

    python3 publish-brief.py

and follow the menu: pick the project, pick the direction (several are allowed, e.g. `1,2`, or create a new one), set the
label ("Open project", "Filled", ...) and the one-line description. The same menu changes
the direction or label of a published brief, refreshes the PDFs after you edit briefs, and
takes briefs off the site.

Without the menu:

    python3 publish-brief.py --publish "Visuomotor" --direction aerial-manipulation
    python3 publish-brief.py --publish "Positions" --direction aerial-manipulation,multimodal-design
    python3 publish-brief.py --refresh
    python3 publish-brief.py --list
    python3 publish-brief.py --remove <slug>

The PDF is copied to `projects/<slug>.pdf`, entries are kept in `projects/briefs.json`, and
the lists between the `<!-- briefs:... -->` markers are rewritten. Then commit and push.
