import { and, gte, lt, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { contacts, deals, leadSubmissions, messages, stages, tasks } from "@/db/schema";
import type { TenantContext } from "@/modules/tenancy/context";
import { tenantDb } from "@/modules/tenancy/db";

// Sales reporting for the business itself (admin and agente alike — the
// pipeline is shared, §1.2, so the numbers over it are too).
//
// This is lead-to-sale reporting, not web analytics: pageviews and funnels
// are deliberately not in this repo (§1.2 — Umami, self-hosted, separately).
// What the CRM owns is what happened to each lead once it arrived, which is
// the half a rank-and-rent operator actually sells on.
//
// Every read is date-narrowed in SQL and aggregated in memory. A tenant's
// own window is a bounded set — that is what makes this safe without the raw
// `db` access the module boundary (§3.3) does not grant.

export type ReportWindow = { from: Date; to: Date; days: number };

export function reportWindow(days: number, now: Date = new Date()): ReportWindow {
  return { from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), to: now, days };
}

export type FunnelCounts = {
  leads: number;
  /** Leads that produced a deal — the ratio that says whether the site is
   * sending work or noise. */
  leadsWithDeal: number;
  contactsCreated: number;
  dealsOpened: number;
  dealsWon: number;
  dealsLost: number;
  wonValue: number;
  currency: string;
};

export type SourceRow = {
  key: string;
  leads: number;
  deals: number;
  won: number;
  wonValue: number;
};

export type AgentRow = {
  userId: string;
  dealsWon: number;
  wonValue: number;
  dealsOpen: number;
  messagesSent: number;
  tasksCompleted: number;
};

export type MonthRow = { month: string; won: number; lost: number; wonValue: number };

export type ResponseTimes = {
  /** Conversations in the window that got a reply at all. */
  answered: number;
  /** Inbound-first conversations with no outbound reply after them. */
  unanswered: number;
  medianMinutes: number | null;
  slowestMinutes: number | null;
};

export type SalesReport = {
  window: ReportWindow;
  funnel: FunnelCounts;
  bySource: SourceRow[];
  bySite: SourceRow[];
  byAgent: AgentRow[];
  byMonth: MonthRow[];
  response: ResponseTimes;
};

type Utm = { source?: string; campaign?: string };

/** `[from, to)` on any datetime column — the four tables this reads all
 * narrow the same way. */
