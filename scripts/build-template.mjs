// One-off script: builds the cleaned ELK-Desa Capital template from the
// original hand-filled workbook. Removes the MASTER LIST sheet (the app
// replaces it with a real form) and clears every formula-driven data cell
// on pg1-5, leaving only static labels/checklist/formatting/images intact.
// The app writes literal values (not formulas) into these same addresses
// at generation time - see src/lib/formTemplate.ts for the matching map.
import ExcelJS from "exceljs";

const SOURCE =
  "\\\\Pantasautoworld\\pantas autoworld\\LOAN SUBMISSION\\JULY 2026\\10) +601164413751 JRF6564 (YATT)\\KIWI AUTOWORLD FORM.xlsx";
const DEST = "templates/elk-desa-capital.xlsx";

const CLEAR_CELLS = {
  "ELK pg1": [
    "C9", "C10", "C11", "C12", "C13", "C14", "C15",
    "C18", "C19", "C20", "C21", "C22", "H19", "H20", "H21",
    "C25", "C26", "C27", "C28", "C29", "H25", "H26", "H27", "H28",
    "C33", "C34", "C35", "C36", "C37", "H33", "H34", "H35", "H36",
    "C42",
  ],
  "ELK pg2": ["C3", "D4", "I4", "B5", "B44", "C46", "C47", "C48", "C49", "C51"],
  "ELK pg3": ["C1", "B35", "C39", "C40", "B42", "H42", "C46", "C47", "I46", "I47"],
  "ELK pg4": ["D1", "C42", "I42", "E47", "J47", "E49", "J49", "E50", "J50"],
  "ELK pg5": ["D1", "C42", "I42", "E47", "J47", "E49", "J49", "E50", "J50"],
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SOURCE);

const master = wb.getWorksheet("MASTER LIST");
if (master) wb.removeWorksheet(master.id);

for (const [sheetName, addresses] of Object.entries(CLEAR_CELLS)) {
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
  for (const addr of addresses) {
    ws.getCell(addr).value = null;
  }
}

await wb.xlsx.writeFile(DEST);
console.log(`Wrote ${DEST}`);
