import { contextBridge, ipcRenderer } from "electron";
import type { ServerState } from "../shared/types.js";

contextBridge.exposeInMainWorld("api", {
  getState(): Promise<ServerState> {
    return ipcRenderer.invoke("get-state");
  },

  onStateUpdate(cb: (state: ServerState) => void): () => void {
    const handler = (_e: Electron.IpcRendererEvent, state: ServerState) => cb(state);
    ipcRenderer.on("state-update", handler);
    return () => ipcRenderer.off("state-update", handler);
  },

  openBrowser(url: string): void {
    ipcRenderer.send("open-browser", url);
  },
});
