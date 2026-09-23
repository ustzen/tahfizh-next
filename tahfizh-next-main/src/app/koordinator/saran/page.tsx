import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getFeedbackList, getFeedbackTeacherOptions } from "@/lib/v10";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { FeedbackList } from "@/components/feedback/feedback-list";

export const metadata = { title: "Kritik & Saran" };

export default async function KoordinatorSaranPage() {
  await requireRole(["KOORDINATOR"], "/koordinator/saran");
  const [teacherOptions, rows] = await Promise.all([getFeedbackTeacherOptions(), getFeedbackList()]);

  return (
    <div>
      <PageHeader
        title="Kritik & Saran"
        description="Masukan yang ditujukan kepada Anda dan kepada guru binaan tampil di sini."
      />
      <div className="space-y-6">
        <FeedbackForm teacherOptions={teacherOptions} pageUrl="/koordinator/saran" />
        <FeedbackList rows={rows} teacherOptions={teacherOptions} showForward={false} />
      </div>
    </div>
  );
}
