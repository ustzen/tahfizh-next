import {
  BookMarked,
  Building2,
  CalendarCheck,
  CheckCircle2,
  CircleUser,
  CircleSlash,
  GraduationCap,
  HandCoins,
  Hourglass,
  MessageSquareText,
  Receipt,
  Target,
  TrendingUp,
  Users,
  Users2,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ICONS = {
  tenant: Building2,
  user: CircleUser,
  teacher: BookMarked,
  student: GraduationCap,
  people: Users,
  halaqah: Users2,
  attendance: CalendarCheck,
  // Ikon tambahan agar tiap angka punya makna visualnya sendiri.
  paid: CheckCircle2,
  unpaid: Hourglass,
  inactive: CircleSlash,
  infak: HandCoins,
  wallet: Wallet,
  invoice: Receipt,
  feedback: MessageSquareText,
  target: Target,
  achievement: TrendingUp,
} as const;

export type StatIcon = keyof typeof ICONS;

type Tone = { chip: string; strip: string; bar: string };

/**
 * Warna aksen per kartu (ikon + strip kiri unik) — solid, tanpa gradient.
 * Kelas ditulis penuh (bukan template string) agar terdeteksi Tailwind.
 */
const TONES: Record<StatIcon, Tone> = {
  tenant: {
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    strip: "bg-blue-600",
    bar: "bg-blue-600",
  },
  user: {
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    strip: "bg-violet-500",
    bar: "bg-violet-500",
  },
  teacher: {
    chip: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
    strip: "bg-yellow-400",
    bar: "bg-yellow-400",
  },
  student: {
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    strip: "bg-emerald-500",
    bar: "bg-emerald-500",
  },
  people: {
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    strip: "bg-sky-600",
    bar: "bg-sky-600",
  },
  halaqah: {
    chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    strip: "bg-indigo-500",
    bar: "bg-indigo-500",
  },
  attendance: {
    chip: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    strip: "bg-cyan-500",
    bar: "bg-cyan-500",
  },
  paid: {
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    strip: "bg-emerald-500",
    bar: "bg-emerald-500",
  },
  unpaid: {
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    strip: "bg-amber-500",
    bar: "bg-amber-500",
  },
  inactive: {
    chip: "bg-slate-200 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
    strip: "bg-slate-400",
    bar: "bg-slate-400",
  },
  infak: {
    chip: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    strip: "bg-teal-500",
    bar: "bg-teal-500",
  },
  wallet: {
    chip: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    strip: "bg-orange-500",
    bar: "bg-orange-500",
  },
  invoice: {
    chip: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
    strip: "bg-fuchsia-500",
    bar: "bg-fuchsia-500",
  },
  feedback: {
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    strip: "bg-rose-500",
    bar: "bg-rose-500",
  },
  target: {
    chip: "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300",
    strip: "bg-lime-500",
    bar: "bg-lime-500",
  },
  achievement: {
    chip: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
    strip: "bg-purple-500",
    bar: "bg-purple-500",
  },
};

/**
 * Kartu statistik dengan strip warna unik di sisi kiri (V12 — full color).
 * Hover: naik sedikit + bayangan lebih dalam.
 *
 * `progress` (0–100) opsional: menampilkan bilah kemajuan di bawah angka,
 * cocok untuk rasio (mis. santri aktif dari total, tagihan lunas).
 */
export function StatCard({
  icon,
  label,
  value,
  hint,
  progress,
}: {
  icon: StatIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  progress?: number;
}) {
  const Icon = ICONS[icon];
  const t = TONES[icon];
  const pct =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.max(0, Math.min(100, Math.round(progress)))
      : null;

  return (
    <Card className="shadow-card hover:shadow-card-lg gap-0 overflow-hidden rounded-2xl py-0 transition-all duration-200 hover:-translate-y-0.5">
      <CardContent className="relative flex items-center gap-4 p-0">
        {/* Strip warna unik di pinggiran kiri kartu */}
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5 rounded-l-2xl", t.strip)} />

        <div className="flex min-w-0 flex-1 items-center gap-4 px-5 py-5 pl-6">
          <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl", t.chip)}>
            <Icon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-[0.9rem] font-medium">{label}</p>
            <p className="tabular truncate text-[1.75rem] leading-tight font-bold tracking-tight">{value}</p>
            {hint && <p className="text-muted-foreground mt-0.5 truncate text-[0.8rem]">{hint}</p>}
            {pct !== null && (
              <div className="mt-2 flex items-center gap-2">
                <div
                  className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={label}
                >
                  <div className={cn("h-full rounded-full", t.bar)} style={{ width: `${pct}%` }} />
                </div>
                <span className="tabular text-muted-foreground text-[0.72rem] font-semibold">{pct}%</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
