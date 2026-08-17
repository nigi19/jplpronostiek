"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { upsertPrediction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

interface MatchCardProps {
  matchId: number;
  homeTeam: string;
  homeTeamLogo: string | null;
  awayTeam: string;
  awayTeamLogo: string | null;
  kickoff: Date;
  status: string;
  actualHome: number | null;
  actualAway: number | null;
  predictedHome: number | null;
  predictedAway: number | null;
  points: number | null;
  isLocked: boolean;
}

export function MatchCard({
  matchId,
  homeTeam,
  homeTeamLogo,
  awayTeam,
  awayTeamLogo,
  kickoff,
  status,
  actualHome,
  actualAway,
  predictedHome,
  predictedAway,
  points,
  isLocked,
}: MatchCardProps) {
  const [home, setHome] = useState<string>(
    predictedHome !== null ? String(predictedHome) : ""
  );
  const [away, setAway] = useState<string>(
    predictedAway !== null ? String(predictedAway) : ""
  );
  const [isPending, startTransition] = useTransition();

  const isFinished = ["FT", "AET", "PEN"].includes(status);
  const hasPrediction = predictedHome !== null && predictedAway !== null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
      toast.error("Vul geldige scores in (getal ≥ 0)");
      return;
    }
    startTransition(async () => {
      const result = await upsertPrediction(matchId, h, a);
      if (result.success) {
        toast.success("Voorspelling opgeslagen!");
      } else {
        toast.error(result.error ?? "Er ging iets mis");
      }
    });
  }

  const kickoffStr = kickoff.toLocaleString("nl-BE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="border rounded-xl p-4 bg-white dark:bg-zinc-900 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-400">{kickoffStr}</span>
        <div className="flex items-center gap-2">
          {isFinished && (
            <Badge variant="secondary" className="text-xs">
              FT: {actualHome}–{actualAway}
            </Badge>
          )}
          {!isFinished && status !== "NS" && (
            <Badge className="text-xs bg-green-600 text-white">{status}</Badge>
          )}
          {isLocked && !isFinished && (
            <Badge variant="outline" className="text-xs text-orange-500 border-orange-300">
              🔒 Vergrendeld
            </Badge>
          )}
          {points !== null && (
            <Badge className="text-xs font-bold bg-blue-700 text-white">
              {points} pt
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Home team */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          <span className="font-semibold text-sm text-right">{homeTeam}</span>
          {homeTeamLogo && (
            <Image src={homeTeamLogo} alt={homeTeam} width={24} height={24} className="object-contain" />
          )}
        </div>

        {/* Score inputs / display */}
        {isLocked ? (
          <div className="flex items-center gap-1.5 px-3">
            {hasPrediction ? (
              <span className={`font-mono text-sm font-bold ${
                points !== null
                  ? points >= 10 ? "text-green-600" : points >= 7 ? "text-blue-600" : points >= 5 ? "text-zinc-700" : "text-zinc-400"
                  : "text-zinc-500"
              }`}>
                {predictedHome}–{predictedAway}
              </span>
            ) : (
              <span className="font-mono text-xs text-zinc-300">—–—</span>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={20}
              value={home}
              onChange={(e) => setHome(e.target.value)}
              className="w-10 text-center border rounded-md py-1 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="–"
              disabled={isPending}
            />
            <span className="text-zinc-400 text-sm font-bold">–</span>
            <input
              type="number"
              min={0}
              max={20}
              value={away}
              onChange={(e) => setAway(e.target.value)}
              className="w-10 text-center border rounded-md py-1 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="–"
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={isPending || home === "" || away === ""}
              className="ml-1 px-2 py-1 bg-blue-700 text-white text-xs rounded-md hover:bg-blue-800 disabled:opacity-40 transition-colors"
            >
              {isPending ? "…" : "✓"}
            </button>
          </form>
        )}

        {/* Away team */}
        <div className="flex items-center gap-2 flex-1">
          {awayTeamLogo && (
            <Image src={awayTeamLogo} alt={awayTeam} width={24} height={24} className="object-contain" />
          )}
          <span className="font-semibold text-sm">{awayTeam}</span>
        </div>
      </div>
    </div>
  );
}
