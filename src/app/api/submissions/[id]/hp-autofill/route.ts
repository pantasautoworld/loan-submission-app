import { NextResponse } from "next/server";
import { requireSalesStaff } from "@/lib/auth";
import { buildHpAutofillValues, buildHpAutofillWorkbook, fetchHpAutofillInput, formatPlate } from "@/lib/hpAutofill";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireSalesStaff();

  try {
    const input = await fetchHpAutofillInput(supabase, id);
    if (!input) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

    const bytes = await buildHpAutofillWorkbook(buildHpAutofillValues(input));
    const plate = formatPlate(input.plate).replace(/[^A-Za-z0-9 ]/g, "").trim() || "submission";

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="HP Application - Autofill Link Generator_${plate}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not build the Excel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
