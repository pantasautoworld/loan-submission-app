export type PersonRole = "hirer" | "guarantor1" | "guarantor2" | "reference1" | "reference2";
export type SignerRole = "hirer" | "guarantor1" | "guarantor2";

export type PersonFieldValue = string | number | boolean | null;
export type PersonFields = Record<string, PersonFieldValue>;

export type DocType =
  | "car_voc"
  | "hirer_ic"
  | "hirer_ic_back"
  | "hirer_license"
  | "hirer_license_back"
  | "hirer_payslip"
  | "hirer_payslip_template"
  | "hirer_epf"
  | "hirer_staff_tag"
  | "guarantor1_ic"
  | "guarantor1_ic_back"
  | "guarantor1_license"
  | "guarantor1_license_back"
  | "guarantor1_payslip"
  | "guarantor1_payslip_template"
  | "guarantor1_epf"
  | "guarantor1_staff_tag"
  | "guarantor2_ic"
  | "guarantor2_ic_back"
  | "guarantor2_license"
  | "guarantor2_license_back"
  | "guarantor2_payslip"
  | "guarantor2_payslip_template"
  | "guarantor2_epf"
  | "guarantor2_staff_tag"
  | "tnb_bill";

export interface PersonRow {
  id: string;
  submission_id: string;
  role: PersonRole;
  name: string;
  nric: string;
  dob: string | null;
  age: number | null;
  sex: string;
  race: string;
  bumi: string;
  address: string;
  poskod: string;
  state: string;
  marital_status: string;
  phone: string;
  job_position: string;
  employer: string;
  office_address: string;
  office_phone: string;
  email: string;
  relationship_to_hirer: string;
  no_payslip: boolean;
  company_name: string;
  company_registration: string;
  company_address: string;
  signature_path: string | null;
  signed_name: string | null;
  signed_at: string | null;
}

export interface SubmissionRow {
  id: string;
  created_by: string | null;
  stock_board_vehicle_id: string | null;
  status: "draft" | "signed" | "generated";
  no_plate: string;
  model: string;
  year_made: number | null;
  finance_loan: number | null;
  tenure_year: number | null;
  created_at: string;
  /** When an admin clicked "Submitted" (submitted to the credit company) - null until then. */
  submitted_at: string | null;
  /** The admin who clicked "Submitted" - their username becomes the ticket_no prefix. Null until submitted. */
  submitted_by: string | null;
  /** Auto-assigned by a DB trigger the moment submitted_at is first set, e.g. "JOHN/008/001" (prefix is the submitter's username) - the running number resets to 001 each Malaysia-time month. Null until submitted. */
  ticket_no: string | null;
}

export interface DocumentRow {
  id: string;
  submission_id: string;
  doc_type: DocType;
  file_path: string;
  uploaded_at: string;
}
