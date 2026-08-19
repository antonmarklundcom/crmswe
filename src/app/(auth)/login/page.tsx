import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
      {/* Signed out there is no user row to store the choice on, so this
          writes the cookie the request config falls back to. */}
      <LanguageSwitcher compact />
    </main>
  );
}
