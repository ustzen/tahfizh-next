"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CalendarPlus, CheckCircle2, ChevronDown, FileUp, HandCoins, HandHeart, QrCode, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  initiatePaymentAction,
  cancelTransactionAction,
  submitProofAction,
  type PaymentItem,
} from "@/app/actions/v10";
import {
  ANONYMOUS_PAYER_NAME,
  DUE_DAY,
  INFAK_MIN_AMOUNT,
  IPAYMU_MIN_TOTAL,
  MAX_PAYMENT_ITEMS,
  QUICK_AMOUNTS,
  TRANSACTION_STATUS_LABEL,
  INVOICE_STATUS_LABEL,
  formatDateId,
  groupAllocationsByStudent,
  monthIndex,
  monthYearLabel,
  monthYearShort,
  rupiah,
  statusTone,
} from "@/lib/v10-shared";
import type { WaliChild, WaliInvoiceItem, WaliOtherStudent, WaliTxRow, WaliBankInfo } from "@/lib/v10";
import { cn } from "@/lib/utils";

type DialogState =
  | { kind: "none" }
  | { kind: "manual"; total: number; count: number; transactionId: string; reference: string }
  | { kind: "proof"; transactionId: string; reference: string };

/** Hanya tagihan UNPAID (atau NONE = belum ada tagihan, dibuat saat dibayar) yang bisa dipilih. */
const isSelectable = (inv: WaliInvoiceItem) => inv.status === "UNPAID" || inv.status === "NONE";
const keyOf = (studentId: string, y: number, m: number) => `${studentId}:${y}:${m}`;

/** Jumlah tunggakan (bulan < bulan berjalan) → nada badge. */
function arrearsTone(count: number) {
  return count >= 3
    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
    : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
}

