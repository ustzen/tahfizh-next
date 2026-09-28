import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getAdminHalaqahList, getTeacherHalaqahList } from "@/lib/halaqah";
import type { ScheduleRow } from "@/lib/akademik";
import { WEEK_DAYS, type JadwalBoardData, type MissingPresensi } from "@/lib/jadwal-shared";

/**
 * TAHFIZH V47 — Menu Jadwal (Master Data) untuk ADMIN / KOORDINATOR / USTADZ.
 *
 * Sumber data: learning_schedules (V11) + attendance_sessions (V8).
 * Tidak ada tabel baru — jadwal tetap referensi; presensi tetap alurnya
 * sendiri. Fitur baru: deteksi tanggal jadwal yang sudah LEWAT namun belum
 * ada sesi presensi ("Belum Dipresensi") agar guru/admin tidak lupa mengisi.
 */

export type { JadwalBoardData, MissingPresensi };
export { WEEK_DAYS, DAY_LABEL, formatTanggalSingkat } from "@/lib/jadwal-shared";

/** Batas lampau yang dipindai: maksimal 28 hari ke belakang (hemat query). */
const LOOKBACK_DAYS = 28;

/** JS getDay() (0=Minggu) → kode hari internal. */
function jsDayToCode(js: number): string {
  return WEEK_DAYS[js === 0 ? 6 : js - 1];
}

/** ISO date (lokal, bukan UTC) dari objek Date — pola todayISO(). */
function isoOf(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/**
 * Board jadwal untuk role saat ini. Guru hanya melihat jadwal halaqah yang
 * diampu; admin/koordinator melihat seluruh jadwal tenant. Deteksi "belum
 * dipresensi" hanya untuk halaqah yang relevan bagi role tsb.
 */
export const getJadwalBoard = cache(async (): Promise<JadwalBoardData> => {
  const profile = await getSessionProfile();
  const supabase = await createClient();

  const empty: JadwalBoardData = {
    schedules: [],
    todayCode: jsDayToCode(new Date().getDay()),
    todayISO: isoOf(new Date()),
    missing: [],
    canManage: false,
  };
  if (!profile?.tenantId) return empty;

  const isTeacher = profile.role === "USTADZ";
  const isAdmin = profile.role === "ADMIN";
  const canManage = isAdmin; // RPC learning_schedule_save hanya menerima ADMIN.
  if (!isTeacher && !isAdmin && profile.role !== "KOORDINATOR") return empty;

  const [schedules, halaqahList] = await Promise.all([
    getSchedulesForRole(isTeacher),
    isTeacher ? getTeacherHalaqahList() : getAdminHalaqahList(),
  ]);
  if (schedules.length === 0) {
    return { ...empty, canManage };
  }

  // Sesi presensi yang sudah ada dalam rentang pindai.
  const from = isoOf(new Date(Date.now() - LOOKBACK_DAYS * 86400000));
  const { data: sessions } = await supabase
    .from("attendance_sessions")
    .select("halaqah_id, session_date")
    .gte("session_date", from);
  const done = new Set<string>();
  for (const s of sessions ?? []) {
    done.add(`${s.halaqah_id}|${s.session_date}`);
  }

  // Halaqah dengan jadwal (untuk guru: filter lagi ke halaqah yang diampu —
  // getTeacherHalaqahList sudah hanya miliknya, jadi cukup cek keanggotaan).
  const relevant = new Set(halaqahList.map((h) => h.id));
  const now = new Date();
  const today = isoOf(now);
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  const missing: MissingPresensi[] = [];
  for (let i = LOOKBACK_DAYS; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const date = isoOf(d);
    const code = jsDayToCode(d.getDay());
    for (const s of schedules) {
      if (s.day !== code || !relevant.has(s.halaqahId)) continue;
      if (done.has(`${s.halaqahId}|${date}`)) continue;
      const [sh, sm] = s.startTime.split(":").map(Number);
      const isToday = date === today;
      // Hari ini hanya dihitung terlewat bila jam mulai sudah lewat.
      if (isToday && minutesNow <= sh * 60 + (sm || 0)) continue;
      missing.push({
        halaqahId: s.halaqahId,
        halaqahName: s.halaqahName,
        halaqahCode: s.halaqahCode,
        date,
        dayLabel: code,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room,
        daysOverdue: i,
        isToday,
      });
    }
  }

  // Terlama dulu (paling menekan), maksimal 8 agar banner tetap ringkas.
  missing.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  return { schedules, todayCode: jsDayToCode(now.getDay()), todayISO: today, missing: missing.slice(0, 8), canManage };
});

/** Jadwal: guru hanya halaqah diampu; admin/koordinator seluruh tenant. */
async function getSchedulesForRole(isTeacher: boolean): Promise<ScheduleRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("learning_schedules")
    .select("id, halaqah_id, day, start_time, end_time, room, halaqahs(name, business_code)");

  if (isTeacher) {
    // RLS sudah membatasi per tenant; filter eksplisit ke halaqah yang diampu.
    const teacherId = await resolveTeacherId();
    if (!teacherId) return [];
    const { data: assigned } = await supabase
      .from("halaqah_teachers")
      .select("halaqah_id")
      .eq("teacher_id", teacherId);
    const ids = (assigned ?? []).map((a) => a.halaqah_id);
    if (ids.length === 0) return [];
    query = query.in("halaqah_id", ids);
  }

  const { data } = await query.order("day").order("start_time");
  return (data ?? []).map((s) => {
    const halaqah = s.halaqahs as unknown as { name: string; business_code: string } | null;
    return {
      id: s.id,
      halaqahId: s.halaqah_id,
      halaqahName: halaqah?.name ?? "-",
      halaqahCode: halaqah?.business_code ?? "",
      day: s.day,
      startTime: s.start_time.slice(0, 5),
      endTime: s.end_time.slice(0, 5),
      room: s.room,
    };
  });
}

/** Resolve teacher id dari sesi — pola yang sama dengan modul lain. */
async function resolveTeacherId(): Promise<string | null> {
  const profile = await getSessionProfile();
  if (!profile?.tenantId) return null;
  const supabase = await createClient();
  const byId = await supabase
    .from("teachers")
    .select("id")
    .eq("tenant_id", profile.tenantId)
    .eq("profile_id", profile.id)
    .limit(1)
    .maybeSingle();
  if (byId.data?.id) return byId.data.id;
  if (!profile.fullName) return null;
  const byName = await supabase
    .from("teachers")
    .select("id")
    .eq("tenant_id", profile.tenantId)
    .ilike("full_name", profile.fullName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return byName.data?.id ?? null;
}
