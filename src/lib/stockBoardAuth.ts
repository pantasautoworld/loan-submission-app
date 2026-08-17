// Verifies staff logins against the existing Stock Board tool's own account
// list, stored in the same Firebase Realtime Database as the vehicle inventory
// (see stockBoard.ts) - so staff use one set of credentials across both tools.
// Mirrors Stock Board's own handleLogin() comparison exactly (case-insensitive
// username, exact password match). Stock Board itself compares passwords in
// plain text; this reads that same live list rather than storing a copy.
const FIREBASE_DB_URL =
  "https://pantas-stock-board-default-rtdb.asia-southeast1.firebasedatabase.app";
const STAFF_PATH = "stockboard/staff-accounts";

export interface StockBoardStaffAccount {
  name: string;
  username: string;
  password: string;
  role: "staff" | "admin" | string;
}

export async function verifyStockBoardLogin(
  username: string,
  password: string
): Promise<StockBoardStaffAccount | null> {
  const res = await fetch(`${FIREBASE_DB_URL}/${STAFF_PATH}.json`);
  if (!res.ok) throw new Error(`Could not reach Stock Board (${res.status})`);
  const accounts: StockBoardStaffAccount[] | null = await res.json();
  if (!accounts) return null;

  const match = accounts.find(
    (a) => a.username.toLowerCase() === username.toLowerCase() && a.password === password
  );
  return match ?? null;
}
