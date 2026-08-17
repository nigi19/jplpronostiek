import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function VerifyPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <div className="text-4xl mb-2">📧</div>
          <CardTitle>Controleer je email</CardTitle>
          <CardDescription>
            We hebben je een inloglink gestuurd.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-500">
          <p>
            Klik op de link in de email om in te loggen. De link is 24 uur geldig.
          </p>
          <p>
            Geen email ontvangen?{" "}
            <Link href="/auth/signin" className="text-blue-600 hover:underline">
              Probeer opnieuw
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
