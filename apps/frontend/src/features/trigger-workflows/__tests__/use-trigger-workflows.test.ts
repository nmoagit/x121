/**
 * Hook tests for trigger workflows (PRD-97).
 *
 * Validates that query key factory produces correct keys for each
 * query/mutation pattern.
 */

import { describe, expect, it } from "vitest";

import { triggerKeys } from "../hooks/use-trigger-workflows";

/* --------------------------------------------------------------------------
   Query key factory tests
   -------------------------------------------------------------------------- */

describe("triggerKeys", () => {
  it("produces correct base key", () => {
    expect(triggerKeys.all).toEqual(["triggers"]);
  });

  it("produces list key without projectId", () => {
    expect(triggerKeys.list()).toEqual(["triggers", "list", undefined]);
  });

  it("produces list key with projectId", () => {
    expect(triggerKeys.list(42)).toEqual(["triggers", "list", 42]);
  });

  it("produces detail key", () => {
    expect(triggerKeys.detail(7)).toEqual(["triggers", "detail", 7]);
  });

  it("produces log key with filters", () => {
    const filters = { trigger_id: "3", limit: "20" };
    expect(triggerKeys.log(filters)).toEqual(["triggers", "log", filters]);
  });

  it("produces chainGraph key without projectId", () => {
    expect(triggerKeys.chainGraph()).toEqual(["triggers", "chain-graph", undefined]);
  });

  it("produces chainGraph key with projectId", () => {
    expect(triggerKeys.chainGraph(5)).toEqual(["triggers", "chain-graph", 5]);
  });

  it("detail keys for different IDs are distinct", () => {
    expect(triggerKeys.detail(1)).not.toEqual(triggerKeys.detail(2));
  });

  it("list keys for different projects are distinct", () => {
    expect(triggerKeys.list(1)).not.toEqual(triggerKeys.list(2));
  });
});
