import { describe, expect, it, vi } from "vitest";
import { escapeHtml } from "./escape";
import { taskRemindersEmail } from "./templates";

// templates.ts reads one constant from the subscriptions module, which pulls in the DB client and env.
vi.mock("@/modules/tenancy/subscriptions", () => ({ GRACE_PERIOD_DAYS: 7 }));

describe("email HTML escaping", () => {
  it("escapes & < > \" '", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;",
    );
  });

  it("does not let contact/task/appointment text inject markup into the reminder digest", async () => {
    const payload = `<img src="https://evil.example/p.gif"><a href="https://evil.example">x</a>`;
    const { html } = await taskRemindersEmail({
      userName: payload,
      items: [
        { title: payload, dueAt: new Date(), overdue: false, contactName: payload, url: "/t?a=1&b=2" },
      ],
      appointments: [
        {
          title: payload,
          startsAt: new Date(),
          allDay: false,
          location: payload,
          contactName: payload,
          url: "/a",
        },
      ],
      tasksUrl: "https://app.example/tasks",
      locale: "es",
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example\">x</a>");
    expect(html).toContain("&lt;img src=&quot;https://evil.example/p.gif&quot;&gt;");
    expect(html).toContain("/t?a=1&amp;b=2");
  });
});
