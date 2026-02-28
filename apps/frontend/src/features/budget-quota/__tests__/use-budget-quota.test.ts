/**
 * Tests for budget & quota TanStack Query hooks (PRD-93).
 */

import { describe, expect, test } from "vitest";

import { budgetKeys } from "../hooks/use-budget-quota";

/* --------------------------------------------------------------------------
   Query key factory tests
   -------------------------------------------------------------------------- */

describe("budgetKeys", () => {
  test("all returns base key", () => {
    expect(budgetKeys.all).toEqual(["budgets"]);
  });

  test("budgets returns list key", () => {
    expect(budgetKeys.budgets()).toEqual(["budgets", "budgets"]);
  });

  test("budget returns project-specific key", () => {
    expect(budgetKeys.budget(42)).toEqual(["budgets", "budget", 42]);
  });

  test("quotas returns list key", () => {
    expect(budgetKeys.quotas()).toEqual(["budgets", "quotas"]);
  });

  test("quota returns user-specific key", () => {
    expect(budgetKeys.quota(7)).toEqual(["budgets", "quota", 7]);
  });

  test("exemptions returns exemptions key", () => {
    expect(budgetKeys.exemptions()).toEqual(["budgets", "exemptions"]);
  });

  test("myBudget returns user-scoped budget key", () => {
    expect(budgetKeys.myBudget(10)).toEqual(["budgets", "my-budget", 10]);
  });

  test("myQuota returns user-scoped quota key", () => {
    expect(budgetKeys.myQuota()).toEqual(["budgets", "my-quota"]);
  });

  test("check returns check key with projectId and hours", () => {
    expect(budgetKeys.check(5, 2.5)).toEqual(["budgets", "check", 5, 2.5]);
  });

  test("budgetHistory returns project history key", () => {
    expect(budgetKeys.budgetHistory(3, "30d")).toEqual([
      "budgets",
      "budget-history",
      3,
      "30d",
    ]);
  });

  test("quotaHistory returns user history key", () => {
    expect(budgetKeys.quotaHistory(5, "7d")).toEqual([
      "budgets",
      "quota-history",
      5,
      "7d",
    ]);
  });

  test("keys are readonly tuples (as const)", () => {
    const key = budgetKeys.budget(1);
    // TypeScript readonly assertion -- key[0] should be "budgets"
    expect(key[0]).toBe("budgets");
    expect(key[1]).toBe("budget");
    expect(key[2]).toBe(1);
  });
});
