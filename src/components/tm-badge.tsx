import { cn } from "@/lib/utils";

/** Lencana TM (Tatap Muka). `no` kosong → tanda hubung. */
export function TmBadge({ no, className }: { no: number | null | undefined; className?: string }) {
  if (!no) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "tabular inline-block rounded-lg bg-teal-700 px-2 py-0.5 text-xs font-extrabold whitespace-nowrap text-white",
        className
      )}
    >
      TM {no}
    </span>
  );
}
