"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import type { ActionResult } from "@/app/actions/crud";
import { allocateAccount, createLoginAccount, defaultPasswordFor } from "@/lib/account";
import {
  canonicalizeRow,
  friendlyDbError,
  isSystemicDbError,
  rowNumberOf,
  validateStudentRow,
  validateTeacherRow,
  type ImportIssue,
  type ImportKind,
  type ImportRow,
  type ValidStudentRow,
  type ValidTeacherRow,
} from "@/lib/import-shared";

/**
 * TAHFIZH V12.14 — Import Excel Guru & Santri (server-side, batch).
 *
 * Client (dialog import) membaca file .XLSX/.CSV dengan SheetJS, memetakan
 * header ke kolom kanonik A..J (lihat src/lib/import-shared.ts), lalu mengirim
 * baris dalam POTONGAN kecil (maks. 25 baris/permintaan) sebagai JSON di field
 * `payload` — agar tiap permintaan selesai jauh di bawah batas waktu server
 * (pembuatan akun login = beberapa panggilan Supabase Auth per baris).
 *
 * Server melakukan SEMUA validasi ulang: session → role (ADMIN/KOORDINATOR) →
 * tenant dari session (tidak pernah dari client) → normalisasi kunci baris →
 * aturan validasi yang sama dengan pratinjau di browser.
 *
 * Perubahan V12.14 (import sebelumnya gagal untuk semua baris):
 *   - Kunci baris dinormalisasi (alias header), bukan pencocokan huruf-campuran.
 *   - ID baris dibuat di server (randomUUID) dan insert TIDAK memakai
 *     `.select()` → tidak bergantung pada policy SELECT/RETURNING; urutan hasil
 *     tidak lagi diasumsikan.
 *   - Batch insert gagal → dicoba per baris, sehingga satu baris bermasalah
 *     tidak menggagalkan baris lain, dan pesan error DB diterjemahkan.
 *   - Guru: username diisi tanpa kata sandi → sandi default (panggilan+1234);
 *     sandi diisi tanpa username → username otomatis.
 *   - Username eksplisit di file dicadangkan lebih dulu agar alokasi otomatis
 *     tidak mengambilnya.
 *   - Akun login dibuat paralel terbatas (4 sekaligus) setelah username
 *     dialokasikan berurutan (menghindari dua "zain" saling menabrak).
 *
 * - business_code (A-1, S-1, …) dibiarkan NULL agar trigger DB
 *   (next_business_id) yang membuat ID internal otomatis — race-safe.
 * - Nama Halaqah pada import santri opsional: baris dengan nama yang cocok
 *   (case-insensitive — "ALIF", "Alif", "alif" dianggap sama) ditautkan ke
 *   halaqah via halaqah_students (RLS V8 mengizinkan ADMIN; KOORDINATOR hanya
 *   jika lembaga mengizinkan — error dilaporkan sebagai catatan, data santri
 *   tetap terimport).
 */

const MAX_ROWS = 500;
const ACCOUNT_CONCURRENCY = 4;

export type ImportSummary = ActionResult & {
  data?: {
    inserted: number;
    /** Jumlah baris yang TIDAK diimport (level "error"). */
    skipped: number;
    errors: ImportIssue[];
    /** true → masalah sistemik (skema/kebijakan DB); klien berhenti mengirim potongan berikutnya. */
    fatal?: boolean;
  };
};

type Db = Awaited<ReturnType<typeof createClient>>;

function revalidateGuruSantri() {
  // V12: menu Data Guru & Data Santri terpisah (admin + koordinator).
  revalidatePath("/admin/guru");
  revalidatePath("/admin/santri");
  revalidatePath("/koordinator/guru");
  revalidatePath("/koordinator/santri");
  revalidatePath("/admin");
  revalidatePath("/koordinator");
}

