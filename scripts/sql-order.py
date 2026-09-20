#!/usr/bin/env python3
"""Within-file statement ordering analyzer for TAHFIZH migrations.

For each migration file, walks statements in order (dollar-quote aware,
comment-stripped). A `public.NAME` reference OUTSIDE a plpgsql body must
resolve to an object created in an earlier file or an earlier statement of
the same file. plpgsql bodies ($$...$$ in `language plpgsql` statements)
defer name resolution to runtime, so their internal references are skipped.
`language sql` function bodies and view bodies ARE validated at CREATE time,
so their references are checked.
"""
import glob
import re
import sys

DEF_TABLE = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)", re.I)
DEF_TYPE = re.compile(r"create\s+type\s+public\.([a-z_][a-z0-9_]*)", re.I)
DEF_VIEW = re.compile(r"create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+public\.([a-z_][a-z0-9_]*)", re.I)
DEF_FUNC = re.compile(r"create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_][a-z0-9_]*)", re.I)
DEF_SEQ = re.compile(r"create\s+sequence\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)", re.I)
REF = re.compile(r"public\.([a-z_][a-z0-9_]*)", re.I)


def split_statements(text):
    """Split on top-level semicolons, keeping dollar-quoted bodies attached."""
    stmts, buf = [], []
    i, n = 0, len(text)
    while i < n:
        m = re.match(r"\$[a-zA-Z_]*\$", text[i:])
        if m:
            tag = m.group(0)
            end = text.find(tag, i + 1)
            if end == -1:
                return None
            buf.append(text[i : end + len(tag)])
            i = end + len(tag)
            continue
        ch = text[i]
        buf.append(ch)
        if ch == ";":
            stmts.append("".join(buf))
            buf = []
        i += 1
    if buf and "".join(buf).strip():
        stmts.append("".join(buf))
    return stmts


def strip_comments(stmt):
    out, i, n = [], 0, len(stmt)
    while i < n:
        if stmt.startswith("--", i):
            j = stmt.find("\n", i)
            i = n if j == -1 else j
            continue
        if stmt.startswith("/*", i):
            j = stmt.find("*/", i + 2)
            i = n if j == -1 else j + 2
            continue
        out.append(stmt[i])
        i += 1
    return "".join(out)


def main():
    pattern = sys.argv[1] if len(sys.argv) > 1 else "supabase/migrations/*.sql"
    files = sorted(glob.glob(pattern))
    problems = []
    known = set()

    for f in files:
        raw = open(f, encoding="utf-8").read()
        stmts = split_statements(raw)
        if stmts is None:
            problems.append("%s: UNTERMINATED DOLLAR QUOTE" % f)
            continue
        for si, stmt in enumerate(stmts):
            code = strip_comments(stmt)
            low = code.lower()
            local_defs = set()
            for pat in (DEF_TABLE, DEF_TYPE, DEF_VIEW, DEF_FUNC, DEF_SEQ):
                for m in pat.finditer(code):
                    local_defs.add(m.group(1).lower())

            # Which region do we scan for references?
            # plpgsql body is deferred; everything else is eager.
            if "$$" in code and "language plpgsql" in low:
                # scan only the part before the first $$ (signature, returns)
                scan = code.split("$$", 1)[0]
                # also `as $$` do-blocks: create type via do $$ has no eager refs
            else:
                scan = code  # view bodies, sql fn bodies, policies, DDL

            for m in REF.finditer(scan):
                name = m.group(1).lower()
                if name in local_defs or name in known:
                    continue
                problems.append(
                    "%s stmt#%d: public.%s used before defined (not in earlier stmts/files)"
                    % (f, si, name)
                )
            known |= local_defs

    if problems:
        seen = set()
        for p in problems:
            if p not in seen:
                print(p)
                seen.add(p)
        print("TOTAL: %d problems" % len(seen))
    else:
        print("WITHIN-FILE ORDER OK")


if __name__ == "__main__":
    main()
