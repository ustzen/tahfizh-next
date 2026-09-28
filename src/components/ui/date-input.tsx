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
 * untuk diketik, plus TOMBOL KALENDER yang membuka picker tanggal native
 * lewat showPicker() (Chrome/Edge 99+, Safari 16+, Firefox 101+).
 * Nilai yang dikirim ke onChange tetap ISO yyyy-mm-dd sehingga URL ?tanggal=
 * dan RPC attendance_save_batch tidak berubah.
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
  const nativeRef = useRef<HTMLInputElement>(null);

  // Sinkron bila nilai berubah dari luar (mis. ?tanggal= di URL atau kalender).
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

  /** Buka kalender native. Harus dipanggil dari gesture pengguna (klik). */
  function openCalendar() {
    const el = nativeRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      // Browser lama menolak showPicker — fokuskan saja kontrol native.
      el.focus();
    }
  }

  return (
    <span className="relative block">
      {/* Area ketik dd/mm/yyyy */}
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

      {/* Tombol kalender + kontrol native tersembunyi (tetap dirender agar
          showPicker() valid — bukan display:none). */}
      <span className="absolute inset-y-0 right-0 flex w-10 items-center justify-center">
        <button
          type="button"
          onClick={openCalendar}
          disabled={disabled}
          aria-label={ariaLabel ? `Buka kalender ${ariaLabel}` : "Buka kalender"}
          className="text-muted-foreground hover:text-role flex h-full w-full cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CalendarDays className="size-4" />
        </button>
        <input
          ref={nativeRef}
          type="date"
          value={value}
          max={max}
          min={min}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 size-px -translate-x-1/2 -translate-y-1/2 opacity-0"
        />
      </span>
    </span>
  );
}
