"""Switch the lab site between names (and their logos).

    python3 brand.py              show the current name and the options
    python3 brand.py ril          Robotic Intelligence Lab
    python3 brand.py lar-lab      Learning and Adaptive Robotics Lab
    python3 brand.py lar-group    Learning and Adaptive Robotics Group
    python3 brand.py mandralis    Mandralis Lab

The names and their logos are listed once, in logos/logo.js (BRANDS).
Every .html page is rewritten in place and LOGO in logos/logo.js is set to the
new name's logo. Running it again with the old name switches everything back.
"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO_JS = os.path.join(HERE, "logos", "logo.js")


def load_brands():
    js = open(LOGO_JS, encoding="utf-8").read()
    block = re.search(r"brands:start.*?\n\s*var BRANDS = (\{.*?\});\s*\n\s*// brands:end", js, re.S)
    return js, json.loads(block.group(1))


def current_brand(brands):
    html = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
    name = re.search(r'class="brand-name">([^<]+)<', html).group(1).strip()
    for key, b in brands.items():
        if b["name"] == name:
            return key
    sys.exit(f'The header says "{name}", which is not one of the names in logos/logo.js.')


def main():
    js, brands = load_brands()
    cur = current_brand(brands)
    if len(sys.argv) < 2:
        print(f"\n  Now: {brands[cur]['name']}  ({cur})\n\n  Options:")
        for k, b in brands.items():
            print(f"    python3 brand.py {k:<10}  {b['name']}  (logo: {b['logo']})")
        print()
        return
    new = sys.argv[1]
    if new not in brands:
        sys.exit(f"Unknown name '{new}'. Options: {', '.join(brands)}")
    a, b = brands[cur], brands[new]
    pairs = [(f"The {a['name']} is a {a['kind']}", f"The {b['name']} is a {b['kind']}"),
             (a["name"], b["name"])]
    changed = 0
    if new != cur:
        for path in sorted(glob.glob(os.path.join(HERE, "*.html"))):
            text = open(path, encoding="utf-8").read()
            out = text
            for old, rep in pairs:
                out = out.replace(old, rep)
            if out != text:
                open(path, "w", encoding="utf-8").write(out)
                changed += 1
    js2 = re.sub(r'var LOGO = "[^"]*";', f'var LOGO = "{b["logo"]}";', js, count=1)
    if js2 != js:
        open(LOGO_JS, "w", encoding="utf-8").write(js2)
    print(f"\n  {a['name']}  ->  {b['name']}\n  {changed} pages updated; logo set to {b['logo']}.\n"
          "  Refresh the browser to see it. To switch back: python3 brand.py " + cur + "\n")


if __name__ == "__main__":
    main()
