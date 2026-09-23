import { BookOpenText } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Logo TAHFIZH — hanya bertuliskan TAHFIZH tanpa nomor versi (V12 #5).
 */
export function Logo({
  className,
  showText = true,
  dark = false,
}: {
  className?: string;
  showText?: boolean;
  dark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="bg-gradient-brand flex size-9 items-center justify-center rounded-xl text-white shadow-card">
        <BookOpenText className="size-5" />
      </span>
      {showText && (
        <span
          className={cn(
            "text-[1.05rem] font-bold tracking-tight",
            dark ? "text-white" : "text-foreground"
          )}
        >
          TAHFIZH
        </span>
      )}
    </span>
  );
}
