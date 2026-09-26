import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarSection } from "@/components/settings/avatar-section";
import { ProfileForm } from "@/components/settings/profile-form";
import { EmailForm, PasswordForm } from "@/components/settings/security-forms";
import { MenuOrderEditor } from "@/components/settings/menu-order";
import { MenuIconManager, type IconMenuRow } from "@/components/settings/menu-icon-manager";
import { AdminForceResetCard, type ResettableAccount } from "@/components/akun/admin-force-reset-card";
import { AdminResetRequestsCard } from "@/components/akun/admin-reset-requests-card";
import { TerminologyForm } from "@/components/settings/terminology-form";
import { IdentityTypesForm, DeleteIdentityTypeButton } from "@/components/settings/identity-form";
import { LeaderForm } from "@/components/settings/leader-form";
import { formatFullName, resolveNav, DEFAULT_TERMINOLOGY } from "@/lib/terminology";
import { parseIdentityTypes } from "@/lib/identity";
import { getTerminology, hasCustomTerminology } from "@/lib/terminology";
import { getMenuIconOverrides } from "@/lib/menu-icon-overrides";
import {
  USTADZ_QUICK_MENU,
  ADMIN_QUICK_MENU,
  KOORDINATOR_QUICK_MENU,
  SANTRI_QUICK_MENU,
} from "@/lib/quick-menu";
import { getDisplayProfile } from "@/lib/layout-data";
import { createClient } from "@/lib/supabase/server";
import { listPasswordResetRequests } from "@/app/actions/password";
import { settingsSectionsFor, type AppRole } from "@/lib/roles";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { cache } from "react";

/* ------------------------------------------------------------------ */
/* Shared data                                                         */
/* ------------------------------------------------------------------ */

const getTerminologyEntries = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("terminologies")
    .select("key, label")
    .eq("tenant_id", tenantId);
  return data ?? [];
});

const getTenantSettings = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_settings")
    .select("identity_types, show_teacher_identity")
    .eq("tenant_id", tenantId)
    .single();
  return {
    identityTypes: parseIdentityTypes(data?.identity_types),
    showTeacherIdentity: data?.show_teacher_identity ?? false,
  };
});

const getLeader = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leader_profiles")
    .select("full_name, front_title, back_title, identity_key, identity_number")
    .eq("tenant_id", tenantId)
    .single();
  return data
    ? {
        fullName: data.full_name,
        frontTitle: data.front_title,
        backTitle: data.back_title,
        identityKey: data.identity_key,
        identityNumber: data.identity_number,
      }
    : null;
});

const getMenuOrder = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("menu_order")
    .eq("id", userId)
    .single();
  return (data?.menu_order as string[] | null) ?? null;
});

async function requireSession() {
  const profile = await getDisplayProfile();
  if (!profile) throw new Error("Unauthenticated");
  return profile;
}

/* ------------------------------------------------------------------ */
/* PROFIL                                                              */
/* ------------------------------------------------------------------ */
export async function ProfilSection({ role }: { role: AppRole }) {
  const profile = await requireSession();
  const terms = await getTerminology(profile.tenantId);

  const sections = settingsSectionsFor(role);

  return (
    <SettingsLayout
      role={role}
      sections={sections}
      active="profil"
      title="Pengaturan"
      description="Kelola profil dan preferensi akun Anda."
    >
      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle>Foto Profil</CardTitle>
          <CardDescription>Hanya Anda yang dapat melihat dan mengganti foto ini.</CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarSection
            userId={profile.id}
            displayName={formatFullName(profile.frontTitle, profile.fullName, profile.backTitle)}
            avatarUrl={profile.avatarUrl}
            canDelete={Boolean(profile.avatarUrl)}
          />
        </CardContent>
      </Card>

      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle>Data Diri</CardTitle>
          <CardDescription>
            Gelar ditampilkan otomatis, contoh: {formatFullName("Drs.", profile.fullName, "M.Pd.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            profile={{
              fullName: profile.fullName,
              frontTitle: profile.frontTitle,
              backTitle: profile.backTitle,
              whatsapp: null,
              gender: profile.gender,
              email: profile.email,
              showGender: role !== "WALI_SANTRI",
            }}
          />
        </CardContent>
      </Card>
    </SettingsLayout>
  );
}

