/**
 * Best-effort Telegram notification - failures here should never break the
 * actual document generation flow, so callers should not await-and-throw on
 * errors from this. Sends to every chat ID in TELEGRAM_CHAT_IDS (comma-separated)
 * so more staff can be added without a code change.
 */
export async function notifyTelegram(text: string): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  await Promise.all(telegramChatAllowlist().map((chatId) => sendTelegramMessage(chatId, text)));
}

/** Sends to exactly one chat - e.g. replying to whichever staff member's message triggered a webhook action. */
export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch (err) {
    console.error(`[telegram] send failed for chat ${chatId}:`, err);
  }
}

/** The same allowlist notifyTelegram broadcasts to - reused by the webhook to authorize inbound senders. */
export function telegramChatAllowlist(): string[] {
  return (process.env.TELEGRAM_CHAT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}
