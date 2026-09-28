import { cn } from "@/lib/utils";
import { lastOnlineLabel, onlineDotTone, onlineTitle } from "@/lib/online-status";

/**
 * TAHFIZH V50 — sel "Online" untuk tabel Data Santri: titik status berwarna +
 * label waktu singkat ("Online", "5 mnt lalu", "12 Mei"). iso = last_seen_at
 * akun wali santri; null = akun wali belum pernah login / tidak tertaut.
 */
export function OnlineCell({ iso, className }: { iso: string | null | undefined; className?: string }) {
  return (
    <span
      className={cn("flex items-center gap-1.5 text-xs", className)}
      title={onlineTitle(iso)}
    >
      <span className={cn("size-2 shrink-0 rounded-full", onlineDotTone(iso))} aria-hidden />
      <span className={cn(iso ? "text-foreground/85" : "text-muted-foreground")}>{lastOnlineLabel(iso)}</span>
    </span>
  );
}
