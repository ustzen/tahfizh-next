import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton dasbor generik per area role (ustadz/koordinator/admin/santri):
 * header + kartu statistik + satu blok besar. Dipakai bersama agar navigasi
 * antar menu punya umpan balik visual yang konsisten.
 */
export function DashboardLoading() {
  return (
    <div className="animate-pulse">
      <Skeleton className="h-9 w-72 rounded-xl" />
      <Skeleton className="mt-2 h-4 w-56 rounded-lg" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>

      <Skeleton className="mt-6 h-72 rounded-2xl" />
      <Skeleton className="mt-4 h-40 rounded-2xl" />
    </div>
  );
}
