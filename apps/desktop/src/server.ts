import http from "node:http";
import os from "node:os";
import express from "express";
import { nanoid } from "nanoid";
import { WebSocketServer } from "ws";
import {
  isClientMessage,
  type ClientMessage,
  type ModifierKey,
  type ServerMessage
} from "@window-controller/protocol";
import { loadInputDriver } from "./input-driver.js";
import { getPairedDevices, savePairedDevice } from "./storage.js";

const PORT = Number(process.env.PORT ?? "4580");
const HOST = process.env.HOST ?? "0.0.0.0";
const PAIR_CODE_LENGTH = 6;

function generatePairCode(): string {
  return String(Math.floor(Math.random() * 10 ** PAIR_CODE_LENGTH)).padStart(PAIR_CODE_LENGTH, "0");
}

function getLocalIpv4(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface): iface is NonNullable<typeof iface> => Boolean(iface))
    .filter((iface) => iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);
}

function isPrivateAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }

  const normalized = address.replace("::ffff:", "");
  return (
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

export async function startServer(): Promise<void> {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  const driver = loadInputDriver();
  let pairCode = generatePairCode();
  let connectedDeviceName: string | undefined;

  app.use(express.json());

  app.get("/api/state", (_req, res) => {
    res.json({
      hostName: os.hostname(),
      pairCode,
      port: PORT,
      addresses: getLocalIpv4(),
      connectedDevice: connectedDeviceName
    });
  });

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
      connectedDevice: connectedDeviceName
    });

    socket.on("message", async (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        send({ type: "error", message: "Invalid JSON" });
        return;
      }

      if (!isClientMessage(parsed)) {
        send({ type: "error", message: "Invalid message shape" });
        return;
      }

      const message = parsed as ClientMessage;

      if (message.type === "ping") {
        send({ type: "pong" });
        return;
      }

      if (message.type === "pair_request") {
        if (message.pairCode !== pairCode) {
          send({ type: "pair_result", ok: false, message: "Invalid pair code" });
          return;
        }

        const deviceId = nanoid(12);
        const token = nanoid(32);
        await savePairedDevice({
          deviceId,
          deviceName: message.deviceName,
          token,
          pairedAt: new Date().toISOString()
        });
        authenticatedDeviceId = deviceId;
        connectedDeviceName = message.deviceName;
        pairCode = generatePairCode();
        send({ type: "pair_result", ok: true, deviceId, token });
        return;
      }

      if (message.type === "auth") {
        const pairedDevices = await getPairedDevices();
        const device = pairedDevices.find(
          (entry) => entry.deviceId === message.deviceId && entry.token === message.token
        );
        if (!device) {
          send({ type: "auth_result", ok: false, message: "Authentication failed" });
          return;
        }
        authenticatedDeviceId = device.deviceId;
        connectedDeviceName = device.deviceName;
        send({ type: "auth_result", ok: true });
        return;
      }

      if (!authenticatedDeviceId) {
        send({ type: "error", message: "Authenticate first" });
        return;
      }

      switch (message.type) {
        case "mouse_move":
          driver.moveMouse(message.dx, message.dy);
          break;
        case "mouse_button":
          driver.mouseButton(message.button, message.action);
          break;
        case "scroll":
          driver.scroll(message.deltaX, message.deltaY);
          break;
        case "key":
          driver.keyPress(message.key, message.action, message.modifiers ?? ([] as ModifierKey[]));
          break;
        case "text":
          driver.textInput(message.value);
          break;
      }
    });

    socket.on("close", () => {
      connectedDeviceName = undefined;
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(PORT, HOST, () => resolve());
  });

  const addresses = getLocalIpv4();
  console.log("Remote Controller running");
  console.log(`Host name: ${os.hostname()}`);
  console.log(`Pair code: ${pairCode}`);
  for (const address of addresses) {
    console.log(`Open: http://${address}:${PORT}`);
  }
}
