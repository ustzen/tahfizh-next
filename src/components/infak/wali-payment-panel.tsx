"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CalendarDays, CalendarPlus, CheckCircle2, ChevronDown, CircleUserRound, FileUp, HandCoins, HandHeart, History, PencilLine, QrCode, ReceiptText, Search, UserRound, X } from "lucide-react";

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
import type {
  WaiverRequestRow,
  WaliBankInfo,
  WaliChild,
  WaliHistoryChild,
  WaliInvoiceItem,
  WaliOtherStudent,
  WaliTxRow,
} from "@/lib/v10";
import { InfakHistoryInline } from "@/components/infak/infak-history-card";
import { WaiverRequestLink } from "@/components/infak/waiver-request-link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

/** Ubin ringkasan status tagihan — bentuk & palet mengikuti ubin Presensi. */
const PAYMENT_STATS = [
  { key: "paid", label: "Lunas", icon: "✓", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  { key: "pending", label: "Menunggu", icon: "◷", tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  { key: "waiting", label: "Diproses", icon: "↻", tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  { key: "unpaid", label: "Belum Bayar", icon: "✚", tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
] as const;

/** Tagihan yang masih harus dibayar (belum diterbitkan pun tetap bisa dilunasi). */
const isOpenStatus = (s: string) => s === "UNPAID" || s === "NONE";

/** Teks ringkas status satu bulan (agregat antar anak), mis. "2 Lunas · 1 Belum Bayar". */
function monthStatusText(statuses: string[]) {
  const counts = new Map<string, number>();
  for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()]
    .map(([s, n]) => `${n > 1 ? `${n} ` : ""}${INVOICE_STATUS_LABEL[s] ?? (s === "NONE" ? "Belum Bayar" : s)}`)
    .join(" · ");
}

/** Nada badge status bulan — yang paling perlu diperhatikan yang menang. */
function monthTone(statuses: string[]) {
  if (statuses.some(isOpenStatus))
    return "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
  if (statuses.some((s) => s === "PENDING"))
    return "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300";
  if (statuses.some((s) => s === "WAITING_CONFIRM"))
    return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
}

/** Gaya chip identitas pembayar: aktif = solid warna role, nonaktif = outline lembut. */
function payerChipCls(active: boolean) {
  return cn(
    "h-8 max-w-56 rounded-full px-3.5 text-xs",
    active
      ? "border-transparent bg-role text-role-ink shadow-sm hover:bg-role/90 hover:text-role-ink"
      : "border-role/30 bg-white text-role-strong hover:bg-role-soft hover:text-role-strong dark:bg-transparent"
  );
}

/** Aksen avatar anak — berputar per anak agar kartu terlihat hidup tapi tetap serasi. */
const CHILD_TONES = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
];

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
  waiverKids,
  waiverRequests,
  history,
  payerName,
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
  waiverKids: { studentId: string; name: string; code: string }[];
  waiverRequests: WaiverRequestRow[];
  /** Riwayat per bulan (tab kedua kartu Riwayat gabungan). */
  history: WaliHistoryChild[];
  /** Nama asli wali (dari profil) — pilihan default "atas nama". */
  payerName: string;
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
  // Mode identitas: "self" = nama asli wali (dikirim apa adanya), "anon" = Hamba Allah,
  // "custom" = bebas diketik. Default "self" sehingga nama tercatat otomatis.
  const [payerMode, setPayerMode] = useState<"self" | "anon" | "custom">("self");
  const [payerCustom, setPayerCustom] = useState("");
  const payerAlias = payerMode === "self" ? payerName : payerMode === "anon" ? ANONYMOUS_PAYER_NAME : payerCustom.trim();
  // V48.3 — kartu metode bayar hanya muncul setelah pengguna klik lanjut.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // Tab kartu Riwayat gabungan.
  const [histTab, setHistTab] = useState<"transaksi" | "bulanan">("transaksi");

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
    setCheckoutOpen(false);
  }

  /** Klik chip identitas: pilih mode, atau batal (kembali ke "nama saya") bila sudah aktif. */
  function togglePayerMode(mode: "self" | "anon" | "custom") {
    setPayerMode(mode);
    if (mode === "custom" && payerMode === "custom") setPayerCustom("");
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

  /* ---- Ringkasan tagihan (ala kartu Presensi) ---------------------------- */
  // Gabungan riwayat 12 bulan + tunggakan lama (di luar riwayat) per anak,
  // tanpa duplikat — satu sumber untuk ubin, tabel bulanan, dan chip.
  type MonthCell = { studentId: string; studentName: string; y: number; m: number; amount: number; status: string };
  const monthCells: MonthCell[] = [];
  const seenMonth = new Set<string>();
  for (const h of history) {
    for (const it of h.items) {
      const k = `${h.studentId}:${it.y}:${it.m}`;
      if (seenMonth.has(k)) continue;
      seenMonth.add(k);
      monthCells.push({ studentId: h.studentId, studentName: h.name, y: it.y, m: it.m, amount: it.amount, status: it.status });
    }
  }
  for (const c of kids) {
    for (const inv of c.invoices) {
      const k = `${c.studentId}:${inv.y}:${inv.m}`;
      if (seenMonth.has(k)) continue;
      seenMonth.add(k);
      monthCells.push({ studentId: c.studentId, studentName: c.name, y: inv.y, m: inv.m, amount: inv.amount, status: inv.status });
    }
  }
  const summary = {
    total: monthCells.length,
    paid: monthCells.filter((c) => c.status === "PAID").length,
    pending: monthCells.filter((c) => c.status === "PENDING").length,
    waiting: monthCells.filter((c) => c.status === "WAITING_CONFIRM").length,
    unpaid: monthCells.filter((c) => isOpenStatus(c.status)).length,
  };
  // Tabel status per bulan — agregat antar anak, terbaru dulu.
  const monthlyRows = [...monthCells
    .reduce((map, c) => {
      const key = `${c.y}-${c.m}`;
      const row = map.get(key) ?? { y: c.y, m: c.m, amount: 0, statuses: [] as string[] };
      row.amount += c.amount;
      row.statuses.push(c.status);
      map.set(key, row);
      return map;
    }, new Map<string, { y: number; m: number; amount: number; statuses: string[] }>())
    .values()]
    .sort((a, b) => monthIndex(b.y, b.m) - monthIndex(a.y, a.m));
  // Chip bulan yang perlu dibayar — terlama dulu, maks 5.
  const openCells = monthCells
    .filter((c) => isOpenStatus(c.status) && c.amount > 0)
    .sort((a, b) => monthIndex(a.y, a.m) - monthIndex(b.y, b.m))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <Card className="shadow-card overflow-hidden rounded-2xl">
        {/* Ringkasan ala kartu Presensi: judul + lencana status, ubin status
            4 warna, tabel status per bulan, dan chip bulan perlu dibayar.
            Pengaturan nominal & pemilihan tagihan tetap di bagian bawah. */}
        <CardContent className="px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-role-strong text-lg font-bold tracking-tight sm:text-xl">
                Infak Pengembangan {academicYear}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {monthCells.length > 0
                  ? `${monthCells.length} bulan tercatat`
                  : "Belum ada tagihan tercatat"}{" "}
                · mulai {rupiah(defaultAmount)}/bulan/santri
              </p>
            </div>
            {selectedCount > 0 ? (
              <span className="bg-role text-role-ink shadow-card inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold">
                <HandCoins className="size-4" />
                {selectedCount} dipilih · {rupiah(total)}
              </span>
            ) : monthCells.length > 0 ? (
              <span
                className={cn(
                  "shadow-card inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold text-white",
                  summary.unpaid === 0
                    ? "bg-emerald-600"
                    : summary.unpaid < 3
                      ? "bg-amber-500"
                      : "bg-rose-600"
                )}
              >
                {summary.unpaid === 0 ? <CheckCircle2 className="size-4" /> : <CalendarDays className="size-4" />}
                {summary.unpaid === 0 ? "Semua lunas" : `Perlu dibayar ${summary.unpaid} bulan`}
              </span>
            ) : null}
          </div>

          {waiverKids.length > 0 && (
            <div className="mt-3">
              <WaiverRequestLink kids={waiverKids} requests={waiverRequests} />
            </div>
          )}

          {/* Ubin status tagihan */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PAYMENT_STATS.map((s) => (
              <div key={s.key} className={cn("rounded-2xl px-3 py-3", s.tone)}>
                <div className="flex items-center justify-between">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wider">{s.label}</p>
                  <span aria-hidden className="text-sm opacity-70">{s.icon}</span>
                </div>
                <p className="tabular mt-0.5 text-2xl font-bold">{summary[s.key]}</p>
              </div>
            ))}
          </div>

          {/* Status per bulan — terbaru dulu */}
          {monthlyRows.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[24rem] text-sm">
                <thead>
                  <tr className="text-muted-foreground text-left text-[0.7rem] uppercase tracking-wider">
                    <th className="py-1.5 font-bold">Bulan</th>
                    <th className="py-1.5 text-center font-bold">Nominal</th>
                    <th className="py-1.5 text-right font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {monthlyRows.map((row) => (
                    <tr key={`${row.y}-${row.m}`}>
                      <td className="py-2 font-medium">{monthYearLabel(row.y, row.m)}</td>
                      <td className="tabular py-2 text-center">{rupiah(row.amount)}</td>
                      <td className="py-2 text-right">
                        <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", monthTone(row.statuses))}>
                          {monthStatusText(row.statuses)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Bulan yang masih perlu dibayar (terlama dulu) */}
          {openCells.length > 0 && (
            <div className="mt-5">
              <p className="text-muted-foreground mb-2 text-[0.7rem] font-bold uppercase tracking-widest">
                Perlu dibayar
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {openCells.map((c) => (
                  <li
                    key={`${c.studentId}-${c.y}-${c.m}`}
                    title={c.studentName}
                    className="rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                  >
                    {monthYearLabel(c.y, c.m)} · {rupiah(c.amount)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
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

          {/* ---------------- Tagihan Saya — nominal + daftar anak dalam satu kartu ---------------- */}
          <section className="shadow-card border-role/15 bg-role-soft/30 relative overflow-hidden rounded-2xl border">
            <span
              aria-hidden
              className="bg-dots text-role/15 pointer-events-none absolute -top-4 -right-4 h-28 w-44 [mask-image:linear-gradient(to_left,black,transparent)]"
            />
            {/* Header strip: chip ikon + judul + pengatur nominal sebaris */}
            <div className="bg-role-soft/60 border-role/15 relative flex flex-wrap items-center gap-x-3 gap-y-3 border-b px-5 py-4 sm:px-6">
              <span className="bg-role text-role-ink shadow-card flex size-10 shrink-0 items-center justify-center rounded-xl">
                <HandCoins className="size-5" />
              </span>
              <div className="min-w-0">
                <h4 className="text-role-strong text-base font-bold tracking-tight sm:text-lg">Tagihan Saya</h4>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Nominal infak <span className="text-role-strong font-semibold">{rupiah(customAmount ?? defaultAmount)}</span> per
                  bulan / santri
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(
                    "h-8 rounded-full px-3.5 text-xs",
                    customAmount === null
                      ? "border-transparent bg-role text-role-ink hover:bg-role/90 hover:text-role-ink"
                      : "border-role/30 bg-white text-role-strong hover:bg-role-soft hover:text-role-strong dark:bg-transparent"
                  )}
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
                    variant="outline"
                    className={cn(
                      "h-8 rounded-full px-3.5 text-xs",
                      customAmount === a
                        ? "border-transparent bg-role text-role-ink hover:bg-role/90 hover:text-role-ink"
                        : "border-role/30 bg-white text-role-strong hover:bg-role-soft hover:text-role-strong dark:bg-transparent"
                    )}
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
                  placeholder="Nominal lain…"
                  className="border-role/30 h-8 w-28 rounded-full bg-white dark:bg-transparent"
                  aria-label="Nominal infak per bulan lainnya"
                />
              </div>
            </div>

            {/* Daftar tagihan per anak */}
            {kids.length === 0 && (
              <p className="border-role/25 bg-role-soft/40 text-muted-foreground mx-5 mb-4 mt-5 rounded-xl border border-dashed px-4 py-6 text-center text-sm sm:mx-6">
                Tagihan infak bulan ini belum diterbitkan lembaga. Anda tetap dapat berinfak untuk santri lain di daftar bawah.
              </p>
            )}
            <div className="grid gap-4 px-5 py-5 md:grid-cols-2 sm:px-6">
              {kids.map((child, ci) => {
                const tone = CHILD_TONES[ci % CHILD_TONES.length];
                const openSelectable = child.invoices.filter(isSelectable);
                const openSelected = openSelectable.filter((i) => keyOf(child.studentId, i.y, i.m) in selected).length;
                const allOpenSelected = openSelectable.length > 0 && openSelected === openSelectable.length;
                const aheadSelectable = child.ahead.filter(isSelectable);
                const aheadSelected = child.ahead.filter((i) => keyOf(child.studentId, i.y, i.m) in selected).length;
                const isAheadOpen = aheadOpen[child.studentId] === true;
                return (
                  <div
                    key={child.studentId}
                    className="shadow-card bg-white rounded-2xl border border-slate-200 p-5 transition-shadow hover:shadow-md dark:border-slate-500/20 dark:bg-card"
                  >
                    <div className="mb-4 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", tone)}
                          aria-hidden
                        >
                          {child.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-foreground">{child.name}</p>
                          <p className="text-muted-foreground font-mono text-xs">{child.code}</p>
                        </div>
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
                    <div className="bg-role-soft/40 mt-3 rounded-xl p-3">
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
                          {child.ahead.length === 0 ? (
                            <p className="text-muted-foreground text-[0.7rem] leading-relaxed">
                              Tidak ada bulan tersisa untuk dibayar di muka tahun ini — sudah sampai Desember.
                              Bulan Januari tahun depan akan muncul di sini setelah tagihannya diterbitkan.
                            </p>
                          ) : (
                            <>
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
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-xs"
                                  disabled={locked || aheadSelectable.length === 0}
                                  onClick={() => pickAhead(child, aheadSelectable.length)}
                                >
                                  Sampai Desember
                                </Button>
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
                                          ? "border-role bg-role-soft font-semibold text-role-strong"
                                          : ok
                                            ? "border-slate-200 bg-white text-slate-700 hover:border-role/40 dark:border-slate-500/20 dark:bg-transparent"
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
                                Tagihan bulan depan dibuat otomatis saat dibayar. Ditampilkan sampai Desember{" "}
                                {child.ahead[child.ahead.length - 1]?.y ?? ""} — mulai lagi otomatis saat memasuki Januari.
                              </p>
                            </>
                          )}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <HandHeart className="size-4 text-role" />
                  <h4 className="text-sm font-semibold text-foreground">Bayarkan untuk santri lain</h4>
                  <Badge variant="outline" className="text-[0.65rem]">{others.length} menunggak</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">Bantu terlama:</span>
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
                </div>
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

          {/* ---------------- Ringkasan pilihan + lanjut bayar ---------------- */}
          {selectedCount > 0 && (
            <div className="bg-role-soft/50 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {selectedCount} tagihan · {studentCount} santri · <span className="text-role-strong">{rupiah(total)}</span>
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={clearAll} disabled={pending}>
                  Kosongkan
                </Button>
              </div>
              {/* Identitas pembayar — muncul begitu ada tagihan dipilih,
                  sebelum lanjut ke pembayaran (juga berlaku untuk infak santri lain). */}
              <div className="border-role/15 mt-3 rounded-2xl border bg-white/70 p-3 dark:bg-transparent">
                <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-semibold">
                  <UserRound className="size-3.5 text-role" />
                  Dibayarkan atas nama
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={payerChipCls(payerMode === "self")}
                    onClick={() => togglePayerMode("self")}
                    aria-pressed={payerMode === "self"}
                  >
                    <CircleUserRound className="size-3.5" />
                    {payerName || "Nama saya"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={payerChipCls(payerMode === "anon")}
                    onClick={() => togglePayerMode("anon")}
                    aria-pressed={payerMode === "anon"}
                  >
                    <HandHeart className="size-3.5" />
                    {ANONYMOUS_PAYER_NAME}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={payerChipCls(payerMode === "custom")}
                    onClick={() => togglePayerMode("custom")}
                    aria-pressed={payerMode === "custom"}
                  >
                    <PencilLine className="size-3.5" />
                    Ketik sendiri
                  </Button>
                  {payerMode === "custom" && (
                    <Input
                      value={payerCustom}
                      onChange={(e) => setPayerCustom(e.target.value)}
                      maxLength={60}
                      autoFocus
                      placeholder="Tulis nama yang ditampilkan…"
                      className="h-8 w-48 rounded-full bg-white text-xs dark:bg-transparent"
                      aria-label="Nama pembayar kustom"
                    />
                  )}
                </div>
                <p className="text-muted-foreground mt-2 text-[0.7rem] leading-relaxed">
                  Nama ini yang tercatat sebagai pembayar infak — pilih Hamba Allah bila ingin anonim.
                </p>
              </div>

              {!checkoutOpen ? (
                <Button
                  type="button"
                  onClick={() => setCheckoutOpen(true)}
                  disabled={pending || pendingTx !== undefined}
                  className="bg-gradient-brand mt-3 w-full hover:opacity-90"
                >
                  Lanjut ke Pembayaran ({rupiah(total)})
                </Button>
              ) : (
                <div className="mt-3 space-y-3">
                  {/* Metode pembayaran — muncul setelah lanjut */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border p-4">
                      <div className="flex items-center gap-2.5">
                        <span className="bg-role-soft text-role-strong flex size-9 shrink-0 items-center justify-center rounded-xl">
                          <Banknote className="size-4.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">Transfer Manual</p>
                          {bank?.bankName && bank?.bankNo ? (
                            <p className="text-muted-foreground truncate font-mono text-xs">
                              {bank.bankName} · {bank.bankNo}
                            </p>
                          ) : (
                            <p className="text-muted-foreground truncate text-xs">Rekening belum diatur</p>
                          )}
                        </div>
                      </div>
                      {bank?.bankAccount && <p className="text-muted-foreground mt-1.5 text-xs">a.n. {bank.bankAccount}</p>}
                      <Button
                        onClick={() => handlePay("MANUAL")}
                        disabled={pending || pendingTx !== undefined}
                        className="bg-gradient-brand mt-3 w-full hover:opacity-90"
                      >
                        {pending ? "Memproses…" : `Bayar ${rupiah(total)} via Transfer`}
                      </Button>
                    </div>

                    <div className="rounded-2xl border p-4">
                      <div className="flex items-center gap-2.5">
                        <span className="bg-role-soft text-role-strong flex size-9 shrink-0 items-center justify-center rounded-xl">
                          <QrCode className="size-4.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">Otomatis (QRIS / e-wallet)</p>
                          <p className="text-muted-foreground truncate text-xs">
                            {autoEnabled ? `QRIS · VA · e-wallet · min ${rupiah(IPAYMU_MIN_TOTAL)}` : "Belum diaktifkan"}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => handlePay("IPAYMU")}
                        disabled={pending || pendingTx !== undefined || !autoEnabled}
                        variant="outline"
                        className="mt-3 w-full"
                      >
                        {pending ? "Memproses…" : "Bayar Otomatis"}
                      </Button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCheckoutOpen(false)}
                    className="text-muted-foreground mx-auto block text-xs hover:underline"
                  >
                    Kembali atur tagihan
                  </button>
                </div>
              )}
            </div>
          )}

          {bank?.instructions && (
            <p className="text-muted-foreground text-xs leading-relaxed">{bank.instructions}</p>
          )}
        </CardContent>
      </Card>

      {/* V48.3 — Riwayat gabungan: transaksi + per bulan dalam satu kartu bertab. */}
      <Card className="shadow-card overflow-hidden rounded-2xl">
        <div className="bg-role-soft border-role/15 relative overflow-hidden border-l-4 px-5 py-4">
          <div className="relative flex flex-wrap items-center gap-3">
            <span className="bg-role text-role-ink shadow-card flex size-10 shrink-0 items-center justify-center rounded-xl">
              <History className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-role-strong text-base font-bold tracking-tight">Riwayat Infak</h3>
              <p className="text-muted-foreground text-xs">Transaksi dan rincian per bulan dalam satu tempat.</p>
            </div>
          </div>
        </div>
        <CardContent className="pt-4">
          <Tabs value={histTab} onValueChange={(v) => setHistTab(v as "transaksi" | "bulanan")}>
            <TabsList className="mb-3">
              <TabsTrigger value="transaksi" className="gap-1.5">
                <ReceiptText className="size-3.5" /> Transaksi ({transactions.length})
              </TabsTrigger>
              <TabsTrigger value="bulanan" className="gap-1.5">
                <CalendarDays className="size-3.5" /> Per Bulan
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transaksi" className="mt-0">
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
            </TabsContent>

            <TabsContent value="bulanan" className="mt-0">
              <InfakHistoryInline history={history} />
            </TabsContent>
          </Tabs>
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
          ? "border-role bg-role-soft shadow-sm"
          : "border-slate-200 bg-white hover:border-role/40 hover:bg-role-soft/40 dark:border-slate-500/20 dark:bg-transparent",
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
            checked ? "border-role bg-role text-role-ink" : "border-slate-300"
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
