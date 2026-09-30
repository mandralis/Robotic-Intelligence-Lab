#!/usr/bin/env python3
"""
Publish Project Desk briefs on the lab website.

Run it with no arguments for the interactive menu:

    python3 publish-brief.py

(or double-click "Publish brief.command" in Finder). The menu lets you pick a
project from Faculty/Projects, pick the research direction to list it under
(or create a new direction), set the label and the one-line description, and
take briefs off the site again.

What it does: copies the compiled brief.pdf into projects/<slug>.pdf, records
the entry in projects/briefs.json, and rewrites the lists between the
<!-- briefs:... --> markers in research.html (under each direction) and in
openings.html (the Student projects section). Running it again is always safe.

The same actions without the menu:

    python3 publish-brief.py --publish "Visuomotor" --direction aerial-manipulation
    python3 publish-brief.py --refresh      # re-copy every PDF after editing briefs
    python3 publish-brief.py --list
    python3 publish-brief.py --remove <slug>
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
RESEARCH = os.path.join(HERE, "research.html")
OPENINGS = os.path.join(HERE, "openings.html")
DEFAULT_STATUS = "Open project"
NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]

# ------------------------------------------------------------------ helpers

def slugify(text):
    text = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return text[:80].strip("-") or "item"


def esc(s):
    return html.escape(s or "", quote=True)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def write(path, text):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def first_sentence(text):
    text = " ".join((text or "").split())
    m = re.match(r"(.+?[.!?])(\s|$)", text)
    return m.group(1) if m else text


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


def is_open(entry):
    return (entry.get("status") or DEFAULT_STATUS).lower().startswith("open")

# --------------------------------------------------------- Project Desk side

def desk_projects():
    """Every Project Desk folder that has a brief.json, newest first."""
    out = []
    if not os.path.isdir(PROJECTS_ROOT):
        return out
    for name in sorted(os.listdir(PROJECTS_ROOT), reverse=True):
        folder = os.path.join(PROJECTS_ROOT, name)
        meta_path = os.path.join(folder, "brief.json")
        if name.startswith(".") or not os.path.isfile(meta_path):
            continue
        try:
            with open(meta_path, encoding="utf-8") as fh:
                brief = json.load(fh)
        except Exception:
            continue
        out.append({"folder": folder, "brief": brief,
                    "has_pdf": os.path.isfile(os.path.join(folder, "brief.pdf"))})
    return out


def find_folder(query):
    if os.path.isdir(query):
        return os.path.abspath(query)
    hits = [p["folder"] for p in desk_projects()
            if query.lower() in os.path.basename(p["folder"]).lower()
            or query.lower() in (p["brief"].get("meta", {}).get("title") or "").lower()]
    if not hits:
        sys.exit("No Project Desk project matches %r" % query)
    if len(hits) > 1:
        sys.exit("Several projects match %r:\n  %s" % (query, "\n  ".join(os.path.basename(h) for h in hits)))
    return hits[0]


def source_path(entry):
    """The brief's Project Desk folder. Project Desk renames folders when a title
    changes, so fall back to finding the folder by the brief's id."""
    src = entry["source"]
    path = src if os.path.isabs(src) else os.path.normpath(os.path.join(HERE, src))
    if os.path.isfile(os.path.join(path, "brief.json")):
        return path
    for p in desk_projects():
        if entry.get("id") and p["brief"].get("id") == entry["id"]:
            entry["source"] = os.path.relpath(p["folder"], HERE)
            return p["folder"]
    return path


def copy_pdf(entry):
    src = os.path.join(source_path(entry), "brief.pdf")
    if not os.path.isfile(src):
        print("  ! no brief.pdf for %s; keeping the published copy" % entry["slug"])
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    shutil.copyfile(src, os.path.join(OUT_DIR, entry["slug"] + ".pdf"))

# ------------------------------------------------------------- research page

DIR_RE = re.compile(
    r'<div class="direction"(?: id="([^"]*)")?>\s*<h3 class="dir-title">(.*?)</h3>', re.S)


def directions():
    """[(id, title)] in page order, as research.html has them."""
    out = []
    for m in DIR_RE.finditer(read(RESEARCH)):
        title = html.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
        out.append((m.group(1) or slugify(title), title))
    return out


