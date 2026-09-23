import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { DevelopmentView } from "@/components/akademik/development-view";

export const metadata: Metadata = { title: "Riwayat Perkembangan" };

export default async function SantriPerkembanganPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireRole(["WALI_SANTRI"], "/santri/perkembangan");
  return <DevelopmentView profile={profile} studentId={sp.student} />;
}
