import { Suspense } from "react";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