/* ------------------------------------------------------------------ */
/* KEAMANAN                                                            */
/* ------------------------------------------------------------------ */
export async function KeamananSection({ role }: { role: AppRole }) {
  const profile = await requireSession();
  const sections = settingsSectionsFor(role);

  // V12.4 — daftar akun yang dapat direset passwordnya oleh ADMIN lembaga
  // (SANTRI / GURU / KOORDINATOR tenant sendiri — sudah dijaga RLS
  // profiles_select_tenant).
  let resettable: ResettableAccount[] = [];
  let resetRequests: Awaited<ReturnType<typeof listPasswordResetRequests>> = [];
  if (role === "ADMIN" && profile.tenantId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role, username")
      .eq("tenant_id", profile.tenantId)
      .in("role", ["WALI_SANTRI", "USTADZ", "KOORDINATOR"])
      .order("full_name");
    resettable = (data ?? []) as ResettableAccount[];
    resetRequests = await listPasswordResetRequests();
  }

  return (
    <SettingsLayout
      role={role}
      sections={sections}
      active="keamanan"
      title="Pengaturan"
      description="Email dan password dikelola melalui Supabase Auth yang aman."
    >
      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            Perubahan email mengikuti mekanisme verifikasi Supabase Auth.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailForm currentEmail={profile.email} />
        </CardContent>
      </Card>

      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Password minimal 8 karakter. Tidak pernah disimpan dalam teks polos.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      {role === "ADMIN" && (
        <Card className="shadow-card rounded-2xl">
          <CardHeader>
            <CardTitle>Permintaan Reset Password (via Username)</CardTitle>
            <CardDescription>
              Pengajuan dari Santri/Guru di halaman Lupa Password. Setujui untuk membuat kode
              sekali-pakai (30 menit) yang Anda kirimkan ke pemohon via WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminResetRequestsCard requests={resetRequests} />
          </CardContent>
        </Card>
      )}

      {role === "ADMIN" && (
        <Card className="shadow-card rounded-2xl">
          <CardHeader>
            <CardTitle>Reset Password Akun (Santri / Guru / Koordinator)</CardTitle>
            <CardDescription>
              Ganti password akun lembaga Anda saat lupa password atau insiden keamanan.
              Pemilik akun wajib mengganti password pada login berikutnya.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resettable.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Belum ada akun Santri/Guru/Koordinator di lembaga ini.
              </p>
            ) : (
              <AdminForceResetCard accounts={resettable} />
            )}
          </CardContent>
        </Card>
      )}
    </SettingsLayout>
  );
}

/* ------------------------------------------------------------------ */
/* IKON MENU (DEVELOPER — V39)                                         */
/* ------------------------------------------------------------------ */
export async function MenuIconSection({ role }: { role: AppRole }) {
  const profile = await requireSession();
  const terms = await getTerminology(profile.tenantId);
  const overrides = await getMenuIconOverrides();
  const sections = settingsSectionsFor(role);

  // Pool menu: nav semua role + Menu Cepat semua role. Dedup per key —
  // fallback ikon lucide di-resolve client-side dari peta terpusat.
  const navRows: IconMenuRow[] = [
    ...resolveNav("DEVELOPER", terms, profile.gender, null),
    ...resolveNav("ADMIN", terms, profile.gender, null),
    ...resolveNav("KOORDINATOR", terms, profile.gender, null),
    ...resolveNav("USTADZ", terms, profile.gender, null),
    ...resolveNav("WALI_SANTRI", terms, profile.gender, null),
  ]
    .map((item) => ({ key: item.key as string, label: item.label }))
    .filter((row, i, arr) => arr.findIndex((r) => r.key === row.key) === i);

  const quickRows: IconMenuRow[] = [
    ...USTADZ_QUICK_MENU,
    ...ADMIN_QUICK_MENU,
    ...KOORDINATOR_QUICK_MENU,
    ...SANTRI_QUICK_MENU,
  ]
    .map((item) => ({ key: item.key, label: item.label }))
    .filter((row, i, arr) => arr.findIndex((r) => r.key === row.key) === i)
    // Menu Cepat yang key-nya sudah ada di nav tidak perlu baris kedua.
    .filter((row) => !navRows.some((n) => n.key === row.key));

  return (
    <SettingsLayout
      role={role}
      sections={sections}
      active="ikon"
      title="Pengaturan"
      description="Ganti ikon tiap menu dari katalog Phosphor atau unggahan sendiri."
    >
      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle>Ikon Menu</CardTitle>
          <CardDescription>
            Klik ikon atau tombol Ganti untuk memilih dari katalog Phosphor Icons, atau unggah
            gambar sendiri. Perubahan berlaku untuk seluruh web (semua lembaga).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MenuIconManager menus={[...navRows, ...quickRows]} overrides={overrides} />
        </CardContent>
      </Card>

      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle>Catatan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Menu yang berbagi kunci yang sama (mis. menu di sidebar dan Menu Cepat) otomatis ikut
            berubah. Ikon bawaan memakai Lucide; pilihan Phosphor dan unggahan disimpan di
            database platform dan langsung tampil setelah halaman dimuat ulang.
          </p>
        </CardContent>
      </Card>
    </SettingsLayout>
  );
}

