#!/usr/bin/env python3
"""Static SQL migration validator (no DB connection required).

Pipeline: remove comments / dollar-quote bodies / string contents FIRST,
then split on `;` and check parenthesis balance per statement.
Also detects the known broken policy pattern:
  `)` newline `or public.is_platform_developer();`
"""
import glob
import re
import sys

BROKEN_OR_DEV = re.compile(
    r"\)\s*\n\s*or\s+public\.is_platform_developer\(\)\s*;", re.I
)


def code_only(text):
    """Return text with comments, dollar bodies and string contents removed."""
    out = []
    i, n = 0, len(text)
    while i < n:
        m = re.match(r"\$[a-zA-Z_]*\$", text[i:])
        if m:
            tag = m.group(0)
            end = text.find(tag, i + 1)
            if end == -1:
                out.append(text[i:])
                break
            i = end + len(tag)  # drop dollar-quoted body entirely
            continue
        if text.startswith("--", i):
            j = text.find("\n", i)
            i = n if j == -1 else j
            continue
        if text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j == -1 else j + 2
            continue
        if text[i] == "'":
            j = i + 1
            while j < n:
                if text[j] == "'":
                    if j + 1 < n and text[j + 1] == "'":
                        j += 2
                        continue
                    break
                j += 1
            out.append("''")  # keep the string, drop its contents
            i = j + 1
            continue
        out.append(text[i])
        i += 1
    return "".join(out)


def main():
    pattern = sys.argv[1] if len(sys.argv) > 1 else "supabase/migrations/*.sql"
    files = sorted(glob.glob(pattern))
    if not files:
        print("no migration files found")
        return
    problems = []
    for f in files:
        text = open(f, encoding="utf-8").read()
        if BROKEN_OR_DEV.search(text):
            problems.append("%s: BROKEN or-dev placement" % f)
        # unterminated dollar quote?
        pos, i, n = 0, 0, len(text)
        while i < n:
            m = re.match(r"\$[a-zA-Z_]*\$", text[i:])
            if m:
                tag = m.group(0)
                end = text.find(tag, i + 1)
                if end == -1:
                    problems.append("%s: UNTERMINATED DOLLAR QUOTE" % f)
                    break
                i = end + len(tag)
                continue
            i += 1
        code = code_only(text)
        for idx, stmt in enumerate(s for s in code.split(";") if s.strip()):
            if stmt.count("(") != stmt.count(")"):
                problems.append(
                    "%s stmt#%d: UNBALANCED PARENS :: %r"
                    % (f, idx, stmt.strip()[:110])
                )
    if problems:
        for p in problems:
            print(p)
    else:
        print("NO STRUCTURAL ERRORS FOUND")


if __name__ == "__main__":
    main()
