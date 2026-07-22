import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenantContext } from "@/modules/tenancy/context";
import { getContact, listTags, listTagsForContact } from "@/modules/crm/contacts";
import { listActivitiesForContact } from "@/modules/crm/activities";
import { listDealsForContact } from "@/modules/crm/deals";
import { Button } from "@/components/ui/button";
import {
  addNoteAction,
  addTagToContactAction,
  removeTagFromContactAction,
  updateContactAction,
} from "../actions";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const t = await getTranslations("app.contacts");
  const tc = await getTranslations("common");

  const contact = await getContact(ctx, id);
  if (!contact) notFound();

  const [activities, deals, contactTags, allTags] = await Promise.all([
    listActivitiesForContact(ctx, id),
    listDealsForContact(ctx, id),
    listTagsForContact(ctx, id),
    listTags(ctx),
  ]);

  const availableTags = allTags.filter(
    (tag) => !contactTags.some((ct) => ct.id === tag.id),
  );

  const updateAction = updateContactAction.bind(null, id);
  const addNote = addNoteAction.bind(null, id);
  const addTag = addTagToContactAction.bind(null, id);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold">{contact.name}</h1>
        <p className="text-sm text-muted-foreground">{contact.phone}</p>

        <div className="my-4 flex flex-wrap gap-2">
          {contactTags.map((tag) => (
            <form key={tag.id} action={removeTagFromContactAction.bind(null, id, tag.id)}>
              <button
                type="submit"
                className="rounded-full border px-3 py-1 text-xs hover:bg-accent"
              >
                {tag.name} ×
              </button>
            </form>
          ))}
        </div>

        {availableTags.length > 0 && (
          <form action={addTag} className="flex max-w-xs gap-2">
            <select name="tagId" className="flex-1 rounded-md border px-3 py-2 text-sm">
              {availableTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline">
              {t("addTag")}
            </Button>
          </form>
        )}

        <form action={updateAction} className="mt-6 flex max-w-sm flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("name")}
            <input name="name" defaultValue={contact.name} className="rounded-md border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("email")}
            <input
              name="email"
              type="email"
              defaultValue={contact.email ?? ""}
              className="rounded-md border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("notes")}
            <textarea name="notes" defaultValue={contact.notes ?? ""} className="rounded-md border px-3 py-2" />
          </label>
          <Button type="submit">{tc("save")}</Button>
        </form>
      </section>

      {deals.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">{t("dealsTitle")}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {deals.map((deal) => (
              <li key={deal.id} className="rounded-md border px-3 py-2">
                {deal.title} — {deal.value} {deal.currency}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("timelineTitle")}</h2>
        <form action={addNote} className="mb-4 flex max-w-sm flex-col gap-2">
          <textarea name="note" required placeholder={t("notePlaceholder")} className="rounded-md border px-3 py-2 text-sm" />
          <Button type="submit" size="sm">
            {t("addNote")}
          </Button>
        </form>
        <ul className="flex flex-col gap-2 text-sm">
          {activities.map((activity) => (
            <li key={activity.id} className="rounded-md border px-3 py-2">
              <span className="font-medium">{t(`activityTypes.${activity.type}` as "activityTypes.note")}</span>
              {" — "}
              <span className="text-muted-foreground">{activity.createdAt.toLocaleString("es-PY")}</span>
              {activity.type === "note" && (
                <p>{(activity.payload as { text?: string }).text}</p>
              )}
            </li>
          ))}
          {activities.length === 0 && (
            <li className="text-muted-foreground">{t("timelineEmpty")}</li>
          )}
        </ul>
      </section>
    </div>
  );
}
