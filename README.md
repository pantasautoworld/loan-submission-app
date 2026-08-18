# Pantas Autoworld — Loan Submission App

Web app replacing the manual `KIWI AUTOWORLD FORM.xlsx` workflow for ELK-Desa Capital
hire-purchase loan submissions. Staff scan a customer's IC and TNB bill for auto-fill,
pick the vehicle from the in-app stocklist for an exact financing price, sign
electronically, and generate the final PDF packet (ELK submission form + all supporting
documents combined, in order).

## Local development

```bash
npm install
npm run dev
```

Requires `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=...   # for IC / electricity bill scanning — https://console.anthropic.com/settings/keys
```

Staff accounts (username, password, role) are created and managed by an admin from
within the app itself, under "Manage Staff" (`/staff`, admin-only) - not self-signup.
Login is entirely local to this app (a username/password checked against Supabase
Auth); it does not depend on any other system.

### PDF generation locally

Document generation shells out to LibreOffice (`soffice`) to convert the filled xlsx
packet to PDF. Install LibreOffice locally to test this end-to-end, or set
`LIBREOFFICE_BIN` to point at the binary if it's not auto-detected:

- Windows: installs are auto-detected at the default Program Files path.
- Linux/Docker: expects `soffice` on `PATH` (see Dockerfile).

Attachment merging also shells out to `qpdf` to strip owner-password restrictions from
locked PDFs (EPF/KWSP statements especially are usually exported this way) before
they're merged in - see `src/lib/pdf/unlockPdf.ts`. Without it, a locked PDF still
merges but that page can come out garbled. Install qpdf locally to test this, or set
`QPDF_BIN` to point at the binary if it's not auto-detected:

- Windows: install from [qpdf releases](https://github.com/qpdf/qpdf/releases) and it's
  auto-detected at the default Program Files path.
- Linux/Docker: expects `qpdf` on `PATH` (see Dockerfile).

## Deploying

This app needs a **persistent Node process with LibreOffice installed** — not a
serverless platform like Vercel, since serverless functions can't run the `soffice`
binary. The included `Dockerfile` works on any container host. Render, Fly.io, and
Railway are all straightforward:

1. Push this repo to GitHub.
2. Create a new "Web Service" (Render) / "App" (Fly.io/Railway) from the repo, using the
   Dockerfile build.
3. Set environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `ANTHROPIC_API_KEY`.
4. Deploy. The container listens on `PORT` (default 3000).

## Architecture notes

- **Database/Auth/Storage**: Supabase project `loan-submission-app` under the
  "PANTAS AUTOWORLD SDN BHD" org. Schema applied via migrations (see Supabase dashboard
  → Database → Migrations for history).
- **Document template**: `templates/elk-desa-capital.xlsx` is a cleaned copy of the
  original hand-filled workbook (MASTER LIST sheet removed, all formula-driven cells
  blanked). `src/lib/formTemplate.ts` maps submission data straight onto those same
  cell addresses — see `scripts/build-template.mjs` for how the template was derived.
- **E-signatures**: signer-adopted only (the actual hirer/guarantor types their name and
  ticks a consent line) — see `src/components/wizard/SigningStep.tsx`. Never
  staff-generated on someone else's behalf.
- **Final PDF order**: ELK submission form, then Car VOC, Hirer IC, Hirer IC Back (if
  have), Hirer License Front (if have), Hirer License Back (if have), Guarantor 1 IC,
  Guarantor 1 IC Back (if have), Guarantor 1 License Front (if have), Guarantor 1
  License Back (if have), Guarantor 2 IC (if have), Guarantor 2 IC Back (if have),
  Guarantor 2 License Front (if have), Guarantor 2 License Back (if have), TNB bill —
  see `ATTACHMENT_ORDER` in `src/app/api/submissions/[id]/generate/route.ts`. Income
  documents (payslip/EPF) are generated separately - see below - and are never part of
  this packet.
- **Income documents**: staff upload each person's 3-months payslip + EPF/KWSP (if have)
  + Signage/Staff Tag (if have, `*_staff_tag` doc types) on the "Income Documents" step
  (`src/components/wizard/IncomeDocumentsForm.tsx`). The Signage/Staff Tag upload is
  always shown, whether or not "doesn't have a payslip" is ticked. If someone
  has no payslip, staff tick "doesn't have a payslip", enter that person's employer
  name/registration/address (`persons.no_payslip`, `company_name`,
  `company_registration`, `company_address`), and upload a blank payslip Excel template
  instead (`*_payslip_template` doc types). At generation time
  (`src/lib/pdf/buildPayslip.ts`) the template is filled with the person's company/name/NRIC
  details and converted to PDF in place of an uploaded payslip - one worksheet per month,
  in tab order. The template must use the standard staff format: each sheet has literal
  placeholder cells `1A` (company name), `2A` (company registration), `3A` (company
  address), `4A` (hirer/guarantor name), and `5A` (hirer/guarantor NRIC), which get
  overwritten with the real values wherever they appear on that sheet (works regardless
  of merged-range size/position). Month/year and earnings/deductions figures are left
  as-is from whatever the admin already filled into the template.