export function WaliPaymentPanel({
  kids,
  others,
  defaultAmount,
  academicYear,
  bank,
  transactions,
  autoEnabled,
  currentY,
  currentM,
}: {
  kids: WaliChild[];
  others: WaliOtherStudent[];
  defaultAmount: number;
  academicYear: string;
  bank: WaliBankInfo | null;
  transactions: WaliTxRow[];
  autoEnabled: boolean;
  currentY: number;
  currentM: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // `${studentId}:${y}:${m}` -> nominal tagihan (dasar). Nominal akhir = max(dasar, nominal per bulan).
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [customAmount, setCustomAmount] = useState<number | null>(null);
  const [customText, setCustomText] = useState("");
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [error, setError] = useState<string | null>(null);
  const [proofTarget, setProofTarget] = useState<string | null>(null);
  const [aheadOpen, setAheadOpen] = useState<Record<string, boolean>>({});
  const [othersQuery, setOthersQuery] = useState("");
  const [othersShown, setOthersShown] = useState(10);
  const [othersOpen, setOthersOpen] = useState<Record<string, boolean>>({});
  // "Dibayarkan atas nama" — dipakai bila ingin infak untuk santri lain tanpa
  // menampilkan nama asli (mis. "Hamba Allah").
  const [payerAlias, setPayerAlias] = useState("");

  const pendingTx = transactions.find((t) => t.status === "PENDING");
  const locked = pending || pendingTx !== undefined;
  const curIdx = monthIndex(currentY, currentM);

  const amountOf = (base: number) => Math.max(base, customAmount ?? 0);
  const selectedKeys = Object.keys(selected);
  const selectedCount = selectedKeys.length;
  const studentCount = new Set(selectedKeys.map((k) => k.split(":")[0])).size;
  const total = useMemo(
    () => Object.values(selected).reduce((a, b) => a + Math.max(b, customAmount ?? 0), 0),
    [selected, customAmount]
  );

  /* ---- seleksi ---------------------------------------------------------- */
  function setMany(studentId: string, invs: WaliInvoiceItem[], on: boolean, replaceAmong?: WaliInvoiceItem[]) {
    setError(null);
    setSelected((prev) => {
      const next = { ...prev };
      for (const inv of replaceAmong ?? []) delete next[keyOf(studentId, inv.y, inv.m)];
      for (const inv of invs) {
        if (!isSelectable(inv)) continue;
        const k = keyOf(studentId, inv.y, inv.m);
        if (on) next[k] = inv.amount;
        else delete next[k];
      }
      return next;
    });
  }

  function toggleOne(studentId: string, inv: WaliInvoiceItem) {
    if (!isSelectable(inv)) return;
    setMany(studentId, [inv], !(keyOf(studentId, inv.y, inv.m) in selected));
  }

  /** Pilih N bulan pertama ke depan yang masih bisa dibayar (mengganti pilihan bulan depan sebelumnya). */
  function pickAhead(child: WaliChild, n: number) {
    setMany(child.studentId, child.ahead.filter(isSelectable).slice(0, n), true, child.ahead);
  }

  function setCustom(text: string) {
    const digits = text.replace(/[^0-9]/g, "");
    setCustomText(digits ? Number(digits).toLocaleString("id-ID") : "");
    const n = digits ? Number(digits) : 0;
    setCustomAmount(n >= INFAK_MIN_AMOUNT ? n : null);
  }

  function clearAll() {
    setSelected({});
    setCustomAmount(null);
    setCustomText("");
    setError(null);
  }

  /** Pilih N santri lain dengan tunggakan paling lama (seluruh bulannya). */
  function pickOldestOthers(n: number) {
    setError(null);
    setSelected((prev) => {
      const next = { ...prev };
      for (const o of others.slice(0, n)) {
        for (const inv of o.invoices.filter(isSelectable)) next[keyOf(o.studentId, inv.y, inv.m)] = inv.amount;
      }
      return next;
    });
  }

  /* ---- bayar ------------------------------------------------------------ */
  function handlePay(method: "MANUAL" | "IPAYMU") {
    setError(null);
    const items: PaymentItem[] = selectedKeys.map((key) => {
      const [studentId, y, m] = key.split(":");
      return { studentId, y: Number(y), m: Number(m), amount: amountOf(selected[key]) };
    });
    if (items.length === 0) {
      setError("Pilih minimal satu tagihan terlebih dahulu.");
      return;
    }
    if (items.length > MAX_PAYMENT_ITEMS) {
      setError(`Terlalu banyak tagihan dalam satu pembayaran (maksimal ${MAX_PAYMENT_ITEMS}). Bayar bertahap.`);
      return;
    }
    if (method === "IPAYMU" && total < IPAYMU_MIN_TOTAL) {
      setError(`Pembayaran otomatis minimal ${rupiah(IPAYMU_MIN_TOTAL)}. Gunakan transfer manual.`);
      return;
    }
    const payTotal = total;
    startTransition(async () => {
      const res = await initiatePaymentAction(items, method, payerAlias.trim());
      if (res.error) {
        setError(res.error);
        return;
      }
      const d = (res.data ?? {}) as { transactionId?: string; reference?: string; paymentUrl?: string };
      if (method === "IPAYMU" && d.paymentUrl) {
        window.location.href = d.paymentUrl;
        return;
      }
      router.refresh();
      setDialog({
        kind: "manual",
        total: payTotal,
        count: items.length,
        transactionId: d.transactionId ?? "",
        reference: d.reference ?? "",
      });
      clearAll();
    });
  }

  /* ---- santri lain ------------------------------------------------------ */
  const filteredOthers = useMemo(() => {
    const q = othersQuery.trim().toLowerCase();
    if (!q) return others;
    return others.filter((o) => o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q));
  }, [others, othersQuery]);
  const visibleOthers = filteredOthers.slice(0, othersShown);

  return (
    <div className="space-y-6">
      <Card className="shadow-card overflow-hidden rounded-2xl">
        <div className="bg-gradient-brand relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7">
          <span
            aria-hidden
            className="bg-dots text-role/20 pointer-events-none absolute -top-4 -right-4 h-32 w-52 [mask-image:linear-gradient(to_left,black,transparent)]"
          />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white shadow-card backdrop-blur-sm sm:size-14">
                <HandCoins className="size-6 sm:size-7" />
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-white sm:text-xl">Tagihan Infak Pengembangan</h3>
                <p className="mt-0.5 text-sm text-white/85">
                  Tahun ajaran {academicYear} · dana untuk pengembangan platform TAHFIZH
                </p>
              </div>
            </div>
            {selectedCount > 0 && (
              <div className="rounded-2xl bg-white/15 px-4 py-3 text-right shadow-card backdrop-blur-sm sm:px-5">
                <p className="text-xs font-medium text-white/80">
                  {selectedCount} tagihan dipilih
                </p>
                <p className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">{rupiah(total)}</p>
              </div>
            )}
          </div>
        </div>
        <CardContent className="space-y-6 pt-6">
          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>
          )}

          {pendingTx && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              Anda memiliki transaksi yang sedang berjalan ({pendingTx.reference} · {rupiah(pendingTx.total_amount)}).
              Selesaikan atau batalkan terlebih dahulu.
            </p>
          )}

          {/* ---------------- Anak sendiri ---------------- */}
          <section className="space-y-3.5">
            <h4 className="text-base font-semibold text-foreground">Tagihan Saya</h4>
            {kids.length === 0 && (
              <p className="text-muted-foreground py-4 text-center text-sm">
                Tagihan infak bulan ini belum diterbitkan lembaga. Anda tetap dapat berinfak untuk santri lain di daftar bawah.
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {kids.map((child) => {
                const openSelectable = child.invoices.filter(isSelectable);
                const openSelected = openSelectable.filter((i) => keyOf(child.studentId, i.y, i.m) in selected).length;
                const allOpenSelected = openSelectable.length > 0 && openSelected === openSelectable.length;
                const aheadSelectable = child.ahead.filter(isSelectable);
                const aheadSelected = child.ahead.filter((i) => keyOf(child.studentId, i.y, i.m) in selected).length;
                const isAheadOpen = aheadOpen[child.studentId] === true;
                return (
                  <div
                    key={child.studentId}
                    className="shadow-card rounded-2xl border border-slate-200 p-5 transition-shadow hover:shadow-md dark:border-slate-500/20"
                  >
                    <div className="mb-4 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-foreground">{child.name}</p>
                        <p className="text-muted-foreground font-mono text-xs">{child.code}</p>
                      </div>
                      {openSelectable.length > 1 && (
                        <label className="text-muted-foreground flex shrink-0 cursor-pointer items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={allOpenSelected}
                            disabled={locked}
                            onCheckedChange={(c) => setMany(child.studentId, openSelectable, c === true)}
                            aria-label={`Pilih semua tagihan ${child.name}`}
                          />
                          Pilih semua
                        </label>
                      )}
                    </div>

                    {child.invoices.length === 0 ? (
                      <p className="text-muted-foreground rounded-lg bg-emerald-50 px-3 py-2 text-xs dark:bg-emerald-500/10">
                        Semua tagihan sampai bulan ini lunas. Jazakumullahu khairan! 🎉
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {child.invoices.map((inv) => (
                          <li key={`${inv.y}-${inv.m}`}>
                            <MonthRow
                              inv={inv}
                              checked={keyOf(child.studentId, inv.y, inv.m) in selected}
                              disabled={locked || !isSelectable(inv)}
                              overdue={monthIndex(inv.y, inv.m) < curIdx}
                              onToggle={() => toggleOne(child.studentId, inv)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Bayar di muka */}
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-500/5">
                      <button
                        type="button"
                        onClick={() => setAheadOpen((p) => ({ ...p, [child.studentId]: !isAheadOpen }))}
                        className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-foreground/85"
                        aria-expanded={isAheadOpen}
                      >
                        <span className="flex items-center gap-1.5">
                          <CalendarPlus className="size-3.5 text-role" />
                          Bayar di muka (bulan depan)
                          {aheadSelected > 0 && (
                            <span className="rounded-full bg-role text-role-ink px-1.5 py-0.5 text-[0.65rem]">{aheadSelected}</span>
                          )}
                        </span>
                        <ChevronDown className={cn("size-4 transition-transform", isAheadOpen && "rotate-180")} />
                      </button>
                      {isAheadOpen && (
                        <div className="mt-3 space-y-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-muted-foreground text-xs">Cepat:</span>
                            {[1, 3, 6].map((n) => (
                              <Button
                                key={n}
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs"
                                disabled={locked || aheadSelectable.length < n}
                                onClick={() => pickAhead(child, n)}
                              >
                                {n} bulan
                              </Button>
                            ))}
                            {aheadSelected > 0 && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-red-600 dark:text-red-300"
                                onClick={() => setMany(child.studentId, [], false, child.ahead)}
                              >
                                Batal
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                            {child.ahead.map((inv) => {
                              const on = keyOf(child.studentId, inv.y, inv.m) in selected;
                              const ok = isSelectable(inv);
                              return (
                                <button
                                  key={`${inv.y}-${inv.m}`}
                                  type="button"
                                  disabled={locked || !ok}
                                  onClick={() => toggleOne(child.studentId, inv)}
                                  title={ok ? rupiah(inv.amount) : (INVOICE_STATUS_LABEL[inv.status] ?? inv.status)}
                                  className={cn(
                                    "rounded-lg border px-2 py-1.5 text-center text-xs transition-colors",
                                    on
                                      ? "border-blue-500 bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                                      : ok
                                        ? "border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-slate-500/20 dark:bg-transparent"
                                        : "border-slate-100 bg-slate-50 text-slate-400 dark:border-slate-500/10 dark:bg-transparent",
                                    !ok && "cursor-not-allowed"
                                  )}
                                >
                                  <span className="block">{monthYearShort(inv.y, inv.m)}</span>
                                  {!ok && (
                                    <span className="block text-[0.6rem]">
                                      {inv.status === "PAID" ? "Lunas" : "Diproses"}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-muted-foreground text-[0.7rem] leading-relaxed">
                            Tagihan bulan depan dibuat otomatis saat dibayar. Bisa sampai 11 bulan ke depan.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------------- Santri lain (menunggak) ---------------- */}
          {others.length > 0 && (
            <section className="space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-500/5">
              <div>
                <div className="flex items-center gap-2">
                  <HandHeart className="size-4 text-role" />
                  <h4 className="text-sm font-semibold text-foreground">Bayarkan untuk santri lain</h4>
                </div>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  Santri di lembaga Anda yang belum membayar infak, diurutkan dari yang <span className="font-medium">paling lama
                  menunggak</span>. Centang santri lalu bayarkan — semua bulan tunggakannya ikut terpilih (bisa diatur lewat
                  “Pilih bulan”). Santri yang bersangkutan akan melihat siapa yang membayarkan.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground text-xs">Bantu yang paling lama menunggak:</span>
                {[1, 3, 5].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 bg-white px-2.5 text-xs dark:bg-transparent"
                    disabled={locked || others.length < n}
                    onClick={() => pickOldestOthers(n)}
                  >
                    {n} santri
                  </Button>
                ))}
                <span className="text-muted-foreground text-xs">({others.length} santri menunggak)</span>
              </div>

              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={othersQuery}
                  onChange={(e) => {
                    setOthersQuery(e.target.value);
                    setOthersShown(10);
                  }}
                  placeholder="Cari nama atau kode santri…"
                  className="bg-white pl-9 dark:bg-transparent"
                  aria-label="Cari santri"
                />
              </div>

              {filteredOthers.length === 0 ? (
                <p className="text-muted-foreground py-3 text-center text-sm">Tidak ada santri yang cocok.</p>
              ) : (
                <ul className="space-y-2">
                  {visibleOthers.map((o) => {
                    const selectable = o.invoices.filter(isSelectable);
                    const chosen = selectable.filter((i) => keyOf(o.studentId, i.y, i.m) in selected).length;
                    const all = selectable.length > 0 && chosen === selectable.length;
                    const open = othersOpen[o.studentId] === true;
                    return (
                      <li
                        key={o.studentId}
                        className={cn(
                          "rounded-xl border bg-white dark:bg-transparent",
                          chosen > 0 ? "border-blue-500" : "border-slate-200 dark:border-slate-500/20"
                        )}
                      >
                        <div className="flex items-center gap-3 p-3">
                          <Checkbox
                            checked={all}
                            disabled={locked || selectable.length === 0}
                            onCheckedChange={(c) => setMany(o.studentId, selectable, c === true)}
                            aria-label={`Pilih ${o.name}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {o.name} <span className="text-muted-foreground font-mono text-xs">{o.code}</span>
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                              <Badge variant="outline" className={arrearsTone(o.unpaidCount)}>
                                Menunggak {o.unpaidCount} bulan
                              </Badge>
                              <span className="text-muted-foreground">
                                sejak {monthYearLabel(o.oldestY, o.oldestM)}
                              </span>
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold text-foreground">{rupiah(o.unpaidTotal)}</p>
                            <button
                              type="button"
                              onClick={() => setOthersOpen((p) => ({ ...p, [o.studentId]: !open }))}
                              className="text-xs font-medium text-role-strong hover:underline"
                              aria-expanded={open}
                            >
                              {open ? "Tutup" : chosen > 0 && !all ? `Pilih bulan (${chosen}/${selectable.length})` : "Pilih bulan"}
                            </button>
                          </div>
                        </div>
                        {open && (
                          <ul className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-500/10">
                            {o.invoices.map((inv) => (
                              <li key={`${inv.y}-${inv.m}`}>
                                <MonthRow
                                  inv={inv}
                                  checked={keyOf(o.studentId, inv.y, inv.m) in selected}
                                  disabled={locked || !isSelectable(inv)}
                                  overdue={monthIndex(inv.y, inv.m) < curIdx}
                                  onToggle={() => toggleOne(o.studentId, inv)}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {filteredOthers.length > visibleOthers.length && (
                <div className="text-center">
                  <Button type="button" variant="outline" size="sm" onClick={() => setOthersShown((n) => n + 10)}>
                    Tampilkan lebih banyak ({filteredOthers.length - visibleOthers.length} lagi)
                  </Button>
                </div>
              )}
            </section>
          )}

          {/* ---------------- Ringkasan pilihan + nominal ---------------- */}
          {selectedCount > 0 && (
            <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/60 p-5 dark:border-blue-500/20 dark:bg-blue-500/5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {selectedCount} tagihan dipilih · {studentCount} santri
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    Total <span className="text-lg font-bold text-foreground">{rupiah(total)}</span>
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={clearAll} disabled={pending}>
                  Kosongkan pilihan
                </Button>
              </div>
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="infak-per-month" className="text-xs">
                  Nominal per bulan (opsional — boleh lebih dari tagihan, min {rupiah(defaultAmount)})
                </Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={customAmount === null ? "default" : "outline"}
                    className="h-8"
                    onClick={() => {
                      setCustomAmount(null);
                      setCustomText("");
                    }}
                  >
                    Sesuai tagihan
                  </Button>
                  {QUICK_AMOUNTS.filter((a) => a > defaultAmount).map((a) => (
                    <Button
                      key={a}
                      type="button"
                      size="sm"
                      variant={customAmount === a ? "default" : "outline"}
                      className="h-8"
                      onClick={() => {
                        setCustomAmount(a);
                        setCustomText(a.toLocaleString("id-ID"));
                      }}
                    >
                      {rupiah(a)}
                    </Button>
                  ))}
                  <Input
                    id="infak-per-month"
                    inputMode="numeric"
                    value={customText}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="Nominal lain"
                    className="h-8 w-32 bg-white dark:bg-transparent"
                  />
                </div>
              </div>

              {studentCount > 0 && (
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="infak-alias" className="text-xs">
                    Dibayarkan atas nama (opsional) — nama ini yang dilihat santri penerima
                  </Label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Input
                      id="infak-alias"
                      value={payerAlias}
                      onChange={(e) => setPayerAlias(e.target.value)}
                      maxLength={60}
                      placeholder="Kosongkan untuk memakai nama Anda"
                      className="h-8 w-56 bg-white dark:bg-transparent"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant={payerAlias === ANONYMOUS_PAYER_NAME ? "default" : "outline"}
                      className="h-8"
                      onClick={() =>
                        setPayerAlias((v) => (v === ANONYMOUS_PAYER_NAME ? "" : ANONYMOUS_PAYER_NAME))
                      }
                    >
                      {ANONYMOUS_PAYER_NAME}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---------------- Metode pembayaran ---------------- */}
          <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
            <div className="shadow-card rounded-2xl border border-slate-200 p-5 transition-shadow hover:shadow-md dark:border-slate-500/20">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-role-soft text-role-strong">
                  <Banknote className="size-5" />
                </span>
                <p className="text-base font-semibold">Transfer Manual</p>
              </div>
              {bank && (bank.bankName || bank.bankNo) ? (
                <div className="text-muted-foreground mt-3 space-y-1 text-sm">
                  {bank.bankName && <p>Bank: <span className="font-semibold text-foreground/85">{bank.bankName}</span></p>}
                  {bank.bankNo && <p>No. rekening: <span className="font-mono text-[0.95rem] font-semibold text-foreground/85">{bank.bankNo}</span></p>}
                  {bank.bankAccount && <p>a.n. {bank.bankAccount}</p>}
                </div>
              ) : (
                <p className="text-muted-foreground mt-3 text-sm">Rekening penerima infak belum diatur. Silakan hubungi pengelola TAHFIZH.</p>
              )}
              <Button
                onClick={() => handlePay("MANUAL")}
                disabled={pending || selectedCount === 0 || pendingTx !== undefined}
                size="lg"
                className="mt-4 w-full bg-gradient-brand text-base hover:opacity-90"
              >
                {pending ? "Memproses…" : selectedCount > 0 ? `Bayar ${rupiah(total)} via Transfer` : "Bayar via Transfer"}
              </Button>
            </div>

            <div className="shadow-card rounded-2xl border border-slate-200 p-5 transition-shadow hover:shadow-md dark:border-slate-500/20">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-role-soft text-role-strong">
                  <QrCode className="size-5" />
                </span>
                <p className="text-base font-semibold">Otomatis (QRIS / e-wallet)</p>
              </div>
              <p className="text-muted-foreground mt-3 text-sm">
                {autoEnabled
                  ? `Bayar langsung via QRIS, VA, atau e-wallet. Minimal ${rupiah(IPAYMU_MIN_TOTAL)}.`
                  : "Pembayaran otomatis belum diaktifkan."}
              </p>
              <Button
                onClick={() => handlePay("IPAYMU")}
                disabled={pending || selectedCount === 0 || pendingTx !== undefined || !autoEnabled}
                variant="outline"
                size="lg"
                className="mt-4 w-full text-base"
              >
                {pending ? "Memproses…" : "Bayar Otomatis"}
              </Button>
            </div>
          </div>
          {bank?.instructions && (
            <p className="text-muted-foreground text-xs leading-relaxed">{bank.instructions}</p>
          )}
        </CardContent>
      </Card>

      {/* Riwayat transaksi */}
      <Card className="shadow-card rounded-2xl">
        <CardContent className="pt-6">
          <h3 className="mb-4 text-base font-semibold text-foreground">Riwayat Pembayaran Saya</h3>
          {transactions.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">Belum ada transaksi.</p>
          ) : (
            <ul className="divide-y">
              {transactions.map((t) => (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-role-strong">
                      {t.reference}
                      <span className="text-muted-foreground ml-2 font-sans font-normal">
                        {formatDateId(t.created_at, { short: true })}
                      </span>
                    </p>
                    <ul className="text-muted-foreground mt-0.5 space-y-0.5 text-xs">
                      {groupAllocationsByStudent(t.allocations).map((g) => (
                        <li key={g.student}>
                          <span className="font-medium text-foreground/85">{g.student}</span> · {g.months}
                        </li>
                      ))}
                    </ul>
                    {t.status === "REJECTED" && t.reject_reason && (
                      <p className="mt-0.5 text-xs text-red-600 dark:text-red-300">Alasan: {t.reject_reason}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{rupiah(t.total_amount)}</span>
                    <Badge variant="outline" className={statusTone(t.status)}>
                      {TRANSACTION_STATUS_LABEL[t.status] ?? t.status}
                    </Badge>
                    {t.status === "PENDING" && t.method === "MANUAL" && (
                      <Button size="sm" variant="outline" onClick={() => setProofTarget(t.id)}>
                        <FileUp className="size-3.5" /> Unggah Bukti
                      </Button>
                    )}
                    {t.status === "PENDING" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 dark:text-red-300"
                        disabled={pending}
                        aria-label="Batalkan transaksi"
                        onClick={() =>
                          startTransition(async () => {
                            const fd = new FormData();
                            fd.set("transactionId", t.id);
                            await cancelTransactionAction(null, fd);
                            router.refresh();
                          })
                        }
                      >
                        <X className="size-3.5" />
                      </Button>
                    )}
                    {t.status === "WAITING_CONFIRM" && (
                      <span className="text-muted-foreground text-xs">
                        Bukti terkirim — menunggu konfirmasi.
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Dialog: konfirmasi transfer manual */}
      <Dialog open={dialog.kind === "manual"} onOpenChange={(o) => !o && setDialog({ kind: "none" })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Konfirmasi Transfer Manual</DialogTitle>
            <DialogDescription>
              Transfer <span className="font-semibold text-foreground">{rupiah(dialog.kind === "manual" ? dialog.total : 0)}</span>{" "}
              untuk {dialog.kind === "manual" ? dialog.count : 0} tagihan ke rekening TAHFIZH di bawah ini, lalu unggah bukti transfer.
            </DialogDescription>
          </DialogHeader>
          {bank && (bank.bankName || bank.bankNo) && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-500/5">
              {bank.bankName && <p>Bank: <span className="font-semibold">{bank.bankName}</span></p>}
              {bank.bankNo && <p className="font-mono">No. rek: {bank.bankNo}</p>}
              {bank.bankAccount && <p className="text-muted-foreground text-xs">a.n. {bank.bankAccount}</p>}
            </div>
          )}
          {bank?.confirmNote && <p className="text-muted-foreground text-xs">{bank.confirmNote}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog({ kind: "none" })}>
              Nanti saja
            </Button>
            <Button
              className="bg-gradient-brand hover:opacity-90"
              onClick={() => {
                if (dialog.kind !== "manual") return;
                const { transactionId, reference } = dialog;
                setDialog({ kind: "proof", transactionId, reference });
              }}
            >
              <FileUp className="size-4" /> Unggah Bukti Sekarang
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: unggah bukti transfer */}
      <ProofUploadDialog
        transactionId={dialog.kind === "proof" ? dialog.transactionId : proofTarget}
        reference={dialog.kind === "proof" ? dialog.reference : null}
        onClose={() => {
          setDialog({ kind: "none" });
          setProofTarget(null);
        }}
      />
    </div>
  );
}

/** Satu baris bulan tagihan (bisa dicentang bila UNPAID). */
function MonthRow({
  inv,
  checked,
  disabled,
  overdue,
  onToggle,
}: {
  inv: WaliInvoiceItem;
  checked: boolean;
  disabled: boolean;
  overdue: boolean;
  onToggle: () => void;
}) {
  const open = isSelectable(inv);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={checked}
      className={cn(
        "flex w-full items-center justify-between rounded-xl border-2 px-4 py-3.5 text-left text-sm transition-all",
        checked
          ? "border-blue-500 bg-blue-50 shadow-sm dark:bg-blue-500/10"
          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-500/20 dark:bg-transparent",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-[0.95rem] font-semibold text-foreground">
          {monthYearLabel(inv.y, inv.m)}
          {open && overdue && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[0.7rem] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
              Menunggak
            </span>
          )}
        </span>
        <span className="text-muted-foreground mt-0.5 block text-xs">
          {INVOICE_STATUS_LABEL[inv.status] ?? (inv.status === "NONE" ? "Belum Bayar" : inv.status)}
          {open && ` · min ${rupiah(inv.amount)}`}
          {open && !overdue && ` · jatuh tempo ${String(DUE_DAY).padStart(2, "0")}/${String(inv.m).padStart(2, "0")}/${inv.y}`}
        </span>
      </span>
      <span className="ml-3 flex shrink-0 items-center gap-3">
        <span className="text-base font-bold text-foreground">{rupiah(inv.amount)}</span>
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full border-2 transition-colors",
            checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"
          )}
        >
          {checked && <CheckCircle2 className="size-4" strokeWidth={2.5} />}
        </span>
      </span>
    </button>
  );
}

function ProofUploadDialog({
  transactionId,
  reference,
  onClose,
}: {
  transactionId: string | null;
  reference: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(submitProofAction, null);

  if (!transactionId) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unggah Bukti Transfer</DialogTitle>
          <DialogDescription>
            {reference && <span className="font-mono">{reference}</span>} — lampirkan foto bukti transfer (JPG/PNG/WebP, maks 5 MB).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="transactionId" value={transactionId} />
          <div className="space-y-1.5">
            <Label htmlFor="proof-file">Foto bukti transfer</Label>
            <Input id="proof-file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proof-note">Catatan (opsional)</Label>
            <Textarea id="proof-note" name="note" rows={2} placeholder="Contoh: transfer dari BSI a.n. Ahmad" />
          </div>
          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{state.error}</p>
          )}
          {state?.success && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              {state.success}
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={() => { router.refresh(); onClose(); }}>
                  Selesai
                </Button>
              </div>
            </div>
          )}
          {!state?.success && (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Batal
              </Button>
              <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
                {pending ? "Mengunggah…" : "Kirim Bukti"}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
