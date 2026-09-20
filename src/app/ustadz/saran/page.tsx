import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getFeedbackList, getFeedbackTeacherOptions } from "@/lib/v10";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { FeedbackList } from "@/components/feedback/feedback-list";

export const metadata = { title: "Kritik & Saran" };

export default async function UstadzSaranPage() {
  await requireRole(["USTADZ"], "/ustadz/saran");
  const [teacherOptions, rows] = await Promise.all([getFeedbackTeacherOptions(), getFeedbackList()]);

  return (
    <div>
      <PageHeader
        title="Kritik & Saran"
        description="Sampaikan masukan untuk koordinator, admin lembaga, atau Developer TAHFIZH."
      />
      <div className="space-y-6">
        <FeedbackForm teacherOptions={teacherOptions} pageUrl="/ustadz/saran" />
        <FeedbackList rows={rows} teacherOptions={teacherOptions} showForward={false} />
      </div>
    </div>
  );
}
