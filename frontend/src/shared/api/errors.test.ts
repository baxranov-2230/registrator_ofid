import { describe, expect, it } from "vitest";

import { formatApiError } from "@/shared/api/errors";

describe("formatApiError", () => {
  it("returns a plain FastAPI detail string", () => {
    expect(formatApiError({ status: 409, data: { detail: "Murojaat yopilgan" } })).toBe(
      "Murojaat yopilgan",
    );
  });

  it("flattens a 422 validation list and drops the 'body' prefix", () => {
    const err = {
      status: 422,
      data: {
        detail: [
          { loc: ["body", "new_password"], msg: "Parol kamida 10 ta belgidan iborat bo'lishi kerak" },
        ],
      },
    };
    expect(formatApiError(err)).toBe(
      "new_password: Parol kamida 10 ta belgidan iborat bo'lishi kerak",
    );
  });

  it("falls back to the status code when there is no detail", () => {
    expect(formatApiError({ status: 503 }, "Xato")).toBe("Xato (503)");
    expect(formatApiError(null, "Xato")).toBe("Xato");
  });
});
