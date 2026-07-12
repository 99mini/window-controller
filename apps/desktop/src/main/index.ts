import path from "node:path";
import { app, BrowserWindow, ipcMain, nativeImage, shell, Tray, Menu } from "electron";
import { startServer } from "./server.js";
import type { ServerState } from "../shared/types.js";

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;

function createTrayIcon(): nativeImage.NativeImage {
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4 + 0] = 86;
    buf[i * 4 + 1] = 122;
    buf[i * 4 + 2] = 255;
    buf[i * 4 + 3] = 255;
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function buildTrayMenu(state: ServerState): Electron.Menu {
  return Menu.buildFromTemplate([
    {
      label: state.connectedDevice
        ? `Connected: ${state.connectedDevice}`
        : "Waiting for connection",
      enabled: false,
    },
    { label: `Pair code: ${state.pairCode}`, enabled: false },
    { type: "separator" },
    {
      label: "Show",
      click: () => { mainWindow?.show(); mainWindow?.focus(); },
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 620,
    resizable: false,
    show: false,
    title: "Window Controller",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  win.on("close", (e) => {
    e.preventDefault();
    win.hide();
  });

  return win;
}

app.whenReady().then(async () => {
  const mobilePath = app.isPackaged
    ? path.join(process.resourcesPath, "mobile")
    : undefined;

  const addonPath = app.isPackaged
    ? path.join(process.resourcesPath, "native", "input_controller.node")
    : undefined;

  const dataDir = app.getPath("userData");

  const controller = await startServer({ mobilePath, dataDir, addonPath });

  let cachedState: ServerState = controller.getState();

  controller.on("stateChange", (state) => {
    cachedState = state;
    tray?.setContextMenu(buildTrayMenu(state));
    mainWindow?.webContents.send("state-update", state);
  });

  mainWindow = createWindow();

  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("Window Controller");
  tray.setContextMenu(buildTrayMenu(cachedState));

  tray.on("click", () => {
    if (!mainWindow) return;
    mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
  });

  ipcMain.handle("get-state", () => cachedState);
  ipcMain.on("open-browser", (_e, url: string) => { shell.openExternal(url); });

  mainWindow.show();
});

app.on("window-all-closed", () => {
  // keep alive in tray — do not quit
});

app.on("before-quit", () => {
  mainWindow?.removeAllListeners("close");
});

app.on("activate", () => {
  mainWindow?.show();
});
