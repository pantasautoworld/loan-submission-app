import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { formatChatTime } from "@/lib/chatTime";

interface MessageRow {
  id: string;
  direction: string;
  body: string;
  media_type: string | null;
  staff_name: string | null;
  quick_reply_used: string | null;
  sent_at: string | null;
}

export default async function ChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireAdmin();
  const { id } = await params;

  const { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id, contact_name, contact_phone, channel_title, assignee")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) notFound();

  const { data } = await supabase
    .from("ai_messages")
    .select("id, direction, body, media_type, staff_name, quick_reply_used, sent_at")
    .eq("conversation_id", id)
    .order("sent_at", { ascending: true })
    .limit(2000);
  const messages = (data ?? []) as MessageRow[];

  const title = conversation.contact_name || conversation.contact_phone || "Unknown";

  return (
    <div className="flex flex-1 flex-col">
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["AI Reply Desk", "Chat History", title]} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl text-fg">{title}</h1>
            <p className="text-xs text-muted">
              {conversation.contact_name ? `${conversation.contact_phone} · ` : ""}
              {conversation.channel_title ?? ""}
              {conversation.assignee ? ` · assigned to ${conversation.assignee}` : ""} · {messages.length} message
              {messages.length === 1 ? "" : "s"}
            </p>
          </div>
          <Link href="/ai-desk/history" className="shrink-0 text-sm text-muted hover:text-amber">
            Back to list
          </Link>
        </div>

        {messages.length === 0 ? (
          <div className="rounded-[10px] border border-line bg-panel p-6 text-sm text-muted">
            No messages saved for this conversation.
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => {
              const fromStaff = m.direction === "staff";
              const isMedia = m.media_type && m.media_type !== "text";
              return (
                <div key={m.id} className={`flex ${fromStaff ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-[10px] border border-line p-2.5 text-sm ${
                      fromStaff ? "bg-panel-raised" : "bg-panel"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-muted">
                      <span className="font-medium">{fromStaff ? m.staff_name || "Staff" : "Customer"}</span>
                      <span>{formatChatTime(m.sent_at)}</span>
                    </div>
                    {isMedia && (
                      <span className="mb-1 inline-block rounded bg-panel-raised px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted">
                        {m.media_type}
                      </span>
                    )}
                    {m.body && <p className="whitespace-pre-wrap break-words text-fg">{m.body}</p>}
                    {m.quick_reply_used && (
                      <p className="mt-1 text-[11px] text-muted">Quick reply: {m.quick_reply_used}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
