import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";

import { PageHeader } from "@/components/dashboard/section";
import { ChatPanel } from "@/components/community/chat-panel";
import { requireRole } from "@/lib/auth";
import { getChatRooms, getInitialChatMessages } from "@/lib/chat";

export const metadata: Metadata = { title: "Obrolan" };

export default async function AdminObrolanPage() {
  const profile = await requireRole(["ADMIN"], "/admin/obrolan");
  const rooms = await getChatRooms();
  const messages = await getInitialChatMessages(null);

  return (
    <div>
      <PageHeader
        title="Obrolan"
        description={`Ruang obrolan ${profile.tenantName ?? "lembaga Anda"} — hanya untuk lembaga Anda, pesan otomatis terhapus setelah 24 jam.`}
        icon={<MessagesSquare className="size-6" />}
      />
      <ChatPanel rooms={rooms} initialRoomId={null} initialMessages={messages} canModerate />
    </div>
  );
}
