import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  BookOpenText,
  Check,
  HandHeart,
  Sparkles,
  Target as TargetIcon,
} from "lucide-react";

import { TargetMosqueArt } from "@/components/santri/target-hero-art";
import { requireRole } from "@/lib/auth";
import { getTargetProgress } from "@/lib/santri-pantauan";
import type { TargetProgress } from "@/lib/santri-pantauan-shared";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Target" };

type CategoryKey = "TAHFIDZ" | "HADITS" | "DOA";

/** Urutan kartu tetap seperti mockup: Tahfidz, Hadits, Doa Harian. */
const CATEGORY_ORDER: CategoryKey[] = ["TAHFIDZ", "HADITS", "DOA"];

const VIEW: Record<
  CategoryKey,
  {
    label: string;
    itemsLabel: string;
    unit: string;
    Icon: React.ComponentType<{ className?: string }>;
    card: string;
    iconWrap: string;
    bar: string;
    badge: string;
    chip: string;
    panel: string;
  }
> = {
  TAHFIDZ: {
    label: "Tahfidz",
    itemsLabel: "Surat yang dihafal",
    unit: "surat",
    Icon: BookOpen,
    card: "border-emerald-100",
    iconWrap: "bg-emerald-500",
    bar: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    chip: "bg-emerald-100 text-emerald-700",
    panel: "border-emerald-100 bg-emerald-50/70",
  },
  HADITS: {
    label: "Hadits",
    itemsLabel: "Hadits yang dipelajari",
    unit: "hadits",
    Icon: BookOpenText,
    card: "border-blue-100",
    iconWrap: "bg-blue-500",
    bar: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    chip: "bg-blue-100 text-blue-700",
    panel: "border-blue-100 bg-blue-50/70",
  },
  DOA: {
    label: "Doa Harian",
    itemsLabel: "Doa yang dipelajari",
    unit: "doa",
    Icon: HandHeart,
    card: "border-violet-100",
    iconWrap: "bg-violet-500",
    bar: "bg-violet-500",
    badge: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
    chip: "bg-violet-100 text-violet-700",
    panel: "border-violet-100 bg-violet-50/70",
  },
};

/**
 * Item target + status centang. Mengutamakan `itemStatus` dari server (V61) —
 * hasil sinkron penilaian guru, jadi surat/hadits/doa yang sudah dicapai santri
 * otomatis tercentang. Bila field belum tersedia (migrasi belum diterapkan),
 * daftar diturunkan dari `items` dengan capaian sebagai perkiraan.
 */
