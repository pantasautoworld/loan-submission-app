import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractGrantDetails } from "@/lib/anthropic";
import { readUploadedFile, imageMediaType } from "@/lib/uploadedFile";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { file, base64 } = await readUploadedFile(request);
    const isPdf = file.type === "application/pdf";
    const result = await extractGrantDetails(
      isPdf
        ? { kind: "pdf", base64 }
        : { kind: "image", mediaType: imageMediaType(file.type), base64 }
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
