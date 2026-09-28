"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * TAHFIZH V48 — Filter halaqah ringan (URL-driven) untuk halaman Riwayat
 * Presensi. Terpisah dari PeriodFilter karena tidak memakai rentang tanggal.
 */
export function HalaqahFilterBar({
  basePath,
  halaqahId,
  options,
}: {
  basePath: string;
  halaqahId: string;
  options: { id: string; name: string }[];
}) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-role/15 bg-white/80 p-3 shadow-card dark:bg-card/80">
      <span className="text-muted-foreground pl-1 text-xs font-medium">Halaqah</span>
      <Select
        value={halaqahId || undefined}
        onValueChange={(v) => router.push(`${basePath}?halaqah=${v}`)}
      >
        <SelectTrigger aria-label="Pilih halaqah" className="w-full sm:w-56">
          <SelectValue placeholder="Pilih halaqah" />
        </SelectTrigger>
        <SelectContent>
          {options.map((h) => (
            <SelectItem key={h.id} value={h.id}>
              {h.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
