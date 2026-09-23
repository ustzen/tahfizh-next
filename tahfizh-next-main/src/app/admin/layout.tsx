import { requireRole } from "@/lib/auth";
import { getDisplayProfile } from "@/lib/layout-data";
import { DashboardShell } from "@/components/dashboard/shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["ADMIN"], "/admin");
  const profile = (await getDisplayProfile()) ?? {
    ...session,
    frontTitle: null,
    backTitle: null,
    avatarUrl: null,
  };

  return (
    <DashboardShell
      role="ADMIN"
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
