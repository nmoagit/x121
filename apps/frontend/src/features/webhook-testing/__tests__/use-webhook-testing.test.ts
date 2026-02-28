import { describe, expect, it } from "vitest";

import { webhookTestingKeys } from "../hooks/use-webhook-testing";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("webhookTestingKeys", () => {
  it("generates base key", () => {
    expect(webhookTestingKeys.all).toEqual(["webhook-testing"]);
  });

  it("generates deliveries key without filters", () => {
    expect(webhookTestingKeys.deliveries()).toEqual([
      "webhook-testing",
      "deliveries",
      {},
    ]);
  });

  it("generates deliveries key with filters", () => {
    const filters = { endpoint_id: 1, success: true };
    expect(webhookTestingKeys.deliveries(filters)).toEqual([
      "webhook-testing",
      "deliveries",
      filters,
    ]);
  });

  it("generates delivery detail key", () => {
    expect(webhookTestingKeys.delivery(42)).toEqual([
      "webhook-testing",
      "delivery",
      42,
    ]);
  });

  it("generates health key", () => {
    expect(webhookTestingKeys.health(1, "webhook")).toEqual([
      "webhook-testing",
      "health",
      { endpointId: 1, endpointType: "webhook" },
    ]);
  });

  it("generates health summary key", () => {
    expect(webhookTestingKeys.healthSummary()).toEqual([
      "webhook-testing",
      "health-summary",
    ]);
  });

  it("generates mocks key", () => {
    expect(webhookTestingKeys.mocks()).toEqual([
      "webhook-testing",
      "mocks",
    ]);
  });

  it("generates mock captures key", () => {
    expect(webhookTestingKeys.mockCaptures(5)).toEqual([
      "webhook-testing",
      "mock-captures",
      5,
    ]);
  });

  it("generates sample payloads key", () => {
    expect(webhookTestingKeys.samplePayloads()).toEqual([
      "webhook-testing",
      "sample-payloads",
    ]);
  });
});
