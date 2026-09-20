import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getFeedbackList, getFeedbackTeacherOptions } from "@/lib/v10";
import { FeedbackList } from "@/components/feedback/feedback-list";

export const metadata = { title: "Kritik & Saran" };

export default async function AdminSaranPage() {
  await requireRole(["ADMIN"], "/admin/saran");
  const [teacherOptions, rows] = await Promise.all([getFeedbackTeacherOptions(), getFeedbackList()]);

  return (
    <div>
      <PageHeader
        title="Kritik & Saran"
        description="Kelola masukan lembaga: ubah status, beri tanggapan, dan teruskan ke pihak yang tepat."
      />
      <div className="space-y-6">
        <FeedbackList rows={rows} teacherOptions={teacherOptions} showForward />
      </div>
    </div>
  );
}
