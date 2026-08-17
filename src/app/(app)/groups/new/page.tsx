"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createGroup } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewGroupPage() {
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createGroup(name);
      if (result.success && result.groupId) {
        toast.success("Groep aangemaakt!");
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
          <CardTitle>Nieuwe groep aanmaken</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Groepsnaam</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="bv. De Vrienden"
                maxLength={60}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending || !name.trim()}>
              {isPending ? "Aanmaken…" : "Groep aanmaken"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
