import { auth } from "@/auth";
import { db } from "@/lib/db";
import { seasons } from "../../../../drizzle/schema";
import { redirect } from "next/navigation";
import { AdminPanel } from "./admin-panel";

export default async function AdminPage() {
  const session = await auth();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim());
  const isAdmin = !!(session?.user?.email && adminEmails.includes(session.user.email));
  if (!isAdmin) redirect("/");

  const allSeasons = await db.select().from(seasons).orderBy(seasons.year);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">⚙️ Admin</h1>
        <p className="text-zinc-500 text-sm mt-1">Beheer seizoenen en synchronisatie</p>
      </div>
      <AdminPanel seasons={allSeasons} />
    </div>
  );
}
