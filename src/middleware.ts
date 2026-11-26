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
    // broker/ is excluded too - outside brokers open their stock page / Excel feed with no login;
    // it is secured by each broker's secret key in the link (see src/app/broker/[key]). The
    // trailing slash keeps the admin page /broker-sheet behind the login.
    "/((?!_next/static|_next/image|favicon.ico|api/telegram|broker/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
