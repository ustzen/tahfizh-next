#!/usr/bin/env python3
"""Cross-file dependency analyzer for TAHFIZH migrations.

Walks migration files in filename order. A `public.NAME` reference in file F
resolves when the object is defined in an EARLIER file or anywhere in F itself
(files are written definitions-first). Reports:
  - dependency inversion (object first defined in a LATER file)
  - references to objects defined NOWHERE (possible misspelling)
  - duplicate table/type/view creation across files
"""
import glob
import re

DEF_PATTERNS = [
    ("table", re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)", re.I)),
    ("type", re.compile(r"create\s+type\s+public\.([a-z_][a-z0-9_]*)", re.I)),
    ("view", re.compile(r"create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+public\.([a-z_][a-z0-9_]*)", re.I)),
    ("function", re.compile(r"create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_][a-z0-9_]*)", re.I)),
    ("sequence", re.compile(r"create\s+sequence\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)", re.I)),
]

REF = re.compile(r"public\.([a-z_][a-z0-9_]*)", re.I)


def main():
    files = sorted(glob.glob("supabase/migrations/*.sql"))
    if not files:
        print("no migration files found")
        return
    problems = []

    # Pre-scan: name -> list of files that define it.
    defs_by_name = {}
    for f in files:
        text = open(f, encoding="utf-8").read()
        for _kind, pat in DEF_PATTERNS:
            for m in pat.finditer(text):
                defs_by_name.setdefault(m.group(1).lower(), []).append(f)

    # Ordered walk.
    known = set()
    for f in files:
        text = open(f, encoding="utf-8").read()
        local = set()
        for _kind, pat in DEF_PATTERNS:
            for m in pat.finditer(text):
                local.add(m.group(1).lower())
        for m in REF.finditer(text):
            name = m.group(1).lower()
            if name in local or name in known:
                continue
            defining_files = defs_by_name.get(name, [])
            if defining_files:
                problems.append(
                    "%s: public.%s used here but first defined in %s (dependency inversion)"
                    % (f, name, min(defining_files))
                )
            else:
                problems.append(
                    "%s: public.%s referenced but defined NOWHERE (check spelling)"
                    % (f, name)
                )
        known |= local

    # Duplicate hard objects across files.
    seen = {}
    for f in files:
        text = open(f, encoding="utf-8").read()
        for kind in ("table", "type", "view"):
            for m in DEF_PATTERNS[[p[0] for p in DEF_PATTERNS].index(kind)][1].finditer(text):
                nm = m.group(1).lower()
                key = (kind, nm)
                if key in seen and seen[key] != f:
                    problems.append("DUPLICATE %s %s in %s and %s" % (kind, nm, seen[key], f))
                seen.setdefault(key, f)

    if problems:
        for p in problems:
            print(p)
    else:
        print("ALL CROSS-FILE REFERENCES RESOLVE")


if __name__ == "__main__":
    main()
