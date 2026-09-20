/**
 * TAHFIZH — Seed data DUMMY untuk mencoba aplikasi (V12).
 *
 * Membuat di lembaga ADMIN yang diberikan (via --email):
 *   - 3 guru, 3 santri
 *   - 2 halaqah (masing-masing dengan guru pengampu + anggota)
 *   - 2 tahun akademik (1 aktif + 1 arsip) beserta semester
 *   - 1 tagihan infak (bulan berjalan, satu santri, PAID supaya dashboard hidup)
 *   - 1 raport DRAFT dengan data lengkap: salinan template lembaga + snapshot
 *     data nilai supaya preview raport terlihat penuh
 *   - AKUN LOGIN guru & santri (V12.3, via src/lib/demo-seed.ts — modul yang
 *     sama dengan pendaftaran lembaga baru): username = nama panggilan
 *     (unik global — zain → zain2 bila dipakai), password = panggilan+1234
 *     (mis. zain → zain1234), wajib ganti password saat login pertama.
 *
 * Idempoten: aman dijalankan berulang (cek existing dulu per langkah).
 *
 * Pemakaian:
 *   bun supabase/seed-dummy.ts --email admin@lembaga.sch.id
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service role
 * diperlukan untuk menembus RLS saat seeding data demo).
 */
import { createClient } from "@supabase/supabase-js";
import { seedDemoData } from "../src/lib/demo-seed";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const args = process.argv.slice(2);
const emailIdx = args.indexOf("--email");
const adminEmail = emailIdx !== -1 ? args[emailIdx + 1] : undefined;

if (!adminEmail) {
  console.error("Pemakaian: bun supabase/seed-dummy.ts --email <email-admin-lembaga>");
  process.exit(1);
}

function log(step: string, msg: string) {
  console.log(`  ${step}  ${msg}`);
}

