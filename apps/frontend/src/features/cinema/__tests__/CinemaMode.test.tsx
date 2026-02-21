import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CinemaMode } from "../CinemaMode";
import { SyncPlayGrid } from "../SyncPlayGrid";
import type { GridCell, GridLayout } from "../SyncPlayGrid";
import { CinemaReviewControls } from "../CinemaReviewControls";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

// Mock the Fullscreen API.
const mockRequestFullscreen = vi.fn().mockResolvedValue(undefined);
const mockExitFullscreen = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  // Stub HTMLElement.requestFullscreen
  HTMLDivElement.prototype.requestFullscreen = mockRequestFullscreen;
  Object.defineProperty(document, "fullscreenElement", {
    value: null,
    writable: true,
    configurable: true,
  });
  document.exitFullscreen = mockExitFullscreen;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Mock the video-related modules.
vi.mock("@/features/video-player", () => ({
  VideoPlayer: () => <div data-testid="mock-video-player" />,
  useVideoPlayer: () => ({
    videoRef: { current: null },
    isPlaying: false,
    currentFrame: 0,
    currentTime: 0,
    duration: 120,
    speed: 1,
    volume: 1,
    isMuted: false,
    isReady: true,
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    seekToFrame: vi.fn(),
    seekToTime: vi.fn(),
    setSpeed: vi.fn(),
    stepForward: vi.fn(),
    stepBackward: vi.fn(),
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
  }),
  useVideoMetadata: () => ({
    data: { framerate: 24, total_frames: 2880 },
  }),
  getStreamUrl: (type: string, id: number, quality: string) =>
    `/api/v1/videos/${type}/${id}/stream?quality=${quality}`,
  formatDuration: (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  },
}));

vi.mock("@/features/shortcuts", () => ({
  useShortcut: vi.fn(),
}));

vi.mock("../useAmbilight", () => ({
  useAmbilight: () => ({
    gradient: "radial-gradient(black, black)",
    isActive: false,
  }),
  AMBILIGHT_TRANSITION: "background 300ms ease",
}));

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

/* --------------------------------------------------------------------------
   CinemaMode Tests
   -------------------------------------------------------------------------- */

