import { NextResponse } from "next/server";
import { markLoanApproved } from "@/lib/stockBoard";
import { sendTelegramMessage, telegramChatAllowlist } from "@/lib/telegram";

// Every real approval note already starts "RM<deposit> ELK-DESA <PLATE> <name>..."
// (both with and without a dash before the name) - anchoring on "ELK-DESA" doubles
// as the "is this actually an approval message" gate, so casual chat in the same
// 1:1 threads notifyTelegram already uses never triggers a reply.
const APPROVAL_PATTERN = /ELK-DESA\s+([A-Z]{1,3})\s?(\d{1,4})([A-Z]{0,2})/i;

interface TelegramUpdate {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    from?: { first_name?: string };
  };
}

export async function POST(request: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== expectedSecret) {
      return NextResponse.json({ ok: true }); // don't reveal why - just no-op
    }
  } else {
    console.warn("[telegram webhook] TELEGRAM_WEBHOOK_SECRET is not set - accepting unverified requests.");
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  const text = update.message?.text;
  if (chatId === undefined || !text) return NextResponse.json({ ok: true });

  const allowlist = telegramChatAllowlist();
  if (!allowlist.includes(String(chatId))) return NextResponse.json({ ok: true });

  const match = text.match(APPROVAL_PATTERN);
  if (!match) return NextResponse.json({ ok: true }); // not an approval message - ignore silently

  const plate = `${match[1]}${match[2]}${match[3] ?? ""}`;
  const actorName = update.message?.from?.first_name || "Telegram";

  try {
    const result = await markLoanApproved(plate, text, actorName);
    if (result.ok) {
      await sendTelegramMessage(
        String(chatId),
        `✅ Updated <b>${result.vehicle.vehicle}</b> (${result.vehicle.vin}) → Loan Approved. Notes updated.`
      );
    } else {
      await sendTelegramMessage(String(chatId), `⚠️ ${result.reason}`);
    }
  } catch (err) {
    console.error("[telegram webhook] failed to update Stock Board:", err);
    await sendTelegramMessage(
      String(chatId),
      `⚠️ Could not reach the Stock Board for plate "${plate}" - please update it manually.`
    );
  }

  return NextResponse.json({ ok: true });
}
