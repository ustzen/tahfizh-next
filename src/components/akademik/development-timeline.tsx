"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { CalendarDays, ClipboardCheck, GraduationCap, Loader2, ScrollText } from "lucide-react";

import { fetchDevelopmentPageAction, type DevelopmentEvent } from "@/app/actions/development";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { fmtDMY } from "@/lib/date-format";

/**
 * Riwayat Perkembangan timeline (#43-#47): modern vertical timeline with
 * filters (tahun ajaran + semester + jenis kegiatan + rentang tanggal) and
 * "load more" pagination (#71 — never fetches the whole history at once).
 *
 * Year/semester filters translate into date ranges (#45/#47) — semesters own
 * their start/end dates, so no extra RPC parameter is needed.
 */

const PAGE_SIZE = 20;

const KINDS: { value: string; label: string; color: string }[] = [
  { value: "TAHFIDZ", label: "Tahfidz", color: "bg-emerald-500" },
  { value: "SETORAN", label: "Setoran", color: "bg-blue-500" },
  { value: "TARTIL", label: "Tartil", color: "bg-cyan-500" },
  { value: "HADITS", label: "Hadits", color: "bg-amber-500" },
  { value: "DOA", label: "Doa Harian", color: "bg-orange-500" },
  { value: "TAJWID", label: "Tajwid", color: "bg-violet-500" },
  { value: "TUGAS", label: "Tugas", color: "bg-sky-500" },
  { value: "JURNAL", label: "Jurnal", color: "bg-slate-500" },
];

function kindMeta(kind: string) {
  return KINDS.find((k) => k.value === kind) ?? { value: kind, label: kind, color: "bg-slate-400" };
}

function formatTanggal(iso: string) {
  return fmtDMY(iso);
}

export type TimelineYear = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  active: boolean;
};

export type TimelineSemester = {
  id: string;
  yearId: string;
  label: string;
  startDate: string;
  endDate: string;
  active: boolean;
};

export function DevelopmentTimeline({
  studentId,
  summary,
  years,
  semesters,
}: {
  studentId: string;
  summary: Record<string, number>;
  years: TimelineYear[];
  semesters: TimelineSemester[];
}) {
  const [yearId, setYearId] = useState<string>("");
  const [semId, setSemId] = useState<string>("");
  const [kind, setKind] = useState<string>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const selectedYear = years.find((y) => y.id === yearId) ?? null;
  const selectedSem = semesters.find((s) => s.id === semId) ?? null;
  const yearSemesters = yearId ? semesters.filter((s) => s.yearId === yearId) : [];

  // Periode efektif (#45/#47): semester > tahun ajaran > input tanggal manual.
  const effFrom = selectedSem?.startDate ?? selectedYear?.startDate ?? from;
  const effTo = selectedSem?.endDate ?? selectedYear?.endDate ?? to;

  const [rows, setRows] = useState<DevelopmentEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, startTransition] = useTransition();
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(
    (offset: number, replace: boolean) => {
      startTransition(async () => {
        const res = await fetchDevelopmentPageAction(studentId, {
          limit: PAGE_SIZE,
          offset,
          kind: kind === "ALL" ? undefined : kind,
          from: effFrom || undefined,
          to: effTo || undefined,
        });
        if (res.error) {
          setError(res.error);
          setRows([]);
          setHasMore(false);
          return;
        }
        setError(null);
        setRows((prev) => (replace ? res.rows : [...prev, ...res.rows]));
        setHasMore(res.rows.length === PAGE_SIZE);
      });
    },
    [studentId, kind, effFrom, effTo]
  );

  useEffect(() => {
    load(0, true);
  }, [load]);

  const summaryEntries = KINDS.filter((k) => (summary[k.value] ?? 0) > 0);

  return (
    <div className="space-y-5">
      {/* Ringkasan (#46) — real counts from development_summary RPC */}
      {summaryEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {summaryEntries.map((k) => (
            <Card key={k.value} className="shadow-card rounded-2xl">
              <CardContent className="flex items-center gap-3 px-4 py-4">
                <span className={`size-2.5 shrink-0 rounded-full ${k.color}`} />
                <div>
                  <p className="text-lg font-bold leading-none text-foreground">{summary[k.value]}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filter (#45/#47) — tahun ajaran, semester, jenis, dan rentang tanggal */}
      <Card className="shadow-card rounded-2xl">
        <CardContent className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            value={yearId}
            onValueChange={(v) => {
              setYearId(v);
              setSemId("");
            }}
          >
            <SelectTrigger className="w-full" aria-label="Tahun ajaran">
              <SelectValue placeholder="Semua Tahun Ajaran" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Semua Tahun Ajaran</SelectItem>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                  {y.active ? " · Aktif" : " · Arsip"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={semId} onValueChange={setSemId} disabled={!yearId}>
            <SelectTrigger className="w-full" aria-label="Semester">
              <SelectValue placeholder={yearId ? "Semua Semester" : "Pilih tahun dulu"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Semua Semester</SelectItem>
              {yearSemesters.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                  {s.active ? " · Aktif" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-full" aria-label="Jenis kegiatan">
              <SelectValue placeholder="Semua Jenis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Jenis</SelectItem>
              {KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={Boolean(selectedYear || selectedSem)}
            aria-label="Dari tanggal"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={Boolean(selectedYear || selectedSem)}
            aria-label="Sampai tanggal"
          />
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-lg bg-red-50 dark:bg-red-500/15 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : rows.length === 0 && !loading ? (
        <Empty className="py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ScrollText /></EmptyMedia>
            <EmptyTitle>Belum ada riwayat perkembangan untuk periode ini.</EmptyTitle>
            <EmptyDescription>
              Aktivitas pembelajaran (tahfidz, setoran, tartil, presensi kegiatan lain) akan muncul di sini.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="relative pl-6">
          {/* Timeline rail */}
          <span className="absolute top-2 bottom-2 left-[9px] w-0.5 rounded bg-blue-200 dark:bg-blue-500/30" />
          <ol className="space-y-4">
            {rows.map((e, i) => {
              const meta = kindMeta(e.kind);
              return (
                <li key={`${e.eventDate}-${e.title}-${i}`} className="relative">
                  <span className={`absolute top-4 -left-[22px] size-4 rounded-full ring-4 ring-white ${meta.color}`} />
                  <Card className="shadow-card rounded-2xl transition-shadow hover:shadow-md">
                    <CardContent className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-role-soft px-2.5 py-0.5 text-xs font-semibold text-role-strong">
                          {meta.label}
                        </span>
                        <span className="text-muted-foreground flex items-center gap-1 text-xs">
                          <CalendarDays className="size-3.5" />
                          {formatTanggal(e.eventDate)}
                        </span>
                        {e.scoreLabel && (
                          <span className="ml-auto rounded-full bg-amber-50 dark:bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                            Nilai: {e.scoreLabel}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 font-semibold text-foreground">{e.title}</p>
                      {e.detail && <p className="text-muted-foreground mt-0.5 text-sm">{e.detail}</p>}
                      {e.teacher && (
                        <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
                          <GraduationCap className="size-3.5" />
                          {e.teacher}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {hasMore && rows.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loading} onClick={() => load(rows.length, false)}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
            Muat Lebih Banyak
          </Button>
        </div>
      )}
    </div>
  );
}
