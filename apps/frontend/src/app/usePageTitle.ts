import { create } from "zustand";

interface PageTitleState {
  title: string;
  description: string;
  setPageTitle: (title: string, description?: string) => void;
}

export const usePageTitle = create<PageTitleState>((set) => ({
  title: "",
  description: "",
  setPageTitle: (title, description = "") => set({ title, description }),
}));
