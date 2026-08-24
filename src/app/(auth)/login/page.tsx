import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function LoginPage() {
  return (
    <>
      <Suspense>
        <LoginForm />
      </Suspense>
      {/* Signed out there is no user row to store the choice on, so this
          writes the cookie the request config falls back to. */}
      <LanguageSwitcher compact />
    </>
  );
}
