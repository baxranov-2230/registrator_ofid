import { describe, expect, it } from "vitest";

import { isNavActive, navItemsFor } from "@/shared/navItems";
import { homePathForRole, requestPathForRole } from "@/shared/navigation";

describe("navigation by role", () => {
  it("offers students nothing: they use the partner platform", () => {
    expect(navItemsFor("student")).toEqual([]);
  });

  it("gives reports to admin and leadership only", () => {
    const hasReports = (role: string) =>
      navItemsFor(role).some((item) => item.to === "/admin/reports");
    expect(hasReports("admin")).toBe(true);
    expect(hasReports("leadership")).toBe(true);
    expect(hasReports("registrator")).toBe(false);
    expect(hasReports("staff")).toBe(false);
  });

  it("keeps leadership away from management screens", () => {
    const targets = navItemsFor("leadership").map((i) => i.to);
    expect(targets).not.toContain("/admin/users");
    expect(targets).not.toContain("/admin/categories");
    expect(targets).not.toContain("/admin/api-clients");
  });

  it("routes each role to its own request detail prefix", () => {
    expect(requestPathForRole("staff")).toBe("/staff/requests");
    expect(requestPathForRole("registrator")).toBe("/registrator/requests");
    expect(requestPathForRole("leadership")).toBe("/admin/requests");
    expect(homePathForRole(undefined)).toBe("/dashboard");
  });
});

describe("isNavActive", () => {
  it("matches on segment boundaries only", () => {
    expect(isNavActive("/admin/users", "/admin/users")).toBe(true);
    expect(isNavActive("/admin/users/5", "/admin/users")).toBe(true);
    expect(isNavActive("/admin/usersx", "/admin/users")).toBe(false);
  });

  it("never lights the dashboard for nested pages", () => {
    expect(isNavActive("/dashboard/anything", "/dashboard")).toBe(false);
  });
});
