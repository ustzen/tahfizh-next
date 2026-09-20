import { MateriSection } from "@/components/settings/materi-section";

export const metadata = { title: "Pengaturan · Materi Pembelajaran" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return <MateriSection tab={tab} />;
}
