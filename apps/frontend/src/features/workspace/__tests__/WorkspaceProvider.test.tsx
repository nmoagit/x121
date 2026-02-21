/**
 * Tests for WorkspaceProvider and workspace state management (PRD-04).
 */

import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";
import { useAuthStore } from "@/stores/auth-store";

import { WorkspaceProvider } from "../WorkspaceProvider";
import { useWorkspaceStore } from "../hooks/use-workspace";

/* --------------------------------------------------------------------------
   Mock the API module (factory is hoisted, cannot reference outer variables)
   -------------------------------------------------------------------------- */

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      id: 1,
      user_id: 42,
      device_type: "desktop",
      layout_state: { panels: {}, sidebarWidth: 300, sidebarCollapsed: false },
      navigation_state: {
        activeProjectId: 5,
        activeCharacterId: null,
        activeSceneId: null,
        activeSegmentId: null,
        scrollPositions: {},
        zoomLevel: 1,
        videoPlaybackPosition: 0,
      },
      preferences: {},
      created_at: "2026-02-21T00:00:00Z",
      updated_at: "2026-02-21T00:00:00Z",
    }),
    put: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  },
}));

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function setAuthenticated() {
  useAuthStore.setState({
    isAuthenticated: true,
    user: { id: 42, username: "test", email: "test@test.com", role: "creator" },
    accessToken: "mock-token",
    refreshToken: "mock-refresh",
    isLoading: false,
  });
}

function clearAuth() {
  useAuthStore.setState({
    isAuthenticated: false,
    user: null,
    accessToken: null,
    refreshToken: null,
    isLoading: false,
  });
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("WorkspaceProvider", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      layout: { panels: {}, sidebarWidth: 280, sidebarCollapsed: false },
      navigation: {
        activeProjectId: null,
        activeCharacterId: null,
        activeSceneId: null,
        activeSegmentId: null,
        scrollPositions: {},
        zoomLevel: 1,
        videoPlaybackPosition: 0,
      },
      preferences: {},
      isLoaded: false,
      isDirty: false,
    });
  });

  afterEach(() => {
    clearAuth();
  });

  test("shows loading skeleton when authenticated but not loaded", () => {
    setAuthenticated();

    renderWithProviders(
      <WorkspaceProvider>
        <div data-testid="child">App Content</div>
      </WorkspaceProvider>,
    );

    expect(screen.getByText("Restoring workspace...")).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  test("renders children when not authenticated", () => {
    clearAuth();
    useWorkspaceStore.setState({ isLoaded: false });

    renderWithProviders(
      <WorkspaceProvider>
        <div data-testid="child">App Content</div>
      </WorkspaceProvider>,
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  test("renders children after workspace loads", async () => {
    setAuthenticated();

    renderWithProviders(
      <WorkspaceProvider>
        <div data-testid="child">App Content</div>
      </WorkspaceProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    // Verify store was hydrated with server data.
    const state = useWorkspaceStore.getState();
    expect(state.isLoaded).toBe(true);
    expect(state.layout.sidebarWidth).toBe(300);
    expect(state.navigation.activeProjectId).toBe(5);
  });
});

describe("useWorkspaceStore", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
  });

  test("setLayout marks dirty and merges state", () => {
    useWorkspaceStore.getState().setLayout({ sidebarWidth: 350 });

    const state = useWorkspaceStore.getState();
    expect(state.isDirty).toBe(true);
    expect(state.layout.sidebarWidth).toBe(350);
    expect(state.layout.sidebarCollapsed).toBe(false); // Unchanged.
  });

  test("setNavigation marks dirty and merges state", () => {
    useWorkspaceStore.getState().setNavigation({ activeProjectId: 7 });

    const state = useWorkspaceStore.getState();
    expect(state.isDirty).toBe(true);
    expect(state.navigation.activeProjectId).toBe(7);
    expect(state.navigation.zoomLevel).toBe(1); // Unchanged.
  });

  test("markClean resets isDirty", () => {
    useWorkspaceStore.getState().setLayout({ sidebarWidth: 400 });
    expect(useWorkspaceStore.getState().isDirty).toBe(true);

    useWorkspaceStore.getState().markClean();
    expect(useWorkspaceStore.getState().isDirty).toBe(false);
  });

  test("reset returns to initial state", () => {
    useWorkspaceStore.getState().setLayout({ sidebarWidth: 500 });
    useWorkspaceStore.setState({ isLoaded: true });

    useWorkspaceStore.getState().reset();

    const state = useWorkspaceStore.getState();
    expect(state.isLoaded).toBe(false);
    expect(state.isDirty).toBe(false);
    expect(state.layout.sidebarWidth).toBe(280);
  });
});
