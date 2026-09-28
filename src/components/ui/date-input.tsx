"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * TAHFIZH — Input tanggal berformat tampilan dd/mm/yyyy.
 *
 * <input type="date"> native mengikuti locale browser sehingga bisa tampil
 * mm/dd/yyyy. Komponen ini menampilkan TEKS dd/mm/yyyy (mask + auto-slash)
 * dan menyediakan tombol kalender (native date input transparan) untuk memilih
 * tanggal. Nilai yang dikirim ke onChange tetap ISO yyyy-mm-dd sehingga URL
 * ?tanggal= dan RPC attendance_save_batch tidak berubah.
 */

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function displayToIso(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const dt = new Date(yyyy, mm - 1, dd);
  if (dt.getDate() !== dd || dt.getMonth() !== mm - 1 || dt.getFullYear() !== yyyy) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function digitsToDisplay(digits: string): string {
  const p = digits.slice(0, 8);
  let out = p.slice(0, 2);
  if (p.length > 2) out += `/${p.slice(2, 4)}`;
  if (p.length > 4) out += `/${p.slice(4, 8)}`;
  return out;
}

export function DateInput({
  value,
  onChange,
  max,
  min,
  disabled,
  ariaLabel,
  className,
}: {
  /** ISO yyyy-mm-dd. */
  value: string;
  /** Menerima ISO yyyy-mm-dd. */
  onChange: (iso: string) => void;
  max?: string;
  min?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(() => (value ? isoToDisplay(value) : ""));
  const pickerRef = useRef<HTMLInputElement>(null);

  // Sinkron bila nilai berubah dari luar (mis. ?tanggal= di URL).
  useEffect(() => {
    setDisplay((prev) => {
      const prevIso = displayToIso(prev);
      if (prevIso === value) return prev;
      return value ? isoToDisplay(value) : "";
    });
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    const next = digitsToDisplay(digits);
    setDisplay(next);
    if (digits.length === 8) {
      const iso = displayToIso(next);
      if (iso) onChange(iso);
    }
  }

  // Blur dengan isian belum lengkap/invalid → kembalikan tampilan ke nilai aktif.
  function handleBlur() {
    const iso = displayToIso(display);
    if (!iso) {
      setDisplay(value ? isoToDisplay(value) : "");
      return;
    }
    setDisplay(isoToDisplay(iso));
    if (iso !== value) onChange(iso);
  }

  function openPicker() {
    const el = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    el?.showPicker?.();
  }

  return (
    <span className="relative block">
      <Input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn("pr-10 font-mono", className)}
      />
      <span className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-center">
        <input
          ref={pickerRef}
          type="date"
          value={value}
          max={max}
          min={min}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          onClick={openPicker}
          disabled={disabled}
          className="pointer-events-auto absolute inset-0 h-full w-full cursor-pointer opacity-0"
          tabIndex={-1}
          aria-hidden="true"
        />
        <CalendarDays className="text-muted-foreground size-4" />
      </span>
    </span>
  );
}
