import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users, predictions, seasons } from "../../../../drizzle/schema";
import { eq, sum, count, desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";

export default async function LeaderboardPage() {
  const session = await auth();
  const currentUserId = session!.user!.id!;

  // Global leaderboard: sum of all scored predictions per user
  const standings = await db
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🏆 Globaal klassement</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Alle spelers, gesorteerd op totaal punten
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
                    isMe ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
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
                  Nog geen gescoorde voorspellingen. Kom later terug!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
