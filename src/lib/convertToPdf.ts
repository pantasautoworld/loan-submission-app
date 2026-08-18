import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

function resolveSofficeBinary(): string {
  if (process.env.LIBREOFFICE_BIN) return process.env.LIBREOFFICE_BIN;

  const windowsCandidates = [
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  ];
  for (const candidate of windowsCandidates) {
    // turbopackIgnore: these are fixed dev-machine-only paths, not project files
    if (existsSync(/* turbopackIgnore: true */ candidate)) return candidate;
  }

  // Linux/Docker deploy: expects `soffice` on PATH (apt-get install libreoffice)
  return "soffice";
}

/** Converts an xlsx file (as a Buffer) to a PDF (as a Buffer) via headless LibreOffice. */
export async function convertXlsxToPdf(xlsxBuffer: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "loan-doc-"));
  const inputPath = join(dir, "packet.xlsx");
  const outputPath = join(dir, "packet.pdf");

  try {
    await writeFile(inputPath, xlsxBuffer);

    const binary = resolveSofficeBinary();
    // The container runs as a non-root user with no writable home directory (HOME
    // resolves to /nonexistent), so LibreOffice can't create its user profile there
    // and fails with "User installation could not be completed". Point it at our
    // own known-writable temp dir instead of relying on $HOME - cleaned up below
    // along with the rest of `dir`.
    const profileDir = join(dir, "soffice-profile");
    await execFileAsync(
      binary,
      [
        "--headless",
        "--norestore",
        `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
        "--convert-to",
        "pdf",
        "--outdir",
        dir,
        inputPath,
      ],
      { timeout: 60_000 }
    );

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
