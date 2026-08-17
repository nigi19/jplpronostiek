"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { joinGroup } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function JoinGroupPage() {
  const [code, setCode] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await joinGroup(code);
      if (result.success && result.groupId) {
        toast.success("Je hebt de groep vervoegd!");
        router.push(`/groups/${result.groupId}`);
      } else {
        toast.error(result.error ?? "Er ging iets mis");
      }
    });
  }

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Groep vervoegen</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Uitnodigingscode</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="bv. AB12CD"
                maxLength={8}
                required
                className="font-mono tracking-widest text-lg text-center"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending || !code.trim()}>
              {isPending ? "Vervoegen…" : "Groep vervoegen"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
