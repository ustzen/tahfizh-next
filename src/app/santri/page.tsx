import { LayoutDashboard } from "lucide-react";

import { PageHeader, CardBox, SectionTitle } from "@/components/dashboard/section";
import { ForceChangePasswordCard } from "@/components/akun/force-change-password-card";
import { QuickMenuEditorButton, QuickMenuGrid } from "@/components/dashboard/quick-menu-editor";
import { requireRole } from "@/lib/auth";
import { SANTRI_QUICK_MENU, SANTRI_QUICK_MENU_DEFAULT_KEYS, resolveQuickMenu } from "@/lib/quick-menu";
import { createClient } from "@/lib/supabase/server";
import { getMenuIconOverrides } from "@/lib/menu-icon-overrides";

export const metadata = { title: "Dashboard Santri" };

async function getDashboardQuickMenuOrder(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("dashboard_quick_menu")
    .eq("id", userId)
    .single();
  return (data?.dashboard_quick_menu as string[] | null) ?? null;
}

/**
 * Dasbor Santri (disederhanakan).
 *
 * Isi dasbor kini hanya Menu Cepat — pintu masuk ke setiap modul yang
 * bermanfaat (Pantauan, Target, Presensi, Prestasi, Perkembangan, Infak,
 * Obrolan, Saran). Kartu wajib ganti password (password sementara) tetap
 * tampil bila berlaku, dan banner gate infak tetap muncul saat akses
 * dibatasi. Detail setiap modul pindah ke halamannya masing-masing.
 */
export default async function SantriDashboardPage() {
  const profile = await requireRole(["WALI_SANTRI"], "/santri");

  const [savedQuickMenu, ownProfileRes, iconOverrides] = await Promise.all([
    getDashboardQuickMenuOrder(profile.id),
    createClient().then((supabase) =>
      supabase.from("profiles").select("must_change_password").eq("id", profile.id).single()
    ),
    // V39: override ikon menu platform.
    getMenuIconOverrides(),
  ]);
  const mustChangePassword = ownProfileRes.data?.must_change_password === true;

  const visibleQuickMenu = resolveQuickMenu(SANTRI_QUICK_MENU, savedQuickMenu, SANTRI_QUICK_MENU_DEFAULT_KEYS);
  // Set lengkap (sebelum wali mengatur), dipakai editor untuk "Kembalikan Default".
  const defaultQuickMenu = resolveQuickMenu(SANTRI_QUICK_MENU, null, SANTRI_QUICK_MENU_DEFAULT_KEYS);

  return (
    <div>
      <PageHeader
        title={`Assalamu'alaikum, ${profile.fullName.split(" ")[0]} 👋`}
        description="Semua menu ananda ada di sini — pilih salah satu untuk memulai."
        icon={<LayoutDashboard className="size-6" />}
      />

      {mustChangePassword && <ForceChangePasswordCard />}

      {/* Menu Cepat — satu-satunya isi dasbor (V31, dapat diatur per akun) */}
      <CardBox>
        <SectionTitle
          tone="emerald"
          icon={<LayoutDashboard />}
          title="Menu Cepat"
          description="Akses langsung ke semua modul yang Anda gunakan sehari-hari."
          action={
            <QuickMenuEditorButton
              defaults={SANTRI_QUICK_MENU}
              visible={visibleQuickMenu}
              defaultVisible={defaultQuickMenu}
              iconOverrides={iconOverrides}
            />
          }
        />
        <QuickMenuGrid items={visibleQuickMenu} iconOverrides={iconOverrides} />
      </CardBox>
    </div>
  );
}
