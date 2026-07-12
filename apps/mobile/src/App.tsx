import { useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@window-controller/protocol";

type SessionState = {
  deviceId: string;
  token: string;
  deviceName: string;
};

const STORAGE_KEY = "window-controller-session";
const SEND_INTERVAL = 1000 / 60;

function loadStoredSession(): SessionState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

export function App() {
  const [host, setHost] = useState(() => window.location.hostname || "192.168.0.10");
  const [port, setPort] = useState("4580");
  const [deviceName, setDeviceName] = useState("My Phone");
  const [pairCode, setPairCode] = useState("");
  const [status, setStatus] = useState("disconnected");
  const [serverName, setServerName] = useState("unknown");
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<SessionState | null>(loadStoredSession());
  const movementRef = useRef({ dx: 0, dy: 0, lastSentAt: 0 });
  const pendingPairRef = useRef(false);

  useEffect(() => {
    return () => socketRef.current?.close();
  }, []);

  function sendMessage(message: ClientMessage) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(message));
  }

  function connect() {
    socketRef.current?.close();
    const socket = new WebSocket(`ws://${host}:${port}/ws`);
    socketRef.current = socket;
    setStatus("connecting");

    socket.addEventListener("open", () => {
      setStatus("connected");
      if (pendingPairRef.current) {
        sendMessage({ type: "pair_request", pairCode, deviceName });
        pendingPairRef.current = false;
        return;
      }

      const session = sessionRef.current;
      if (session) {
        sendMessage({ type: "auth", deviceId: session.deviceId, token: session.token });
      }
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === "server_state") {
        setServerName(message.hostName);
        setPort(String(message.port));
      }
      if (message.type === "pair_result" && message.ok && message.deviceId && message.token) {
        const nextSession = { deviceId: message.deviceId, token: message.token, deviceName };
        sessionRef.current = nextSession;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
        setStatus("paired");
      }
      if (message.type === "auth_result") {
        setStatus(message.ok ? "ready" : "auth_failed");
      }
      if (message.type === "error") {
        setStatus(`error: ${message.message}`);
      }
    });

    socket.addEventListener("close", () => {
      setStatus("disconnected");
    });
  }

  function pair() {
    pendingPairRef.current = true;
    connect();
  }

  function flushMovement(force = false) {
    const now = performance.now();
    if (!force && now - movementRef.current.lastSentAt < SEND_INTERVAL) {
      return;
    }

    const { dx, dy } = movementRef.current;
    if (dx !== 0 || dy !== 0) {
      sendMessage({ type: "mouse_move", dx, dy });
      movementRef.current = { dx: 0, dy: 0, lastSentAt: now };
    }
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <h1>Window Controller</h1>
        <p>{status}</p>
        <label>
          Host
          <input value={host} onChange={(event) => setHost(event.target.value)} />
        </label>
        <label>
          Port
          <input value={port} onChange={(event) => setPort(event.target.value)} />
        </label>
        <label>
          Device name
          <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
        </label>
        <label>
          Pair code
          <input value={pairCode} onChange={(event) => setPairCode(event.target.value)} />
        </label>
        <div className="actions">
          <button onClick={connect}>Connect</button>
          <button onClick={pair}>Pair</button>
        </div>
        <p>Connected PC: {serverName}</p>
      </section>

      <section
        className="touchpad"
        onPointerDown={(event) => {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.pressure) {
            return;
          }
          movementRef.current.dx += event.movementX;
          movementRef.current.dy += event.movementY;
          flushMovement();
        }}
        onPointerUp={() => {
          flushMovement(true);
        }}
        onDoubleClick={() => {
          sendMessage({ type: "mouse_button", button: "left", action: "click" });
        }}
      >
        <span>Touchpad</span>
      </section>

      <section className="button-row">
        <button onClick={() => sendMessage({ type: "mouse_button", button: "left", action: "click" })}>
          Left Click
        </button>
        <button onClick={() => sendMessage({ type: "mouse_button", button: "right", action: "click" })}>
          Right Click
        </button>
      </section>

      <section className="button-row">
        <button onClick={() => sendMessage({ type: "scroll", deltaX: 0, deltaY: 120 })}>Scroll Up</button>
        <button onClick={() => sendMessage({ type: "scroll", deltaX: 0, deltaY: -120 })}>Scroll Down</button>
      </section>
    </main>
  );
}