def ensure_direction_markers(page):
    """Give every direction an id, a <ul class="ongoing"> and the briefs markers."""
    def fix(m):
        did = m.group(1) or slugify(html.unescape(re.sub(r"<[^>]+>", "", m.group(2))))
        return '<div class="direction" id="%s">%s' % (did, m.group(0)[m.group(0).index(">") + 1:])
    page = DIR_RE.sub(fix, page)
    for did, _ in [(m.group(1), None) for m in DIR_RE.finditer(page)]:
        if "<!-- briefs:%s -->" % did in page:
            continue
        start = page.index('id="%s"' % did)
        nxt = page.find('<div class="direction"', start + 1)
        end_div = page.find("\n      </div>", start)
        region_end = end_div if (nxt < 0 or end_div < nxt) else nxt
        ul_close = page.find("        </ul>", start, region_end)
        marker = "          <!-- briefs:%s --><!-- /briefs:%s -->\n" % (did, did)
        if ul_close >= 0:
            page = page[:ul_close] + marker + page[ul_close:]
        else:
            block = '        <ul class="ongoing">\n' + marker + "        </ul>\n"
            page = page[:end_div + 1] + block + page[end_div + 1:]
    return page


def add_direction(title, description):
    did = slugify(title)
    page = read(RESEARCH)
    if 'id="%s"' % did in page:
        return did
    block = ('      <div class="direction" id="%s">\n'
             '        <h3 class="dir-title">%s</h3>\n'
             '%s'
             '        <ul class="ongoing">\n'
             '          <!-- briefs:%s --><!-- /briefs:%s -->\n'
             '        </ul>\n'
             '      </div>\n') % (did, esc(title),
                                  ("        <p>%s</p>\n" % esc(description)) if description else "",
                                  did, did)
    anchor = page.find("      <h2>Featured research</h2>")
    if anchor < 0:
        anchor = page.index("  </main>")
    page = page[:anchor] + block + "\n" + page[anchor:]
    # keep "in two directions" in the lede honest
    count = len(DIR_RE.findall(page))
    if count < len(NUMBERS):
        page = re.sub(r"\bin (%s) directions\b" % "|".join(NUMBERS[2:]),
                      "in %s directions" % NUMBERS[count], page)
    write(RESEARCH, page)
    return did

# ------------------------------------------------------------------ render

def when_text(entry):
    if entry.get("start") and entry.get("deadline"):
        return "%s to %s" % (entry["start"], entry["deadline"])
    if entry.get("start"):
        return "from %s" % entry["start"]
    return ""


def li(entry, prefix=""):
    lead = ", ".join(x for x in (entry.get("kind"), when_text(entry)) if x)
    text = prefix + (lead + ". " if lead else "") + (entry.get("blurb") or "")
    return ('          <li class="og-brief"><span class="og-status">%s</span>'
            '<a href="projects/%s.pdf" target="_blank" rel="noopener">%s'
            '<span class="og-pdf">PDF</span></a><span class="og-text">%s</span></li>'
            % (esc(entry.get("status") or DEFAULT_STATUS), esc(entry["slug"]),
               esc(entry["title"]), esc(text.strip())))


def replace_block(page, key, rows, indent_list=False):
    start, end = "<!-- briefs:%s -->" % key, "<!-- /briefs:%s -->" % key
    pat = re.compile(r"([ \t]*)%s.*?%s" % (re.escape(start), re.escape(end)), re.S)
    m = pat.search(page)
    if not m:
        print("  ! no %s marker found; skipped" % start)
        return page
    ind = m.group(1)
    block = ind + start + ("\n" + "\n".join(rows) + "\n" + ind if rows else "") + end
    return page[:m.start()] + block + page[m.end():]


def render(entries):
    page = ensure_direction_markers(read(RESEARCH))
    known = []
    for m in DIR_RE.finditer(page):
        known.append((m.group(1), html.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()))
    for did, _ in known:
        page = replace_block(page, did, [li(e) for e in entries if e.get("direction") == did])
    write(RESEARCH, page)

    if os.path.exists(OPENINGS):
        titles = dict(known)
        order = [d for d, _ in known]
        open_ones = sorted([e for e in entries if is_open(e)],
                           key=lambda e: order.index(e["direction"]) if e["direction"] in order else 99)
        if open_ones:
            rows = ['          <ul class="ongoing">']
            rows += [li(e, prefix=(titles.get(e["direction"], "") + ". ") if titles.get(e["direction"]) else "")
                     for e in open_ones]
            rows += ["          </ul>"]
        else:
            rows = ["          <p><em>No project briefs are posted at the moment; enquiries are still welcome.</em></p>"]
        page = read(OPENINGS)
        page = replace_block(page, "openings", [r[2:] if r.lstrip().startswith("<li") else r[4:] for r in rows])
        write(OPENINGS, page)
    orphans = [e["slug"] for e in entries if e.get("direction") not in dict(known)]
    for s in orphans:
        print("  ! %s points at a direction that is no longer on research.html" % s)

