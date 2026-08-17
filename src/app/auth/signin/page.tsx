import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  const { callbackUrl, error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">⚽</div>
          <CardTitle className="text-xl">Pronostiek</CardTitle>
          <CardDescription>
            Voorspel scores van de Jupiler Pro League
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error === "OAuthSignin"
                ? "Aanmelden mislukt. Probeer opnieuw."
                : "Er is een fout opgetreden. Controleer je email en probeer opnieuw."}
            </div>
          )}
          <form
            action={async (formData: FormData) => {
              "use server";
              await signIn("resend", {
                email: formData.get("email") as string,
                redirectTo: callbackUrl ?? "/",
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mailadres</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="jij@voorbeeld.be"
                required
                autoComplete="email"
              />
            </div>
            <Button type="submit" className="w-full">
              Stuur magische link
            </Button>
          </form>
          <p className="text-xs text-zinc-400 text-center mt-4">
            Je ontvangt een inloglink per email. Geen wachtwoord nodig.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
