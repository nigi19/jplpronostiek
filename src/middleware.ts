import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";

// Middleware uses only the edge-safe config — no Nodemailer, no Node.js streams.
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = [
  "/auth/signin",
  "/auth/verify",
  "/auth/error",
  "/api/auth",
  "/api/cron",
  "/api/admin/import", // called from GitHub Actions with IMPORT_SECRET, not Auth.js
  "/_next",
  "/favicon.ico",
];

export default auth((req: NextAuthRequest) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!isPublic && !req.auth) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(signInUrl);
  }

  // Admin routes — restricted to ADMIN_EMAILS
  if (pathname.startsWith("/admin")) {
    const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim());
    const userEmail = req.auth?.user?.email;
    if (!userEmail || !adminEmails.includes(userEmail)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
