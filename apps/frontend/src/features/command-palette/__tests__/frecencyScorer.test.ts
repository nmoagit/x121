import { describe, expect, it } from "vitest";

import {
  calculateFrecencyScore,
  sortByFrecency,
} from "../frecencyScorer";
import type { UserRecentItem } from "../types";

function makeItem(overrides: Partial<UserRecentItem> = {}): UserRecentItem {
  return {
    id: 1,
    user_id: 1,
    entity_type: "project",
    entity_id: 100,
    access_count: 1,
    last_accessed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("frecencyScorer", () => {
  it("recent items score higher than old items", () => {
    const recent = makeItem({
      access_count: 1,
      last_accessed_at: new Date().toISOString(),
    });
    const old = makeItem({
      access_count: 1,
      last_accessed_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    expect(calculateFrecencyScore(recent)).toBeGreaterThan(
      calculateFrecencyScore(old),
    );
  });

  it("frequent items score higher than rare items", () => {
    const now = new Date().toISOString();
    const frequent = makeItem({ access_count: 50, last_accessed_at: now });
    const rare = makeItem({ access_count: 1, last_accessed_at: now });

    expect(calculateFrecencyScore(frequent)).toBeGreaterThan(
      calculateFrecencyScore(rare),
    );
  });

  it("sortByFrecency orders highest score first", () => {
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const items = [
      makeItem({ id: 1, access_count: 1, last_accessed_at: old }),
      makeItem({ id: 2, access_count: 10, last_accessed_at: now }),
      makeItem({ id: 3, access_count: 2, last_accessed_at: now }),
    ];

    const sorted = sortByFrecency(items);
    expect(sorted[0]!.id).toBe(2);
    expect(sorted[sorted.length - 1]!.id).toBe(1);
  });
});
