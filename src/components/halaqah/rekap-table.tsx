import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { RekapRow } from "@/lib/halaqah";

/**
 * TAHFIZH V8 — rekap table (rule #35): Nama, H, I, S, A, Persen. Colors per
 * status but always with letter labels so it stays readable without color
 * (rule #56/#75). Scrolls horizontally on small screens.
 */
export function RekapTable({ rows }: { rows: RekapRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
        Belum ada data presensi pada periode ini.
      </p>
    );
  }

  return (
    <div className="bg-card overflow-x-auto rounded-xl border shadow-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Santri</TableHead>
            <TableHead className="text-center text-emerald-700 dark:text-emerald-300">H</TableHead>
            <TableHead className="text-center text-amber-700 dark:text-amber-300">I</TableHead>
            <TableHead className="text-center text-sky-700 dark:text-sky-300">S</TableHead>
            <TableHead className="text-center text-red-700 dark:text-red-300">A</TableHead>
            <TableHead className="text-center">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.studentId}>
              <TableCell>
                <p className="text-sm font-medium text-foreground">{r.studentName}</p>
              </TableCell>
              <TableCell className="text-center font-semibold text-emerald-700 dark:text-emerald-300">{r.hadir}</TableCell>
              <TableCell className="text-center font-semibold text-amber-700 dark:text-amber-300">{r.izin}</TableCell>
              <TableCell className="text-center font-semibold text-sky-700 dark:text-sky-300">{r.sakit}</TableCell>
              <TableCell className="text-center font-semibold text-red-700 dark:text-red-300">{r.alpa}</TableCell>
              <TableCell className="text-center">
                <span
                  className={cn(
                    "tabular inline-block rounded-full px-2.5 py-0.5 text-xs font-bold",
                    r.persen >= 85
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : r.persen >= 70
                        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                        : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                  )}
                >
                  {r.persen}%
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
