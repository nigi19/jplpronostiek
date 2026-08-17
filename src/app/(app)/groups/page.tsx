import { auth } from "@/auth";
import { db } from "@/lib/db";
import { groups, groupMembers } from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function GroupsPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  // Groups the user belongs to
  const myMemberships = await db
    .select({
      groupId: groupMembers.groupId,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId));

  const groupIds = myMemberships.map((m) => m.groupId);

  const myGroups = groupIds.length
    ? await db
        .select()
        .from(groups)
        .where(eq(groups.id, groupIds[0])) // placeholder; see note below
    : [];

  // Fetch all groups the user belongs to
  const allGroups = await Promise.all(
    groupIds.map((gid) =>
      db.select().from(groups).where(eq(groups.id, gid)).limit(1).then((r) => r[0])
    )
  );
  const roleMap = new Map(myMemberships.map((m) => [m.groupId, m.role]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">👥 Mijn groepen</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Speel mee met vrienden in een eigen groep
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/groups/join">
            <Button variant="outline" size="sm">Groep vervoegen</Button>
          </Link>
          <Link href="/groups/new">
            <Button size="sm">Groep aanmaken</Button>
          </Link>
        </div>
      </div>

      {allGroups.filter(Boolean).length === 0 ? (
        <div className="text-center py-16 border rounded-xl text-zinc-400">
          <p className="text-lg">Je bent nog geen lid van een groep.</p>
          <p className="text-sm mt-2">
            Maak een groep aan of vervoeg er een via uitnodigingscode.
          </p>
          <div className="flex justify-center gap-3 mt-4">
            <Link href="/groups/join">
              <Button variant="outline">Groep vervoegen</Button>
            </Link>
            <Link href="/groups/new">
              <Button>Groep aanmaken</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {allGroups.filter(Boolean).map((group) => (
            <Link key={group!.id} href={`/groups/${group!.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    {group!.name}
                    {roleMap.get(group!.id) === "owner" && (
                      <span className="text-xs text-zinc-400">(eigenaar)</span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-zinc-400">
                    Code:{" "}
                    <span className="font-mono font-bold text-zinc-600 dark:text-zinc-300">
                      {group!.inviteCode}
                    </span>
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
