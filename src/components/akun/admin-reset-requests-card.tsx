"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound, MessageCircle, X } from "lucide-react";import { toast } from "sonner";

import {
  decidePasswordResetAction,
  type AdminResetRequest,
  type DecideResult,
} from "@/app/actions/password";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { roleLabel } from "@/lib/roles";

/**
 * V12.12 — Kartu permintaan reset password (Admin lembaga).
 *
 * Pemohon (Santri/Guru) mengajukan via halaman Lupa Password → tab Username.
 * Admin menyetujui di sini: sistem menghasilkan kode sekali-pakai (8 karakter,
 * 30 menit) yang Admin kirimkan ke pemohon via WhatsApp. Kode hanya
 * ditampilkan SEKALI — tidak disimpan plaintext di database.
 */

const STATUS_LABEL: Record<AdminResetRequest["status"], { text: string; cls: string }> = {
  PENDING: { text: "Menunggu", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { text: "Disetujui", cls: "bg-blue-100 text-blue-800" },
  REJECTED: { text: "Ditolak", cls: "bg-slate-100 text-slate-600" },
  USED: { text: "Selesai dipakai", cls: "bg-emerald-100 text-emerald-800" },
  EXPIRED: { text: "Kedaluwarsa", cls: "bg-slate-100 text-slate-600" },
};

export function AdminResetRequestsCard({ requests }: { requests: AdminResetRequest[] }) {
  const [state, formAction, pending] = useActionState<DecideResult | null, FormData>(
    decidePasswordResetAction as never,
    null
  );
  const [copied, setCopied] = useState(false);

  const pendingList = requests.filter((r) => r.status === "PENDING");
  const history = requests.filter((r) => r.status !== "PENDING");

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Kode disalin ke clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin kode.");
    }
  }

  return (
    <div className="space-y-4">
      {state?.error && (
        <p className="text-sm font-medium text-red-600 dark:text-red-300" role="alert">{state.error}</p>
      )}
      {state?.success && state?.code && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 p-4" role="status">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{state.success}</p>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-card px-4 py-3">
            <span className="font-mono text-2xl font-bold tracking-[0.3em] text-emerald-900 dark:text-emerald-300">
              {state.code}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copyCode(state.code!)}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />} Salin
              </Button>

            </div>
          </div>
          <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
            Kode hanya tampil sekali. Berlaku 30 menit dan hanya bisa dipakai sekali.
          </p>
        </div>
      )}
      {state?.success && !state?.code && (
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-300" role="status">{state.success}</p>
      )}

      {pendingList.length === 0 ? (
        <p className="text-muted-foreground text-sm">Tidak ada permintaan reset yang menunggu persetujuan.</p>
      ) : (
        <ul className="space-y-3">
          {pendingList.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {r.full_name} <span className="text-muted-foreground font-normal">— {roleLabel(r.role)}</span>
                  {r.username && <span className="text-muted-foreground"> ({r.username})</span>}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Diminta {new Date(r.requested_at).toLocaleString("id-ID")}
                  {r.whatsapp ? ` · WA ${r.whatsapp}` : " · nomor WhatsApp belum tercatat"}
                </p>
              </div>
              <form action={formAction} className="flex shrink-0 items-center gap-2">
                <input type="hidden" name="requestId" value={r.id} />
                <Button
                  type="submit"
                  name="decision"
                  value="approve"
                  size="sm"
                  disabled={pending}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {pending ? <Spinner /> : <Check className="size-4" />} Setujui &amp; Buat Kode
                </Button>
                <Button
                  type="submit"
                  name="decision"
                  value="reject"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  className="text-red-600 dark:text-red-300 hover:bg-red-50"
                >
                  <X className="size-4" /> Tolak
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer font-medium">
            Riwayat ({history.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {history.map((r) => {
              const s = STATUS_LABEL[r.status];
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="min-w-0 truncate text-foreground/85">
                    {r.full_name}
                    {r.username ? ` (${r.username})` : ""}{" "}
                    <span className="text-muted-foreground text-xs">
                      · {new Date(r.requested_at).toLocaleString("id-ID")}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
                    {s.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <p className="text-muted-foreground flex items-start gap-1.5 text-xs leading-relaxed">
        <KeyRound className="mt-0.5 size-3.5 shrink-0" />
        Setujui hanya permintaan yang Anda kenal. Kode dikirim ke pemohon via WhatsApp
        <MessageCircle className="mt-0.5 size-3.5 shrink-0" />
        lalu ia menukar kode dengan password baru di halaman Lupa Password.
      </p>
    </div>
  );
}
