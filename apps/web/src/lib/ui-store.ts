import { create } from "zustand";

type UiState = {
  noticeDismissed: boolean;
  dismissNotice: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  noticeDismissed: false,
  dismissNotice: () => set({ noticeDismissed: true }),
}));
