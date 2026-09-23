import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Banner judul halaman. Warna mengikuti identitas role (lihat `data-role` di
 * DashboardShell): strip solid di sisi kiri, chip judul lembut, dan pola titik
 * halus di pojok. Dipakai oleh semua menu di semua role, jadi cukup diubah di sini.
 */
export function PageHeader({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Ikon opsional di kiri judul (mis. <Users className="size-6" />). */
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-role-soft border-role/15 relative mb-6 overflow-hidden rounded-2xl border">
      {/* Strip identitas role */}
      <span aria-hidden className="bg-role absolute inset-y-0 left-0 w-1.5" />
      {/* Dekorasi titik — sangat halus, tidak mengganggu teks */}
      <span
        aria-hidden
        className="bg-dots text-role/20 pointer-events-none absolute -top-2 -right-2 h-28 w-44 [mask-image:linear-gradient(to_left,black,transparent)]"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-3 py-5 pr-5 pl-6 sm:pr-6">
        <div className="flex min-w-0 items-center gap-3.5">
          {icon && (
            <span className="bg-role text-role-ink flex size-11 shrink-0 items-center justify-center rounded-xl shadow-card">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-role-strong text-2xl font-bold tracking-tight sm:text-[1.7rem]">
              {title}
            </h2>
            {description && (
              <p className="text-muted-foreground mt-1 text-[0.95rem]">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}

export function CardBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("shadow-card rounded-2xl", className)}>
      <CardContent className="px-5 py-5">{children}</CardContent>
    </Card>
  );
}

/**
 * Judul bagian di dalam kartu: chip ikon berwarna + judul + keterangan + aksi.
 * `tone` memilih warna chip; default mengikuti warna role.
 */
const TONES = {
  role: "bg-role-soft text-role-strong",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
} as const;

export type SectionTone = keyof typeof TONES;

export function SectionTitle({
  icon,
  title,
  description,
  action,
  tone = "role",
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: SectionTone;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5",
              TONES[tone]
            )}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-foreground font-semibold">{title}</h3>
          {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
