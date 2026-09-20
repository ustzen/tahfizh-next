import { requireRole } from "@/lib/auth";
import { getDisplayProfile } from "@/lib/layout-data";
import { DashboardShell } from "@/components/dashboard/shell";

/**
 * Santri layout. The V10 payment gate (rule #7-#10: day ≥ 16 & unpaid → only
 * /santri/infak reachable) is enforced server-side in src/proxy.ts, which knows
 * the request path and already resolves the trusted profile role.
 */
export default async function SantriLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["WALI_SANTRI"], "/santri");
  const profile = (await getDisplayProfile()) ?? {
    ...session,
    frontTitle: null,
    backTitle: null,
    avatarUrl: null,
  };

  return (
    <DashboardShell
      role="WALI_SANTRI"
      fullName={profile.fullName}
      tenantId={profile.tenantId}
      tenantName={profile.tenantName}
      tenantCode={profile.tenantCode}
      avatarUrl={profile.avatarUrl}
    >
      {children}
    </DashboardShell>
  );
}