# ------------------------------------------------------------------ actions

def publish(folder, direction, status=None, blurb=None):
    with open(os.path.join(folder, "brief.json"), encoding="utf-8") as fh:
        brief = json.load(fh)
    if not os.path.isfile(os.path.join(folder, "brief.pdf")):
        sys.exit("That project has no brief.pdf yet: compile it in Project Desk first.")
    meta = brief.get("meta", {})
    title = meta.get("title") or os.path.basename(folder)
    entries = load_registry()
    old = next((x for x in entries if x.get("id") == brief.get("id") or x["slug"] == slugify(title)), {})
    entry = {
        "id": brief.get("id"),
        "slug": old.get("slug") or slugify(title),
        "title": title,
        "kind": meta.get("kind", ""),
        "start": meta.get("start", ""),
        "deadline": meta.get("deadline", ""),
        "direction": direction,
        "status": status or old.get("status") or DEFAULT_STATUS,
        "blurb": blurb if blurb is not None else (old.get("blurb") or first_sentence(meta.get("summary"))),
        "source": os.path.relpath(folder, HERE),
    }
    entries = [x for x in entries if x.get("slug") != entry["slug"]] + [entry]
    copy_pdf(entry)
    save_registry(entries)
    render(entries)
    return entry


def remove(slug):
    entries = load_registry()
    keep = [x for x in entries if x["slug"] != slug]
    if len(keep) == len(entries):
        sys.exit("Nothing published under %r" % slug)
    pdf = os.path.join(OUT_DIR, slug + ".pdf")
    if os.path.exists(pdf):
        try:
            os.remove(pdf)
        except OSError:
            print("  ! could not delete %s; remove it by hand" % pdf)
    save_registry(keep)
    render(keep)


def refresh():
    entries = load_registry()
    for x in entries:
        copy_pdf(x)
    save_registry(entries)
    render(entries)
    return len(entries)

# ------------------------------------------------------------- interaction

def ask(prompt, default=""):
    shown = " [%s]" % default if default else ""
    try:
        got = input("%s%s: " % (prompt, shown)).strip()
    except EOFError:
        raise KeyboardInterrupt
    return got or default


def choose(title, options, allow_back=True):
    """Numbered menu; returns the index chosen, or None for back."""
    print("\n" + title)
    for i, opt in enumerate(options, 1):
        print("  %2d  %s" % (i, opt))
    if allow_back:
        print("   0  Back")
    while True:
        got = ask("Choose")
        if allow_back and got in ("0", "b", "q"):
            return None
        if got.isdigit() and 1 <= int(got) <= len(options):
            return int(got) - 1
        print("  Type a number from the list.")


def yes(prompt, default=True):
    got = ask(prompt + (" (Y/n)" if default else " (y/N)")).lower()
    return default if not got else got.startswith("y")


