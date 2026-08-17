// Cell mapping for templates/elk-desa-capital.xlsx (ELK-Desa Capital packet, pg1-5).
// Addresses were extracted from the original hand-filled workbook's formulas
// (each formula pointed at a MASTER LIST or cross-sheet cell) - see
// scripts/build-template.mjs, which blanked exactly these same addresses.
// The generator writes literal values here instead of relying on formula
// recalculation, which is unreliable to trigger in a headless PDF conversion.

export interface PersonData {
  name: string;
  nric: string;
  address1: string;
  address2: string;
  phone: string;
  officePhone: string;
  jobPosition: string;
  email: string;
  maritalStatus: string;
  relationshipToHirer: string;
}

export interface VehicleData {
  plateNo: string;
  model: string;
  yearMade: string | number;
  financeLoan: string | number;
  tenureYears: string | number;
}

export interface DealerData {
  name: string;
  phone: string;
}

export interface SubmissionDocData {
  dealer: DealerData;
  vehicle: VehicleData;
  hirer: PersonData;
  guarantor1: PersonData;
  guarantor2?: PersonData; // omit => ELK pg5 is dropped from the generated packet
  /** Formatted as it should appear on the consent letters, e.g. "7/08/2026" */
  date: string;
}

export type SignerRole = "hirer" | "guarantor1" | "guarantor2";

export interface CellWrite {
  sheet: string;
  cell: string;
  value: (d: SubmissionDocData) => string | number;
}

export const CELL_WRITES: CellWrite[] = [
  // --- ELK pg1: Hire Purchase Application ---
  { sheet: "ELK pg1", cell: "C9", value: (d) => d.vehicle.plateNo },
  { sheet: "ELK pg1", cell: "C10", value: (d) => d.vehicle.model },
  { sheet: "ELK pg1", cell: "C11", value: (d) => d.vehicle.yearMade },
  { sheet: "ELK pg1", cell: "C12", value: (d) => d.vehicle.financeLoan },
  { sheet: "ELK pg1", cell: "C13", value: (d) => d.vehicle.tenureYears },
  { sheet: "ELK pg1", cell: "C14", value: (d) => d.dealer.name },
  { sheet: "ELK pg1", cell: "C15", value: (d) => d.dealer.phone },

  { sheet: "ELK pg1", cell: "C18", value: (d) => d.hirer.name },
  { sheet: "ELK pg1", cell: "C19", value: (d) => d.hirer.nric },
  { sheet: "ELK pg1", cell: "C20", value: (d) => d.hirer.address1 },
  { sheet: "ELK pg1", cell: "C21", value: (d) => d.hirer.address2 },
  { sheet: "ELK pg1", cell: "C22", value: (d) => d.hirer.email },
  { sheet: "ELK pg1", cell: "H19", value: (d) => d.hirer.phone },
  { sheet: "ELK pg1", cell: "H20", value: (d) => d.hirer.officePhone },
  { sheet: "ELK pg1", cell: "H21", value: (d) => d.hirer.jobPosition },
  { sheet: "ELK pg1", cell: "C25", value: (d) => d.guarantor1.name },
  { sheet: "ELK pg1", cell: "C26", value: (d) => d.guarantor1.nric },
  { sheet: "ELK pg1", cell: "C27", value: (d) => d.guarantor1.address1 },
  { sheet: "ELK pg1", cell: "C28", value: (d) => d.guarantor1.address2 },
  { sheet: "ELK pg1", cell: "C29", value: (d) => d.guarantor1.relationshipToHirer },
  { sheet: "ELK pg1", cell: "H25", value: (d) => d.guarantor1.maritalStatus },
  { sheet: "ELK pg1", cell: "H26", value: (d) => d.guarantor1.phone },
  { sheet: "ELK pg1", cell: "H27", value: (d) => d.guarantor1.officePhone },
  { sheet: "ELK pg1", cell: "H28", value: (d) => d.guarantor1.jobPosition },

  { sheet: "ELK pg1", cell: "C33", value: (d) => d.guarantor2?.name ?? "" },
  { sheet: "ELK pg1", cell: "C34", value: (d) => d.guarantor2?.nric ?? "" },
  { sheet: "ELK pg1", cell: "C35", value: (d) => d.guarantor2?.address1 ?? "" },
  { sheet: "ELK pg1", cell: "C36", value: (d) => d.guarantor2?.address2 ?? "" },
  { sheet: "ELK pg1", cell: "C37", value: (d) => d.guarantor2?.relationshipToHirer ?? "" },
  { sheet: "ELK pg1", cell: "H33", value: (d) => d.guarantor2?.maritalStatus ?? "" },
  { sheet: "ELK pg1", cell: "H34", value: (d) => d.guarantor2?.phone ?? "" },
  { sheet: "ELK pg1", cell: "H35", value: (d) => d.guarantor2?.officePhone ?? "" },
  { sheet: "ELK pg1", cell: "H36", value: (d) => d.guarantor2?.jobPosition ?? "" },

  // --- ELK pg2: Customer Consent Form (Hirer only) ---
  { sheet: "ELK pg2", cell: "C3", value: (d) => d.hirer.name },
  { sheet: "ELK pg2", cell: "D4", value: (d) => d.hirer.nric },
  { sheet: "ELK pg2", cell: "I4", value: (d) => d.hirer.address1 },
  { sheet: "ELK pg2", cell: "B5", value: (d) => d.hirer.address2 },
  { sheet: "ELK pg2", cell: "C46", value: (d) => d.hirer.name },
  { sheet: "ELK pg2", cell: "C47", value: (d) => d.hirer.nric },
  { sheet: "ELK pg2", cell: "C48", value: (d) => d.date },
  { sheet: "ELK pg2", cell: "C49", value: (d) => d.hirer.email },
  { sheet: "ELK pg2", cell: "C51", value: (d) => d.hirer.phone },

  // --- ELK pg3: Experian consent (Hirer + Guarantor1 + Guarantor2) ---
  { sheet: "ELK pg3", cell: "C1", value: (d) => d.date },
  { sheet: "ELK pg3", cell: "C39", value: (d) => d.hirer.name },
  { sheet: "ELK pg3", cell: "C40", value: (d) => d.hirer.nric },
  { sheet: "ELK pg3", cell: "C46", value: (d) => d.guarantor1.name },
  { sheet: "ELK pg3", cell: "C47", value: (d) => d.guarantor1.nric },
  { sheet: "ELK pg3", cell: "I46", value: (d) => d.guarantor2?.name ?? "" },
  { sheet: "ELK pg3", cell: "I47", value: (d) => d.guarantor2?.nric ?? "" },

  // --- ELK pg4: CTOS consent (Hirer + Guarantor1) ---
  { sheet: "ELK pg4", cell: "D1", value: (d) => d.date },
  { sheet: "ELK pg4", cell: "E47", value: (d) => d.hirer.name },
  { sheet: "ELK pg4", cell: "E49", value: (d) => d.hirer.nric },
  { sheet: "ELK pg4", cell: "E50", value: (d) => d.hirer.jobPosition },
  { sheet: "ELK pg4", cell: "J47", value: (d) => d.guarantor1.name },
  { sheet: "ELK pg4", cell: "J49", value: (d) => d.guarantor1.nric },
  { sheet: "ELK pg4", cell: "J50", value: (d) => d.guarantor1.jobPosition },

  // --- ELK pg5: CTOS consent (Hirer + Guarantor2) - only written/kept when guarantor2 exists ---
  { sheet: "ELK pg5", cell: "D1", value: (d) => d.date },
  { sheet: "ELK pg5", cell: "E47", value: (d) => d.hirer.name },
  { sheet: "ELK pg5", cell: "E49", value: (d) => d.hirer.nric },
  { sheet: "ELK pg5", cell: "E50", value: (d) => d.hirer.jobPosition },
  { sheet: "ELK pg5", cell: "J47", value: (d) => d.guarantor2?.name ?? "" },
  { sheet: "ELK pg5", cell: "J49", value: (d) => d.guarantor2?.nric ?? "" },
  { sheet: "ELK pg5", cell: "J50", value: (d) => d.guarantor2?.jobPosition ?? "" },
];

