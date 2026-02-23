/**
 * Tests for ScanHistory component (PRD-43).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ScanHistory } from "../ScanHistory";
import type { IntegrityScan } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const scans: IntegrityScan[] = [
  {
    id: 1,
    worker_id: 10,
    scan_type: "full",
    status_id: 3,
    results_json: null,
    models_found: 42,
    models_missing: 2,
    models_corrupted: 1,
    nodes_found: 15,
    nodes_missing: 0,
    started_at: "2026-02-22T10:00:00Z",
    completed_at: "2026-02-22T10:05:00Z",
    triggered_by: 1,
    created_at: "2026-02-22T10:00:00Z",
    updated_at: "2026-02-22T10:05:00Z",
  },
  {
    id: 2,
    worker_id: 10,
    scan_type: "models",
    status_id: 2,
    results_json: null,
    models_found: 40,
    models_missing: 0,
    models_corrupted: 0,
    nodes_found: 0,
    nodes_missing: 0,
    started_at: "2026-02-22T11:00:00Z",
    completed_at: null,
    triggered_by: 1,
    created_at: "2026-02-22T11:00:00Z",
    updated_at: "2026-02-22T11:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ScanHistory", () => {
  test("renders scan list", () => {
    renderWithProviders(<ScanHistory scans={scans} />);

    expect(screen.getByTestId("scan-history")).toBeInTheDocument();
    expect(screen.getByTestId("scan-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("scan-row-2")).toBeInTheDocument();
    expect(screen.getByText("Full System Scan")).toBeInTheDocument();
    expect(screen.getByText("Model Verification")).toBeInTheDocument();
  });

  test("shows summary counts", () => {
    renderWithProviders(<ScanHistory scans={scans} />);

    const summary = screen.getByTestId("scan-summary-1");
    expect(summary).toHaveTextContent("42 found");
    expect(summary).toHaveTextContent("2 missing");
    expect(summary).toHaveTextContent("1 corrupted");
  });

  test("shows status badge labels", () => {
    renderWithProviders(<ScanHistory scans={scans} />);

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });
});