async function main() {
  // 0. Cari admin + tenant
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, tenant_id, full_name, role")
    .eq("email", adminEmail)
    .maybeSingle();
  if (pErr || !profile || !profile.tenant_id) {
    console.error(`Admin dengan email ${adminEmail} tidak ditemukan / belum punya lembaga.`);
    process.exit(1);
  }
  const tid = profile.tenant_id as string;
  log("●", `Lembaga ditemukan (admin: ${profile.full_name}).`);

  // V12.3 — guru & santri + akun login dibuat lewat SATU modul bersama
  // (idempoten, sama dengan yang dipakai pendaftaran lembaga baru).
  const demo = await seedDemoData({ tenantId: tid, adminProfileId: profile.id, adminName: profile.full_name });
  if (demo.errors.length > 0) {
    for (const e of demo.errors) console.warn(`  !  ${e}`);
  }
  for (const a of demo.accounts) {
    log("✓", `${a.role} ${a.label} — akun: ${a.username} / ${a.password}`);
  }

  // 1. GURU — id lembaga (sudah dibuat seedDemoData; fallback bila tabel kosong)
  const guruNames = [
    { full_name: "Ustadz Ahmad Fauzi", nickname: "Ahmad", gender: "L" as const, whatsapp: "081234567001" },
    { full_name: "Ustadzah Siti Aminah", nickname: "Siti", gender: "P" as const, whatsapp: "081234567002" },
    { full_name: "Ustadz Rahmat Hidayat", nickname: "Rahmat", gender: "L" as const, whatsapp: "081234567003" },
  ];
  const teacherIds: string[] = [];
  for (const g of guruNames) {
    const { data: existing } = await admin
      .from("teachers")
      .select("id")
      .eq("tenant_id", tid)
      .eq("full_name", g.full_name)
      .maybeSingle();
    if (existing) {
      teacherIds.push(existing.id);
      continue;
    }
    const { data, error } = await admin
      .from("teachers")
      .insert({ tenant_id: tid, ...g })
      .select("id")
      .single();
    if (error || !data) {
      console.error("Gagal membuat guru:", error?.message);
      process.exit(1);
    }
    teacherIds.push(data.id);
  }
  log("✓", "3 guru dummy siap.");

  // 2. SANTRI — 3 orang
  const santriNames = [
    { full_name: "Zain Arifin", nickname: "Zain", gender: "L" as const },
    { full_name: "Zahra Nurjannah", nickname: "Zahra", gender: "P" as const },
    { full_name: "Yusuf Maulana", nickname: "Yusuf", gender: "L" as const },
  ];
  const studentIds: string[] = [];
  for (const s of santriNames) {
    const { data: existing } = await admin
      .from("students")
      .select("id")
      .eq("tenant_id", tid)
      .eq("full_name", s.full_name)
      .maybeSingle();
    if (existing) {
      studentIds.push(existing.id);
      continue;
    }
    const { data, error } = await admin
      .from("students")
      .insert({ tenant_id: tid, ...s })
      .select("id")
      .single();
    if (error || !data) {
      console.error("Gagal membuat santri:", error?.message);
      process.exit(1);
    }
    studentIds.push(data.id);
  }
  log("✓", "3 santri dummy siap.");

  // 3. TAHUN AKADEMIK — 2 (1 aktif + 1 arsip) + semester
  const nowYear = new Date().getFullYear();
  const years = [
    { name: `${nowYear - 1}/${nowYear}`, status: "ARCHIVE" as const, start: `${nowYear - 1}-07-01`, end: `${nowYear}-06-30` },
    { name: `${nowYear}/${nowYear + 1}`, status: "ACTIVE" as const, start: `${nowYear}-07-01`, end: `${nowYear + 1}-06-30` },
  ];
  let activeYearId: string | null = null;
  let activeYearName = "";
  for (const y of years) {
    const { data: existing } = await admin
      .from("academic_years")
      .select("id")
      .eq("tenant_id", tid)
      .eq("name", y.name)
      .maybeSingle();
    if (existing) {
      if (y.status === "ACTIVE") activeYearId = existing.id;
      activeYearName = y.name;
      continue;
    }
    const { data, error } = await admin
      .from("academic_years")
      .insert({ tenant_id: tid, name: y.name, start_date: y.start, end_date: y.end, status: y.status })
      .select("id")
      .single();
    if (error || !data) {
      console.error(`Gagal membuat tahun ajaran ${y.name}:`, error?.message);
      process.exit(1);
    }
    // Semester untuk tiap tahun
    await admin.from("academic_semesters").insert([
      { tenant_id: tid, academic_year_id: data.id, sequence: 1, name: "Semester 1", start_date: y.start, end_date: `${y.start.slice(0, 4)}-12-31`, status: y.status === "ACTIVE" ? "AKTIF" : "SELESAI" },
      { tenant_id: tid, academic_year_id: data.id, sequence: 2, name: "Semester 2", start_date: `${Number(y.start.slice(0, 4)) + 1}-01-01`, end_date: y.end, status: "BELUM" },
    ]);
    if (y.status === "ACTIVE") activeYearId = data.id;
    activeYearName = y.name;
  }
  log("✓", "2 tahun akademik dummy siap (1 aktif, 1 arsip).");

  // 4. HALAQAH — 2, masing-masing dengan pengampu + anggota
  const halaqahs = [
    { name: "Halaqah Al-Fatih", teachers: [teacherIds[0], teacherIds[2]], students: [studentIds[0]] },
    { name: "Halaqah An-Nur", teachers: [teacherIds[1]], students: [studentIds[1], studentIds[2]] },
  ];
  const halaqahIds: string[] = [];
  for (const h of halaqahs) {
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
        .insert({ tenant_id: tid, name: h.name, description: `Dummy — ${h.name}` })
        .select("id")
        .single();
      if (error || !data) {
        console.error(`Gagal membuat ${h.name}:`, error?.message);
        process.exit(1);
      }
      hid = data.id;
    }
    if (!hid) continue;
    halaqahIds.push(hid);

    // Pengampu
    for (let i = 0; i < h.teachers.length; i++) {
      await admin.from("halaqah_teachers").upsert(
        { tenant_id: tid, halaqah_id: hid, teacher_id: h.teachers[i], is_primary: i === 0 },
        { onConflict: "halaqah_id,teacher_id" }
      );
    }
    // Anggota
    for (const sid of h.students) {
      const { data: member } = await admin
        .from("halaqah_students")
        .select("id")
        .eq("halaqah_id", hid)
        .eq("student_id", sid)
        .eq("left_at", null)
        .maybeSingle();
      if (!member) {
        await admin.from("halaqah_students").insert({ tenant_id: tid, halaqah_id: hid, student_id: sid });
      }
    }
  }
  log("✓", "2 halaqah dummy siap (dengan pengampu + anggota).");

  // 5. INFAK — 1 tagihan lunas untuk santri pertama (bulan berjalan)
  const now = new Date();
  const invMonth = now.getMonth() + 1;
  const invYear = now.getFullYear();
  const academicYearLabel = activeYearName || `${invYear}/${invYear + 1}`;
  const { data: existingInv } = await admin
    .from("payment_invoices")
    .select("id")
    .eq("tenant_id", tid)
    .eq("student_id", studentIds[0])
    .eq("academic_year", academicYearLabel)
    .eq("year", invYear)
    .eq("month", invMonth)
    .maybeSingle();
  if (!existingInv) {
    const { error } = await admin.from("payment_invoices").insert({
      tenant_id: tid,
      student_id: studentIds[0],
      academic_year: academicYearLabel,
      year: invYear,
      month: invMonth,
      amount: 10000,
      status: "PAID",
      paid_at: now.toISOString(),
      paid_via: "MANUAL",
    });
    if (error) log("!", `Infak dummy dilewati: ${error.message}`);
    else log("✓", "1 tagihan infak dummy (lunas) siap.");
  } else {
    log("●", "Infak dummy sudah ada.");
  }

  // 6. RAPORT — 1 DRAFT dengan data penuh (salinan template + snapshot data)
  // 6a. Salin template global pertama menjadi milik lembaga.
  const { data: globalTpl } = await admin
    .from("report_templates")
    .select("id, name, description, paper, orientation, layout")
    .eq("tenant_id", null)
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!globalTpl) {
    log("!", "Template raport global tidak ditemukan — raport dummy dilewati.");
  } else {
    const tplName = `${globalTpl.name} (Dummy)`;
    let { data: tenantTpl } = await admin
      .from("report_templates")
      .select("id")
      .eq("tenant_id", tid)
      .eq("name", tplName)
      .maybeSingle();
    if (!tenantTpl) {
      const { data, error } = await admin
        .from("report_templates")
        .insert({
          tenant_id: tid,
          created_by: profile.id,
          source_template_id: globalTpl.id,
          name: tplName,
          description: globalTpl.description,
          paper: globalTpl.paper,
          orientation: globalTpl.orientation,
          layout: globalTpl.layout,
        })
        .select("id")
        .single();
      if (error || !data) {
        log("!", `Salinan template gagal: ${error?.message} — raport dummy dilewati.`);
      } else {
        tenantTpl = data;
      }
    }

    if (tenantTpl) {
      const semester1Start = `${activeYearName.split("/")[0]}-07-01`;
      const semester1End = `${activeYearName.split("/")[0]}-12-31`;
      const { data: existingReport } = await admin
        .from("reports")
        .select("id")
        .eq("tenant_id", tid)
        .eq("student_id", studentIds[0])
        .eq("template_id", tenantTpl.id)
        .maybeSingle();

      let reportId = existingReport?.id as string | undefined;
      if (!reportId) {
        const { data, error } = await admin
          .from("reports")
          .insert({
            tenant_id: tid,
            template_id: tenantTpl.id,
            student_id: studentIds[0],
            teacher_id: teacherIds[0],
            created_by: profile.id,
            title: "RAPORT TAHFIZH",
            academic_year: academicYearLabel,
            semester_label: "Semester 1",
            period_label: "Semester 1",
            period_start: semester1Start,
            period_end: semester1End,
            status: "DRAFT",
          })
          .select("id")
          .single();
        if (error || !data) {
          log("!", `Raport dummy gagal: ${error?.message}`);
        } else {
          reportId = data.id;
        }
      }

      if (reportId) {
        // Snapshot data nilai penuh untuk semua modul supaya preview terlihat
        // lengkap (contoh raport). Format sama dengan payload report_student_data.
        const { data: rSnap } = await admin.from("report_snapshots").select("report_id").eq("report_id", reportId).maybeSingle();
        if (!rSnap) {
          const { data: layoutRow } = await admin
            .from("report_templates")
            .select("layout")
            .eq("id", tenantTpl.id)
            .single();
          const dummyData = {
            student: { name: santriNames[0].full_name, nickname: santriNames[0].nickname, class: "1", halaqah: halaqahs[0].name },
            teacher: { name: guruNames[0].full_name },
            head: { name: profile.full_name },
            period: { academicYear: academicYearLabel, semester: "Semester 1" },
            scores: [
              { module: "TAHFIDZ", label: "Tahfidz", value: "94", predicate: "A", description: "Hafalan lancar, murojaah terjaga." },
              { module: "TARTIL", label: "Tartil", value: "90", predicate: "A", description: "Bacaan tartil sesuai kaidah." },
              { module: "SETORAN", label: "Setoran", value: "95", predicate: "A", description: "Setoran tepat waktu." },
              { module: "HADITS", label: "Hadits", value: "88", predicate: "B", description: "Hafalan hadits pilihan baik." },
              { module: "DOA", label: "Doa Harian", value: "92", predicate: "A", description: "Hafalan doa harian lengkap." },
              { module: "TAJWID", label: "Tajwid", value: "89", predicate: "B", description: "Penerapan tajwid makin ringkas." },
              { module: "TUGAS", label: "Tugas", value: "91", predicate: "A", description: "Tugas dikerjakan tertib." },
            ],
            attendance: { hadir: 92, izin: 3, sakit: 2, alpa: 1, persen: 94 },
            achievement: { total: 24, lulus: 21, ulang: 3 },
            notes: "Ananda menunjukkan kemajuan hafalan yang konsisten. Pertahankan murojaah harian di rumah.",
          };
          await admin.from("report_snapshots").insert({
            report_id: reportId,
            tenant_id: tid,
            layout: layoutRow?.layout ?? {},
            data: dummyData,
            settings: {},
          });
        }
        log("✓", "1 raport dummy (DRAFT, data lengkap) siap — cek menu Raport → Buat/Preview.");
      }
    }
  }

  console.log("\nSelesai! Data dummy siap dipakai untuk mencoba aplikasi.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
