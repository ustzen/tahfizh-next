import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

/**
 * V12.13 — Pengingat sesi halaqah (H-0 hari ini & H-1 besok).
 *
 * Sumber data: learning_schedules (V11) — jadwal per halaqah per hari.
 * Guru yang berhak: pengampu halaqah (halaqah_teachers). Query client biasa:
 * RLS mengizinkan baca jadwal per tenant; guru hanya melihat halaqahnya
 * karena kita filter eksplisit berdasarkan halaqah_teachers miliknya.
 */

export type ScheduleReminder = {
  halaqahName: string;
  day: string;
  startTime: string;
  endTime: string;
  room: string | null;
  /** 0 = hari ini, 1 = besok (H-1). */
  daysUntil: 0 | 1;
};

const DAY_INDEX: Record<string, number> = {
  SENIN: 1,
  SELASA: 2,
  RABU: 3,
  KAMIS: 4,
  JUMAT: 5,
  SABTU: 6,
  MINGGU: 0,
};

const DAY_LABEL: Record<string, string> = {
  SENIN: "Senin",
  SELASA: "Selasa",
  RABU: "Rabu",
  KAMIS: "Kamis",
  JUMAT: "Jumat",
  SABTU: "Sabtu",
  MINGGU: "Minggu",
};

export const getScheduleReminders = cache(async (): Promise<ScheduleReminder[]> => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ" || !profile.tenantId) return [];
  const supabase = await createClient();

  // Halaqah yang diampu guru ini (jalur UUID + fallback nama sama seperti
  // modul lain; sederhana: dua query kecil).
  let teacherId: string | null = null;
  const byId = await supabase
    .from("teachers")
    .select("id")
    .eq("tenant_id", profile.tenantId)
    .eq("profile_id", profile.id)
    .limit(1)
    .maybeSingle();
  teacherId = byId.data?.id ?? null;
  if (!teacherId) {
    const byName = await supabase
      .from("teachers")
      .select("id")
      .eq("tenant_id", profile.tenantId)
      .ilike("full_name", profile.fullName)
      .limit(1)
      .maybeSingle();
    teacherId = byName.data?.id ?? null;
  }
  if (!teacherId) return [];

  const now = new Date();
  const todayIdx = now.getDay(); // 0=Minggu (JS) — cocok dengan DAY_INDEX MINGGU=0
  const tomorrowIdx = (todayIdx + 1) % 7;
  const wantedDays = new Set<string>();
  for (const [day, idx] of Object.entries(DAY_INDEX)) {
    if (idx === todayIdx || idx === tomorrowIdx) wantedDays.add(day);
  }

  const { data: assignments, error: aErr } = await supabase
    .from("halaqah_teachers")
    .select("halaqah_id")
    .eq("teacher_id", teacherId);
  if (aErr || !assignments || assignments.length === 0) return [];
  const halaqahIds = assignments.map((a) => a.halaqah_id);

  const { data: schedules, error: sErr } = await supabase
    .from("learning_schedules")
    .select(`day, start_time, end_time, room, halaqah:halaqahs (name)`)
    .in("halaqah_id", halaqahIds)
    .in("day", [...wantedDays])
    .order("start_time");
  if (sErr) {
    console.error("[getScheduleReminders]", sErr.message);
    return [];
  }

  const rows: ScheduleReminder[] = [];
  for (const s of schedules ?? []) {
    const halaqah = s.halaqah as { name?: string } | null;
    const idx = DAY_INDEX[s.day];
    if (idx !== todayIdx && idx !== tomorrowIdx) continue;
    rows.push({
      halaqahName: halaqah?.name ?? "Halaqah",
      day: DAY_LABEL[s.day] ?? s.day,
      startTime: String(s.start_time).slice(0, 5),
      endTime: String(s.end_time).slice(0, 5),
      room: s.room,
      daysUntil: idx === todayIdx ? 0 : 1,
    });
  }

  // Hari ini dulu, lalu besok; masing-masing urut jam mulai.
  return rows.sort((a, b) => a.daysUntil - b.daysUntil || a.startTime.localeCompare(b.startTime));
});
