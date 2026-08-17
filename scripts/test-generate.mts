// Smoke test for the document-generation pipeline (template fill -> LibreOffice
// PDF conversion -> attachment merge), using fabricated data instead of a real
// Supabase submission. Run with: npx tsx scripts/test-generate.mts
import { writeFile } from "node:fs/promises";
import { buildWorkbookBuffer } from "../src/lib/pdf/buildWorkbook";
import { convertXlsxToPdf } from "../src/lib/convertToPdf";
import { mergePdfPacketWithAttachments } from "../src/lib/pdf/mergeDocuments";
import type { SubmissionDocData } from "../src/lib/formTemplate";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const doc: SubmissionDocData = {
  dealer: { name: "WILLIAM", phone: "016-220 9393" },
  vehicle: {
    plateNo: "BNT4054",
    model: "PROTON IRIZ 1.3L CVT (A)",
    yearMade: 2016,
    financeLoan: 23000,
    tenureYears: 6,
  },
  hirer: {
    name: "AHMAD BIN TEST",
    nric: "900920-01-6763",
    address1: "1-1-17, APT MEGAH COURT JLN 1/64",
    address2: "51200 KUALA LUMPUR",
    phone: "011-60767698",
    officePhone: "",
    jobPosition: "Executive",
    email: "ahmad@example.com",
    maritalStatus: "SINGLE",
    relationshipToHirer: "",
  },
  guarantor1: {
    name: "NUR FATAHIYAH ANUM BINTI MAJID KHAN",
    nric: "860922-35-5466",
    address1: "1-1-17, APT MEGAH COURT JLN 1/64",
    address2: "51200 KUALA LUMPUR",
    phone: "012-3456789",
    officePhone: "",
    jobPosition: "Clerk",
    email: "",
    maritalStatus: "SINGLE",
    relationshipToHirer: "SAUDARA",
  },
  guarantor2: {
    name: "SECOND GUARANTOR TEST",
    nric: "880101-14-5566",
    address1: "1-1-17, APT MEGAH COURT JLN 1/64",
    address2: "51200 KUALA LUMPUR",
    phone: "013-9998888",
    officePhone: "",
    jobPosition: "Manager",
    email: "",
    maritalStatus: "MARRIED",
    relationshipToHirer: "FRIEND",
  },
  date: "7/08/2026",
};

async function main() {
  console.log("Building workbook (2 guarantors)...");
  const xlsx = await buildWorkbookBuffer(doc, true, {
    hirer: TINY_PNG,
    guarantor1: TINY_PNG,
    guarantor2: TINY_PNG,
  });
  await writeFile("scratchpad-output.xlsx", xlsx);
  console.log(`  xlsx: ${xlsx.length} bytes`);

  console.log("Converting to PDF via LibreOffice...");
  const pdf = await convertXlsxToPdf(xlsx);
  console.log(`  pdf: ${pdf.length} bytes`);

  console.log("Merging in a dummy attachment (image)...");
  const combined = await mergePdfPacketWithAttachments(pdf, [
    { bytes: TINY_PNG, extension: "png" },
  ]);
  console.log(`  combined pdf: ${combined.length} bytes`);

  await writeFile("scratchpad-output.pdf", combined);
  console.log("Wrote scratchpad-output.xlsx and scratchpad-output.pdf");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
