import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";

const execFileAsync = promisify(execFile);

/** winget installs qpdf into a version-numbered folder (e.g. "qpdf 12.3.2"), so this
 * scans for it rather than assuming an exact path. */
function findQpdfInProgramFiles(programFilesDir: string): string | null {
  let entries: string[];
  try {
    entries = readdirSync(programFilesDir);
  } catch {
    return null;
  }
  const match = entries.find((name) => /^qpdf(\s|$)/i.test(name));
  if (!match) return null;
  const candidate = join(programFilesDir, match, "bin", "qpdf.exe");
  return existsSync(candidate) ? candidate : null;
}

function resolveQpdfBinary(): string {
  if (process.env.QPDF_BIN) return process.env.QPDF_BIN;

  for (const programFilesDir of ["C:\\Program Files", "C:\\Program Files (x86)"]) {
    const found = findQpdfInProgramFiles(programFilesDir);
    if (found) return found;
  }

  // Linux/Docker deploy: expects `qpdf` on PATH (apt-get install qpdf)
  return "qpdf";
}

/**
 * Many scanned/downloaded documents (EPF/KWSP statements especially) are exported
 * with owner-password restrictions (no printing/copying), even though anyone can open
 * and read them. pdf-lib can't actually decrypt encrypted content streams - its
 * `ignoreEncryption` option only skips the "this file is encrypted" guard, so merging
 * a locked PDF in as-is produces a garbled/blank page. qpdf strips that restriction so
 * the page embeds cleanly. If the PDF genuinely needs a password to open (rare for
 * these documents) or qpdf isn't installed, this falls back to the original bytes
 * rather than failing the whole packet.
 */
export async function unlockPdf(bytes: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "loan-unlock-"));
  const inputPath = join(dir, "in.pdf");
  const outputPath = join(dir, "out.pdf");

  try {
    await writeFile(inputPath, bytes);
    const binary = resolveQpdfBinary();
    await execFileAsync(binary, ["--decrypt", inputPath, outputPath], { timeout: 30_000 });
    return await readFile(outputPath);
  } catch {
    return bytes;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