def interactive_publish():
    projects = desk_projects()
    if not projects:
        print("No Project Desk projects found in %s" % PROJECTS_ROOT)
        return
    published = {e.get("id"): e for e in load_registry()}
    labels = []
    for p in projects:
        m = p["brief"].get("meta", {})
        tag = ""
        if p["brief"].get("id") in published:
            tag = "  [on site: %s]" % published[p["brief"]["id"]]["direction"]
        if not p["has_pdf"]:
            tag += "  [no PDF yet]"
        labels.append("%s  (%s)%s" % (m.get("title") or os.path.basename(p["folder"]), m.get("kind") or "brief", tag))
    i = choose("Which project?", labels)
    if i is None:
        return
    proj = projects[i]
    if not proj["has_pdf"]:
        print("  That brief has not been compiled yet. Open it in Project Desk first.")
        return
    old = published.get(proj["brief"].get("id"), {})

    dirs = directions()
    opts = [t + ("   (current)" if old.get("direction") == d else "") for d, t in dirs] + ["+ New direction..."]
    j = choose("List it under which direction?", opts)
    if j is None:
        return
    if j == len(dirs):
        title = ask("Title of the new direction")
        if not title:
            return
        desc = ask("One-paragraph description (optional, Enter to skip)")
        direction = add_direction(title, desc)
        print("  Added \"%s\" to research.html" % title)
    else:
        direction = dirs[j][0]

    meta = proj["brief"].get("meta", {})
    status = ask("Label", old.get("status") or DEFAULT_STATUS)
    default_blurb = old.get("blurb") or first_sentence(meta.get("summary"))
    print("\nDescription shown on the site (Enter keeps it):\n  " + default_blurb)
    blurb = ask("New description") or default_blurb

    print("\n  %s\n  under: %s\n  label: %s" % (meta.get("title"), dict(dirs).get(direction, direction), status))
    if not yes("Publish?"):
        return
    entry = publish(proj["folder"], direction, status, blurb)
    print("  Done: projects/%s.pdf" % entry["slug"])


def interactive_remove():
    entries = load_registry()
    if not entries:
        print("  Nothing is published.")
        return
    i = choose("Take which brief off the site?", ["%s  [%s]" % (e["title"], e["direction"]) for e in entries])
    if i is None:
        return
    if yes("Remove \"%s\"?" % entries[i]["title"], default=False):
        remove(entries[i]["slug"])
        print("  Removed.")


def interactive_move():
    entries = load_registry()
    if not entries:
        print("  Nothing is published.")
        return
    i = choose("Which brief?", ["%s  [%s, %s]" % (e["title"], e["direction"], e.get("status")) for e in entries])
    if i is None:
        return
    e = entries[i]
    dirs = directions()
    j = choose("Move to which direction?", [t for _, t in dirs] + ["(keep %s)" % e["direction"]])
    if j is None:
        return
    direction = e["direction"] if j == len(dirs) else dirs[j][0]
    status = ask("Label (e.g. Open project, Filled, In progress)", e.get("status") or DEFAULT_STATUS)
    publish(source_path(e), direction, status, e.get("blurb"))
    print("  Updated.")


def show_list():
    entries = load_registry()
    if not entries:
        print("  Nothing is published.")
    titles = dict(directions())
    for e in entries:
        print("  - %s\n      %s | %s | projects/%s.pdf" % (
            e["title"], titles.get(e["direction"], e["direction"]), e.get("status"), e["slug"]))


def menu():
    print("Publish brief: Mandralis Lab website")
    actions = [
        ("Publish or update a project brief", interactive_publish),
        ("Change the direction or label of a published brief", interactive_move),
        ("Refresh every PDF (after editing briefs in Project Desk)",
         lambda: print("  Refreshed %d brief(s)." % refresh())),
        ("Take a brief off the site", interactive_remove),
        ("List what is published", show_list),
    ]
    try:
        while True:
            i = choose("What would you like to do?", [a for a, _ in actions] + ["Quit"], allow_back=False)
            if i == len(actions):
                break
            actions[i][1]()
    except KeyboardInterrupt:
        print()
    print("Preview with:  python3 serve.py   then commit and push to put it online.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--publish", metavar="PROJECT", help="Project Desk folder or title (or part of it)")
    ap.add_argument("--direction", help="direction id on research.html (see --list)")
    ap.add_argument("--status", help='label, e.g. "Open project" or "Filled"')
    ap.add_argument("--blurb", help="description for the website")
    ap.add_argument("--remove", metavar="SLUG")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()

    if a.list:
        print("Directions: " + ", ".join(d for d, _ in directions()))
        show_list()
    elif a.remove:
        remove(a.remove)
        print("Removed %s" % a.remove)
    elif a.refresh:
        print("Refreshed %d brief(s)" % refresh())
    elif a.publish:
        ids = [d for d, _ in directions()]
        direction = a.direction or ids[0]
        if direction not in ids:
            sys.exit("Unknown direction %r. Known: %s" % (direction, ", ".join(ids)))
        e = publish(find_folder(a.publish), direction, a.status, a.blurb)
        print("Published %s -> projects/%s.pdf" % (e["title"], e["slug"]))
    else:
        menu()


if __name__ == "__main__":
    main()
