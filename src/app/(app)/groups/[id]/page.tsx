import { auth } from "@/auth";
import { db } from "@/lib/db";
import { groups, groupMembers, users, predictions } from "../../../../../drizzle/schema";
import { eq, sum, count, desc, and } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GroupPage({ params }: Props) {
  const { id } = await params;
  const groupId = parseInt(id, 10);
  if (isNaN(groupId)) notFound();

  const session = await auth();
  const currentUserId = session!.user!.id!;

  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) notFound();

  // Check membership
  const [membership] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, currentUserId)))
    .limit(1);

  if (!membership) redirect("/groups");

  // Load all members
  const members = await db
    .select({ userId: groupMembers.userId, role: groupMembers.role })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));

  const memberUserIds = members.map((m) => m.userId);

  // Leaderboard: sum predictions.points per user (group members only)
  const allStandings = await db
    .select({
      userId: predictions.userId,
      name: users.name,
      email: users.email,
      totalPoints: sum(predictions.points),
      predictionsScored: count(predictions.id),
    })
    .from(predictions)
    .innerJoin(users, eq(predictions.userId, users.id))
    .groupBy(predictions.userId, users.name, users.email)
    .orderBy(desc(sum(predictions.points)));

  // Filter to group members only
  const memberSet = new Set(memberUserIds);
  const standings = allStandings.filter((s) => memberSet.has(s.userId));

  const roleMap = new Map(members.map((m) => [m.userId, m.role]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{group.name}</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Uitnodigingscode:{" "}
          <span className="font-mono font-bold text-zinc-700 dark:text-zinc-200 tracking-widest">
            {group.inviteCode}
          </span>{" "}
          — Deel met vrienden om hen te laten deelnemen
        </p>
      </div>

      <div className="border rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-zinc-50 dark:bg-zinc-800 text-zinc-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left w-12">#</th>
              <th className="px-4 py-3 text-left">Speler</th>
              <th className="px-4 py-3 text-right">Punten</th>
              <th className="px-4 py-3 text-right hidden sm:table-cell">Gescoord</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, i) => {
              const isMe = row.userId === currentUserId;
              const pts = Number(row.totalPoints ?? 0);
              const medal =
                i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;

              return (
                <tr
                  key={row.userId}
                  className={`border-b last:border-0 transition-colors ${
                    isMe
                      ? "bg-blue-50 dark:bg-blue-950/40"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <td className="px-4 py-3 text-zinc-400 font-mono">
                    {medal ?? i + 1}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <span>{row.name ?? row.email?.split("@")[0]}</span>
                    {isMe && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Jij
                      </Badge>
                    )}
                    {roleMap.get(row.userId) === "owner" && (
                      <Badge variant="outline" className="ml-1 text-xs">
                        ✦
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">
                    {pts}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400 tabular-nums hidden sm:table-cell">
                    {row.predictionsScored}
                  </td>
                </tr>
              );
            })}
            {standings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                  Nog geen gescoorde voorspellingen in deze groep.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
