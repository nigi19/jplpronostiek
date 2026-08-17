import { auth } from "@/auth";
import { Nav } from "@/components/layout/nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim());
  const isAdmin = !!(session?.user?.email && adminEmails.includes(session.user.email));

  return (
    <div className="flex flex-col min-h-screen">
      <Nav user={session?.user ?? null} isAdmin={isAdmin} />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        {children}
      </main>
    </div>
  );
}
