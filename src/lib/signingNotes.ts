import { CLAIM_INVOICE_FINANCIER } from "@/lib/claimInvoices";

export interface ParsedSigningNote {
  buyerName: string;
  financier: string;
  /** Plain digits/decimal, no thousands commas - "" when not found. */
  loanAmount: string;
  retention: string;
}

const EMPTY: ParsedSigningNote = { buyerName: "", financier: "", loanAmount: "", retention: "" };

function plainNumber(raw: string): string {
  return raw.replace(/,/g, "");
}

/**
 * Reads the loan-approval note staff paste on a Stock Board car, e.g.
 *   "RM0 ELK-DESA WC 4351L KANMANI A/P BALAKRISHNAN 20,500.00 @ 10.00% RM482.00 x 65 mths
 *    + RM445.00 Retention: RM0.00 *G - payment voucher with company chop* T&C apply. TQ!"
 * and pulls out the buyer name, financier, loan amount and retention. The plate can be
 * written with a space ("WC 4351L") and the name may be wrapped in brackets, so the plate
 * is stripped by matching it loosely. Anything it can't find comes back as "" for staff to type.
 */
export function parseSigningNote(note: string | undefined, plate: string): ParsedSigningNote {
  const text = (note ?? "").replace(/\s+/g, " ").trim();
  if (!text) return EMPTY;

  const loanMatch = text.match(/([\d,]+(?:\.\d+)?)\s*@\s*[\d.]+\s*%/);
  const retentionMatch = text.match(/Retention:?\s*RM\s*([\d,]+(?:\.\d+)?)/i);

  let financier = "";
  if (/ELK[-\s]?DESA/i.test(text)) {
    financier = CLAIM_INVOICE_FINANCIER;
  } else {
    const first = text.match(/^RM[\d,.]*\s+(\S+)/i);
    if (first) financier = first[1];
  }

  let buyerName = "";
  if (loanMatch && loanMatch.index !== undefined) {
    let segment = text.slice(0, loanMatch.index);
    segment = segment.replace(/^RM[\d,.]*\s*/i, "");
    segment = segment.replace(/^ELK[-\s]?DESA\s*/i, "");
    if (!/ELK[-\s]?DESA/i.test(text) && financier) {
      segment = segment.replace(new RegExp(`^${financier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "");
    }

    const loosePlate = plate
      .replace(/\s+/g, "")
      .split("")
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s*");
    const withoutPlate = loosePlate ? segment.replace(new RegExp(loosePlate, "i"), " ") : segment;
    segment =
      withoutPlate !== segment
        ? withoutPlate
        : segment.replace(/^\s*[A-Z]{1,3}\s?\d{1,4}[A-Z]{0,2}\s+/i, " ");

    buyerName = segment.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  }

  return {
    buyerName,
    financier,
    loanAmount: loanMatch ? plainNumber(loanMatch[1]) : "",
    retention: retentionMatch ? plainNumber(retentionMatch[1]) : "",
  };
}
