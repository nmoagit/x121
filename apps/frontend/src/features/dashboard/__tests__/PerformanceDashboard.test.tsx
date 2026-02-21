import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { PerformanceDashboard } from "../PerformanceDashboard";

// Mock the api module to prevent real HTTP requests.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/performance/overview")) {
        return Promise.resolve({
          total_gpu_hours: 123.4,
          avg_time_per_frame_ms: 45.6,
          peak_vram_mb: 8192,
          total_jobs: 1500,
          total_frames: 75000,
          top_workflows: [
            {
              workflow_id: 1,
              avg_time_per_frame_ms: 30.2,
              p95_time_per_frame_ms: 55.0,
              avg_gpu_time_ms: 120.5,
              avg_vram_peak_mb: 4096.0,
              max_vram_peak_mb: 6144,
              avg_likeness_score: 0.92,
              job_count: 500,
              total_frames: 25000,
            },
          ],
          bottom_workflows: [
            {
              workflow_id: 2,
              avg_time_per_frame_ms: 80.1,
              p95_time_per_frame_ms: 120.0,
              avg_gpu_time_ms: 300.0,
              avg_vram_peak_mb: 7000.0,
              max_vram_peak_mb: 8192,
              avg_likeness_score: 0.75,
              job_count: 200,
              total_frames: 10000,
            },
          ],
        });
      }
      if (path.includes("/performance/trend")) {
        return Promise.resolve([
          {
            period: "2026-02-01T00:00:00Z",
            avg_time_per_frame_ms: 42.0,
            avg_gpu_time_ms: 150.0,
            avg_vram_peak_mb: 5000.0,
            avg_likeness_score: 0.88,
            job_count: 50,
          },
          {
            period: "2026-02-02T00:00:00Z",
            avg_time_per_frame_ms: 44.0,
            avg_gpu_time_ms: 155.0,
            avg_vram_peak_mb: 5100.0,
            avg_likeness_score: 0.89,
            job_count: 55,
          },
        ]);
      }
      if (path.includes("/performance/alerts/thresholds")) {
        return Promise.resolve([]);
      }
      if (path.includes("/performance/workers/comparison")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock recharts to avoid rendering issues in jsdom.
vi.mock("recharts", () => {
  const MockComponent = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-mock">{children}</div>
  );
  return {
    ResponsiveContainer: MockComponent,
    LineChart: MockComponent,
    BarChart: MockComponent,
    PieChart: MockComponent,
    Line: () => null,
    Bar: () => null,
    Pie: () => null,
    Cell: () => null,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

describe("PerformanceDashboard", () => {
  it("renders the dashboard title", async () => {
    renderWithProviders(<PerformanceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Performance Dashboard")).toBeInTheDocument();
    });
  });

  it("shows KPI summary cards once data loads", async () => {
    renderWithProviders(<PerformanceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("123.4")).toBeInTheDocument();
      expect(screen.getByText("45.6")).toBeInTheDocument();
      expect(screen.getByText("8192")).toBeInTheDocument();
      expect(screen.getByText("1,500")).toBeInTheDocument();
      expect(screen.getByText("75,000")).toBeInTheDocument();
    });
  });

  it("shows top performers table", async () => {
    renderWithProviders(<PerformanceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Top Performers (Fastest)")).toBeInTheDocument();
      expect(screen.getByText("Workflow 1")).toBeInTheDocument();
    });
  });

  it("shows bottom performers table", async () => {
    renderWithProviders(<PerformanceDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Bottom Performers (Slowest)")).toBeInTheDocument();
      expect(screen.getByText("Workflow 2")).toBeInTheDocument();
    });
  });

  it("renders date range preset buttons", async () => {
    renderWithProviders(<PerformanceDashboard />);

    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getByText("Last 90 days")).toBeInTheDocument();
  });

  it("renders all tab buttons", async () => {
    renderWithProviders(<PerformanceDashboard />);

    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Quality Trends" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Workflow Comparison" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Worker Benchmarking" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Alert Thresholds" })).toBeInTheDocument();
  });

  it("switches to Quality Trends tab", async () => {
    renderWithProviders(<PerformanceDashboard />);

    const qualityTab = screen.getByRole("tab", { name: "Quality Trends" });
    fireEvent.click(qualityTab);

    await waitFor(() => {
      expect(screen.getByText("Quality & Performance Trends")).toBeInTheDocument();
    });
  });

  it("switches to Alert Thresholds tab", async () => {
    renderWithProviders(<PerformanceDashboard />);

    const alertsTab = screen.getByRole("tab", { name: "Alert Thresholds" });
    fireEvent.click(alertsTab);

    await waitFor(() => {
      expect(screen.getByText("Add Threshold")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    renderWithProviders(<PerformanceDashboard />);

    // Spinner should be rendered while loading.
    const spinner = document.querySelector('[class*="animate-spin"]');
    expect(spinner).toBeTruthy();
  });
});
