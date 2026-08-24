import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/wordmark";

// Every signed-out screen — sign in, password reset, accepting an invitation
// — is one card on the page background, under the product's name. It is the
// first thing a new tenant sees, and a bare form floating in white was the
// wrong first impression for something being sold as a product.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const tc = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 p-6">
      <Wordmark name={tc("appName")} />
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-xl border bg-card p-6 shadow-sm">
        {children}
      </div>
    </main>
  );
}
