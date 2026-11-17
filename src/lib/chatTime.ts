/** LuluChat message times, shown in Malaysia time. */
export function formatChatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
