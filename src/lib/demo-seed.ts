import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { allocateAccount, createLoginAccount } from "@/lib/account";

/**
 * TAHFIZH V12.3 — Data & akun DEMO otomatis untuk lembaga baru.
 *
 * Dipanggil dari registerLembagaAction (dan supabase/seed-dummy.ts) sehingga
 * SETIAP lembaga yang mendaftar langsung punya:
 *   - 3 guru, 3 santri, 2 halaqah (pengampu + anggota), 1 tagihan infak lunas
 *   - AKUN LOGIN siap pakai dengan aturan V12.2: username = nama panggilan
 *     (unik global — zain → zain2 bila dipakai di seluruh sistem), password =
 *     panggilan + "1234" (zain1234), wajib ganti password saat login pertama.
 *
 * Keamanan: hanya berjalan di server (server-only) memakai service role,
 * dipanggil SETELAH registrasi/verifikasi role; semua insert idempoten
 * (cek existing dulu) sehingga aman dipanggil berulang.
 *
 * Akun demo (password = panggilan+1234, mis. ahmad1234):
 *   Guru   : Ahmad (USTADZ), Siti (USTADZ), Rahmat (USTADZ)
 *   Santri : Zain (WALI_SANTRI/"Santri"), Zahra, Yusuf
 */

export type DemoSeedResult = {
  ok: boolean;
  accounts: { label: string; username: string; password: string; role: string }[];
  errors: string[];
};

const PASSWORD_HINT_SUFFIX = "1234";

const DEMO_TEACHERS = [
  { full_name: "Ustadz Ahmad Fauzi", nickname: "Ahmad", gender: "L" as const, whatsapp: "081234567001" },
  { full_name: "Ustadzah Siti Aminah", nickname: "Siti", gender: "P" as const, whatsapp: "081234567002" },
  { full_name: "Ustadz Rahmat Hidayat", nickname: "Rahmat", gender: "L" as const, whatsapp: "081234567003" },
];

const DEMO_STUDENTS = [
  { full_name: "Zain Arifin", nickname: "Zain", gender: "L" as const, guardian_name: "Bapak Hasyim", guardian_whatsapp: "089876543201" },
  { full_name: "Zahra Nurjannah", nickname: "Zahra", gender: "P" as const, guardian_name: "Bapak Salim", guardian_whatsapp: "089876543202" },
  { full_name: "Yusuf Maulana", nickname: "Yusuf", gender: "L" as const, guardian_name: "Bapak Umar", guardian_whatsapp: "089876543203" },
];

