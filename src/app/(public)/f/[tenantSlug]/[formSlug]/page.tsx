import { notFound } from "next/navigation";
import { getPublicForm } from "@/modules/forms/submissions";
import type { FormField } from "@/modules/forms/forms";
import { submitFormAction } from "./actions";

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; formSlug: string }>;
}) {
  const { tenantSlug, formSlug } = await params;
  const resolved = await getPublicForm(tenantSlug, formSlug);
  if (!resolved) notFound();

  const { form } = resolved;
  const fields = form.fields as FormField[];
  const action = submitFormAction.bind(null, tenantSlug, formSlug);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{form.name}</h1>
      <form action={action} className="flex flex-col gap-4">
        {/* Honeypot: real users never see or fill this field. */}
        <input
          type="text"
          name="_hp"
          tabIndex={-1}
          autoComplete="off"
          className="absolute -left-[9999px]"
          aria-hidden="true"
        />
        {fields.map((field) => (
          <label key={field.key} className="flex flex-col gap-1 text-sm">
            {field.label}
            {field.type === "textarea" ? (
              <textarea name={field.key} required={field.required} className="rounded-md border px-3 py-2" />
            ) : field.type === "select" ? (
              <select name={field.key} required={field.required} className="rounded-md border px-3 py-2">
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={field.key}
                required={field.required}
                type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
                className="rounded-md border px-3 py-2"
              />
            )}
          </label>
        ))}
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
          Enviar
        </button>
      </form>
    </main>
  );
}
