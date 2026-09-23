#!/usr/bin/env python3
"""RLS coverage checker for TAHFIZH migrations.

Every table created in the migrations must have:
  - `alter table public.X enable row level security`
  - at least one `create policy ... on public.X`
Reports tables missing either. Idempotent-safe: aggregates across all files.
"""
import glob
import re
import sys

TABLE = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)", re.I)
ENABLE = re.compile(r"alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security", re.I)
POLICY = re.compile(r"create\s+policy\s+(?:\"[^\"]+\"|[a-z_][a-z0-9_]*)\s+on\s+public\.([a-z_][a-z0-9_]*)", re.I)

# Tables intentionally without client policies (service-role managed only):
# RLS is ENABLED but no policy exists -> every client access is denied; the
# platform writes these tables via service role. This is correct by design.
PLATFORM_OK = {"payment_webhooks", "platform_payment_settings"}


def main():
    pattern = sys.argv[1] if len(sys.argv) > 1 else "supabase/migrations/*.sql"
    files = sorted(glob.glob(pattern))
    tables, enabled, policies = set(), set(), set()
    for f in files:
        text = open(f, encoding="utf-8").read()
        for m in TABLE.finditer(text):
            tables.add(m.group(1).lower())
        for m in ENABLE.finditer(text):
            enabled.add(m.group(1).lower())
        for m in POLICY.finditer(text):
            policies.add(m.group(1).lower())

    problems = []
    for t in sorted(tables):
        if t in PLATFORM_OK:
            continue
        if t not in enabled:
            problems.append("table public.%s: RLS NOT ENABLED" % t)
        if t not in policies:
            problems.append("table public.%s: NO POLICY" % t)
    if problems:
        for p in problems:
            print(p)
        print("TOTAL: %d" % len(problems))
    else:
        print("RLS COVERAGE COMPLETE (%d tables)" % len(tables))


if __name__ == "__main__":
    main()
