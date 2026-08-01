"use client";

import useSWR from "swr";
import Link from "next/link";

export type InboxConversation = {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  unreadCount: number;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Inbox list, 5s polling (PLAN.md §6.5): SWR revalidates in the background
// and swaps in the new list without a full navigation, so the rep isn't
// staring at a page reload while working the queue.
export function InboxList({ initial }: { initial: InboxConversation[] }) {
  const { data } = useSWR<{ conversations: InboxConversation[] }>(
    "/api/inbox/conversations",
    fetcher,
    { fallbackData: { conversations: initial }, refreshInterval: 5000 },
  );

  const conversations = data?.conversations ?? initial;

  return (
    <ul className="flex flex-col gap-2 text-sm">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <Link
            href={`/inbox/${conversation.id}`}
            className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-accent"
          >
            <span>
              <span className="font-medium">{conversation.contactName}</span>{" "}
              <span className="text-muted-foreground">{conversation.contactPhone}</span>
            </span>
            {conversation.unreadCount > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {conversation.unreadCount}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
