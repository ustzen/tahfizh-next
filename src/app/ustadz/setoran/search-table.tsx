"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { genderLabel } from "@/lib/roles";
import {
  SUBMISSION_KIND_LABELS,
  SUBMISSION_RESULT_LABELS,
  SUBMISSION_RESULT_STYLES,
  type SubmissionResult,
} from "@/lib/setoran-shared";
import type { SubmissionStudentSummary } from "@/lib/setoran";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { fmtDMY } from "@/lib/date-format";

function formatDate(iso: string | null) {
  return fmtDMY(iso, "—");
}

function scoreText(s: SubmissionStudentSummary) {
  if (s.lastScoreLabel) return s.lastScoreLabel;
  if (s.lastScoreValue !== null) return String(s.lastScoreValue);
  if (s.lastResult) return "✓";
  return "—";
}

/**
 * Rule #5: table on desktop with wrapping cells (mobile-friendly rows), and
 * rule #25: instant client-side search over nama + ID santri. The list is
 * already in memory from the server render, so search costs nothing (rule #38).
 */
export function SetoranSearchTable({
  summaries,
  termsSantri,
}: {
  summaries: SubmissionStudentSummary[];
  termsSantri: string;
}) {
  const [query, setQuery] = useState("");

  // The search input is server-rendered (page.tsx); bind to it by id.
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>("[data-setoran-search]");
    if (!input) return;
    const handler = () => setQuery(input.value);
    input.addEventListener("input", handler);
    return () => input.removeEventListener("input", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter(
      (s) => s.fullName.toLowerCase().includes(q) || (s.nis ?? "").toLowerCase().includes(q)
    );
  }, [summaries, query]);

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Nama {termsSantri}</TableHead>
          <TableHead>Setoran Terakhir</TableHead>
          <TableHead>Jenis</TableHead>
          <TableHead>Nilai</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="px-5">Santri</TableHead>
          <TableHead className="pr-5 text-right">Aksi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.map((s) => (
          <TableRow key={s.studentId}>
            <TableCell className="font-medium text-foreground">
              <div className="flex flex-col">
                <span>{s.fullName}</span>
                <span className="text-muted-foreground text-xs">{genderLabel(s.gender)}</span>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {s.lastSurah ? (
                <>
                  {s.lastSurah}
                  {s.lastAyat ? <span className="text-muted-foreground"> · {s.lastAyat}</span> : null}
                  <span className="text-muted-foreground block text-xs">{formatDate(s.lastDate)}</span>
                </>
              ) : (
                "Belum ada"
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {s.lastKind ? SUBMISSION_KIND_LABELS[s.lastKind] : "—"}
            </TableCell>
            <TableCell>
              {s.lastResult ? (
                <span className="bg-gradient-brand inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold text-white shadow-card">
                  {scoreText(s)}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              {s.lastResult ? (
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.7rem] font-bold ${SUBMISSION_RESULT_STYLES[s.lastResult as SubmissionResult]}`}
                >
                  {SUBMISSION_RESULT_LABELS[s.lastResult as SubmissionResult]}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="px-5">
              <StatusBadge status={s.studentStatus} />
            </TableCell>
            <TableCell className="pr-5 text-right">
              <Button asChild size="sm" variant="outline" className="h-8">
                <Link href={`/ustadz/setoran/${s.studentId}`}>Lihat</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {filtered.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-muted-foreground px-5 py-8 text-center text-sm">
              Tidak ada {termsSantri.toLowerCase()} yang cocok dengan pencarian.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
