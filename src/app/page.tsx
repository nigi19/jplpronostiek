import { redirect } from "next/navigation";

// Redirect root → /dashboard (the authenticated dashboard lives there).
// The middleware will intercept unauthenticated users and send them to /auth/signin.
export default function RootPage() {
  redirect("/dashboard");
}
