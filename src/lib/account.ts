import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * TAHFIZH V12.2 — Akun login otomatis dari nama panggilan.
 *
 * Aturan (permintaan pengguna):
 *   - Username  = nama panggilan, dinormalisasi (huruf kecil, alfanumerik).
 *     Bila sudah dipakai di SELURUH SISTEM → panggilan+2, panggilan+3, dst.
 *     (zain → zain2 → zain3).
 *   - Password  = nama panggilan + "1234" (zain → zain1234) — untuk santri
 *     DAN guru. Aman: password dikirim ke Supabase Auth (di-hash), tidak pernah
 *     disimpan plaintext di database.
 *   - Username unik GLOBAL (lintas lembaga) — mengikuti unique index
 *     profiles.username yang sudah ada (migration V12 search_accounts).
 *
 * Semua fungsi HANYA dipanggil dari server action yang sudah memverifikasi
 * session ADMIN/KOORDINATOR. Pemeriksaan username memakai service role.
 */

const PASSWORD_SUFFIX = "1234";

/** "Zain!" → "zain"; kosong/angka semua → fallback. */
export function normalizeUsernameBase(raw: string): string {
  const v = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (!v || /^[0-9]+$/.test(v)) return "santri";
  return v.slice(0, 24);
}

/** Nama panggilan efektif: kolom panggilan, atau kata pertama nama lengkap. */
export function deriveNickname(fullName: string, nickname?: string | null): string {
  const n = (nickname ?? "").trim();
  if (n) return n;
  return (fullName.trim().split(/\s+/)[0] ?? "").trim();
}

/**
 * Cari username berikutnya yang belum dipakai DI SELURUH SISTEM:
 * cek profiles.username (semua akun) + students.login_username + (opsional)
 * teachers.login_username + kandidat yang sudah dialokasikan dalam batch yang
 * sama (import multi-baris). zain dipakai → zain2 → zain3 → …
 */
export async function allocateUsername(
  base: string,
  opts?: { taken?: Set<string> }
): Promise<string> {
  const admin = createAdminClient();
  const taken = opts?.taken ?? new Set<string>();

  const isFree = (u: string) => !taken.has(u);

  const candidate = normalizeUsernameBase(base);
  if (isFree(candidate)) {
    const [{ data: prof }, { data: stu }, { data: tea }] = await Promise.all([
      admin.from("profiles").select("id").ilike("username", candidate).limit(1),
      admin.from("students").select("id").ilike("login_username", candidate).limit(1),
      admin.from("teachers").select("id").ilike("login_username", candidate).limit(1),
    ]);
    if (!prof?.length && !stu?.length && !tea?.length) return candidate;
  }

  for (let n = 2; n <= 999; n++) {
    const u = `${candidate}${n}`;
    if (!isFree(u)) continue;
    const [{ data: prof }, { data: stu }, { data: tea }] = await Promise.all([
      admin.from("profiles").select("id").ilike("username", u).limit(1),
      admin.from("students").select("id").ilike("login_username", u).limit(1),
      admin.from("teachers").select("id").ilike("login_username", u).limit(1),
    ]);
    if (!prof?.length && !stu?.length && !tea?.length) return u;
    taken.add(u); // kecilkan pencarian berikutnya
  }
  // Praktis mustahil (999 kandidat); fallback aman dengan timestamp.
  return `${candidate}${Date.now().toString(36).slice(-4)}`;
}

/**
 * Hasil alokasi akun untuk satu orang: username final (unik global) +
 * password = panggilan + 1234 (memakai BASE panggilan, bukan username final —
 * "zain" dipakai orang lain → username zain2, password tetap zain1234).
 */
export async function allocateAccount(
  fullName: string,
  nickname?: string | null,
  opts?: { taken?: Set<string> }
): Promise<{ username: string; password: string; nickname: string }> {
  const nick = deriveNickname(fullName, nickname);
  const base = normalizeUsernameBase(nick);
  const username = await allocateUsername(base, opts);
  return { username, password: `${base}${PASSWORD_SUFFIX}`, nickname: nick };
}

/**
 * Password default tanpa alokasi username: panggilan + 1234. Dipakai import
 * guru bila file mengisi Username (kolom I) tetapi Kata Sandi (kolom J)
 * kosong — mis. file hasil Export, yang memuat username namun tidak pernah
 * memuat password.
 */
export function defaultPasswordFor(fullName: string, nickname?: string | null): string {
  return `${normalizeUsernameBase(deriveNickname(fullName, nickname))}${PASSWORD_SUFFIX}`;
}

/**
 * Buat akun login Supabase untuk SANTRI atau GURU.
 * Return null bila sukses, atau pesan error (data tetap tersimpan — pemanggil
 * hanya melaporkan catatan).
 */
export async function createLoginAccount(input: {
  tenantId: string;
  personId: string;
  fullName: string;
  kind: "student" | "teacher";
  username: string;
  password: string;
  nickname?: string | null;
}): Promise<string | null> {
  const admin = createAdminClient();
  const syntheticEmail =
    input.kind === "student"
      ? `${input.username}@santri.tahfizh.local`
      : `${input.username}@guru.tahfizh.local`;

  // 1. User auth (email dikonfirmasi — akun dibuat admin, tanpa verifikasi).
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName, username: input.username },
  });
  if (userErr || !userData.user) {
    const msg = userErr?.message ?? "unknown";
    return /already|duplicate/i.test(msg) ? "username sudah dipakai" : msg;
  }

  // 2. Profile: role WALI_SANTRI (label "Santri") / USTADZ (label "Guru"),
  //    wajib ganti password saat login pertama.
  const role = input.kind === "student" ? "WALI_SANTRI" : "USTADZ";
  const { error: profErr } = await admin.from("profiles").upsert({
    id: userData.user.id,
    full_name: input.fullName,
    role,
    tenant_id: input.tenantId,
    username: input.username,
    must_change_password: true,
  });
  if (profErr) return `gagal membuat profil: ${profErr.message}`;

  // 3. Snapshot username + link UUID profil ke person (students/teachers).
  //    V12.11: teachers.profile_id = profiles.id — modul guru men-resolve
  //    baris mereka via UUID ini, bukan pencocokan nama.
  const table = input.kind === "student" ? "students" : "teachers";
  const personUpdate: Record<string, string> = { login_username: input.username };
  if (input.kind === "teacher") personUpdate.profile_id = userData.user.id;
  const { error: linkErr } = await admin
    .from(table)
    .update(personUpdate)
    .eq("id", input.personId);
  if (linkErr) return `gagal menautkan username: ${linkErr.message}`;

  // V16 — untuk kind "student": trigger DB students_self_guardian_link (lihat
  // migrasi 20260920220000) otomatis membuat baris guardians +
  // guardian_students begitu login_username di atas tersimpan, menjadikan
  // akun ini "wali dari dirinya sendiri". Tanpa ini, /santri/infak,
  // /santri/anak, dan dasbor /santri akan selalu tampak "belum terhubung"
  // walau akun sudah jelas tertaut ke datanya sendiri via login_username —
  // JANGAN hapus trigger tersebut tanpa mengganti mekanismenya di sini.
  return null;
}
