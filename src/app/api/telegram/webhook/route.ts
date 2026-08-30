import { NextResponse } from "next/server";
import { findByPlate, fetchStockBoardVehicles, markLoanApproved } from "@/lib/stockBoard";
import {
  answerTelegramCallbackQuery,
  getTelegramFileBytes,
  notifyTelegram,
  sendTelegramDocument,
  sendTelegramMessage,
  telegramChatAllowlist,
} from "@/lib/telegram";
import { recordDepositPayment, resolveDepositPaymentAndNotify } from "@/lib/depositPayments";
import { attachClaimInvoiceGrant, CLAIM_INVOICE_FINANCIER, createClaimInvoice } from "@/lib/claimInvoices";
import { extractGrantDetails } from "@/lib/anthropic";
import { buildClaimInvoicePdf } from "@/lib/pdf/claimInvoicePdf";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  advanceInvoiceDraftToDeposit,
  advanceInvoiceDraftToLoan,
  deleteInvoiceDraft,
  getInvoiceDraft,
  startInvoiceDraft,
  type TelegramInvoiceDraft,
} from "@/lib/telegramInvoiceDrafts";

const CARS_ELIGIBLE_FOR_DEPOSITS = ["reserved"];

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

interface TelegramDocument {
  file_id: string;
  mime_type?: string;
}