function readRows(kind: ImportKind, formData: FormData): { rows: ImportRow[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("payload") ?? "[]"));
  } catch {
    return { error: "Data import tidak valid." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return { error: "Tidak ada baris untuk diimport." };
  if (parsed.length > MAX_ROWS) return { error: `Maksimal ${MAX_ROWS} baris per permintaan.` };
  return { rows: parsed.map((r) => canonicalizeRow(kind, r)) };
}

/** Akun login dibuat lewat service-role — tanpa kuncinya import akan setengah jalan, jadi hentikan lebih awal. */
function accountEnvError(): string | null {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      "SUPABASE_SERVICE_ROLE_KEY belum diatur di environment server (Vercel → Settings → Environment Variables). " +
      "Akun login otomatis tidak dapat dibuat, sehingga import dibatalkan agar data tidak tersimpan setengah jalan."
    );
  }
  return null;
}

/** Jalankan `worker` untuk semua item dengan paling banyak `limit` proses bersamaan. */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

/**
 * Insert batch; bila gagal, ulangi per baris agar baris bermasalah terisolasi
 * dan dilaporkan dengan nomor baris. Error sistemik (kolom/tabel/RLS) langsung
 * dikembalikan sebagai `fatal` — mengulang per baris tidak ada gunanya.
 * Insert TANPA `.select()`: hanya butuh policy INSERT; id sudah dibuat di sini.
 */
async function insertRows(
  db: Db,
  table: "teachers" | "students",
  rows: ({ id: string } & Record<string, unknown>)[],
  rowNums: number[],
  issues: ImportIssue[]
): Promise<{ okIds: Set<string>; fatal?: string }> {
  const okIds = new Set<string>();
  const batch = await db.from(table).insert(rows);
  if (!batch.error) {
    for (const r of rows) okIds.add(r.id);
    return { okIds };
  }
  if (isSystemicDbError(batch.error)) return { okIds, fatal: friendlyDbError(batch.error, table) };

  for (let i = 0; i < rows.length; i++) {
    const one = await db.from(table).insert(rows[i]);
    if (!one.error) {
      okIds.add(rows[i].id);
      continue;
    }
    if (isSystemicDbError(one.error)) return { okIds, fatal: friendlyDbError(one.error, table) };
    issues.push({ row: rowNums[i], reason: friendlyDbError(one.error, table), level: "error" });
  }
  return { okIds };
}

function finish(issues: ImportIssue[]): ImportIssue[] {
  return [...issues].sort((a, b) => a.row - b.row);
}

function countSkipped(issues: ImportIssue[]): number {
  return issues.filter((i) => i.level === "error").length;
}

/**
 * Import GURU: A. Identitas | B. Nama | C. Panggilan | D. Gelar Depan |
 * E. Gelar Belakang | F. Gender | G. Kode Halaqah | H. WhatsApp |
 * I. Username | J. Kata Sandi
 *
 * V12.2 — AKUN LOGIN GURU OTOMATIS: kolom I/J kosong → akun dibuat otomatis
 * dari NAMA PANGGILAN (username = panggilan, unik global — zain → zain2 bila
 * sudah dipakai di seluruh sistem; password = panggilan+1234, mis. zain1234).
 * Kolom I/J diisi → dipakai apa adanya (password ≥ 8 karakter). Hanya I terisi
 * → password default; hanya J terisi → username otomatis.
 */
