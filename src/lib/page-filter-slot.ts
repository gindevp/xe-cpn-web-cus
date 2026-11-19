import { create } from "zustand";
import { useLayoutEffect, type ReactNode } from "react";

type PageFilterSlot = {
  node: ReactNode;
  activeCount: number;
  clear: (() => void) | null;
};

type State = {
  slot: PageFilterSlot | null;
  setSlot: (slot: PageFilterSlot | null) => void;
};

/** Slot lọc theo từng trang — panel Lọc đọc và render. */
export const usePageFilterSlot = create<State>((set) => ({
  slot: null,
  setSlot: (slot) => set({ slot }),
}));

/** Đăng ký bộ lọc trang vào nút Lọc (unmount → gỡ). */
export function useRegisterPageFilters(
  node: ReactNode,
  opts?: { activeCount?: number; clear?: () => void },
) {
  const setSlot = usePageFilterSlot((s) => s.setSlot);
  const activeCount = opts?.activeCount ?? 0;
  const clear = opts?.clear;

  useLayoutEffect(() => {
    setSlot({ node, activeCount, clear: clear ?? null });
    return () => setSlot(null);
  }, [setSlot, node, activeCount, clear]);
}
