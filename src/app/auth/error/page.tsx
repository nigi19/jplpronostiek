import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function AuthErrorPage({ searchParams }: Props) {
  const { error } = await searchParams;

  const errorMessages: Record<string, string> = {
    Configuration: "Er is een serverconfiguratiefout. Contacteer de beheerder.",
    AccessDenied: "Toegang geweigerd.",
    Verification: "De inloglink is verlopen of ongeldig. Vraag een nieuwe aan.",
    Default: "Er is een onbekende fout opgetreden.",
  };

  const message = errorMessages[error ?? "Default"] ?? errorMessages.Default;

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <div className="text-4xl mb-2">❌</div>
          <CardTitle>Aanmelden mislukt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-500">{message}</p>
          <Link href="/auth/signin">
            <Button className="w-full">Opnieuw proberen</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
