import { create } from "zustand";

export type ScreenshotAsset = {
  id: string;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  name: string;
};

type HistorySnapshot = {
  baseDataUrl: string;
  annotationDataUrl: string | null;
};

type EditorStore = {
  screenshot: ScreenshotAsset | null;
  baseDataUrl: string | null;
  annotationDataUrl: string | null;
  history: HistorySnapshot[];
  historyIndex: number;
  unsavedChanges: boolean;
  setScreenshot: (asset: ScreenshotAsset) => void;
  pushSnapshot: (snapshot: HistorySnapshot, markUnsaved?: boolean) => void;
  undo: () => boolean;
  redo: () => boolean;
  clearScreenshot: () => void;
  markSaved: () => void;
  setUnsavedChanges: (value: boolean) => void;
};

export const useEditorStore = create<EditorStore>((set, get) => ({
  screenshot: null,
  baseDataUrl: null,
  annotationDataUrl: null,
  history: [],
  historyIndex: -1,
  unsavedChanges: false,
  setScreenshot: (asset) =>
    set({
      screenshot: asset,
      baseDataUrl: asset.dataUrl,
      annotationDataUrl: null,
      history: [{ baseDataUrl: asset.dataUrl, annotationDataUrl: null }],
      historyIndex: 0,
      unsavedChanges: false,
    }),
  pushSnapshot: (snapshot, markUnsaved = true) => {
    const { history, historyIndex } = get();
    const nextHistory = [...history.slice(0, historyIndex + 1), snapshot];
    set({
      history: nextHistory,
      historyIndex: nextHistory.length - 1,
      baseDataUrl: snapshot.baseDataUrl,
      annotationDataUrl: snapshot.annotationDataUrl,
      unsavedChanges: markUnsaved,
    });
  },
  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) {
      return false;
    }
    const nextIndex = historyIndex - 1;
    const snapshot = history[nextIndex];
    set({
      historyIndex: nextIndex,
      baseDataUrl: snapshot.baseDataUrl,
      annotationDataUrl: snapshot.annotationDataUrl,
      unsavedChanges: true,
    });
    return true;
  },
  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) {
      return false;
    }
    const nextIndex = historyIndex + 1;
    const snapshot = history[nextIndex];
    set({
      historyIndex: nextIndex,
      baseDataUrl: snapshot.baseDataUrl,
      annotationDataUrl: snapshot.annotationDataUrl,
      unsavedChanges: true,
    });
    return true;
  },
  clearScreenshot: () =>
    set({
      screenshot: null,
      baseDataUrl: null,
      annotationDataUrl: null,
      history: [],
      historyIndex: -1,
      unsavedChanges: false,
    }),
  markSaved: () => set({ unsavedChanges: false }),
  setUnsavedChanges: (value) => set({ unsavedChanges: value }),
}));
