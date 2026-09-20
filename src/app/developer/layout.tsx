import { requireRole } from "@/lib/auth";
import { getDisplayProfile } from "@/lib/layout-data";
import { DashboardShell } from "@/components/dashboard/shell";

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["DEVELOPER"], "/developer");
  const profile = (await getDisplayProfile()) ?? {
    ...session,
    frontTitle: null,
    backTitle: null,
    avatarUrl: null,
  };

  return (
    <DashboardShell
      role="DEVELOPER"
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