export interface SignatureSlot {
  sheet: string;
  /** Anchor cell range for the signature image, above/near the printed name line. */
  anchor: { from: string; to: string };
}

// Which sheets each signer's adopted signature image gets placed on.
// A signer's single captured signature is reused across every slot they own.
export const SIGNATURE_SLOTS: Record<SignerRole, SignatureSlot[]> = {
  hirer: [
    { sheet: "ELK pg1", anchor: { from: "C44", to: "E45" } },
    { sheet: "ELK pg2", anchor: { from: "B44", to: "D45" } },
    { sheet: "ELK pg3", anchor: { from: "B35", to: "D37" } },
    { sheet: "ELK pg4", anchor: { from: "C42", to: "E44" } },
    { sheet: "ELK pg5", anchor: { from: "C42", to: "E44" } },
  ],
  guarantor1: [
    { sheet: "ELK pg3", anchor: { from: "B42", to: "D44" } },
    { sheet: "ELK pg4", anchor: { from: "I42", to: "K44" } },
  ],
  guarantor2: [
    { sheet: "ELK pg3", anchor: { from: "H42", to: "J44" } },
    { sheet: "ELK pg5", anchor: { from: "I42", to: "J44" } },
  ],
};

/** Sheet order in the generated packet. pg5 is dropped when there's no 2nd guarantor. */
export const PACKET_SHEETS_WITH_GUARANTOR2 = ["ELK pg1", "ELK pg2", "ELK pg3", "ELK pg4", "ELK pg5"];
export const PACKET_SHEETS_SINGLE_GUARANTOR = ["ELK pg1", "ELK pg2", "ELK pg3", "ELK pg4"];

export const TEMPLATE_PATH = "templates/elk-desa-capital.xlsx";
