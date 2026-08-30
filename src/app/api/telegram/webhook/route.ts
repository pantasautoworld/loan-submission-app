import { NextResponse } from "next/server";
import { findByPlate, fetchStockBoardVehicles, markLoanApproved } from "@/lib/stockBoard";
import {
  answerTelegramCallbackQuery,
  editTelegramMessageCaption,
  getTelegramFileBytes,
  notifyTelegram,
  sendTelegramMessage,
  telegramChatAllowlist,
} from "@/lib/telegram";
import { buildDepositCaption, recordDepositPayment, resolveDepositPayment } from "@/lib/depositPayments";

// Every real approval note already starts "RM<deposit> ELK-DESA <PLATE> <name>..."
// (both with and without a dash before the name) - anchoring on "ELK-DESA" doubles
// as the "is this actually an approval message" gate, so casual chat in the same
// 1:1 threads notifyTelegram already uses never triggers a reply.
const APPROVAL_PATTERN = /ELK-DESA\s+([A-Z]{1,3})\s?(\d{1,4})([A-Z]{0,2})/i;

const DEPOSIT_CALLBACK_PATTERN = /^dep:([0-9a-f-]+):(approve|reject)$/i;

interface TelegramPhotoSize {
  file_id: string;
  width: number;
  height: number;
}

interface TelegramUpdate {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    caption?: string;
    photo?: TelegramPhotoSize[];
    from?: { first_name?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { id?: number | string; first_name?: string };
    message?: {
      chat?: { id?: number | string };
      message_id?: number;
    };
  };
}

/** "<PLATE> <AMOUNT> <note...>" e.g. "CEG171 5000 Booking deposit" - the format staff use when texting a receipt straight to the bot. */
function parseDepositCaption(caption: string): { plateRaw: string; amount: number; note: string } | null {
  const tokens = caption.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  const amount = Number(tokens[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { plateRaw: tokens[0], amount, note: tokens.slice(2).join(" ") };
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

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  if (chatId === undefined) return NextResponse.json({ ok: true });

  const allowlist = telegramChatAllowlist();
  if (!allowlist.includes(String(chatId))) return NextResponse.json({ ok: true });

  if (update.message?.photo && update.message.photo.length > 0) {
    await handleDepositPhoto(String(chatId), update.message.photo, update.message.caption ?? "", update.message.from?.first_name);
    return NextResponse.json({ ok: true });
  }

  const text = update.message?.text;
  if (!text) return NextResponse.json({ ok: true });

  const match = text.match(APPROVAL_PATTERN);
  if (!match) return NextResponse.json({ ok: true }); // not an approval message - ignore silently

  const plate = `${match[1]}${match[2]}${match[3] ?? ""}`;
  const actorName = update.message?.from?.first_name || "Telegram";

  try {
    const result = await markLoanApproved(plate, text, actorName);
    if (result.ok) {
      // Broadcast to every staff chat (same audience as notifyTelegram's other
      // notifications) - not just the one who pasted it, so the whole team sees
      // the car moved to Loan Approved.
      await notifyTelegram(
        `✅ <b>${result.vehicle.vehicle}</b> (${result.vehicle.vin}) → Loan Approved.\n` +
          `Updated by ${actorName}. Notes updated.`
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

/** Staff texted a deposit receipt straight to the bot: "<PLATE> <AMOUNT> <label>" as the photo's caption. */
async function handleDepositPhoto(
  chatId: string,
  photos: TelegramPhotoSize[],
  caption: string,
  fromName: string | undefined
): Promise<void> {
  const parsed = parseDepositCaption(caption);
  if (!parsed) {
    await sendTelegramMessage(
      chatId,
      `⚠️ Couldn't read that as a deposit payment. Send the receipt photo with caption "PLATE AMOUNT label", e.g. "CEG171 5000 Booking deposit".`
    );
    return;
  }

  try {
    const vehicles = await fetchStockBoardVehicles();
    const vehicle = findByPlate(parsed.plateRaw, vehicles);
    if (!vehicle || vehicle.status !== "reserved") {
      await sendTelegramMessage(
        chatId,
        `⚠️ No car currently marked Loan Approved matches plate "${parsed.plateRaw}".`
      );
      return;
    }

    const largest = photos[photos.length - 1];
    const bytes = await getTelegramFileBytes(largest.file_id);
    if (!bytes) {
      await sendTelegramMessage(chatId, `⚠️ Could not download that photo - please try sending it again.`);
      return;
    }

    await recordDepositPayment({
      stockBoardVehicleId: vehicle.id,
      noPlate: vehicle.vin,
      vehicle: vehicle.vehicle,
      note: parsed.note,
      method: "",
      amount: parsed.amount,
      receiptBytes: bytes,
      receiptExt: "jpg",
      uploadedByProfileId: null,
      uploadedByName: fromName || "Telegram",
      source: "telegram",
    });

    await sendTelegramMessage(
      chatId,
      `✅ Logged RM${parsed.amount.toLocaleString()} for ${vehicle.vehicle} (${vehicle.vin}) - waiting for approval.`
    );
  } catch (err) {
    console.error("[telegram webhook] failed to record deposit payment:", err);
    await sendTelegramMessage(chatId, `⚠️ Could not save that payment - please try again.`);
  }
}

/** Admin tapped ✅ Approve / ❌ Reject under a deposit payment's receipt photo. */
async function handleCallbackQuery(cq: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
  const fromId = cq.from?.id;
  if (fromId === undefined || !cq.data) return;

  if (!telegramChatAllowlist().includes(String(fromId))) {
    await answerTelegramCallbackQuery(cq.id, "Not authorized.");
    return;
  }

  const match = cq.data.match(DEPOSIT_CALLBACK_PATTERN);
  if (!match) return;

  const [, paymentId, action] = match;
  const decision = action.toLowerCase() === "approve" ? "approved" : "rejected";
  const approverName = cq.from?.first_name || "Admin";

  const resolved = await resolveDepositPayment(paymentId, decision, approverName);
  if (!resolved) {
    await answerTelegramCallbackQuery(cq.id, "Already resolved.");
    return;
  }

  await answerTelegramCallbackQuery(cq.id, decision === "approved" ? "Approved!" : "Rejected.");

  const resolvedLine =
    decision === "approved" ? `✅ Approved by ${approverName}` : `❌ Rejected by ${approverName}`;
  const caption = `${buildDepositCaption({
    vehicle: resolved.carDeposit.vehicle,
    noPlate: resolved.carDeposit.no_plate,
    amount: resolved.payment.amount,
    note: resolved.payment.note,
    method: resolved.payment.method,
    uploadedByName: resolved.payment.uploaded_by_name,
  })}\n\n${resolvedLine}`;

  // Update every admin's copy of the message, not just the one who tapped -
  // otherwise the other admins are left looking at stale Approve/Reject buttons.
  await Promise.all(
    resolved.payment.telegram_messages.map((tm) => editTelegramMessageCaption(tm.chat_id, tm.message_id, caption))
  );

  await notifyTelegram(
    `${resolvedLine}: RM${resolved.payment.amount.toLocaleString()}` +
      `${resolved.payment.note ? ` (${resolved.payment.note})` : ""} for ` +
      `${resolved.carDeposit.vehicle} (${resolved.carDeposit.no_plate}).`
  );
}
