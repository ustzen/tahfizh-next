import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
  INACTIVE: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn(STYLES[status] ?? STYLES.INACTIVE, "px-2.5 py-1 text-[0.78rem] font-medium", className)}>
      {status === "ACTIVE" ? "Aktif" : "Nonaktif"}
    </Badge>
  );
}
