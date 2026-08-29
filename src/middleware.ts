import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // api/telegram is excluded - it's called by Telegram's servers, which never carry a
    // staff login session, so it would otherwise get redirected to /login on every request
    // (secured instead by its own secret-token + chat-allowlist checks, see the route itself).
    "/((?!_next/static|_next/image|favicon.ico|api/telegram|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
