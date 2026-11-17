import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { formatChatTime } from "@/lib/chatTime";

const PAGE_SIZE = 50;

interface ConversationRow {
  id: string;
  contact_name: string;
  contact_phone: string;
  channel_title: string | null;
  assignee: string | null;
  last_message_at: string | null;
}

export default async function ChatHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { supabase, profile } = await requireAdmin();
  const { q: rawQuery, page: rawPage } = await searchParams;

  // characters that would break the PostgREST or() filter, or act as wildcards
  const q = (rawQuery ?? "").replace(/[,()%*\\]/g, " ").trim();
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("ai_conversations")
    .select("id, contact_name, contact_phone, channel_title, assignee, last_message_at", { count: "exact" })
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);
  if (q) query = query.or(`contact_name.ilike.%${q}%,contact_phone.ilike.%${q}%`);

  const { data, count } = await query;
  const rows = (data ?? []) as ConversationRow[];
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number) => `/ai-desk/history?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="flex flex-1 flex-col">
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["AI Reply Desk", "Chat History"]} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl text-fg">Chat History</h1>
          <Link href="/ai-desk" className="text-sm text-muted hover:text-amber">
            Back to AI Reply Desk
          </Link>
        </div>

        <form className="flex gap-2" action="/ai-desk/history">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search customer name or phone number"
            className="w-full rounded-[7px] border border-line bg-panel px-3 py-2 text-sm text-fg"
          />
          <button type="submit" className="rounded-[7px] border border-line bg-panel-raised px-4 text-sm text-fg">
            Search
          </button>
        </form>

        <p className="text-sm text-muted">
          {total.toLocaleString("en-MY")} conversation{total === 1 ? "" : "s"}
          {q ? ` matching "${q}"` : ""}, newest first.
        </p>

        {rows.length === 0 ? (
          <div className="rounded-[10px] border border-line bg-panel p-6 text-sm text-muted">
            No conversations found.
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-[10px] border border-line bg-panel">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/ai-desk/history/${c.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-panel-raised">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">
                      {c.contact_name || c.contact_phone || "Unknown"}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {c.contact_name ? `${c.contact_phone} · ` : ""}
                      {c.channel_title ?? ""}
                      {c.assignee ? ` · ${c.assignee}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{formatChatTime(c.last_message_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between text-sm text-muted">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="hover:text-amber">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {lastPage}
          </span>
          {page < lastPage ? (
            <Link href={pageHref(page + 1)} className="hover:text-amber">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </main>
    </div>
  );
}
