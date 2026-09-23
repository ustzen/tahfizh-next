"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, HandCoins, Search, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CardBox } from "@/components/dashboard/section";
import { settleInvoicesAction, type SettleItem } from "@/app/actions/v10";
import {
  ANONYMOUS_PAYER_NAME,
  INVOICE_STATUS_LABEL,
  MAX_SETTLE_ITEMS,
  monthYearLabel,
  monthYearShort,
  rupiah,
} from "@/lib/v10-shared";
import type { DevArrearStudent, DevArrearsData, WaliInvoiceItem } from "@/lib/v10";
import { cn } from "@/lib/utils";

const isOpenInvoice = (inv: WaliInvoiceItem) => inv.status === "UNPAID";
const keyOf = (studentId: string, y: number, m: number) => `${studentId}:${y}:${m}`;

function arrearsTone(count: number) {
  return count >= 3
    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
    : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
}

/**
 * Pelunasan infak oleh Developer: pilih santri (urut tunggakan terlama),
 * tuliskan DIBAYARKAN OLEH SIAPA, lalu lunasi. Nama pembayar tampil di
 * riwayat infak santri yang bersangkutan.
 */
export function DevSettlePanel({
  data,
  query,
  tenantId,
}: {
  data: DevArrearsData | null;
  query: string;
  tenantId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [payerName, setPayerName] = useState("");
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const students = data?.students ?? [];
  const tenants = data?.tenants ?? [];

  const selectedKeys = Object.keys(selected);
  const total = useMemo(() => Object.values(selected).reduce((a, b) => a + b, 0), [selected]);
  const studentCount = new Set(selectedKeys.map((k) => k.split(":")[0])).size;

  function setMany(studentId: string, invs: WaliInvoiceItem[], on: boolean) {
    setError(null);
    setDone(null);
    setSelected((prev) => {
      const next = { ...prev };
      for (const inv of invs) {
        if (!isOpenInvoice(inv)) continue;
        const k = keyOf(studentId, inv.y, inv.m);
        if (on) next[k] = inv.amount;
        else delete next[k];
      }
      return next;
    });
  }

  function toggleOne(studentId: string, inv: WaliInvoiceItem) {
    if (!isOpenInvoice(inv)) return;
    setMany(studentId, [inv], !(keyOf(studentId, inv.y, inv.m) in selected));
  }

  /** Pilih N santri dengan tunggakan paling lama (seluruh bulannya). */
  function pickOldest(n: number) {
    setError(null);
    setDone(null);
    const next: Record<string, number> = {};
    for (const s of students.slice(0, n)) {
      for (const inv of s.invoices.filter(isOpenInvoice)) next[keyOf(s.studentId, inv.y, inv.m)] = inv.amount;
    }
    setSelected(next);
  }

  function clearAll() {
    setSelected({});
    setError(null);
    setDone(null);
  }

  function submit() {
    setError(null);
    setDone(null);
    if (payerName.trim().length < 2) {
      setError("Tuliskan nama pembayar infak terlebih dahulu.");
      return;
    }
    const items: SettleItem[] = selectedKeys.map((key) => {
      const [studentId, y, m] = key.split(":");
      return { studentId, y: Number(y), m: Number(m), amount: selected[key] };
    });
    if (items.length === 0) {
      setError("Pilih minimal satu tagihan.");
      return;
    }
    if (items.length > MAX_SETTLE_ITEMS) {
      setError(`Terlalu banyak tagihan sekaligus (maksimal ${MAX_SETTLE_ITEMS}). Lunasi bertahap.`);
      return;
    }
    startTransition(async () => {
      const res = await settleInvoicesAction(items, payerName.trim(), note, force);
      if (res.error) {
        setError(res.error);
        return;
      }
      setDone(res.success ?? "Tagihan dilunasi.");
      clearAll();
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <CardBox>
        <form action="/developer/infak/pelunasan" className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="settle-q" className="text-xs">Cari santri / lembaga</Label>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input id="settle-q" name="q" defaultValue={query} placeholder="Nama atau kode…" className="pl-9" />
            </div>
          </div>
          <div className="min-w-48 space-y-1.5">
            <Label htmlFor="settle-tenant" className="text-xs">Lembaga</Label>
            <select
              id="settle-tenant"
              name="tenant"
              defaultValue={tenantId}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="">Semua lembaga</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.code}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">Terapkan</Button>
        </form>
      </CardBox>

      {done && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          {done}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Daftar tunggakan */}
      <CardBox>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-foreground">Santri Belum Membayar</h3>
            <p className="text-muted-foreground text-xs">
              Diurutkan dari tunggakan paling lama. Centang santri untuk melunasi seluruh bulan tunggakannya.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Pilih terlama:</span>
            {[5, 10, 25].map((n) => (
              <Button
                key={n}
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                disabled={pending || students.length === 0}
                onClick={() => pickOldest(n)}
              >
                {n} santri
              </Button>
            ))}
            {selectedKeys.length > 0 && (
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={clearAll}>
                Kosongkan
              </Button>
            )}
          </div>
        </div>

        {students.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {data ? "Tidak ada santri menunggak untuk filter ini. 🎉" : "Data tunggakan belum termuat. Muat ulang halaman."}
          </p>
        ) : (
          <ul className="space-y-2">
            {students.map((s) => (
              <StudentRow
                key={s.studentId}
                student={s}
                selected={selected}
                disabled={pending}
                open={openRows[s.studentId] === true}
                onToggleOpen={() => setOpenRows((p) => ({ ...p, [s.studentId]: !p[s.studentId] }))}
                onToggleAll={(on) => setMany(s.studentId, s.invoices.filter(isOpenInvoice), on)}
                onToggleMonth={(inv) => toggleOne(s.studentId, inv)}
              />
            ))}
          </ul>
        )}
      </CardBox>

      {/* Form pelunasan */}
      <CardBox className="sticky bottom-4 border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/25 dark:bg-emerald-500/5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <HandCoins className="size-4" />
          </span>
          <div>
            <h3 className="font-semibold text-foreground">Lunasi Tagihan Terpilih</h3>
            <p className="text-muted-foreground text-xs">
              {selectedKeys.length} tagihan · {studentCount} santri · total{" "}
              <span className="font-semibold text-foreground">{rupiah(total)}</span>
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="payer-name" className="text-xs">
              Dibayarkan oleh (wajib) — nama ini tampil di riwayat infak santri
            </Label>
            <Input
              id="payer-name"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              placeholder="Contoh: Bapak Ahmad / Donatur Yayasan X"
              maxLength={120}
              className="bg-white dark:bg-transparent"
            />
            <div className="flex flex-wrap gap-1.5">
              {[ANONYMOUS_PAYER_NAME, "Donatur", "Pengelola Platform"].map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 bg-white px-2.5 text-xs dark:bg-transparent"
                  onClick={() => setPayerName(n)}
                >
                  <UserCheck className="size-3" /> {n}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settle-note" className="text-xs">Catatan pelunasan (opsional)</Label>
            <Textarea
              id="settle-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Contoh: tunai diterima 21/09/2026, dana donasi wakaf pengembangan."
              className="bg-white dark:bg-transparent"
            />
          </div>
        </div>

        <label className="text-muted-foreground mt-3 flex cursor-pointer items-start gap-2 text-xs">
          <Checkbox checked={force} onCheckedChange={(c) => setForce(c === true)} />
          <span>
            Batalkan transaksi wali yang masih menunggu untuk tagihan yang sama. Tanpa ini, tagihan yang
            sedang diproses wali akan ditolak agar tidak terjadi pembayaran ganda.
          </span>
        </label>

        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            disabled={pending || selectedKeys.length === 0}
            onClick={submit}
            className="bg-gradient-brand hover:opacity-90"
          >
            {pending ? "Memproses…" : `Lunasi ${selectedKeys.length || ""} Tagihan`}
          </Button>
        </div>
      </CardBox>
    </div>
  );
}

function StudentRow({
  student,
  selected,
  disabled,
  open,
  onToggleOpen,
  onToggleAll,
  onToggleMonth,
}: {
  student: DevArrearStudent;
  selected: Record<string, number>;
  disabled: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onToggleAll: (on: boolean) => void;
  onToggleMonth: (inv: WaliInvoiceItem) => void;
}) {
  const openInvoices = student.invoices.filter(isOpenInvoice);
  const chosen = openInvoices.filter((i) => keyOf(student.studentId, i.y, i.m) in selected).length;
  const all = openInvoices.length > 0 && chosen === openInvoices.length;

  return (
    <li
      className={cn(
        "rounded-xl border",
        chosen > 0 ? "border-emerald-500" : "border-slate-200 dark:border-slate-500/20"
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <Checkbox
          checked={all}
          disabled={disabled || openInvoices.length === 0}
          onCheckedChange={(c) => onToggleAll(c === true)}
          aria-label={`Pilih ${student.name}`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {student.name} <span className="text-muted-foreground font-mono text-xs">{student.code}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="outline" className={arrearsTone(student.unpaidCount)}>
              Menunggak {student.unpaidCount} bulan
            </Badge>
            <span className="text-muted-foreground">sejak {monthYearLabel(student.oldestY, student.oldestM)}</span>
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Building2 className="size-3" /> {student.tenantName}
            </span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-foreground">{rupiah(student.unpaidTotal)}</p>
          <button
            type="button"
            onClick={onToggleOpen}
            className="text-role-strong text-xs font-medium hover:underline"
            aria-expanded={open}
          >
            {open ? "Tutup" : chosen > 0 && !all ? `Pilih bulan (${chosen}/${openInvoices.length})` : "Pilih bulan"}
          </button>
        </div>
      </div>

      {open && (
        <div className="grid grid-cols-3 gap-1.5 border-t border-slate-100 p-3 sm:grid-cols-6 dark:border-slate-500/10">
          {student.invoices.map((inv) => {
            const on = keyOf(student.studentId, inv.y, inv.m) in selected;
            const ok = isOpenInvoice(inv);
            return (
              <button
                key={`${inv.y}-${inv.m}`}
                type="button"
                disabled={disabled || !ok}
                onClick={() => onToggleMonth(inv)}
                title={ok ? rupiah(inv.amount) : (INVOICE_STATUS_LABEL[inv.status] ?? inv.status)}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-center text-xs transition-colors",
                  on
                    ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : ok
                      ? "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 dark:border-slate-500/20 dark:bg-transparent"
                      : "border-slate-100 bg-slate-50 text-slate-400 dark:border-slate-500/10 dark:bg-transparent",
                  !ok && "cursor-not-allowed"
                )}
              >
                <span className="block">{monthYearShort(inv.y, inv.m)}</span>
                <span className="block text-[0.6rem]">{ok ? rupiah(inv.amount) : "Diproses"}</span>
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}
