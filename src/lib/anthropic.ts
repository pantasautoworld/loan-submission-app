import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_EXTRACTION_MODEL || "claude-haiku-4-5-20251001";

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local to enable IC/bill scanning."
    );
  }
  return new Anthropic({ apiKey });
}

type DocSource =
  | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }
  | { kind: "pdf"; base64: string };

async function extractJson<T>(source: DocSource, instructions: string): Promise<T> {
  const anthropic = client();

  const documentBlock =
    source.kind === "pdf"
      ? ({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: source.base64 },
        } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: source.mediaType, data: source.base64 },
        } as const);

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          documentBlock,
          {
            type: "text",
            text: `${instructions}\n\nRespond with ONLY a JSON object, no other text, no markdown code fences.`,
          },
        ],
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Model did not return JSON: ${text}`);
  return JSON.parse(jsonMatch[0]) as T;
}

export interface IcExtraction {
  name: string;
  nric: string;
}

export async function extractIc(source: DocSource): Promise<IcExtraction> {
  const result = await extractJson<IcExtraction>(
    source,
    `This is a photo of a Malaysian identity card (MyKad). Read the printed "Nama"/Name normally and return it even if the photo is imperfect. Separately, read the 12-digit NRIC number, printed in large bold digits near the top-left of the card, format XXXXXX-XX-XXXX (6-digit birthdate, 2-digit state code, 4-digit serial) - read each of its 12 digits carefully and individually, since this feeds an official finance/loan application and a wrong digit is far worse than a blank one. Only for the NRIC specifically: if the photo is blurry, tilted, glared, or any single digit isn't clearly legible, return an empty string for "nric" rather than guessing. This caution applies only to the NRIC digits, not the name. Return {"name": string, "nric": string}.`
  );

  const nric = result.nric.trim();
  const digits = nric.replace(/[^0-9]/g, "");
  const month = parseInt(digits.slice(2, 4), 10);
  const day = parseInt(digits.slice(4, 6), 10);
  const isPlausibleShape =
    digits.length === 12 && month >= 1 && month <= 12 && day >= 1 && day <= 31;

  return {
    name: result.name.trim(),
    nric: nric && isPlausibleShape ? nric : "",
  };
}

export interface BillExtraction {
  address: string;
}

export async function extractBillAddress(source: DocSource): Promise<BillExtraction> {
  return extractJson<BillExtraction>(
    source,
    `This is a Malaysian electricity (TNB) or water utility bill. Read the customer's billing/service address exactly as printed (the address the utility is billed to, not TNB's own company address). The customer's name is usually printed as its own line directly above the address - do NOT include that name line in the result, only the actual address lines (unit/house no., street, area, postcode, city, state). Return {"address": string} as a single string with the address lines only, joined by ", ". If it can't be read, use an empty string.`
  );
}

export interface VocExtraction {
  plateNo: string;
}

// Malaysian plates: 1-3 letters, up to 4 digits, optional 1-2 trailing letters (e.g. new EV series).
// Used to reject obvious mis-reads (e.g. the model grabbing "No. Enjin"/"No. Casis" instead).
const PLATE_PATTERN = /^[A-Z]{1,3}\d{1,4}[A-Z]{0,2}$/;

export async function extractVocPlate(source: DocSource): Promise<VocExtraction> {
  const result = await extractJson<VocExtraction>(
    source,
    `This is a Malaysian Vehicle Ownership Certificate - either a "Sijil Pemilikan Kenderaan" (newer MyKad-style card) or a "Perakuan Pendaftaran Kenderaan" (older certificate). Read ONLY the vehicle's registration number/plate, labelled "No. Pendaftaran" or "NO. PENDAFTARAN". Do NOT read "No. Enjin"/"Engine No." or "No. Casis"/"Chassis No." - those are different fields on the same document and must never be used as the plate. A genuine Malaysian plate is short, e.g. "WWT 7595" or "AKK6428" (1-3 letters then up to 4 digits, optionally a trailing letter) - unlike an engine or chassis number, which is a long mixed alphanumeric string. Return {"plateNo": string} with the plate exactly as printed (spaces are fine). If you cannot confidently find the field labelled "No. Pendaftaran", use an empty string rather than guessing.`
  );

  const raw = result.plateNo.trim();
  const normalized = raw.replace(/\s+/g, "").toUpperCase();
  if (raw && !PLATE_PATTERN.test(normalized)) {
    return { plateNo: "" };
  }
  return { plateNo: raw };
}

export interface GrantExtraction {
  vehicleNo: string;
  model: string;
  chassisNo: string;
  engineNo: string;
  ownerName: string;
  ownerAddress: string;
}

/** Fuller read of the same document extractVocPlate uses, for the claim invoice generator - pulls every field the invoice needs, not just the plate. */
export async function extractGrantDetails(source: DocSource): Promise<GrantExtraction> {
  const result = await extractJson<GrantExtraction>(
    source,
    `This is a Malaysian Vehicle Ownership Certificate ("Sijil Pemilikan Kenderaan" / "Perakuan Pendaftaran Kenderaan"). Read these fields exactly as printed:
- "No. Pendaftaran" (registration/plate no.) - a short plate like "WWT 7595", never the engine or chassis number.
- "Buatan / Nama Model" (make/model).
- "No. Chasis / No. Enjin" - this is usually ONE combined row holding BOTH numbers together, separated by a "/", e.g. "PL1BH3LTRLG058271 / S4PEVW8884" (chassis number first, engine number second - split it into chassisNo and engineNo accordingly). If chassis and engine are instead printed as two separate labelled fields, read them separately the same way. Either way, do NOT use "Keupayaan Enjin" (engine capacity, a short number like "1332" or "1500") for the engine number - that is a completely different field.
- "Nama Pemunya Berdaftar" (registered owner's full name).
- "Alamat" (registered owner's address).
Return {"vehicleNo": string, "model": string, "chassisNo": string, "engineNo": string, "ownerName": string, "ownerAddress": string}. Use an empty string for any field you cannot confidently read rather than guessing.`
  );

  return {
    vehicleNo: result.vehicleNo.trim(),
    model: result.model.trim(),
    chassisNo: result.chassisNo.trim(),
    engineNo: result.engineNo.trim(),
    ownerName: result.ownerName.trim(),
    ownerAddress: result.ownerAddress.trim(),
  };
}
