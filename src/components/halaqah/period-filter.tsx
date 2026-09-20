"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * TAHFIZH V8 — filter bar for rekap pages (rule #36): Hari / Minggu / Bulan /
 * Custom, plus a halaqah picker. URL-driven (client-side navigation, no full
 * reload — rule #53).
 */
export function PeriodFilter({
  basePath,
  halaqahId,
  halaqahOptions,
  from,
  to,
}: {
  basePath: string;
  halaqahId: string;
  halaqahOptions: { id: string; name: string }[];
  from: string;
  to: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [dari, setDari] = useState(from);
  const [sampai, setSampai] = useState(to);

  const activePeriod =
    sp.get("periode") ?? (from === to ? "hari" : "custom");

  function navigate(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = {
      halaqah: halaqahId || undefined,
      dari,
      sampai,
      periode: sp.get("periode") ?? undefined,
      ...params,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    router.push(`${basePath}?${q.toString()}`);
  }

  function preset(kind: "hari" | "minggu" | "bulan") {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    let f = iso(now);
    let t = iso(now);
    if (kind === "minggu") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay() + 1); // Monday
      f = iso(start);
      t = iso(now);
    } else if (kind === "bulan") {
      f = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      t = iso(now);
    }
    setDari(f);
    setSampai(t);
    navigate({ dari: f, sampai: t, periode: kind });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-role/15 bg-white/80 p-3 shadow-card">
      {halaqahOptions.length > 0 ? (
        <div className="w-full sm:w-52">
          <Select value={halaqahId} onValueChange={(v) => navigate({ halaqah: v })}>
            <SelectTrigger aria-label="Pilih halaqah">
              <SelectValue placeholder="Pilih halaqah" />
            </SelectTrigger>
            <SelectContent>
              {halaqahOptions.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex gap-1" role="group" aria-label="Periode">
        {(["hari", "minggu", "bulan"] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={activePeriod === k ? "default" : "outline"}
            className={cn("h-9 text-xs capitalize", activePeriod === k && "bg-blue-600 text-white")}
            onClick={() => preset(k)}
          >
            {k}
          </Button>
        ))}
      </div>

      <div className="flex flex-1 items-center gap-1.5">
        <Input
          type="date"
          value={dari}
          onChange={(e) => setDari(e.target.value)}
          aria-label="Dari tanggal"
          className="h-9 text-xs"
        />
        <span className="text-xs text-muted-foreground/80">s/d</span>
        <Input
          type="date"
          value={sampai}
          onChange={(e) => setSampai(e.target.value)}
          aria-label="Sampai tanggal"
          className="h-9 text-xs"
        />
        <Button
          size="sm"
          className="h-9 bg-role text-role-ink"
          onClick={() => navigate({ dari, sampai, periode: "custom" })}
        >
          Terapkan
        </Button>
      </div>
    </div>
  );
}
