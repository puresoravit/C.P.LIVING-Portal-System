// Single source of truth for the NextAuth session cookie name, shared between
// authOptions (src/lib/auth.ts) and middleware.ts's withAuth config.
//
// Root cause this file fixes: NextAuth's own handler (via authOptions.useSecureCookies)
// and next-auth/middleware's default withAuth (which auto-detects secure cookies from
// NEXTAUTH_URL starting with "https://") used two independent signals to decide the
// cookie name. They agree in real deployments (NEXTAUTH_URL is https there), but
// disagree whenever NODE_ENV=production is tested against a non-https NEXTAUTH_URL
// (e.g. local production-mode testing), causing login to appear broken. Both files
// must import isProduction/sessionTokenCookieName from here instead of computing
// their own — no Node-only imports (db, bcrypt) so this stays safe in the Edge
// middleware bundle.
export const isProduction = process.env.NODE_ENV === "production";

export const sessionTokenCookieName = `${isProduction ? "__Secure-" : ""}next-auth.session-token`;