function resolveItems(t: TargetProgress): { name: string; done: boolean }[] {
  if (Array.isArray(t.itemStatus) && t.itemStatus.length > 0) return t.itemStatus;
  const names = (t.items ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const doneCount = Math.min(t.capaian, names.length);
  return names.map((name, i) => ({ name, done: i < doneCount }));
}

function CategoryCard({ t }: { t: TargetProgress }) {
  const view = VIEW[t.category as CategoryKey] ?? VIEW.TAHFIDZ;
  const items = resolveItems(t);
  const total = items.length > 0 ? items.length : t.targetValue;
  const done = items.length > 0 ? items.filter((i) => i.done).length : Math.min(t.capaian, t.targetValue);
  const pct = total > 0 ? Math.min(Math.round((done / total) * 100), 100) : 0;
  const selesai = total > 0 && done >= total;
  const { Icon } = view;

  return (
    <div className={cn("shadow-card rounded-3xl border bg-white p-4", view.card)}>
      {/* Baris judul + persentase */}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full text-white shadow-sm",
            view.iconWrap
          )}
        >
          <Icon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-extrabold tracking-tight text-slate-800">{view.label}</p>
          <p className="text-sm font-semibold text-slate-500">
            <span className="tabular font-bold text-slate-700">
              {done}/{total}
            </span>{" "}
            {view.unit}
            <span className="mx-2 text-slate-300">|</span>
            {selesai ? "Selesai" : "Dalam Proses"}
          </p>
        </div>
        <span
          className={cn(
            "tabular flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold",
            view.badge
          )}
        >
          {selesai ? <Check className="size-4" strokeWidth={3} /> : <TargetIcon className="size-4" />}
          {pct}%
        </span>
      </div>

      {/* Bar progres */}
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div className={cn("h-full rounded-full", view.bar)} style={{ width: `${pct}%` }} />
      </div>

      {/* Panel daftar item */}
      <div className={cn("mt-4 rounded-2xl border p-3", view.panel)}>
        <div className="flex items-center justify-between gap-2">
          <span className={cn("rounded-lg px-2.5 py-1 text-xs font-bold", view.chip)}>
            {view.itemsLabel}
          </span>
          <span className={cn("tabular rounded-lg px-2.5 py-1 text-xs font-bold", view.chip)}>
            {done}/{total} {view.unit}
          </span>
        </div>

        {items.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Belum ada {view.unit} pada target ini.</p>
        ) : (
          <ol className="mt-3 gap-x-6 space-y-1 sm:columns-2">
            {items.map((it, i) => (
              <li
                key={`${it.name}-${i}`}
                className="flex items-center gap-2 break-inside-avoid py-0.5"
              >
                <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[0.7rem] font-bold text-slate-500">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                  {it.name}
                </span>
                {it.done ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                ) : (
                  <span className="size-5 shrink-0 rounded-full border-2 border-slate-300" />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function EmptyCategory({ category }: { category: CategoryKey }) {
  const view = VIEW[category];
  const { Icon } = view;
  return (
    <div className={cn("rounded-3xl border border-dashed bg-white/70 p-4", view.card)}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full text-white opacity-60",
            view.iconWrap
          )}
        >
          <Icon className="size-6" />
        </span>
        <div>
          <p className="text-lg font-extrabold tracking-tight text-slate-400">{view.label}</p>
          <p className="text-sm text-slate-400">Guru belum menetapkan target.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Target Pembelajaran (santri) — papan target per anak: Tahfidz, Hadits, dan
 * Doa. Target disinkronkan dari yang ditetapkan guru untuk halaqah, dan tiap
 * item otomatis tercentang begitu dicapai santri (penilaian guru di database).
 */
export default async function SantriTargetPage() {
  await requireRole(["WALI_SANTRI"], "/santri/target");
  const targets = await getTargetProgress();

  const perAnak = new Map<string, TargetProgress[]>();
  for (const t of targets) {
    const list = perAnak.get(t.studentName) ?? [];
    list.push(t);
    perAnak.set(t.studentName, list);
  }

  return (
    <div className="space-y-5">
      {/* Hero banner */}
      <div className="shadow-card relative overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-100 via-sky-50 to-white">
        <TargetMosqueArt className="pointer-events-none absolute inset-y-0 right-0 h-full w-44 sm:w-72" />
        <div className="relative max-w-[60%] p-5 sm:max-w-sm sm:p-6">
          <Link
            href="/santri"
            aria-label="Kembali ke dasbor"
            className="shadow-card flex size-10 items-center justify-center rounded-full bg-white text-sky-600 transition-colors hover:bg-sky-50"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-sky-900 sm:text-[1.7rem]">
            Target Pembelajaran
          </h1>
          <p className="mt-1.5 text-sm font-medium text-sky-800/80">
            Apa saja yang harus dicapai ananda dalam setiap mata pelajaran, ditetapkan guru untuk
            halaqahnya, progres terhitung otomatis.
          </p>
        </div>
      </div>

      {targets.length === 0 ? (
        <div className="shadow-card rounded-3xl border bg-white p-6 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <TargetIcon className="size-6" />
          </span>
          <p className="font-bold text-slate-700">Belum ada target aktif</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Guru belum menetapkan target untuk halaqah ananda. Target akan muncul di sini setelah
            guru mengaturnya di menu Target.
          </p>
        </div>
      ) : (
        [...perAnak.entries()].map(([nama, list]) => {
          const byCat = new Map(list.map((t) => [t.category, t]));
          return (
            <div key={nama} className="space-y-4">
              {perAnak.size > 1 && (
                <p className="px-1 text-lg font-extrabold tracking-tight text-slate-800">
                  {nama}
                  <span className="ml-2 text-sm font-medium text-slate-400">
                    {list[0]?.halaqahName ?? "-"}
                  </span>
                </p>
              )}
              {CATEGORY_ORDER.map((c) => {
                const t = byCat.get(c);
                return t ? <CategoryCard key={c} t={t} /> : <EmptyCategory key={c} category={c} />;
              })}
            </div>
          );
        })
      )}

      {/* Banner kutipan */}
      <div className="relative overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 to-sky-100/70 px-5 py-4">
        <Sparkles className="absolute top-3 left-4 size-4 text-sky-300" />
        <Sparkles className="absolute right-4 bottom-3 size-4 text-sky-300" />
        <div className="flex items-center justify-center gap-3">
          <BookOpen className="hidden size-7 shrink-0 text-sky-400 sm:block" />
          <p className="text-center text-sm font-semibold text-sky-800 italic">
            <span className="mr-1 text-lg text-sky-400">&ldquo;</span>
            Ilmu adalah cahaya, amal adalah buahnya, dan akhlak adalah keindahannya.
            <span className="ml-1 text-lg text-sky-400">&rdquo;</span>
          </p>
        </div>
      </div>
    </div>
  );
}