function inWindow(column: AnyMySqlColumn, window: ReportWindow): SQL {
  return and(gte(column, window.from), lt(column, window.to)) as SQL;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * First-response time per conversation: from the first inbound message in the
 * window to the first outbound message after it.
 *
 * The median rather than the mean, because one holiday weekend would drag an
 * average past the point of meaning anything. Conversations that were never
 * answered are counted separately rather than folded in as a huge number —
 * "eleven unanswered" is the actionable form of that fact.
 */
export function computeResponseTimes(
  rows: Array<{ conversationId: string; direction: string; createdAt: Date }>,
): ResponseTimes {
  const byConversation = new Map<string, Array<{ direction: string; createdAt: Date }>>();
  for (const row of rows) {
    const list = byConversation.get(row.conversationId) ?? [];
    list.push({ direction: row.direction, createdAt: row.createdAt });
    byConversation.set(row.conversationId, list);
  }

  const minutes: number[] = [];
  let unanswered = 0;

  for (const list of byConversation.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const firstInbound = list.find((message) => message.direction === "in");
    if (!firstInbound) continue;

    const reply = list.find(
      (message) =>
        message.direction === "out" &&
        message.createdAt.getTime() >= firstInbound.createdAt.getTime(),
    );
    if (!reply) {
      unanswered += 1;
      continue;
    }
    minutes.push((reply.createdAt.getTime() - firstInbound.createdAt.getTime()) / 60000);
  }

  return {
    answered: minutes.length,
    unanswered,
    medianMinutes: median(minutes),
    slowestMinutes: minutes.length > 0 ? Math.max(...minutes) : null,
  };
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export async function getSalesReport(
  ctx: TenantContext,
  window: ReportWindow,
): Promise<SalesReport> {
  const db = tenantDb(ctx);

  const [leadRows, contactRows, dealRows, stageRows, messageRows, taskRows] = await Promise.all([
    db.select(leadSubmissions, inWindow(leadSubmissions.createdAt, window)),
    db.select(contacts, inWindow(contacts.createdAt, window)),
    // Deals are read on *creation* in the window and again on closure below —
    // a deal opened in March and won in April belongs to March's "opened" and
    // April's "won", which is the only reading that makes a monthly series
    // add up.
    db.select(deals),
    db.select(stages),
    db.select(messages, inWindow(messages.createdAt, window)),
    db.select(tasks, inWindow(tasks.dueAt, window)),
  ]);

  const wonStages = new Set(stageRows.filter((stage) => stage.isWon).map((stage) => stage.id));
  const lostStages = new Set(stageRows.filter((stage) => stage.isLost).map((stage) => stage.id));

  const openedInWindow = dealRows.filter(
    (deal) => deal.createdAt >= window.from && deal.createdAt < window.to,
  );
  const closedInWindow = dealRows.filter(
    (deal) => deal.closedAt !== null && deal.closedAt >= window.from && deal.closedAt < window.to,
  );
  const wonInWindow = closedInWindow.filter((deal) => wonStages.has(deal.stageId));
  const lostInWindow = closedInWindow.filter((deal) => lostStages.has(deal.stageId));

  const dealsById = new Map(dealRows.map((deal) => [deal.id, deal]));

  /** Leads grouped by whatever key the caller picks, carrying the deal they
   * produced so conversion is read from the same row rather than joined
   * again downstream. */
  function group(pick: (row: (typeof leadRows)[number]) => string | null | undefined): SourceRow[] {
    const rows = new Map<string, SourceRow>();
    for (const lead of leadRows) {
      const key = pick(lead) || "—";
      const row = rows.get(key) ?? { key, leads: 0, deals: 0, won: 0, wonValue: 0 };
      row.leads += 1;

      const deal = lead.dealId ? dealsById.get(lead.dealId) : undefined;
      if (deal) {
        row.deals += 1;
        if (wonStages.has(deal.stageId)) {
          row.won += 1;
          row.wonValue += deal.value;
        }
      }
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => b.leads - a.leads);
  }

  const agents = new Map<string, AgentRow>();
  const agentRow = (userId: string) => {
    const row = agents.get(userId) ?? {
      userId,
      dealsWon: 0,
      wonValue: 0,
      dealsOpen: 0,
      messagesSent: 0,
      tasksCompleted: 0,
    };
    agents.set(userId, row);
    return row;
  };

  for (const deal of wonInWindow) {
    if (!deal.assignedUserId) continue;
    const row = agentRow(deal.assignedUserId);
    row.dealsWon += 1;
    row.wonValue += deal.value;
  }
  for (const deal of dealRows) {
    if (!deal.assignedUserId) continue;
    if (wonStages.has(deal.stageId) || lostStages.has(deal.stageId)) continue;
    agentRow(deal.assignedUserId).dealsOpen += 1;
  }
  for (const message of messageRows) {
    if (message.direction !== "out" || !message.sentByUserId) continue;
    agentRow(message.sentByUserId).messagesSent += 1;
  }
  for (const task of taskRows) {
    if (!task.completedAt || !task.assignedUserId) continue;
    if (task.completedAt < window.from || task.completedAt >= window.to) continue;
    agentRow(task.assignedUserId).tasksCompleted += 1;
  }

  const months = new Map<string, MonthRow>();
  for (const deal of closedInWindow) {
    const key = monthKey(deal.closedAt!);
    const row = months.get(key) ?? { month: key, won: 0, lost: 0, wonValue: 0 };
    if (wonStages.has(deal.stageId)) {
      row.won += 1;
      row.wonValue += deal.value;
    } else if (lostStages.has(deal.stageId)) {
      row.lost += 1;
    }
    months.set(key, row);
  }

  return {
    window,
    funnel: {
      leads: leadRows.length,
      leadsWithDeal: leadRows.filter((lead) => lead.dealId).length,
      contactsCreated: contactRows.length,
      dealsOpened: openedInWindow.length,
      dealsWon: wonInWindow.length,
      dealsLost: lostInWindow.length,
      wonValue: wonInWindow.reduce((sum, deal) => sum + deal.value, 0),
      // Phase 1 is single-currency per tenant in practice; the first won deal
      // names it, and PYG is the default everywhere else (§2.3).
      currency: wonInWindow[0]?.currency ?? "PYG",
    },
    bySource: group((lead) => ((lead.utm ?? {}) as Utm).source),
    bySite: group((lead) => lead.siteId),
    byAgent: [...agents.values()].sort((a, b) => b.wonValue - a.wonValue),
    byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    response: computeResponseTimes(messageRows),
  };
}
