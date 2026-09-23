"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Check, NotebookPen, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { saveAttendanceBatchAction } from "@/app/actions/halaqah";
import {
  ATTENDANCE_STATUSES,
  STATUS_META,
  countStatuses,
  formatDateID,
  todayISO,
  type AttendanceEntry,
  type AttendanceStatus,
  type HalaqahMember,
} from "@/lib/halaqah-shared";

/**
 * TAHFIZH V8 — Quick Attendance sheet (rule #13-#26).
 * H/I/S/A mass buttons mutate CLIENT state only (rule #20 — no request per
 * click); [Simpan] sends the whole class in ONE batch call (rule #21).
 * Target workflow < 10 detik (rule #24).
 */

type Option = { id: string; name: string; studentCount: number };

export function AttendanceSheet({
  halaqahOptions,
  initialHalaqahId,
  initialDate,
  initialGeneralNote,
  students,
  initialEntries,
  readOnly = false,
}: {
  halaqahOptions: Option[];
  initialHalaqahId: string;
  initialDate: string;
  initialGeneralNote: string;
  students: HalaqahMember[];
  initialEntries: Record<string, AttendanceEntry>;
  /** Koordinator/admin read-only view (rule #5/#46): lihat tanpa mengubah. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [halaqahId, setHalaqahId] = useState(initialHalaqahId);
  const [date, setDate] = useState(initialDate);
  const [generalNote, setGeneralNote] = useState(initialGeneralNote);
  const [entries, setEntries] = useState<Record<string, AttendanceEntry>>(initialEntries);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // Baris catatan diciutkan secara default (rapat di mobile); dibuka per-santri saat dibutuhkan.
  const [openNote, setOpenNote] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => countStatuses(entries), [entries]);

  /**
   * Ganti tanggal/halaqah HARUS netral dulu (bukan warisan klik sebelumnya).
   * 1) Kosongkan state lokal seketika (biar tidak kelihatan "sudah ter-klik").
   * 2) Dorong ?tanggal=/?halaqah= baru lewat router agar server component
   *    refetch getAttendanceDay untuk kombinasi yang benar-benar baru;
   *    key={halaqahId}-${date} di page.tsx akan remount AttendanceSheet
   *    dengan initialEntries yang sesuai (kosong jika memang belum diisi).
   */
  function resetToNeutral() {
    setEntries({});
    setGeneralNote("");
    setOpenNote({});
    setMessage(null);
  }

  function goTo(nextHalaqahId: string, nextDate: string) {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("tanggal", nextDate);
    if (halaqahOptions.length > 1) {
      params.set("halaqah", nextHalaqahId);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function handleDateChange(nextDate: string) {
    if (nextDate === date) return;
    setDate(nextDate);
    resetToNeutral();
    goTo(halaqahId, nextDate);
  }

  function handleHalaqahChange(nextHalaqahId: string) {
    if (nextHalaqahId === halaqahId) return;
    setHalaqahId(nextHalaqahId);
    resetToNeutral();
    goTo(nextHalaqahId, date);
  }

  /** Mass action — pure client state, zero requests (rule #15-#20). */
  function setAll(status: AttendanceStatus) {
    setEntries((prev) => {
      const next: Record<string, AttendanceEntry> = {};
      for (const s of students) {
        next[s.id] = { status, note: prev[s.id]?.note ?? "" };
      }
      return next;
    });
  }

  function setOne(studentId: string, status: AttendanceStatus) {
    setEntries((prev) => ({
      ...prev,
      [studentId]: { status, note: prev[studentId]?.note ?? "" },
    }));
  }

  function setNote(studentId: string, note: string) {
    setEntries((prev) => ({
      ...prev,
      [studentId]: { status: prev[studentId]?.status ?? null, note },
    }));
  }

  async function save() {
    const records = Object.entries(entries)
      .filter(([, e]) => e.status != null)
      .map(([studentId, e]) => ({ studentId, status: e.status as AttendanceStatus, note: e.note }));
    if (records.length === 0) {
      setMessage({ kind: "err", text: "Pilih status minimal untuk satu santri." });
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await saveAttendanceBatchAction({
      halaqahId,
      date,
      generalNote,
      records,
    }).catch(() => ({
      error: "Presensi belum berhasil disimpan. Silakan coba lagi.",
      success: undefined as string | undefined,
      saved: undefined as number | undefined,
    }));
    setSaving(false);
    if (res.error) {
      setMessage({ kind: "err", text: res.error });
      return;
    }
    setMessage({ kind: "ok", text: res.success ?? "Presensi berhasil disimpan." }); // rule #26
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Selector bar: halaqah + tanggal (rule #24/#31) */}
      <Card className="shadow-card">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Halaqah</Label>
            <Select value={halaqahId} onValueChange={handleHalaqahChange} disabled={isPending}>
              <SelectTrigger aria-label="Pilih halaqah">
                <SelectValue placeholder="Pilih halaqah" />
              </SelectTrigger>
              <SelectContent>
                {halaqahOptions.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name} ({h.studentCount} santri)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tanggal</Label>
            <Input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => handleDateChange(e.target.value)}
              disabled={isPending}
              aria-label="Tanggal presensi"
            />
          </div>
        </CardContent>
      </Card>

      {/* Quick mass-action bar (rule #14-#18) — big touch targets (rule #54) */}
      {readOnly ? (
        <Card className="border-role/15 bg-primary shadow-card">
          <CardContent className="p-4 text-white">
            <p className="text-sm font-semibold">Presensi {formatDateID(date)}</p>
            <p className="text-xs opacity-80">Mode lihat — penyimpanan presensi dilakukan oleh guru pengampu.</p>
          </CardContent>
        </Card>
      ) : (
      <Card className="border-role/15 bg-primary shadow-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-4 text-white">
            <Users className="h-5 w-5" aria-hidden />
            <div>
              <p className="text-xs opacity-80">Presensi Cepat</p>
              <p className="text-sm font-semibold">Set semua santri</p>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-4 gap-2 sm:max-w-md" role="group" aria-label="Status massal">
            {ATTENDANCE_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setAll(s)}
                disabled={isPending}
                aria-label={`${STATUS_META[s].label} semua`}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center rounded-xl border-2 border-white/40 bg-white/15 font-bold text-white backdrop-blur transition hover:bg-white/30 active:scale-95 disabled:opacity-50",
                  "touch-manipulation"
                )}
              >
                <span className="text-lg leading-none">{STATUS_META[s].letter}</span>
                <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide opacity-90">
                  {STATUS_META[s].label}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Per-student status table (rule #22/#23/#28) — rapat di mobile, tanpa geser ke kanan */}
      {students.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground/80">
          Belum ada santri dalam kelompok ini. Tambahkan anggota lewat menu Halaqah.
        </p>
      ) : (
        <Card className="shadow-card overflow-hidden py-0">
          <Table className="table-fixed text-[0.8rem] sm:text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-7 px-1 text-center text-[0.65rem] sm:w-10 sm:px-2 sm:text-xs">No</TableHead>
                <TableHead className="w-14 px-1 text-[0.65rem] sm:w-20 sm:px-2 sm:text-xs">NIS</TableHead>
                <TableHead className="px-1.5 sm:px-3 sm:text-sm">Nama</TableHead>
                {ATTENDANCE_STATUSES.map((st) => (
                  <TableHead
                    key={st}
                    className="w-7 px-0.5 text-center sm:w-14 sm:px-1 sm:text-sm"
                    title={STATUS_META[st].label}
                  >
                    {STATUS_META[st].letter}
                  </TableHead>
                ))}
                <TableHead className="w-7 px-0.5 text-center text-[0.65rem] sm:w-14 sm:px-1 sm:text-xs">Ket</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s, i) => {
                const entry = entries[s.id] ?? { status: null, note: "" };
                const noteOpen = openNote[s.id] === true;
                return (
                  <Fragment key={s.id}>
                    <TableRow>
                      <TableCell className="px-1 text-center text-[0.65rem] text-muted-foreground sm:px-2 sm:text-xs">
                        {i + 1}
                      </TableCell>
                      <TableCell className="px-1 font-mono text-[0.65rem] text-muted-foreground sm:px-2 sm:text-xs">
                        {s.code}
                      </TableCell>
                      <TableCell className="truncate px-1.5 text-xs font-medium text-slate-800 sm:px-3 sm:text-sm dark:text-slate-100">
                        {s.name}
                      </TableCell>
                      {ATTENDANCE_STATUSES.map((st) => {
                        const active = entry.status === st;
                        if (readOnly) {
                          return (
                            <TableCell key={st} className="px-0.5 text-center sm:px-1">
                              <span
                                aria-hidden
                                className={cn(
                                  "mx-auto flex size-7 items-center justify-center rounded-md border text-[0.7rem] font-bold sm:size-10 sm:rounded-lg sm:text-base",
                                  active
                                    ? cn(STATUS_META[st].solid, "border-transparent")
                                    : "border-slate-100 bg-slate-50 text-slate-300"
                                )}
                              >
                                {STATUS_META[st].letter}
                              </span>
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={st} className="px-0.5 text-center sm:px-1">
                            <button
                              type="button"
                              onClick={() => setOne(s.id, st)}
                              disabled={isPending}
                              aria-pressed={active}
                              aria-label={`${STATUS_META[st].label} — ${s.name}`}
                              className={cn(
                                "mx-auto flex size-7 items-center justify-center rounded-md border text-[0.7rem] font-bold transition active:scale-95 disabled:opacity-50 sm:size-10 sm:rounded-lg sm:text-base",
                                active
                                  ? cn(STATUS_META[st].solid, "border-transparent shadow-sm")
                                  : cn("bg-white", STATUS_META[st].chip, "hover:bg-slate-50")
                              )}
                            >
                              {STATUS_META[st].letter}
                            </button>
                          </TableCell>
                        );
                      })}
                      <TableCell className="px-0.5 text-center sm:px-1">
                        <button
                          type="button"
                          onClick={() => setOpenNote((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                          aria-expanded={noteOpen}
                          aria-label={`Catatan untuk ${s.name}`}
                          title="Catatan (opsional)"
                          className={cn(
                            "mx-auto flex size-7 items-center justify-center rounded-md border text-muted-foreground transition sm:size-10 sm:rounded-lg",
                            entry.note ? "border-role/40 bg-role-soft text-role-strong" : "border-slate-200 bg-white hover:bg-slate-50"
                          )}
                        >
                          <NotebookPen className="size-3.5 sm:size-5" />
                        </button>
                      </TableCell>
                    </TableRow>
                    {noteOpen && (
                      <TableRow key={`${s.id}-note`} className="bg-slate-50/60 hover:bg-slate-50/60">
                        <TableCell colSpan={4 + ATTENDANCE_STATUSES.length} className="px-2 py-1.5 sm:px-3 sm:py-2">
                          {readOnly ? (
                            <span className="text-xs text-muted-foreground sm:text-sm">{entry.note || "Tidak ada catatan."}</span>
                          ) : (
                            <input
                              type="text"
                              value={entry.note}
                              onChange={(e) => setNote(s.id, e.target.value)}
                              placeholder={`Catatan untuk ${s.name} (opsional)`}
                              aria-label={`Catatan untuk ${s.name}`}
                              autoFocus
                              className="w-full rounded-md border border-border bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-role sm:px-3 sm:py-1.5 sm:text-sm"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Catatan pertemuan umum (rule #30) */}
      <Card className="shadow-card">
        <CardContent className="space-y-1.5 p-4">
          <Label htmlFor="general-note" className="flex items-center gap-1.5 text-sm">
            <CalendarDays className="h-4 w-4 text-blue-500" /> Catatan Pertemuan (opsional)
          </Label>
          <Textarea
            id="general-note"
            value={generalNote}
            onChange={(e) => setGeneralNote(e.target.value)}
            placeholder="Pembelajaran berjalan normal."
            className="min-h-[56px] text-sm"
            maxLength={500}
          />
        </CardContent>
      </Card>

      {/* Summary + save (rule #25) — sticky on mobile for thumb reach */}
      <div className="sticky bottom-3 z-10">
        <Card className="border-role/15 bg-white/95 shadow-card-lg backdrop-blur">
          <CardContent className="space-y-2.5 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {ATTENDANCE_STATUSES.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className="text-muted-foreground">{STATUS_META[s].label}:</span>
                  <span className="font-bold text-foreground">{counts[s]}</span>
                </span>
              ))}
              {counts.unset > 0 ? (
                <span className="text-muted-foreground/80">Belum: {counts.unset}</span>
              ) : null}
            </div>
            {isPending ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-muted-foreground" role="status">
                Memuat presensi untuk tanggal/halaqah terpilih...
              </p>
            ) : message ? (
              <p
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  message.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                )}
                role="status"
              >
                {message.text}
              </p>
            ) : null}
            <Button
              className="w-full bg-primary text-white"
              disabled={saving || isPending || students.length === 0 || !halaqahId || readOnly}
              onClick={() => void save()}
            >
              <Check className="mr-1.5 h-4 w-4" />
              {saving ? "Menyimpan..." : "Simpan Presensi"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
