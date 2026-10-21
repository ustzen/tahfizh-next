import { cn } from "@/lib/utils";
import { CardBox } from "@/components/dashboard/section";

/* Ikon diimport oleh pemanggil (data melambatkan tekad visual di server). */
export type RaportStat = {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  /** Kelas warna chip ikon, memakai util tema yang sudah ada. */
  chip: string;
  valueClass?: string;
};

/**
 * V72 — rombak bagian raport: strip statistik seragam di atas halaman hub
 * Raport (admin/koordinator/ustadz). Satu kartu, sel-kiriman dengan pemisah,
 * ikon chip per metrik — menggantikan kotak-kotak terpisah yang pucat.
 */
export function RaportStatStrip({ items }: { items: RaportStat[] }) {
  if (items.length === 0) return null;

  return (
    <CardBox className="px-2 py-3 sm:px-3 sm:py-4">
      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))] sm:gap-0">
        {items.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-1.5 sm:px-4 sm:py-2",
              i > 0 && "sm:border-l sm:border-border/70"
            )}
          >
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5",
                s.chip
              )}
            >
              {s.icon}
            </span>
            <div className="min-w-0">
              <p className="tabular text-xl font-bold leading-tight text-foreground sm:text-2xl">
                {s.value}
              </p>
              <p className="text-xs text-muted-foreground truncate">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
    </CardBox>
  );
}