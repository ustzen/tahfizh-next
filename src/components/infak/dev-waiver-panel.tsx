"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Building2, Check, FileText, HeartHandshake, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CardBox } from "@/components/dashboard/section";
import { decideWaiverRequestAction } from "@/app/actions/v10";
import {
  WAIVER_MAX_MONTHS,
  WAIVER_STATUS_LABEL,
  formatDateId,
  monthYearLabel,
  statusTone,
} from "@/lib/v10-shared";
import type { WaiverRequestRow } from "@/lib/v10";

const STATUS_FILTERS = [
  { value: "PENDING", label: "Menunggu" },
  { value: "APPROVED", label: "Disetujui" },
  { value: "REJECTED", label: "Ditolak" },
  { value: "ALL", label: "Semua" },
];

/**
 * DEVELOPER meninjau pengajuan tidak mampu: lihat surat keterangan, lalu
 * setujui (gratis N bulan) atau tolak beserta alasan.
 */
export function DevWaiverPanel({
  requests,
  status,
  query,
}: {
  requests: WaiverRequestRow[];
  status: string;
  query: string;
}) {
  return (
    <div className="space-y-4">
      <CardBox>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                asChild
                size="sm"
                variant={status === f.value ? "default" : "outline"}
              >
                <Link href={`/developer/infak/pengajuan?status=${f.value}${query ? `&q=${encodeURIComponent(query)}` : ""}`}>
                  {f.label}
                </Link>
              </Button>
            ))}
          </div>
          <form action="/developer/infak/pengajuan" className="flex gap-2">
            <input type="hidden" name="status" value={status} />
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                name="q"
                defaultValue={query}
                placeholder="Cari santri / lembaga…"
                className="h-9 w-64 pl-9"
              />
            </div>
            <Button type="submit" size="sm" variant="outline">
              Cari
            </Button>
          </form>
        </div>
      </CardBox>

      {requests.length === 0 ? (
        <CardBox>
          <div className="py-12 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <HeartHandshake className="size-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">Tidak ada pengajuan.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Pengajuan tidak mampu dari wali santri akan tampil di sini.
            </p>
          </div>
        </CardBox>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <WaiverRequestCard key={r.id} request={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function WaiverRequestCard({ request }: { request: WaiverRequestRow }) {
  const [state, formAction, pending] = useActionState(decideWaiverRequestAction, null);
  const isPending = request.status === "PENDING";

  return (
    <CardBox className={isPending ? "border-amber-200 dark:border-amber-500/25" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">
            {request.studentName}{" "}
            <span className="text-muted-foreground font-mono text-xs">{request.studentCode}</span>
          </p>
          <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="inline-flex items-center gap-1">
              <Building2 className="size-3" /> {request.tenantName} · {request.tenantCode}
            </span>
            {request.guardianName && <span>· Wali: {request.guardianName}</span>}
          </p>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3.5" /> Surat {formatDateId(request.certificateDate)}
            </span>
            {request.certificateUrl && (
              <a
                href={request.certificateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-role-strong font-medium hover:underline"
              >
                Lihat surat
              </a>
            )}
          </p>
          {request.reason && (
            <p className="text-muted-foreground mt-1 text-xs italic">“{request.reason}”</p>
          )}
        </div>
        <Badge variant="outline" className={statusTone(request.status)}>
          {WAIVER_STATUS_LABEL[request.status] ?? request.status}
        </Badge>
      </div>

      {!isPending && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted-foreground dark:bg-slate-500/5">
          {request.status === "APPROVED" && request.months && request.fromYear && request.fromMonth
            ? `Digratiskan ${request.months} bulan sejak ${monthYearLabel(request.fromYear, request.fromMonth)}.`
            : request.rejectReason ?? "Pengajuan ditolak."}
          {request.decidedAt ? ` · diputuskan ${formatDateId(request.decidedAt)}` : ""}
        </p>
      )}

      {isPending && (
        <form action={formAction} className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-500/10">
          <input type="hidden" name="requestId" value={request.id} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor={`waive-months-${request.id}`} className="text-xs">
                Gratiskan selama (bulan)
              </Label>
              <select
                id={`waive-months-${request.id}`}
                name="months"
                defaultValue="1"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                {Array.from({ length: WAIVER_MAX_MONTHS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} bulan
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`waive-reason-${request.id}`} className="text-xs">
                Catatan (wajib saat menolak)
              </Label>
              <Textarea
                id={`waive-reason-${request.id}`}
                name="reason"
                rows={2}
                placeholder="Contoh: surat tidak jelas, data tidak sesuai…"
              />
            </div>
          </div>

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {state.error}
            </p>
          )}
          {state?.success && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              {state.success}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              name="decision"
              value="APPROVE"
              disabled={pending}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Check className="size-4" /> Setujui & Gratiskan
            </Button>
            <Button
              type="submit"
              name="decision"
              value="REJECT"
              disabled={pending}
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300"
            >
              <X className="size-4" /> Tolak
            </Button>
          </div>
        </form>
      )}
    </CardBox>
  );
}
