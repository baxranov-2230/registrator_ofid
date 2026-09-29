import { describe, expect, it } from "vitest";

import {
  PROGRESS_STEPS,
  progressIndex,
  STATUS_ORDER,
  TRANSITION_ACTIONS,
} from "@/features/requests/statusMeta";

describe("workflow buttons", () => {
  it("offers no action on a closed request", () => {
    expect(TRANSITION_ACTIONS.completed).toEqual([]);
    expect(TRANSITION_ACTIONS.rejected).toEqual([]);
  });

  it("requires a reason for returning, as the server does", () => {
    const actions = Object.values(TRANSITION_ACTIONS).flat();
    for (const action of actions) {
      if (action.to === "returned") expect(action.commentRequired).toBe(true);
    }
  });

  it("closes a request only through the answer form", () => {
    const actions = Object.values(TRANSITION_ACTIONS).flat();
    for (const action of actions) {
      expect(action.to).not.toBe("rejected");
      expect(action.to).not.toBe("accepted");
      if (action.to === "completed") expect(action.kind).toBe("answer");
    }
    expect(TRANSITION_ACTIONS.in_progress[0].kind).toBe("answer");
  });

  it("walks new → in_progress → completed, with legacy accepted as in progress", () => {
    expect(PROGRESS_STEPS).toEqual(["new", "in_progress", "completed"]);
    expect(progressIndex("accepted")).toBe(progressIndex("in_progress"));
    expect(progressIndex("returned")).toBe(-1);
  });

  it("knows every status", () => {
    expect(new Set(STATUS_ORDER)).toEqual(new Set(Object.keys(TRANSITION_ACTIONS)));
  });
});
