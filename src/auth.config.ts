import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config — no providers, no adapter, no Node.js-only imports.
 * Used by middleware (Edge runtime). auth.ts extends this with Nodemailer + Drizzle.
 */
export const authConfig = {
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
    error: "/auth/error",
  },
  session: { strategy: "jwt" as const },
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  providers: [], // filled in auth.ts
} satisfies NextAuthConfig;
