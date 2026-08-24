import { describe, expect, it } from "vitest";
import {
  hasActiveFilters,
  parseContactQuery,
  parseContactView,
  serializeContactView,
  type ContactSearchParams,
} from "./query";

// The URL is the contacts list's whole state, so these are the rules that
// decide what a saved view is allowed to carry back into it.

describe("parseContactQuery", () => {
  it("carries the pipeline and stage filters through", () => {
    const query = parseContactQuery({ pipelineId: "p1", stageId: "s1" });
    expect(query.pipelineId).toBe("p1");
    expect(query.stageId).toBe("s1");
  });

  it("treats empty strings as no filter — an unset <select> submits one", () => {
    const query = parseContactQuery({ pipelineId: "", stageId: "" });
    expect(query.pipelineId).toBeUndefined();
    expect(query.stageId).toBeUndefined();
  });
});

describe("hasActiveFilters", () => {
  it("counts a pipeline or a stage as a filter", () => {
    expect(hasActiveFilters({ pipelineId: "p1" })).toBe(true);
    expect(hasActiveFilters({ stageId: "s1" })).toBe(true);
    expect(hasActiveFilters({})).toBe(false);
  });
});

describe("serializeContactView", () => {
  it("keeps the filter and sort keys", () => {
    const params: ContactSearchParams = {
      search: "ana",
      tagId: "t1",
      source: "web",
      ownerUserId: "u1",
      pipelineId: "p1",
      stageId: "s1",
      openDeal: "1",
      from: "2026-01-01",
      to: "2026-01-31",
      sort: "name",
      dir: "asc",
    };
    const serialized = new URLSearchParams(serializeContactView(params));
    for (const [key, value] of Object.entries(params)) {
      expect(serialized.get(key)).toBe(value);
    }
  });

  it("drops the page and the checkbox selection — a view is a filter, not a position", () => {
    const serialized = serializeContactView({ search: "ana", page: "3", ids: "a,b" });
    expect(serialized).toBe("search=ana");
  });

  it("drops anything that is not a known filter key", () => {
    const params = { search: "ana", redirect: "//evil.example" } as ContactSearchParams;
    expect(serializeContactView(params)).toBe("search=ana");
  });

  it("orders keys the same way regardless of how they arrived", () => {
    expect(serializeContactView({ sort: "name", search: "ana" })).toBe(
      serializeContactView({ search: "ana", sort: "name" }),
    );
  });
});

describe("parseContactView", () => {
  it("narrows a stored string to the same canonical form", () => {
    expect(parseContactView("search=ana&page=4&whatever=1")).toBe("search=ana");
  });

  it("survives an empty stored view", () => {
    expect(parseContactView("")).toBe("");
  });
});
