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

/** Like sendTelegramMessage, but with inline buttons and returns the sent message's id (needed to edit it later) - for a deposit payment logged with no receipt. */
export async function sendTelegramMessageWithKeyboard(
  chatId: string,
  text: string,
  replyMarkup: InlineKeyboard
): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: replyMarkup },
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`[telegram] sendMessage (keyboard) failed for chat ${chatId}:`, data.description);
      return null;
    }
    return data.result.message_id as number;
  } catch (err) {
    console.error(`[telegram] sendMessage (keyboard) failed for chat ${chatId}:`, err);
    return null;
  }
}

/** Updates a previously-sent plain text message - the receipt-less counterpart to editTelegramMessageCaption. */
export async function editTelegramMessageText(
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboard
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: replyMarkup ?? [] },
      }),
    });
  } catch (err) {
    console.error(`[telegram] editMessageText failed for chat ${chatId}:`, err);
  }
}

/** The same allowlist notifyTelegram broadcasts to - reused by the webhook to authorize inbound senders. */
export function telegramChatAllowlist(): string[] {
  return (process.env.TELEGRAM_CHAT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export type InlineKeyboard = { text: string; callback_data: string }[][];

/** Sends a photo with a caption and optional inline buttons; returns the sent message's id (needed to edit it later), or null on failure. */
export async function sendTelegramPhoto(
  chatId: string,
  photoBytes: Buffer,
  filename: string,
  caption: string,
  replyMarkup?: InlineKeyboard
): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    if (replyMarkup) form.append("reply_markup", JSON.stringify({ inline_keyboard: replyMarkup }));
    form.append("photo", new Blob([new Uint8Array(photoBytes)]), filename);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`[telegram] sendPhoto failed for chat ${chatId}:`, data.description);
      return null;
    }
    return data.result.message_id as number;
  } catch (err) {
    console.error(`[telegram] sendPhoto failed for chat ${chatId}:`, err);
    return null;
  }
}

/** Downloads a photo a staff member sent to the bot, by its file_id. */
export async function getTelegramFileBytes(fileId: string): Promise<Buffer | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) return null;

    const bytesRes = await fetch(`https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`);
    if (!bytesRes.ok) return null;
    return Buffer.from(await bytesRes.arrayBuffer());
  } catch (err) {
    console.error(`[telegram] getFile failed for ${fileId}:`, err);
    return null;
  }
}

/** Updates a previously-sent photo's caption/buttons - used to resolve an Approve/Reject prompt after it's tapped. */
export async function editTelegramMessageCaption(
  chatId: string,
  messageId: number,
  caption: string,
  replyMarkup?: InlineKeyboard
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageCaption`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        caption,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: replyMarkup ?? [] },
      }),
    });
  } catch (err) {
    console.error(`[telegram] editMessageCaption failed for chat ${chatId}:`, err);
  }
}

/** Required after handling a button tap - stops the button's loading spinner and can show a brief toast. */
export async function answerTelegramCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch (err) {
    console.error("[telegram] answerCallbackQuery failed:", err);
  }
}
