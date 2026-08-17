"use client";

import { getSignedUrl } from "@/lib/storage";

export function DownloadLink({ path }: { path: string }) {
  async function download() {
    const { data, error } = await getSignedUrl(path);
    if (error || !data) {
      alert("Could not create a download link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <button onClick={download} className="text-xs text-amber hover:underline">
      Download PDF
    </button>
  );
}
