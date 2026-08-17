"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Season } from "../../../../drizzle/schema";
import { setActiveSeason, triggerSync, createSeason } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  seasons: Season[];
}

export function AdminPanel({ seasons }: Props) {
  const [isPending, startTransition] = useTransition();
  const [newYear, setNewYear] = useState("");
  const [newName, setNewName] = useState("");

  function handleSetActive(seasonId: number) {
    startTransition(async () => {
      const result = await setActiveSeason(seasonId);
      if (result.success) {
        toast.success("Actief seizoen bijgewerkt");
      } else {
        toast.error(result.error ?? "Fout");
      }
    });
  }

  function handleSync() {
    startTransition(async () => {
      const result = await triggerSync();
      if (result.success) {
        toast.success(result.message ?? `Synchronisatie voltooid — ${result.fixturesProcessed ?? 0} wedstrijden verwerkt`);
      } else {
        toast.error(result.error ?? "Synchronisatie mislukt");
      }
    });
  }

  function handleCreateSeason(e: React.FormEvent) {
    e.preventDefault();
    const year = parseInt(newYear, 10);
    if (isNaN(year)) { toast.error("Ongeldig jaar"); return; }
    startTransition(async () => {
      const result = await createSeason(year, newName);
      if (result.success) {
        toast.success("Seizoen aangemaakt");
        setNewYear(""); setNewName("");
      } else {
        toast.error(result.error ?? "Fout");
      }
    });
  }

  const active = seasons.find((s) => s.isActive);

  return (
    <div className="space-y-6">
      {/* Sync */}
      <Card>
        <CardHeader><CardTitle className="text-base">Synchronisatie</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {active ? (
            <>
              <p className="text-sm text-zinc-500">
                Actief seizoen:{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {active.name}
                </span>{" "}
                (jaar {active.year}, league {active.apiLeagueId})
              </p>
              {active.lastSyncedAt && (
                <p className="text-xs text-zinc-400">
                  Laatste sync:{" "}
                  {new Date(active.lastSyncedAt).toLocaleString("nl-BE")}
                </p>
              )}
              {active.syncError && (
                <p className="text-xs text-red-500 bg-red-50 p-2 rounded-lg border border-red-200">
                  Fout: {active.syncError}
                </p>
              )}
              <Button onClick={handleSync} disabled={isPending} size="sm">
                {isPending ? "Bezig…" : "🔄 Nu synchroniseren"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-zinc-400">Geen actief seizoen. Stel er eerst een in.</p>
          )}
        </CardContent>
      </Card>

      {/* Seasons list */}
      <Card>
        <CardHeader><CardTitle className="text-base">Seizoenen</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {seasons.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <span className="font-medium text-sm">{s.name}</span>
                  <span className="text-xs text-zinc-400 ml-2">jaar {s.year}</span>
                  {s.isActive && (
                    <Badge className="ml-2 text-xs bg-blue-700">Actief</Badge>
                  )}
                </div>
                {!s.isActive && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetActive(s.id)}
                    disabled={isPending}
                  >
                    Activeer
                  </Button>
                )}
              </div>
            ))}
            {seasons.length === 0 && (
              <p className="text-sm text-zinc-400">Nog geen seizoenen aangemaakt.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create season */}
      <Card>
        <CardHeader><CardTitle className="text-base">Seizoen toevoegen</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleCreateSeason} className="flex gap-3 items-end flex-wrap">
            <div className="space-y-1">
              <Label htmlFor="year">API-jaar</Label>
              <Input
                id="year"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
                placeholder="2024"
                className="w-24"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sname">Weergavenaam</Label>
              <Input
                id="sname"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="2024/25"
                className="w-32"
                required
              />
            </div>
            <Button type="submit" disabled={isPending} size="sm">
              Toevoegen
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
