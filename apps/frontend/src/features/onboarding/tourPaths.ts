/**
 * Tour step definitions for each user role (PRD-53).
 *
 * Each path contains 4-6 steps highlighting relevant navigation areas
 * for that role.
 */

import type { TourStep } from "./types";

/**
 * Tour paths keyed by role name.
 *
 * Keys must match backend role constants in `core/src/roles.rs`
 * (ROLE_ADMIN, ROLE_CREATOR, ROLE_REVIEWER).
 */
export const tourPaths: Record<string, TourStep[]> = {
  admin: [
    {
      target: "[data-tour='sidebar-nav']",
      title: "Navigation",
      description: "Use the sidebar to navigate between projects, settings, and admin tools.",
      placement: "right",
    },
    {
      target: "[data-tour='project-list']",
      title: "Projects",
      description: "All your projects appear here. Create a new one to get started.",
      placement: "bottom",
    },
    {
      target: "[data-tour='admin-panel']",
      title: "Admin Panel",
      description:
        "Manage users, monitor workers, and configure system-wide settings from the admin area.",
      placement: "right",
    },
    {
      target: "[data-tour='workflow-editor']",
      title: "Workflow Editor",
      description: "Build and customize generation workflows with the visual editor.",
      placement: "bottom",
    },
    {
      target: "[data-tour='dashboard']",
      title: "Dashboard",
      description: "Track system health, active jobs, and project progress at a glance.",
      placement: "bottom",
    },
  ],

  creator: [
    {
      target: "[data-tour='sidebar-nav']",
      title: "Navigation",
      description: "Use the sidebar to switch between your projects and tools.",
      placement: "right",
    },
    {
      target: "[data-tour='project-list']",
      title: "Your Projects",
      description: "Open a project to start uploading portraits and generating images.",
      placement: "bottom",
    },
    {
      target: "[data-tour='character-panel']",
      title: "Characters",
      description: "Upload character portraits and manage source images here.",
      placement: "right",
    },
    {
      target: "[data-tour='generation-trigger']",
      title: "Start a Generation",
      description: "Click here to run your first generation once you have uploaded portraits.",
      placement: "left",
    },
    {
      target: "[data-tour='library']",
      title: "Image Library",
      description: "Browse, compare, and manage all generated images in the library.",
      placement: "bottom",
    },
    {
      target: "[data-tour='dashboard']",
      title: "Dashboard",
      description: "Check job progress and recent activity from the dashboard.",
      placement: "bottom",
    },
  ],

  reviewer: [
    {
      target: "[data-tour='sidebar-nav']",
      title: "Navigation",
      description: "Use the sidebar to find projects assigned for review.",
      placement: "right",
    },
    {
      target: "[data-tour='review-queue']",
      title: "Review Queue",
      description: "Segments waiting for your review appear here. Start approving or rejecting.",
      placement: "bottom",
    },
    {
      target: "[data-tour='review-tools']",
      title: "Review Tools",
      description: "Use approve, reject, and flag actions to process each segment.",
      placement: "left",
    },
    {
      target: "[data-tour='library']",
      title: "Reference Library",
      description: "Browse the image library for context while reviewing.",
      placement: "bottom",
    },
  ],
};