/* ------------------------------------------------------------------ */
/* MENU                                                                */
/* ------------------------------------------------------------------ */
export async function MenuSection({ role }: { role: AppRole }) {
  const profile = await requireSession();
  const terms = await getTerminology(profile.tenantId);
  const savedOrder = await getMenuOrder(profile.id);
  const defaultItems = resolveNav(role, terms, profile.gender, null);
  const sections = settingsSectionsFor(role);

  return (
    <SettingsLayout
      role={role}
      sections={sections}
      active="menu"
      title="Pengaturan"
      description="Atur urutan menu sesuai preferensi Anda."
    >
      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle>Urutan Menu</CardTitle>
          <CardDescription>
            Tarik (drag) atau gunakan tombol ↑↓ untuk mengatur urutan. Default mengikuti role Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MenuOrderEditor defaultItems={defaultItems} savedOrder={savedOrder} />
        </CardContent>
      </Card>
    </SettingsLayout>
  );
}

/* ------------------------------------------------------------------ */
/* TERMINOLOGI (ADMIN only)                                            */
/* ------------------------------------------------------------------ */
export async function TerminologiSection() {
  const profile = await requireSession();
  const entries = await getTerminologyEntries(profile.tenantId!);
  const hasCustom = await hasCustomTerminology(profile.tenantId);

  const current = { ...DEFAULT_TERMINOLOGY };
  for (const e of entries) {
    if (e.key in current) current[e.key as keyof typeof current] = e.label;
  }

  return (
    <SettingsLayout
      role={profile.role}
      sections={settingsSectionsFor("ADMIN")}
      active="terminologi"
      title="Pengaturan"
      description="Istilah yang ditampilkan di seluruh dashboard lembaga Anda."
    >
      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle>Terminologi Lembaga</CardTitle>
          <CardDescription>
            {hasCustom
              ? "Kosongkan kolom dan simpan untuk mengembalikan ke istilah default TAHFIZH."
              : "Masih menggunakan istilah default TAHFIZH. Ubah sesuai kebutuhan lembaga."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TerminologyForm current={current} />
        </CardContent>
      </Card>

      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle>Catatan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Terminologi hanya mengubah <strong>label tampilan</strong>. Nama tabel dan struktur data
            tidak pernah diubah — data antar lembaga tetap terpisah dan aman (T-101 memakai
            &quot;Santri&quot; tidak memengaruhi T-102 yang memakai &quot;Murid&quot;).
          </p>
        </CardContent>
      </Card>
    </SettingsLayout>
  );
}

/* ------------------------------------------------------------------ */
/* IDENTITAS LEMBAGA (ADMIN only)                                      */
/* ------------------------------------------------------------------ */
export async function IdentitasSection() {
  const profile = await requireSession();
  const settings = await getTenantSettings(profile.tenantId!);

  return (
    <SettingsLayout
      role={profile.role}
      sections={settingsSectionsFor("ADMIN")}
      active="identitas"
      title="Pengaturan"
      description="Jenis identitas kepegawaian guru yang digunakan lembaga Anda."
    >
      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle>Jenis Identitas Guru</CardTitle>
          <CardDescription>
            Setiap lembaga bebas menentukan identitasnya (NIP, NBM, NUPTK, NIY, ID Pegawai, atau
            label custom). Struktur data fleksibel — bukan kolom tunggal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IdentityTypesForm
            identityTypes={settings.identityTypes}
            showTeacherIdentity={settings.showTeacherIdentity}
          />
        </CardContent>
      </Card>

      {settings.identityTypes.length > 0 && (
        <Card className="shadow-card rounded-2xl">
          <CardHeader>
            <CardTitle>Identitas Terdaftar</CardTitle>
            <CardDescription>
              Menghapus jenis identitas juga menghapus nilai yang tersimpan pada guru.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {settings.identityTypes.map((t) => (
                <li key={t.key} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.label}</p>
                    <p className="text-muted-foreground font-mono text-xs">{t.key}</p>
                  </div>
                  <DeleteIdentityTypeButton identityKey={t.key} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </SettingsLayout>
  );
}

/* ------------------------------------------------------------------ */
/* PIMPINAN (ADMIN only)                                               */
/* ------------------------------------------------------------------ */
export async function PimpinanSection() {
  const profile = await requireSession();
  const settings = await getTenantSettings(profile.tenantId!);
  const leader = await getLeader(profile.tenantId!);

  return (
    <SettingsLayout
      role={profile.role}
      sections={settingsSectionsFor("ADMIN")}
      active="pimpinan"
      title="Pengaturan"
      description="Data kepala sekolah / pimpinan lembaga (dipakai dokumen pada versi berikutnya)."
    >
      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle>Kepala Sekolah / Pimpinan</CardTitle>
          <CardDescription>
            {leader?.fullName
              ? `Tersimpan: ${formatFullName(leader.frontTitle, leader.fullName, leader.backTitle)}`
              : "Data pimpinan belum diatur."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeaderForm leader={leader ?? null} identityTypes={settings.identityTypes} />
        </CardContent>
      </Card>
    </SettingsLayout>
  );
}
