// Shared by every entry point: the saved LuluChat login (made by `npm run login`).
import { readFile } from "node:fs/promises";

export async function loadStorageState() {
  const raw = (process.env.LULUCHAT_STORAGE_STATE_B64 ?? "").trim().replace(/^["']|["']$/g, "");
  if (raw) {
    try {
      // normally the base64 from state.b64.txt; plain JSON from state.json is accepted too
      return JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw.replace(/\s+/g, ""), "base64").toString("utf8"));
    } catch {
      throw new Error(`LULUCHAT_STORAGE_STATE_B64 is not valid (${raw.length} characters, starts "${raw.slice(0, 6)}"): paste the whole content of .auth/state.b64.txt, which should be about 6300 characters starting "eyJ"`);
    }
  }
  try {
    return JSON.parse(await readFile(new URL("../.auth/state.json", import.meta.url), "utf8"));
  } catch {
    throw new Error("no saved LuluChat login: set LULUCHAT_STORAGE_STATE_B64 or run `npm run login` first");
  }
}