export async function importTeachersAction(
  _prev: ImportSummary | null,
  formData: FormData
): Promise<ImportSummary> {
  const profile = await getSessionProfile();
  if (!profile || !["ADMIN", "KOORDINATOR"].includes(profile.role) || !profile.tenantId) {
    return { error: "Akses ditolak." };
  }
  const envError = accountEnvError();
  if (envError) return { error: envError };

  const read = readRows("guru", formData);
  if ("error" in read) return { error: read.error };
  const { rows } = read;

  const tid = profile.tenantId;
  const db = await createClient();
  const issues: ImportIssue[] = [];
  const prepared: (ValidTeacherRow & { id: string })[] = [];
  const seenUsername = new Map<string, number>();
  let halaqahColumnUsed = false;

  rows.forEach((row, i) => {
    const rowNum = rowNumberOf(row, i);
    const r = validateTeacherRow(row, rowNum);
    if (!r.ok) {
      issues.push({ row: rowNum, reason: r.reason, level: "error" });
      return;
    }
    const v = r.value;
    if (v.username) {
      const dup = seenUsername.get(v.username);
      if (dup) {
        issues.push({ row: rowNum, reason: `Username "${v.username}" duplikat dengan baris ${dup}`, level: "error" });
        return;
      }
      seenUsername.set(v.username, rowNum);
    }
    if (v.halaqahCode) halaqahColumnUsed = true;
    // Kolom A/D/E (identitas, gelar) disimpan pada fitur terkait masing-masing;
    // identitas kepegawaian dikelola lewat Pengaturan → Identitas
    // (teacher_identities V2) — tidak diblokir di sini.
    prepared.push({ ...v, id: randomUUID() });
  });

  if (prepared.length === 0) {
    return {
      error: "Semua baris gagal divalidasi.",
      data: { inserted: 0, skipped: countSkipped(issues), errors: finish(issues) },
    };
  }

  const ins = await insertRows(
    db,
    "teachers",
    prepared.map((p) => ({
      id: p.id,
      tenant_id: tid,
      full_name: p.fullName,
      gender: p.gender,
      nickname: p.nickname,
      whatsapp: p.whatsapp,
    })),
    prepared.map((p) => p.rowNum),
    issues
  );
  if (ins.fatal) {
    return {
      error: `Gagal menyimpan data guru: ${ins.fatal}`,
      data: { inserted: 0, skipped: rows.length, errors: finish(issues), fatal: true },
    };
  }

  // V12.2 — akun login guru. Alokasi username BERURUTAN (mencegah dua "zain"
  // saling menabrak), pembuatan akun PARALEL terbatas. Username eksplisit di
  // file dicadangkan lebih dulu agar alokasi otomatis tidak mengambilnya.
  const created = prepared.filter((p) => ins.okIds.has(p.id));
  const taken = new Set<string>(created.map((p) => p.username).filter(Boolean));
  const jobs: { p: ValidTeacherRow & { id: string }; username: string; password: string }[] = [];
  for (const p of created) {
    try {
      let username = p.username;
      let password = p.password;
      if (!username) {
        const creds = await allocateAccount(p.fullName, p.nickname, { taken });
        username = creds.username;
        if (!password) password = creds.password;
      } else if (!password) {
        password = defaultPasswordFor(p.fullName, p.nickname);
      }
      taken.add(username);
      jobs.push({ p, username, password });
    } catch (e) {
      issues.push({
        row: p.rowNum,
        reason: `Akun login ${p.fullName} gagal: ${e instanceof Error ? e.message : "unknown"}`,
        level: "warning",
      });
    }
  }
  await runPool(jobs, ACCOUNT_CONCURRENCY, async ({ p, username, password }) => {
    try {
      const accErr = await createLoginAccount({
        tenantId: tid,
        personId: p.id,
        fullName: p.fullName,
        kind: "teacher",
        username,
        password,
        nickname: p.nickname,
      });
      if (accErr) issues.push({ row: p.rowNum, reason: `Akun login ${p.fullName} gagal: ${accErr}`, level: "warning" });
    } catch (e) {
      issues.push({
        row: p.rowNum,
        reason: `Akun login ${p.fullName} gagal: ${e instanceof Error ? e.message : "unknown"}`,
        level: "warning",
      });
    }
  });

  if (halaqahColumnUsed) {
    issues.push({
      row: 0,
      reason: "Kolom G (Kode Halaqah) pada import guru belum diproses — atur penugasan guru lewat menu Halaqah.",
      level: "warning",
    });
  }

  const inserted = ins.okIds.size;
  const skipped = countSkipped(issues);
  if (inserted === 0) {
    return { error: "Tidak ada guru yang berhasil disimpan.", data: { inserted, skipped, errors: finish(issues) } };
  }
  revalidateGuruSantri();
  return {
    success: `${inserted} guru berhasil diimport (akun login otomatis dari nama panggilan — password panggilan+1234)${
      issues.length ? `, ${issues.length} catatan` : ""
    }.`,
    data: { inserted, skipped, errors: finish(issues) },
  };
}

