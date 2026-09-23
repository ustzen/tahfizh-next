"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CalendarCheck, Users } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * TAHFIZH V8 — shared tab navigation for halaqah detail pages (rule #12).
 * Tab = nested route segments → client-side navigation, no full reload.
 */
export function HalaqahTabs({
  halaqahId,
  role,
  halaqahLabel,
  studentLabel,
  tabs,
}: {
  halaqahId: string;
  role: "admin" | "koordinator" | "ustadz";
  halaqahLabel: string;
  studentLabel: string;
  /** Extra role-specific tabs, e.g. Aktivitas for admin. */
  tabs?: { key: string; label: string }[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/${role}/halaqah/${halaqahId}`;

  const items = [
    { key: "santri", label: studentLabel, href: `${base}/santri`, icon: Users },
    { key: "presensi", label: "Presensi", href: `${base}/presensi`, icon: CalendarCheck },
    { key: "rekap", label: "Rekap", href: `${base}/rekap`, icon: BarChart3 },
    ...(tabs ?? []).map((t) => ({ ...t, href: `${base}/${t.key}`, icon: undefined })),
  ];

  return (
    <div className="bg-role-soft flex gap-1 overflow-x-auto rounded-xl border p-1 shadow-card">
      {items.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => router.push(t.href)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition",
              active ? "bg-role text-role-ink shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
            )}
          >
            {Icon ? <Icon className="h-4 w-4" /> : null}
            {t.label}
          </button>
        );
      })}
      <Link
        href={`${base}`}
        className="sr-only"
        aria-label={`Ringkasan ${halaqahLabel}`}
      />
    </div>
  );
}
