#!/usr/bin/env python3
"""Build supabase/tahfizh-combined.sql — single idempotent SQL file for TAHFIZH.

Menggabungkan supabase/migrations/*.sql (urut nama file, sama seperti
`supabase db push`) menjadi SATU file yang aman dijalankan berulang kali di
Supabase SQL Editor:

  * create type/table/index/function/view, insert data, RLS policy — sudah
    idempotent di migration sumber (IF NOT EXISTS / ON CONFLICT / drop+create),
    dilewatkan apa adanya.
  * create trigger — migration sumber TIDAK idempotent, jadi tiap statement
    dibungkus DO $$ ... EXECUTE '...' EXCEPTION WHEN duplicate_object THEN NULL
    agar "trigger sudah ada" di-skip, bukan error.

Data yang sudah ada TIDAK pernah dihapus/diubah: file hanya menambahkan
objek yang belum ada (skip yang sudah ada).

Jalankan ulang script ini setiap kali migration baru ditambahkan:

    python3 scripts/build-combined-sql.py
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_GLOB = os.path.join(ROOT, "supabase", "migrations", "*.sql")
OUT_PATH = os.path.join(ROOT, "supabase", "tahfizh-combined.sql")

TRIGGER_RE = re.compile(r"create\s+trigger\b", re.I)
DOLLAR_RE = re.compile(r"\$[a-zA-Z_]*\$")

HEADER = """\
-- ============================================================================
-- TAHFIZH — FILE SQL GABUNGAN (semua migration V1 s/d V12)
-- ============================================================================
-- CARA PAKAI:
--   1. Buka Supabase Dashboard → SQL Editor (project produksi Anda).
--   2. Paste SELURUH isi file ini, lalu Run — cukup SEKALI.
--   3. File ini IDEMPOTEN: jika dijalankan BERULANG kali, tidak akan error dan
--      tidak merusak data. Objek/trigger/policy/seed yang sudah ada di-SKIP;
--      hanya yang belum ada yang dibuat.
--
-- AMAN:
--   * Tidak ada drop table / drop kolom / truncate / hapus data.
--   * Multi-tenant tetap terisolasi penuh — tidak ada USING(true).
--   * Urutan = urutan migration resmi (sama seperti `supabase db push`).
--
-- Dibuat otomatis oleh scripts/build-combined-sql.py — JANGAN edit manual.
-- Regenerasi: python3 scripts/build-combined-sql.py
-- ============================================================================
"""


def split_statements(text):
    """Dollar-quote-aware, comment-aware, string-aware split.
    Returns [(start, end, stmt)] with offsets. ';' inside -- comments, /* */
    blocks, dollar-quoted bodies, or '...' strings never splits a statement.
    """
    stmts = []
    start = 0
    i, n = 0, len(text)
    tag = "$$"
    in_line_comment = in_block_comment = in_string = False
    while i < n:
        ch = text[i]
        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue
        if in_block_comment:
            if text.startswith("*/", i):
                in_block_comment = False
                i += 2
            else:
                i += 1
            continue
        if in_string:
            if ch == "'":
                if i + 1 < n and text[i + 1] == "'":
                    i += 2
                    continue
                in_string = False
            i += 1
            continue
        if ch == "-" and text.startswith("--", i):
            in_line_comment = True
            i += 2
            continue
        if ch == "/" and text.startswith("/*", i):
            in_block_comment = True
            i += 2
            continue
        if ch == "'":
            in_string = True
            i += 1
            continue
        m = DOLLAR_RE.match(text, i)
        if m:
            tag = m.group(0)
            end = text.find(tag, i + len(tag))
            if end == -1:
                raise RuntimeError("unterminated dollar quote")
            i = end + len(tag)
            continue
        if ch == ";":
            stmts.append((start, i + 1, text[start : i + 1]))
            start = i + 1
        i += 1
    tail = text[start:]
    if tail.strip():
        stmts.append((start, len(text), tail))
    return stmts


def strip_comments(stmt):
    out, i, n = [], 0, len(stmt)
    while i < n:
        if stmt.startswith("--", i):
            j = stmt.find("\n", i)
            i = n if j == -1 else j
            continue
        out.append(stmt[i])
        i += 1
    return "".join(out)


def is_trigger_statement(stmt):
    code = strip_comments(stmt).strip()
    return bool(TRIGGER_RE.match(code))


def wrap_trigger(stmt):
    """Wrap `create trigger ...;` in DO-block that skips when it already exists."""
    lines = stmt.split("\n")
    first_idx = None
    for k, ln in enumerate(lines):
        s = ln.strip()
        if s and not s.startswith("--"):
            first_idx = k
            break
    if first_idx is None:
        return stmt  # comment-only

    lead = "\n".join(lines[:first_idx]).rstrip("\n")
    body = "\n".join(lines[first_idx:]).rstrip()
    if body.endswith(";"):
        body = body[:-1].rstrip()
    if not TRIGGER_RE.match(strip_comments(body).strip()):
        return stmt

    lead_out = (lead + "\n\n") if lead.strip() else ""
    esc = body.replace("'", "''")
    return (
        lead_out
        + "do $tfx$  -- idempotent: skip bila trigger sudah ada (aman dijalankan berulang)\n"
        + "begin\n"
        + "  execute '" + esc + "';\n"
        + "exception\n"
        + "  when duplicate_object then null;\n"
        + "end\n"
        + "$tfx$;"
    )


def main():
    files = sorted(glob.glob(SRC_GLOB))
    if not files:
        print("no migration files found", file=sys.stderr)
        return 1

    wrapped = 0
    out_parts = [HEADER]
    for path in files:
        name = os.path.basename(path)
        src = open(path, encoding="utf-8").read()
        out_parts.append(
            f"\n-- ============================================================================\n"
            f"-- SOURCE: {name}\n"
            f"-- ============================================================================\n"
        )
        for _s, _e, stmt in split_statements(src):
            if is_trigger_statement(stmt):
                out_parts.append(wrap_trigger(stmt))
                wrapped += 1
            else:
                out_parts.append(stmt)

    content = "".join(out_parts)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"OK: wrote {os.path.relpath(OUT_PATH, ROOT)}")
    print(f"    sources: {len(files)} migration file(s)")
    print(f"    create trigger wrapped (idempotent): {wrapped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
