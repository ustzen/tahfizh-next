/**
 * TAHFIZH V20 — Obrolan (chat 1 lembaga, client-safe).
 */
import type { AppRole } from "@/lib/roles";
import { fmtDMY } from "@/lib/date-format";

export type ChatMessage = {
  id: string;
  halaqahId: string | null;
  senderId: string;
  senderName: string;
  senderRole: AppRole;
  content: string;
  createdAt: string;
  isSelf: boolean;
};

/** Ruang obrolan: "Lembaga" (id null) atau satu Halaqah tertentu. */
export type ChatRoom = {
  id: string | null;
  label: string;
  kind: "tenant" | "halaqah";
};

export const CHAT_MAX_LENGTH = 160;

export const CHAT_ROLE_LABEL: Record<AppRole, string> = {
  DEVELOPER: "Developer",
  ADMIN: "Admin",
  KOORDINATOR: "Koordinator",
  USTADZ: "Ustadz",
  WALI_SANTRI: "Santri",
};

export const CHAT_ROLE_TONE: Record<AppRole, string> = {
  DEVELOPER: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  ADMIN: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  KOORDINATOR: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  USTADZ: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  WALI_SANTRI: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
};

export function chatRoleLabel(role: string) {
  return CHAT_ROLE_LABEL[role as AppRole] ?? role;
}

export function chatRoleTone(role: string) {
  return CHAT_ROLE_TONE[role as AppRole] ?? "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300";
}

export function chatTimeLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/** Label pemisah hari untuk daftar pesan ("Hari ini", "Kemarin", atau tanggal). */
export function chatDayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return "Hari ini";
  if (diffDays === 1) return "Kemarin";
  return fmtDMY(d);
}