export async function seedDemoData(input: {
  tenantId: string;
  adminProfileId: string;
  adminName?: string | null;
}): Promise<DemoSeedResult> {
  const admin = createAdminClient();
  const tid = input.tenantId;
  const accounts: DemoSeedResult["accounts"] = [];
  const errors: string[] = [];
  // Username yang dialokasikan dalam run yang sama — mencegah dua "Zain"
  // saling menabrak sebelum tersimpan.
  const taken = new Set<string>();

  const fail = (label: string, msg: string) => errors.push(`${label}: ${msg}`);

  // ------------------------------------------------------------------ GURU
  const teacherIds: string[] = [];
  for (const t of DEMO_TEACHERS) {
    let teacherId: string | undefined;
    const { data: existing } = await admin
      .from("teachers")
      .select("id")
      .eq("tenant_id", tid)
      .eq("full_name", t.full_name)
      .maybeSingle();
    if (existing) {
      teacherId = existing.id;
    } else {
      const { data, error } = await admin
        .from("teachers")
        .insert({ tenant_id: tid, full_name: t.full_name, nickname: t.nickname, gender: t.gender, whatsapp: t.whatsapp })
        .select("id")
        .single();
      if (error || !data) {
        fail(t.full_name, error?.message ?? "gagal insert");
        continue;
      }
      teacherId = data.id;
    }
    if (!teacherId) continue; // tidak mungkin, guard TS untuk id opsional
    teacherIds.push(teacherId);

    // Akun login guru (skip bila sudah punya username).
    const { data: tRow } = await admin.from("teachers").select("login_username").eq("id", teacherId).maybeSingle();
    if (tRow?.login_username) {
      accounts.push({ label: t.nickname, username: tRow.login_username, password: `${normalizeBase(t.nickname)}${PASSWORD_HINT_SUFFIX}`, role: "Guru" });
      continue;
    }
    const creds = await allocateAccount(t.full_name, t.nickname, { taken });
    taken.add(creds.username);
    const accErr = await createLoginAccount({
      tenantId: tid,
      personId: teacherId,
      fullName: t.full_name,
      kind: "teacher",
      username: creds.username,
      password: creds.password,
      nickname: creds.nickname,
    });
    if (accErr) fail(`akun guru ${t.nickname}`, accErr);
    else accounts.push({ label: t.nickname, username: creds.username, password: creds.password, role: "Guru" });
  }

  // ----------------------------------------------------------------- SANTRI
  const studentIds: string[] = [];
  for (const s of DEMO_STUDENTS) {
    let studentId: string | undefined;
    const { data: existing } = await admin
      .from("students")
      .select("id")
      .eq("tenant_id", tid)
      .eq("full_name", s.full_name)
      .maybeSingle();
    if (existing) {
      studentId = existing.id;
    } else {
      const { data, error } = await admin
        .from("students")
        .insert({
          tenant_id: tid,
          full_name: s.full_name,
          nickname: s.nickname,
          gender: s.gender,
          guardian_name: s.guardian_name,
          guardian_whatsapp: s.guardian_whatsapp,
        })
        .select("id")
        .single();
      if (error || !data) {
        fail(s.full_name, error?.message ?? "gagal insert");
        continue;
      }
      studentId = data.id;
    }
    if (!studentId) continue; // tidak mungkin, guard TS untuk id opsional
    studentIds.push(studentId);

    const { data: sRow } = await admin.from("students").select("login_username").eq("id", studentId).maybeSingle();
    if (sRow?.login_username) {
      accounts.push({ label: s.nickname, username: sRow.login_username, password: `${normalizeBase(s.nickname)}${PASSWORD_HINT_SUFFIX}`, role: "Santri" });
      continue;
    }
    const creds = await allocateAccount(s.full_name, s.nickname, { taken });
    taken.add(creds.username);
    const accErr = await createLoginAccount({
      tenantId: tid,
      personId: studentId,
      fullName: s.full_name,
      kind: "student",
      username: creds.username,
      password: creds.password,
      nickname: creds.nickname,
    });
    if (accErr) fail(`akun santri ${s.nickname}`, accErr);
    else accounts.push({ label: s.nickname, username: creds.username, password: creds.password, role: "Santri" });
  }

  // ---------------------------------------------------------------- HALAQAH
  // 2 halaqah: Ahmad & Rahmat mengampu Al-Fatih, Siti mengampu An-Nur.
  const halaqahPlan = [
    { name: "Halaqah Al-Fatih", teacherIdx: [0, 2], studentIdx: [0] },
    { name: "Halaqah An-Nur", teacherIdx: [1], studentIdx: [1, 2] },
  ];
  for (const h of halaqahPlan) {
    const { data: existing } = await admin
      .from("halaqahs")
      .select("id")
      .eq("tenant_id", tid)
      .eq("name", h.name)
      .maybeSingle();
    let hid = existing?.id as string | undefined;
    if (!hid) {
      const { data, error } = await admin
        .from("halaqahs")
        .insert({ tenant_id: tid, name: h.name, description: `Demo — ${h.name}` })
        .select("id")
        .single();
      if (error || !data) {
        fail(h.name, error?.message ?? "gagal insert");
        continue;
      }
      hid = data.id;
    }

    for (let i = 0; i < h.teacherIdx.length; i++) {
      const tIdx = h.teacherIdx[i];
      const teacherId = teacherIds[tIdx];
      if (!teacherId) continue;
      await admin.from("halaqah_teachers").upsert(
        { tenant_id: tid, halaqah_id: hid, teacher_id: teacherId, is_primary: i === 0 },
        { onConflict: "halaqah_id,teacher_id" }
      );
    }
    for (const sIdx of h.studentIdx) {
      const studentId = studentIds[sIdx];
      if (!studentId) continue;
      const { data: member } = await admin
        .from("halaqah_students")
        .select("id")
        .eq("halaqah_id", hid)
        .eq("student_id", studentId)
        .is("left_at", null)
        .maybeSingle();
      if (!member) {
        await admin.from("halaqah_students").insert({ tenant_id: tid, halaqah_id: hid, student_id: studentId });
      }
    }
  }

  // ------------------------------------------------------------------ INFAK
  // 1 tagihan bulan berjalan LUNAS untuk santri pertama (PAID → walinya tidak
  // terkunci payment gate V10; dashboard hidup).
  const now = new Date();
  const { data: activeYear } = await admin
    .from("academic_years")
    .select("name")
    .eq("tenant_id", tid)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle();
  const academicYearLabel = activeYear?.name ?? `${now.getFullYear()}/${now.getFullYear() + 1}`;
  if (studentIds[0]) {
    const { data: existingInv } = await admin
      .from("payment_invoices")
      .select("id")
      .eq("tenant_id", tid)
      .eq("student_id", studentIds[0])
      .eq("academic_year", academicYearLabel)
      .eq("year", now.getFullYear())
      .eq("month", now.getMonth() + 1)
      .maybeSingle();
    if (!existingInv) {
      const { error } = await admin.from("payment_invoices").insert({
        tenant_id: tid,
        student_id: studentIds[0],
        academic_year: academicYearLabel,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        amount: 10000,
        status: "PAID",
        paid_at: now.toISOString(),
        paid_via: "MANUAL",
      });
      if (error) fail("infak demo", error.message);
    }
  }

  return {
    ok: errors.length === 0,
    accounts,
    errors,
  };
}

function normalizeBase(raw: string): string {
  const v = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return v || "santri";
}
