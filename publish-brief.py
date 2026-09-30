#!/usr/bin/env python3
"""
Publish a Project Desk brief on the lab website.

Copies the compiled brief.pdf from a Project Desk folder into projects/ and
lists it under one of the "Current directions" on research.html. The list of
published briefs lives in projects/briefs.json; research.html is rewritten
from it between the <!-- briefs:... --> markers, so running the script again
is always safe.

    python3 publish-brief.py "Visuomotor Cooperative"        # add or update
    python3 publish-brief.py "Visuomotor" --direction multimodal-design
    python3 publish-brief.py "Visuomotor" --blurb "One line for the website."
    python3 publish-brief.py --refresh      # re-copy every PDF after edits in Project Desk
    python3 publish-brief.py --list
    python3 publish-brief.py --remove visuomotor-cooperative-manipulation-with-teams-of-quadrotors

The first argument is a Project Desk folder: a full path, or any part of a
folder name under ../../Projects. Directions: aerial-manipulation (default),
multimodal-design.
"""

import argparse
import html
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECTS_ROOT = os.path.normpath(os.path.join(HERE, "..", "..", "Projects"))
OUT_DIR = os.path.join(HERE, "projects")
REGISTRY = os.path.join(OUT_DIR, "briefs.json")
PAGE = os.path.join(HERE, "research.html")
DIRECTIONS = ("aerial-manipulation", "multimodal-design")


def slugify(text):
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return text[:80].strip("-") or "brief"


def load_registry():
    if os.path.exists(REGISTRY):
        with open(REGISTRY, encoding="utf-8") as fh:
            return json.load(fh)
    return []


def save_registry(entries):
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(REGISTRY, "w", encoding="utf-8") as fh:
        json.dump(entries, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def find_folder(query):
    if os.path.isdir(query):
        return os.path.abspath(query)
    if not os.path.isdir(PROJECTS_ROOT):
        sys.exit("Cannot find the Project Desk folder at %s" % PROJECTS_ROOT)
    hits = [d for d in sorted(os.listdir(PROJECTS_ROOT))
            if query.lower() in d.lower()
            and os.path.isfile(os.path.join(PROJECTS_ROOT, d, "brief.json"))]
    if not hits:
        sys.exit("No Project Desk folder matches %r" % query)
    if len(hits) > 1:
        sys.exit("Several folders match %r:\n  %s" % (query, "\n  ".join(hits)))
    return os.path.join(PROJECTS_ROOT, hits[0])


def read_brief(folder):
    with open(os.path.join(folder, "brief.json"), encoding="utf-8") as fh:
        brief = json.load(fh)
    pdf = os.path.join(folder, "brief.pdf")
    if not os.path.isfile(pdf):
        sys.exit("%s has no brief.pdf yet: compile it in Project Desk first." % folder)
    return brief, pdf


def first_sentence(text):
    text = " ".join((text or "").split())
    m = re.match(r"(.+?[.!?])(\s|$)", text)
    return m.group(1) if m else text


def copy_pdf(entry):
    src = os.path.join(entry["source"], "brief.pdf")
    if not os.path.isabs(entry["source"]):
        src = os.path.join(HERE, entry["source"], "brief.pdf")
    if not os.path.isfile(src):
        print("  ! source missing for %s, keeping the published copy" % entry["slug"])
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    shutil.copyfile(src, os.path.join(OUT_DIR, entry["slug"] + ".pdf"))


def li(entry):
    e = lambda s: html.escape(s or "", quote=True)
    when = ""
    if entry.get("start") and entry.get("deadline"):
        when = "%s to %s" % (entry["start"], entry["deadline"])
    elif entry.get("start"):
        when = "from %s" % entry["start"]
    lead = ", ".join(x for x in (entry.get("kind"), when) if x)
    text = (lead + ". " if lead else "") + (entry.get("blurb") or "")
    return ('          <li class="og-brief"><span class="og-status">%s</span>'
            '<a href="projects/%s.pdf" target="_blank" rel="noopener">%s'
            '<span class="og-pdf">PDF</span></a><span class="og-text">%s</span></li>'
            % (e(entry.get("status") or "Open project"), e(entry["slug"]),
               e(entry["title"]), e(text.strip())))


def render(entries):
    with open(PAGE, encoding="utf-8") as fh:
        page = fh.read()
    for d in DIRECTIONS:
        start, end = "<!-- briefs:%s -->" % d, "<!-- /briefs:%s -->" % d
        pat = re.compile(r"([ \t]*)%s.*?%s" % (re.escape(start), re.escape(end)), re.S)
        m = pat.search(page)
        if not m:
            print("  ! research.html has no %s marker; skipped" % start)
            continue
        indent = m.group(1)
        rows = [li(x) for x in entries if x.get("direction") == d]
        block = indent + start + ("\n" + "\n".join(rows) + "\n" + indent if rows else "") + end
        page = page[:m.start()] + block + page[m.end():]
    with open(PAGE, "w", encoding="utf-8") as fh:
        fh.write(page)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", nargs="?", help="Project Desk folder (path or part of its name)")
    ap.add_argument("--direction", choices=DIRECTIONS, help="where to list it (default aerial-manipulation)")
    ap.add_argument("--blurb", help="one or two sentences for the website (default: first sentence of the summary)")
    ap.add_argument("--status", help='label on the left, e.g. "Open project", "Filled" (default Open project)')
    ap.add_argument("--remove", metavar="SLUG", help="take a brief off the website")
    ap.add_argument("--refresh", action="store_true", help="re-copy every PDF and rewrite the page")
    ap.add_argument("--list", action="store_true", help="show what is published")
    a = ap.parse_args()

    entries = load_registry()

    if a.list:
        for x in entries:
            print("%-28s %-14s %s" % (x["direction"], x.get("status", ""), x["slug"]))
        return

    if a.remove:
        keep = [x for x in entries if x["slug"] != a.remove]
        if len(keep) == len(entries):
            sys.exit("Nothing published under %r (see --list)" % a.remove)
        pdf = os.path.join(OUT_DIR, a.remove + ".pdf")
        if os.path.exists(pdf):
            try:
                os.remove(pdf)
            except OSError:
                print("  ! could not delete %s; remove it by hand" % pdf)
        save_registry(keep)
        render(keep)
        print("Removed %s" % a.remove)
        return

    if a.refresh:
        for x in entries:
            copy_pdf(x)
        render(entries)
        print("Refreshed %d brief(s)" % len(entries))
        return

    if not a.folder:
        ap.print_help()
        return

    folder = find_folder(a.folder)
    brief, _ = read_brief(folder)
    meta = brief.get("meta", {})
    title = meta.get("title") or os.path.basename(folder)
    slug = slugify(title)
    old = next((x for x in entries if x["slug"] == slug or x.get("id") == brief.get("id")), {})
    entry = {
        "id": brief.get("id"),
        "slug": old.get("slug", slug),
        "title": title,
        "kind": meta.get("kind", ""),
        "start": meta.get("start", ""),
        "deadline": meta.get("deadline", ""),
        "direction": a.direction or old.get("direction") or "aerial-manipulation",
        "status": a.status or old.get("status") or "Open project",
        "blurb": a.blurb or old.get("blurb") or first_sentence(meta.get("summary")),
        "source": os.path.relpath(folder, HERE),
    }
    entries = [x for x in entries if x is not old and x["slug"] != entry["slug"]] + [entry]
    copy_pdf(entry)
    save_registry(entries)
    render(entries)
    print("Published %s\n  -> projects/%s.pdf under %s" % (title, entry["slug"], entry["direction"]))


if __name__ == "__main__":
    main()
