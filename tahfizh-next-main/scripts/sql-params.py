#!/usr/bin/env python3
"""Detects PostgreSQL error 42P13: non-default parameter after a default one.

Extracts every `create ... function public.NAME(...)` signature (paren-aware,
dollar-quote aware) and validates that once a parameter has a DEFAULT, all
following parameters also have defaults.
"""
import glob
import re
import sys

FUNC = re.compile(
    r"create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_][a-z0-9_]*)\s*\(", re.I
)


def find_close(text, open_idx):
    depth = 0
    i = open_idx
    while i < len(text):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def main():
    pattern = sys.argv[1] if len(sys.argv) > 1 else "supabase/migrations/*.sql"
    files = sorted(glob.glob(pattern))
    bad = []
    for f in files:
        text = open(f, encoding="utf-8").read()
        for m in FUNC.finditer(text):
            open_idx = m.end() - 1
            close_idx = find_close(text, open_idx)
            if close_idx == -1:
                bad.append("%s: %s signature unmatched paren" % (f, m.group(1)))
                continue
            sig = text[open_idx + 1 : close_idx]
            # strip line comments and string contents (they may contain commas)
            sig = re.sub(r"--[^\n]*", "", sig)
            sig = re.sub(r"'(?:[^']|'')*'", "''", sig)
            # split on commas not inside parens (record types etc.)
            depth = 0
            parts, cur = [], []
            for ch in sig:
                if ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
                if ch == "," and depth == 0:
                    parts.append("".join(cur))
                    cur = []
                else:
                    cur.append(ch)
            parts.append("".join(cur))
            seen_default = False
            for p in parts:
                pl = p.lower()
                if not pl.strip():
                    continue
                if re.search(r"\bdefault\b", pl):
                    seen_default = True
                elif seen_default:
                    bad.append(
                        "%s: function %s: param %r lacks DEFAULT after a defaulted param"
                        % (f, m.group(1), p.strip()[:40])
                    )
    if bad:
        for b in bad:
            print(b)
    else:
        print("ALL FUNCTION PARAMETER ORDERS VALID")


if __name__ == "__main__":
    main()
