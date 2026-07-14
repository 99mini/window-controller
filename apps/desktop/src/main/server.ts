import http from "node:http";
import os from "node:os";
import express from "express";
import { nanoid } from "nanoid";
import { WebSocketServer } from "ws";
import {
  isClientMessage,
  type ClientMessage,
  type ModifierKey,
  type ServerMessage,
} from "@window-controller/protocol";
import { loadInputDriver } from "./input-driver.js";
import { getPairedDevices, savePairedDevice } from "./storage.js";
import type { ServerState } from "../shared/types.js";

export type { ServerState };

type StateChangeListener = (state: ServerState) => void;

export interface ServerController {
  getState(): ServerState;
  on(event: "stateChange", cb: StateChangeListener): void;
  off(event: "stateChange", cb: StateChangeListener): void;
}

export interface StartServerOptions {
  mobilePath?: string;
  dataDir?: string;
  addonPath?: string;
}

const PORT = Number(process.env.PORT ?? "4580");
const HOST = process.env.HOST ?? "0.0.0.0";
const PAIR_CODE_LENGTH = 6;

function generatePairCode(): string {
  return String(Math.floor(Math.random() * 10 ** PAIR_CODE_LENGTH)).padStart(
    PAIR_CODE_LENGTH,
    "0",
  );
}

function getLocalIpv4(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface): iface is NonNullable<typeof iface> => Boolean(iface))
    .filter((iface) => iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);
}

function isPrivateAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.replace("::ffff:", "");
  return (
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

export async function startServer(
  options: StartServerOptions = {},
): Promise<ServerController> {
  const { mobilePath, dataDir = process.cwd(), addonPath } = options;

  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  const driver = loadInputDriver(addonPath);

  let pairCode = generatePairCode();
  let connectedDeviceName: string | undefined;
  const listeners = new Set<StateChangeListener>();

  function currentState(): ServerState {
    return {
      pairCode,
      connectedDevice: connectedDeviceName,
      addresses: getLocalIpv4(),
      port: PORT,
      hostName: os.hostname(),
    };
  }

  function emitStateChange(): void {
    const state = currentState();
    for (const cb of listeners) cb(state);
  }

  app.use(express.json());
  app.get("/api/state", (_req, res) => { res.json(currentState()); });
  if (mobilePath) app.use(express.static(mobilePath));

  wss.on("connection", async (socket, request) => {
    if (!isPrivateAddress(request.socket.remoteAddress)) {
      socket.close(1008, "Private network only");
      return;
    }

    let authenticatedDeviceId: string | null = null;
    const send = (message: ServerMessage) => socket.send(JSON.stringify(message));

    send({
      type: "server_state",
      hostName: os.hostname(),
      pairCode,
      port: PORT,
      connectedDevice: connectedDeviceName,
    });

    socket.on("message", async (raw) => {
      let parsed: unknown;
      try { parsed = JSON.parse(String(raw)); }
      catch { send({ type: "error", message: "Invalid JSON" }); return; }

      if (!isClientMessage(parsed)) {
        send({ type: "error", message: "Invalid message shape" });
        return;
      }

      const message = parsed as ClientMessage;

      if (message.type === "ping") { send({ type: "pong" }); return; }

      if (message.type === "pair_request") {
        if (message.pairCode !== pairCode) {
          send({ type: "pair_result", ok: false, message: "Invalid pair code" });
          return;
        }
        const deviceId = nanoid(12);
        const token = nanoid(32);
        await savePairedDevice(
          { deviceId, deviceName: message.deviceName, token, pairedAt: new Date().toISOString() },
          dataDir,
        );
        authenticatedDeviceId = deviceId;
        connectedDeviceName = message.deviceName;
        pairCode = generatePairCode();
        emitStateChange();
        send({ type: "pair_result", ok: true, deviceId, token });
        return;
      }

      if (message.type === "auth") {
        const devices = await getPairedDevices(dataDir);
        const device = devices.find(
          (e) => e.deviceId === message.deviceId && e.token === message.token,
        );
        if (!device) {
          send({ type: "auth_result", ok: false, message: "Authentication failed" });
          return;
        }
        authenticatedDeviceId = device.deviceId;
        connectedDeviceName = device.deviceName;
        emitStateChange();
        send({ type: "auth_result", ok: true });
        return;
      }

      if (!authenticatedDeviceId) {
        send({ type: "error", message: "Authenticate first" });
        return;
      }

      switch (message.type) {
        case "mouse_move": driver.moveMouse(message.dx, message.dy); break;
        case "mouse_button": driver.mouseButton(message.button, message.action); break;
        case "scroll": driver.scroll(message.deltaX, message.deltaY); break;
        case "key":
          driver.keyPress(message.key, message.action, message.modifiers ?? ([] as ModifierKey[]));
          break;
        case "text": driver.textInput(message.value); break;
        case "volume": driver.volume(message.action); break;
      }
    });

    socket.on("close", () => {
      connectedDeviceName = undefined;
      emitStateChange();
    });
  });

  await new Promise<void>((resolve) => { server.listen(PORT, HOST, () => resolve()); });

  console.log(`Window Controller server running on :${PORT}`);

  return {
    getState: currentState,
    on(_event, cb) { listeners.add(cb); },
    off(_event, cb) { listeners.delete(cb); },
  };
}