interface TelegramUpdate {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    caption?: string;
    photo?: TelegramPhotoSize[];
    document?: TelegramDocument;
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

/** "DD/MM/YYYY" or "DD-MM-YY" etc, as typed in reply to the invoice flow's delivery-date question. */
function parseDateDMY(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** A loan/deposit amount typed in reply to the invoice flow's questions - accepts "27000", "27,000", or "RM27000". */
function parseAmountReply(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, "").replace(/^rm/i, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
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

  const fromName = update.message?.from?.first_name;

  if (update.message?.photo && update.message.photo.length > 0) {
    const caption = update.message.caption ?? "";
    if (caption.trim().toLowerCase() === "invoice") {
      await handleInvoicePhoto(String(chatId), update.message.photo, fromName);
    } else {
      await handleDepositPhoto(String(chatId), update.message.photo, caption, fromName);
    }
    return NextResponse.json({ ok: true });
  }

  // A PDF sent as a file (not a photo) still counts for the invoice flow - the
  // grant scanner already handles PDFs, so a scanned/exported grant works the
  // same way. Documents are only wired up for "invoice" - there's no PDF path
  // for deposit receipts, those are always a photographed receipt.
  if (update.message?.document) {
    const caption = update.message.caption ?? "";
    if (caption.trim().toLowerCase() === "invoice") {
      await handleInvoiceDocument(String(chatId), update.message.document, fromName);
    } else {
      await sendTelegramMessage(
        String(chatId),
        `⚠️ To generate an invoice from this file, resend it with the caption "invoice".`
      );
    }
    return NextResponse.json({ ok: true });
  }

  const text = update.message?.text;
  if (!text) return NextResponse.json({ ok: true });

  // A chat mid-way through the "send grant -> answer 3 questions" invoice flow
  // has every plain text reply routed there first, so a date/amount typed in
  // never gets mistaken for anything else (or silently ignored).
  const draft = await getInvoiceDraft(String(chatId));
  if (draft) {
    await handleInvoiceDraftReply(String(chatId), text, draft);
    return NextResponse.json({ ok: true });
  }

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
    if (!vehicle || !CARS_ELIGIBLE_FOR_DEPOSITS.includes(vehicle.status)) {
      await sendTelegramMessage(
        chatId,
        `⚠️ No car currently Loan Approved or awaiting deposit matches plate "${parsed.plateRaw}".`
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
      receiptNumber: "",
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

/** Admin sent a car grant photo with caption "invoice" - starts the "3 questions then auto-generate" claim invoice flow. */
async function handleInvoicePhoto(
  chatId: string,
  photos: TelegramPhotoSize[],
  fromName: string | undefined
): Promise<void> {
  try {
    const largest = photos[photos.length - 1];
    const bytes = await getTelegramFileBytes(largest.file_id);
    if (!bytes) {
      await sendTelegramMessage(chatId, `⚠️ Could not download that photo - please try sending it again.`);
      return;
    }

    const admin = createAdminClient();
    const grantPath = `claim-invoices/telegram-drafts/${chatId}.jpg`;
    const { error: uploadError } = await admin.storage
      .from("submission-files")
      .upload(grantPath, bytes, { upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    await startInvoiceDraft(chatId, grantPath, fromName || "Telegram");

    await sendTelegramMessage(
      chatId,
      `📄 Got the grant. What's the <b>delivery date</b>? Send it as DD/MM/YYYY, e.g. 31/8/2026.`
    );
  } catch (err) {
    console.error("[telegram webhook] failed to start invoice draft:", err);
    await sendTelegramMessage(chatId, `⚠️ Could not start the invoice - please try again.`);
  }
}

/** Admin sent a car grant as a PDF file with caption "invoice" - same flow as handleInvoicePhoto, just downloaded via the document's own file_id instead of picking the largest photo size. */
async function handleInvoiceDocument(
  chatId: string,
  document: TelegramDocument,
  fromName: string | undefined
): Promise<void> {
  try {
    const bytes = await getTelegramFileBytes(document.file_id);
    if (!bytes) {
      await sendTelegramMessage(chatId, `⚠️ Could not download that file - please try sending it again.`);
      return;
    }

    const admin = createAdminClient();
    const grantPath = `claim-invoices/telegram-drafts/${chatId}.pdf`;
    const { error: uploadError } = await admin.storage
      .from("submission-files")
      .upload(grantPath, bytes, { upsert: true, contentType: "application/pdf" });
    if (uploadError) throw new Error(uploadError.message);

    await startInvoiceDraft(chatId, grantPath, fromName || "Telegram");

    await sendTelegramMessage(
      chatId,
      `📄 Got the grant. What's the <b>delivery date</b>? Send it as DD/MM/YYYY, e.g. 31/8/2026.`
    );
  } catch (err) {
    console.error("[telegram webhook] failed to start invoice draft from document:", err);
    await sendTelegramMessage(chatId, `⚠️ Could not start the invoice - please try again.`);
  }
}

/** A plain-text reply from a chat mid-way through the invoice flow - routes by which of the 3 questions is still open. */
async function handleInvoiceDraftReply(chatId: string, text: string, draft: TelegramInvoiceDraft): Promise<void> {
  if (draft.step === "await_date") {
    const iso = parseDateDMY(text);
    if (!iso) {
      await sendTelegramMessage(
        chatId,
        `⚠️ Couldn't read that as a date. Send the delivery date as DD/MM/YYYY, e.g. 31/8/2026.`
      );
      return;
    }
    await advanceInvoiceDraftToLoan(chatId, iso);
    await sendTelegramMessage(chatId, `💰 <b>Loan amount</b> (RM)? Send 0 if this is a cash sale.`);
    return;
  }

  if (draft.step === "await_loan") {
    const amount = parseAmountReply(text);
    if (amount === null) {
      await sendTelegramMessage(chatId, `⚠️ Enter the loan amount as a number, e.g. 27000 (or 0 for cash).`);
      return;
    }
    await advanceInvoiceDraftToDeposit(chatId, amount);
    await sendTelegramMessage(chatId, `💵 <b>Deposit amount</b> (RM)?`);
    return;
  }

  // await_deposit - the final answer, so this generates the invoice.
  const depositAmount = parseAmountReply(text);
  if (depositAmount === null) {
    await sendTelegramMessage(chatId, `⚠️ Enter the deposit amount as a number, e.g. 6000.`);
    return;
  }

  await sendTelegramMessage(chatId, `⏳ Scanning the grant and generating the invoice…`);
  await finalizeInvoiceDraft(chatId, draft, depositAmount);
}

/** All 3 answers are in - scans the grant, creates the invoice, and sends back the PDF + a summary. */
async function finalizeInvoiceDraft(
  chatId: string,
  draft: TelegramInvoiceDraft,
  depositAmount: number
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: fileData, error: downloadError } = await admin.storage
      .from("submission-files")
      .download(draft.grant_path);
    if (downloadError || !fileData) {
      throw new Error(downloadError?.message ?? "Could not re-download the grant photo");
    }
    const grantBytes = Buffer.from(await fileData.arrayBuffer());
    const isPdf = draft.grant_path.toLowerCase().endsWith(".pdf");
    const grantExt = isPdf ? "pdf" : "jpg";

    const scanned = await extractGrantDetails(
      isPdf
        ? { kind: "pdf", base64: grantBytes.toString("base64") }
        : { kind: "image", mediaType: "image/jpeg", base64: grantBytes.toString("base64") }
    );

    const loanAmount = draft.loan_amount ?? 0;
    const sellingPrice = loanAmount + depositAmount;
    const term: "Loan" | "Cash" = loanAmount > 0 ? "Loan" : "Cash";

    const invoice = await createClaimInvoice(admin, {
      invoiceDate: draft.delivery_date!,
      agentName: draft.created_by_name,
      financier: CLAIM_INVOICE_FINANCIER,
      term,
      buyerName: scanned.ownerName,
      buyerAddress: scanned.ownerAddress,
      vehicleNo: scanned.vehicleNo,
      model: scanned.model,
      chassisNo: scanned.chassisNo,
      engineNo: scanned.engineNo,
      sellingPrice,
      loanAmount,
      depositAmount,
      createdByProfileId: null,
      createdByName: draft.created_by_name,
    });

    await attachClaimInvoiceGrant(admin, invoice.id, grantBytes, grantExt);
    await admin.storage.from("submission-files").remove([draft.grant_path]).catch(() => {});
    await deleteInvoiceDraft(chatId);

    const pdfBytes = await buildClaimInvoicePdf(invoice);
    const summary =
      `✅ <b>Invoice ${invoice.invoice_no} generated</b>\n` +
      `${invoice.buyer_name || "(name not read - check the grant scan)"}\n` +
      `${invoice.vehicle_no || "(plate not read)"} ${invoice.model || ""}`.trim() +
      `\nSelling price: RM${sellingPrice.toLocaleString()}` +
      (term === "Loan"
        ? ` (Loan RM${loanAmount.toLocaleString()} + Deposit RM${depositAmount.toLocaleString()})`
        : "");

    await sendTelegramMessage(chatId, summary);
    await sendTelegramDocument(chatId, pdfBytes, `${invoice.invoice_no.replace(/[^A-Za-z0-9]/g, "-")}.pdf`);

    if (!scanned.vehicleNo || !scanned.ownerName) {
      await sendTelegramMessage(
        chatId,
        `⚠️ Some fields couldn't be read confidently from the grant and were left blank - check the invoice in the app and fix them if needed.`
      );
    }
  } catch (err) {
    console.error("[telegram webhook] failed to finalize invoice draft:", err);
    await sendTelegramMessage(chatId, `⚠️ Could not generate the invoice - please try again or use the app instead.`);
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

  const resolved = await resolveDepositPaymentAndNotify(paymentId, decision, approverName);
  if (!resolved) {
    await answerTelegramCallbackQuery(cq.id, "Already resolved.");
    return;
  }

  await answerTelegramCallbackQuery(cq.id, decision === "approved" ? "Approved!" : "Rejected.");
}
