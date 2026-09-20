import { requireRole } from "@/lib/auth";

export default async function AdminPengaturanLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["ADMIN"], "/admin/pengaturan");
  return <>{children}</>;
}
