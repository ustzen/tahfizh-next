"use client";

import { useActionState, useState } from "react";
import { FileText, HeartHandshake, ShieldCheck, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { submitWaiverRequestAction } from "@/app/actions/v10";
import {
  WAIVER_CERTIFICATE_ACCEPT,
  WAIVER_MAX_AGE_DAYS,
  WAIVER_STATUS_LABEL,
  formatDateId,
  monthYearLabel,
  statusTone,
} from "@/lib/v10-shared";
import type { WaiverRequestRow } from "@/lib/v10";

type Child = { studentId: string; name: string; code: string };

/** Tanggal Jakarta (YYYY-MM-DD) — stabil di server & browser. */
const jakartaDate = (offsetDays = 0) =>
  new Date(Date.now() - offsetDays * 86_400_000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });

/**
 * Link kecil "Pengajuan Tidak Mampu" yang tampil di dalam kotak (header)
 * Tagihan Infak Pengembangan. Klik → dialog berisi formulir pengajuan
 * (unggah Surat Keterangan Tidak Mampu, maksimal 7 hari terakhir) dan
 * daftar status pengajuan yang pernah dikirim.
 */
export function WaiverRequestLink({
  kids,
  requests,
}: {
  kids: Child[];
  requests: WaiverRequestRow[];
}) {
  const [open, setOpen] = useState(false);
  if (kids.length === 0) return null;

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-white/85 underline decoration-white/40 underline-offset-2 transition-colors hover:text-white"
      >
        <HeartHandshake className="size-3.5" />
        Pengajuan Tidak Mampu
        {pendingCount > 0 && (
          <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[0.65rem] no-underline">
            {pendingCount} menunggu
          </span>
        )}
      </button>

      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Pengajuan Tidak Mampu</DialogTitle>
              <DialogDescription>
                Unggah Surat Keterangan Tidak Mampu yang tertanggal maksimal {WAIVER_MAX_AGE_DAYS} hari terakhir.
                Bila disetujui Developer, infak pengembangan santri digratiskan untuk beberapa bulan.
              </DialogDescription>
            </DialogHeader>

            <WaiverForm kids={kids} onDone={() => setOpen(false)} />

            {requests.length > 0 && (
              <ul className="divide-y overflow-hidden rounded-xl border border-slate-200 dark:border-slate-500/20">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {r.studentName}{" "}
                        <span className="text-muted-foreground font-mono text-xs">{r.studentCode}</span>
                      </p>
                      <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <FileText className="size-3.5" /> Surat {formatDateId(r.certificateDate)}
                        {r.status === "APPROVED" && r.months && r.fromYear && r.fromMonth && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
                              <ShieldCheck className="size-3.5" />
                              Digratiskan {r.months} bulan sejak {monthYearLabel(r.fromYear, r.fromMonth)}
                            </span>
                          </>
                        )}
                        {r.status === "REJECTED" && r.rejectReason && (
                          <span className="text-red-600 dark:text-red-300">· {r.rejectReason}</span>
                        )}
                      </p>
                    </div>
                    <Badge variant="outline" className={statusTone(r.status)}>
                      {WAIVER_STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Formulir pengajuan — dimount ulang setiap dialog dibuka agar state bersih. */
function WaiverForm({ kids, onDone }: { kids: Child[]; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(submitWaiverRequestAction, null);
  const today = jakartaDate(0);
  const minDate = jakartaDate(WAIVER_MAX_AGE_DAYS);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="waiver-student">Santri</Label>
          <select
            id="waiver-student"
            name="studentId"
            defaultValue={kids[0]?.studentId}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            required
          >
            {kids.map((k) => (
              <option key={k.studentId} value={k.studentId}>
                {k.name} · {k.code}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="waiver-date">Tanggal surat keterangan</Label>
          <Input
            id="waiver-date"
            name="certificateDate"
            type="date"
            min={minDate}
            max={today}
            defaultValue={today}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="waiver-file">Surat Keterangan Tidak Mampu</Label>
        <Input id="waiver-file" name="certificate" type="file" accept={WAIVER_CERTIFICATE_ACCEPT} required />
        <p className="text-muted-foreground text-xs">JPG, PNG, WebP, atau PDF — maksimal 5 MB.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="waiver-reason">Alasan / keterangan (opsional)</Label>
        <Textarea
          id="waiver-reason"
          name="reason"
          rows={2}
          maxLength={1000}
          placeholder="Contoh: kondisi ekonomi keluarga sedang sulit."
        />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state?.success && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          {state.success}
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={onDone}>
              Selesai
            </Button>
          </div>
        </div>
      )}

      {!state?.success && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
            {pending ? (
              "Mengirim…"
            ) : (
              <>
                <Upload className="size-4" /> Kirim Pengajuan
              </>
            )}
          </Button>
        </div>
      )}
    </form>
  );
}
