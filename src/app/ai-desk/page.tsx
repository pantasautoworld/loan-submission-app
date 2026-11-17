import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { DraftCard } from "@/components/aiDesk/DraftCard";
import { KillSwitch } from "@/components/aiDesk/KillSwitch";

interface DraftRow {
  id: string;
  intent: string;
  draft_text: string;
  suggested_quick_reply: string | null;
  reply_to_message_id: string | null;
  ai_conversations: { contact_name: string; contact_phone: string } | null;
  ai_messages: { body: string } | null;
}

export default async function AiDeskPage() {
  const { supabase, profile } = await requireAdmin();

  const [{ data: settings }, { data: drafts }, { count: conversationCount }, { count: messageCount }] =
    await Promise.all([
      supabase.from("ai_settings").select("key, value"),
      supabase
        .from("ai_drafts")
        .select(
          "id, intent, draft_text, suggested_quick_reply, reply_to_message_id, ai_conversations(contact_name, contact_phone), ai_messages!ai_drafts_reply_to_message_id_fkey(body)"
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50),
      supabase.from("ai_conversations").select("id", { count: "exact", head: true }),
      supabase.from("ai_messages").select("id", { count: "exact", head: true }),
    ]);

  const aiEnabled = (settings ?? []).find((s) => s.key === "ai_enabled")?.value !== "false";
  const rows = (drafts ?? []) as unknown as DraftRow[];

  return (
    <div className="flex flex-1 flex-col">
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["AI Reply Desk"]} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl text-fg">AI Reply Desk</h1>
          <div className="flex items-center gap-4">
            <Link href="/ai-desk/history" className="text-sm text-muted hover:text-amber">
              Chat History
            </Link>
            <KillSwitch enabled={aiEnabled} />
          </div>
        </div>

        <p className="text-sm text-muted">
          {aiEnabled ? "AI is on." : "AI is OFF - no new drafts are created."} Learning so far:{" "}
          {conversationCount ?? 0} conversations, {messageCount ?? 0} messages. Drafts waiting for
          your review: {rows.length}. Nothing is sent to customers yet - this is the learning
          stage.
        </p>

        {rows.length === 0 ? (
          <div className="rounded-[10px] border border-line bg-panel p-6 text-sm text-muted">
            No drafts waiting. Once the chat reader is connected, AI drafts will appear here for
            you to approve, edit or reject.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((d) => (
              <DraftCard
                key={d.id}
                draftId={d.id}
                contactLabel={
                  d.ai_conversations?.contact_name || d.ai_conversations?.contact_phone || "Customer"
                }
                customerMessage={d.ai_messages?.body ?? ""}
                intent={d.intent}
                draftText={d.draft_text}
                suggestedQuickReply={d.suggested_quick_reply}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