describe("CinemaMode", () => {
  const defaultProps = {
    segmentId: 42,
    onExit: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onFlag: vi.fn(),
  };

  it("renders the cinema mode container", () => {
    render(<CinemaMode {...defaultProps} />, { wrapper: createWrapper() });
    expect(screen.getByTestId("cinema-mode")).toBeInTheDocument();
  });

  it("requests fullscreen on mount", async () => {
    render(<CinemaMode {...defaultProps} />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(mockRequestFullscreen).toHaveBeenCalled();
    });
  });

  it("shows overlay controls initially", () => {
    render(<CinemaMode {...defaultProps} />, { wrapper: createWrapper() });
    // The exit button should be visible.
    expect(screen.getByTitle("Exit cinema mode (Esc)")).toBeInTheDocument();
  });

  it("auto-hides controls after 3 seconds", async () => {
    vi.useFakeTimers();
    render(<CinemaMode {...defaultProps} />, { wrapper: createWrapper() });

    // Controls visible initially.
    const exitButton = screen.getByTitle("Exit cinema mode (Esc)");
    expect(exitButton).toBeInTheDocument();

    // Advance time past the hide delay.
    act(() => {
      vi.advanceTimersByTime(3100);
    });

    // The overlay should have opacity-0 class (controls hidden).
    const overlay = exitButton.closest("[class*='transition-opacity']");
    expect(overlay?.className).toContain("opacity-0");

    vi.useRealTimers();
  });

  it("shows controls again on mouse movement", async () => {
    vi.useFakeTimers();
    render(<CinemaMode {...defaultProps} />, { wrapper: createWrapper() });

    // Let controls hide.
    act(() => {
      vi.advanceTimersByTime(3100);
    });

    // Move the mouse.
    const container = screen.getByTestId("cinema-mode");
    fireEvent.mouseMove(container);

    // Controls should reappear.
    const exitButton = screen.getByTitle("Exit cinema mode (Esc)");
    const overlay = exitButton.closest("[class*='transition-opacity']");
    expect(overlay?.className).toContain("opacity-100");

    vi.useRealTimers();
  });

  it("renders review controls (approve/reject/flag)", () => {
    render(<CinemaMode {...defaultProps} />, { wrapper: createWrapper() });
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
    expect(screen.getByText("Flag")).toBeInTheDocument();
  });

  it("displays time information", () => {
    render(<CinemaMode {...defaultProps} />, { wrapper: createWrapper() });
    // The mock returns duration 120, currentTime 0.
    expect(screen.getByText("0:00 / 2:00")).toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------------
   SyncPlayGrid Tests
   -------------------------------------------------------------------------- */

describe("SyncPlayGrid", () => {
  const mockCells: GridCell[] = [
    { segmentId: 1, label: "Take A" },
    { segmentId: 2, label: "Take B" },
    { segmentId: 3, label: "Take C" },
    { segmentId: 4, label: "Take D" },
  ];

  const defaultProps = {
    cells: mockCells,
    layout: "2x2" as GridLayout,
    onCellAction: vi.fn(),
    onLayoutChange: vi.fn(),
  };

  it("renders the grid with correct number of cells", () => {
    render(<SyncPlayGrid {...defaultProps} />, { wrapper: createWrapper() });
    expect(screen.getByTestId("sync-grid")).toBeInTheDocument();
    // "Take A" appears in both the cell overlay and the review controls label.
    expect(screen.getAllByText("Take A").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Take B").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Take C").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Take D").length).toBeGreaterThanOrEqual(1);
  });

  it("renders layout switcher buttons", () => {
    render(<SyncPlayGrid {...defaultProps} />, { wrapper: createWrapper() });
    expect(screen.getByText("1x1")).toBeInTheDocument();
    expect(screen.getByText("2x1")).toBeInTheDocument();
    expect(screen.getByText("2x2")).toBeInTheDocument();
  });

  it("calls onLayoutChange when a layout button is clicked", () => {
    render(<SyncPlayGrid {...defaultProps} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByText("2x1"));
    expect(defaultProps.onLayoutChange).toHaveBeenCalledWith("2x1");
  });

  it("shows only the relevant cells for 2x1 layout", () => {
    render(
      <SyncPlayGrid {...defaultProps} layout="2x1" />,
      { wrapper: createWrapper() },
    );
    expect(screen.getAllByText("Take A").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Take B").length).toBeGreaterThanOrEqual(1);
    // Takes C and D should not be rendered in 2x1.
    expect(screen.queryByText("Take C")).not.toBeInTheDocument();
    expect(screen.queryByText("Take D")).not.toBeInTheDocument();
  });

  it("shows empty cell placeholders when fewer cells than layout slots", () => {
    const twoCells: GridCell[] = [
      { segmentId: 1, label: "Take A" },
      { segmentId: 2, label: "Take B" },
    ];
    render(
      <SyncPlayGrid {...defaultProps} cells={twoCells} layout="2x2" />,
      { wrapper: createWrapper() },
    );
    const placeholders = screen.getAllByText("Drop segment here");
    expect(placeholders).toHaveLength(2);
  });

  it("highlights the selected cell on click", () => {
    render(<SyncPlayGrid {...defaultProps} />, { wrapper: createWrapper() });

    // Click the second cell label.
    const takeBLabel = screen.getByText("Take B");
    const cellContainer = takeBLabel.closest("[class*='relative bg-black']");
    if (cellContainer) {
      fireEvent.click(cellContainer);
    }

    // The selected cell should have the ring class.
    expect(cellContainer?.className).toContain("ring-2");
  });

  it("renders review controls for the selected cell", () => {
    render(<SyncPlayGrid {...defaultProps} />, { wrapper: createWrapper() });
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
    expect(screen.getByText("Flag")).toBeInTheDocument();
  });
});

/* --------------------------------------------------------------------------
   CinemaReviewControls Tests
   -------------------------------------------------------------------------- */

describe("CinemaReviewControls", () => {
  it("renders all three review buttons", () => {
    render(
      <CinemaReviewControls
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onFlag={vi.fn()}
      />,
    );
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
    expect(screen.getByText("Flag")).toBeInTheDocument();
  });

  it("calls onApprove when approve button is clicked", () => {
    const onApprove = vi.fn();
    render(
      <CinemaReviewControls
        onApprove={onApprove}
        onReject={vi.fn()}
        onFlag={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Approve"));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("calls onReject when reject button is clicked", () => {
    const onReject = vi.fn();
    render(
      <CinemaReviewControls
        onApprove={vi.fn()}
        onReject={onReject}
        onFlag={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Reject"));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("calls onFlag when flag button is clicked", () => {
    const onFlag = vi.fn();
    render(
      <CinemaReviewControls
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onFlag={onFlag}
      />,
    );
    fireEvent.click(screen.getByText("Flag"));
    expect(onFlag).toHaveBeenCalledTimes(1);
  });

  it("displays cell label when provided", () => {
    render(
      <CinemaReviewControls
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onFlag={vi.fn()}
        cellLabel="Take A"
      />,
    );
    expect(screen.getByText("Take A")).toBeInTheDocument();
  });

  it("shows flash feedback on action", async () => {
    vi.useFakeTimers();
    const { container } = render(
      <CinemaReviewControls
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onFlag={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Approve"));

    // A flash overlay should appear.
    const flashEl = container.querySelector("[class*='animate-pulse']");
    expect(flashEl).toBeInTheDocument();

    // Flash should disappear after the timeout.
    act(() => {
      vi.advanceTimersByTime(700);
    });

    const flashElAfter = container.querySelector("[class*='animate-pulse']");
    expect(flashElAfter).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});
