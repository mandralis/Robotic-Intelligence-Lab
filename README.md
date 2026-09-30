# Mandralis Lab website

A plain static site: every page is an ordinary HTML file in this folder.
It has no dependencies and no build step, and shares no code with the personal site (mandralis.github.io).

## Preview

From this folder:

    python3 serve.py

It prints http://localhost:4000/; Cmd-click it to open the site. Refresh the browser after each edit.

## Layout

- `index.html`, `research.html`, `people.html`, `publications.html`, `teaching.html`, `openings.html`: the pages
- `research-<topic>.html`: the pages the featured carousel links to
- `lab.css`: all styles; `featured.js`: the carousel
- `logos/`: logo options (see `logos/README.md`)
- `media/`, `images/`, `videos/`: pictures and videos used by the pages

## Project briefs

Student project briefs made in Project Desk (`Faculty/Projects`) are listed under
"Current directions" on `research.html`. To publish one, compile it in Project Desk,
then from this folder:

    python3 publish-brief.py "Visuomotor"                           # part of the folder name
    python3 publish-brief.py "Visuomotor" --blurb "One line for the site."
    python3 publish-brief.py "Visuomotor" --direction multimodal-design
    python3 publish-brief.py "Visuomotor" --status "Filled"
    python3 publish-brief.py --refresh                              # after editing a brief
    python3 publish-brief.py --list
    python3 publish-brief.py --remove <slug>

The PDF is copied to `projects/<slug>.pdf`, the entry is kept in `projects/briefs.json`,
and the list between the `<!-- briefs:... -->` markers in `research.html` is rewritten.
