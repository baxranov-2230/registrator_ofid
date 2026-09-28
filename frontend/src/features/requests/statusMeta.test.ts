import { describe, expect, it } from "vitest";

import {
  canRunAction,
  STATUS_ORDER,
  TRANSITION_ACTIONS,
} from "@/features/requests/statusMeta";

describe("workflow buttons", () => {
  it("offers no action on a closed request", () => {
    expect(TRANSITION_ACTIONS.completed).toEqual([]);
    expect(TRANSITION_ACTIONS.rejected).toEqual([]);
  });

  it("requires a reason for returning and rejecting, as the server does", () => {
    const actions = Object.values(TRANSITION_ACTIONS).flat();
    for (const action of actions) {
      if (action.to === "returned" || action.to === "rejected") {
        expect(action.commentRequired).toBe(true);
      }
    }
  });

  it("lets only triage roles return a request", () => {
    const ret = TRANSITION_ACTIONS.new.find((a) => a.to === "returned")!;
    expect(canRunAction(ret, "registrator")).toBe(true);
    expect(canRunAction(ret, "admin")).toBe(true);
    expect(canRunAction(ret, "staff")).toBe(false);
  });

  it("knows every status", () => {
    expect(new Set(STATUS_ORDER)).toEqual(new Set(Object.keys(TRANSITION_ACTIONS)));
  });
});