/** Import SANTRI: A. NIS | B. NISN | C. Nama | D. Panggilan | E. Gender | F. Nama Wali | G. Nama Halaqah | H. WhatsApp Wali */
export async function importStudentsAction(
  _prev: ImportSummary | null,
  formData: FormData
): Promise<ImportSummary> {
  const profile = await getSessionProfile();
  if (!profile || !["ADMIN", "KOORDINATOR"].includes(profile.role) || !profile.tenantId) {
    return { error: "Akses ditolak." };
  }
  const envError = accountEnvError();
  if (envError) return { error: envError };

  const read = readRows("santri", formData);
  if ("error" in read) return { error: read.error };
  const { rows } = read;

  const tid = profile.tenantId;
  const db = await createClient();
  const issues: ImportIssue[] = [];
  let prepared: (ValidStudentRow & { id: string })[] = [];

  // NIS/NISN unik per lembaga — deteksi duplikat dalam potongan yang sama.
  const nisSeen = new Map<string, number>();
  const nisnSeen = new Map<string, number>();
  rows.forEach((row, i) => {
    const rowNum = rowNumberOf(row, i);
    const r = validateStudentRow(row, rowNum);
    if (!r.ok) {
      issues.push({ row: rowNum, reason: r.reason, level: "error" });
      return;
    }
    const v = r.value;
    if (v.nis) {
      const dup = nisSeen.get(v.nis);
      if (dup) {
        issues.push({ row: rowNum, reason: `NIS "${v.nis}" duplikat dengan baris ${dup}`, level: "error" });
        return;
      }
      nisSeen.set(v.nis, rowNum);
    }
    if (v.nisn) {
      const dup = nisnSeen.get(v.nisn);
      if (dup) {
        issues.push({ row: rowNum, reason: `NISN "${v.nisn}" duplikat dengan baris ${dup}`, level: "error" });
        return;
      }
      nisnSeen.set(v.nisn, rowNum);
    }
    prepared.push({ ...v, id: randomUUID() });
  });

  // Duplikat NIS/NISN yang sudah ada di lembaga dilaporkan per baris —
  // santri lain tetap terimport. (Bila policy SELECT database membatasi baris
  // yang terlihat, unique index tetap menangkapnya saat insert per baris.)
  const dbNis = new Set<string>();
  const dbNisn = new Set<string>();
  if (nisSeen.size > 0) {
    const { data } = await db
      .from("students")
      .select("nis")
      .eq("tenant_id", tid)
      .in("nis", Array.from(nisSeen.keys()));
    for (const s of data ?? []) if (s.nis) dbNis.add(String(s.nis));
  }
  if (nisnSeen.size > 0) {
    const { data } = await db
      .from("students")
      .select("nisn")
      .eq("tenant_id", tid)
      .in("nisn", Array.from(nisnSeen.keys()));
    for (const s of data ?? []) if (s.nisn) dbNisn.add(String(s.nisn));
  }
  prepared = prepared.filter((p) => {
    if (p.nis && dbNis.has(p.nis)) {
      issues.push({ row: p.rowNum, reason: `NIS "${p.nis}" sudah terdaftar di lembaga ini`, level: "error" });
      return false;
    }
    if (p.nisn && dbNisn.has(p.nisn)) {
      issues.push({ row: p.rowNum, reason: `NISN "${p.nisn}" sudah terdaftar di lembaga ini`, level: "error" });
      return false;
    }
    return true;
  });

  if (prepared.length === 0) {
    return {
      error: "Semua baris gagal divalidasi.",
      data: { inserted: 0, skipped: countSkipped(issues), errors: finish(issues) },
    };
  }

  // Resolusi NAMA halaqah → id (sekali saja per potongan), TIDAK peka
  // huruf besar/kecil: "ALIF" di file tetap tertaut ke halaqah bernama "Alif".
  // Dicocokkan di JS (bukan `.ilike` per nama) supaya satu query saja cukup
  // dan pencocokan dua arah (spasi berlebih, dsb.) konsisten dengan pratinjau.
  const nameSet = new Set(
    prepared.map((p) => p.halaqahName.trim().toLowerCase()).filter(Boolean)
  );
  const halaqahByName = new Map<string, string>();
  if (nameSet.size > 0) {
    const { data: halaqahs } = await db
      .from("halaqahs")
      .select("id, name")
      .eq("tenant_id", tid);
    for (const h of halaqahs ?? []) {
      const key = String(h.name ?? "").trim().toLowerCase();
      if (key && nameSet.has(key)) halaqahByName.set(key, String(h.id));
    }
  }

  const ins = await insertRows(
    db,
    "students",
    prepared.map((p) => ({
      id: p.id,
      tenant_id: tid,
      full_name: p.fullName,
      gender: p.gender,
      nickname: p.nickname,
      nis: p.nis,
      nisn: p.nisn,
      guardian_name: p.guardianName,
      guardian_whatsapp: p.guardianWhatsapp,
    })),
    prepared.map((p) => p.rowNum),
    issues
  );
  if (ins.fatal) {
    return {
      error: `Gagal menyimpan data santri: ${ins.fatal}`,
      data: { inserted: 0, skipped: rows.length, errors: finish(issues), fatal: true },
    };
  }
  const created = prepared.filter((p) => ins.okIds.has(p.id));

  // V12.2 — AKUN LOGIN SANTRI OTOMATIS: username = nama panggilan (unik
  // global — zain → zain2 bila sudah dipakai di seluruh sistem), password =
  // panggilan+1234 (mis. zain → zain1234). Username dialokasikan berurutan
  // (`taken` mencegah dua baris "zain" menabrak), akun dibuat paralel terbatas.
  // Gagal satu santri = catatan; santri lain tetap terimport.
  const taken = new Set<string>();
  const jobs: { p: ValidStudentRow & { id: string }; username: string; password: string; nickname: string }[] = [];
  for (const p of created) {
    try {
      const creds = await allocateAccount(p.fullName, p.nickname, { taken });
      taken.add(creds.username);
      jobs.push({ p, username: creds.username, password: creds.password, nickname: creds.nickname });
    } catch (e) {
      issues.push({
        row: p.rowNum,
        reason: `Akun login ${p.fullName} gagal: ${e instanceof Error ? e.message : "unknown"}`,
        level: "warning",
      });
    }
  }
  await runPool(jobs, ACCOUNT_CONCURRENCY, async ({ p, username, password, nickname }) => {
    try {
      const accErr = await createLoginAccount({
        tenantId: tid,
        personId: p.id,
        fullName: p.fullName,
        kind: "student",
        username,
        password,
        nickname,
      });
      if (accErr) issues.push({ row: p.rowNum, reason: `Akun login ${p.fullName} gagal: ${accErr}`, level: "warning" });
    } catch (e) {
      issues.push({
        row: p.rowNum,
        reason: `Akun login ${p.fullName} gagal: ${e instanceof Error ? e.message : "unknown"}`,
        level: "warning",
      });
    }
  });

  // Tautkan halaqah (baris dengan kode cocok) — batch insert; error hanya
  // dilaporkan sebagai catatan, tidak membatalkan import santri.
  const memberRows: { tenant_id: string; halaqah_id: string; student_id: string }[] = [];
  for (const p of created) {
    if (!p.halaqahName) continue;
    const halaqahId = halaqahByName.get(p.halaqahName.trim().toLowerCase());
    if (!halaqahId) {
      issues.push({
        row: p.rowNum,
        reason: `Halaqah "${p.halaqahName}" tidak ditemukan — santri terimport tanpa halaqah`,
        level: "warning",
      });
      continue;
    }
    memberRows.push({ tenant_id: tid, halaqah_id: halaqahId, student_id: p.id });
  }
  if (memberRows.length > 0) {
    const { error: mErr } = await db.from("halaqah_students").insert(memberRows);
    if (mErr) {
      issues.push({
        row: 0,
        reason: `Penautan halaqah gagal untuk ${memberRows.length} santri: ${mErr.message}`,
        level: "warning",
      });
    }
  }

  const inserted = ins.okIds.size;
  const skipped = countSkipped(issues);
  if (inserted === 0) {
    return { error: "Tidak ada santri yang berhasil disimpan.", data: { inserted, skipped, errors: finish(issues) } };
  }
  revalidateGuruSantri();
  return {
    success: `${inserted} santri berhasil diimport (akun login otomatis dari nama panggilan — password panggilan+1234)${
      issues.length ? `, ${issues.length} catatan` : ""
    }.`,
    data: { inserted, skipped, errors: finish(issues) },
  };
}
