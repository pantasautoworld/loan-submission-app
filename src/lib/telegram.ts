/**
 * Best-effort Telegram notification - failures here should never break the
 * actual document generation flow, so callers should not await-and-throw on
 * errors from this. Sends to every chat ID in TELEGRAM_CHAT_IDS (comma-separated)
 * so more staff can be added without a code change.
 */
export async function notifyTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!token || chatIds.length === 0) return;

  await Promise.all(
    chatIds.map(async (chatId) => {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
        });
      } catch (err) {
        console.error(`[telegram] notify failed for chat ${chatId}:`, err);
      }
    })
  );
}
