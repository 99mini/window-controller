import { useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@window-controller/protocol";

type Session = {
  deviceId: string;
  token: string;
  deviceName: string;
};

type View = "setup" | "pairing" | "ready";

const SESSION_KEY = "wc-session";
const SERVER_KEY = "wc-server";
const SEND_INTERVAL = 1000 / 60;

function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
}

function loadServer(): { host: string; port: string } {
  try {
    const s = JSON.parse(localStorage.getItem(SERVER_KEY) ?? "null");
    if (s?.host && s?.port) return s;
  } catch {
    // fall through
  }
  return { host: window.location.hostname || "192.168.0.10", port: "4580" };
}

export function App() {
  const savedServer = loadServer();
  const savedSession = loadSession();

  const [host, setHost] = useState(savedServer.host);
  const [port, setPort] = useState(savedServer.port);
  const [deviceName, setDeviceName] = useState(
    savedSession?.deviceName ?? "My Phone",
  );
  const [pairCode, setPairCode] = useState("");
  const [view, setView] = useState<View>("setup");
  const [statusText, setStatusText] = useState(
    savedSession ? "Connecting..." : "",
  );
  const [serverName, setServerName] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<Session | null>(savedSession);
  const movementRef = useRef({ dx: 0, dy: 0, lastSentAt: 0 });
  const pointerDownRef = useRef(false);

  useEffect(() => {
    if (sessionRef.current) {
      connect();
    }
    return () => socketRef.current?.close();
  }, []);

  function sendMessage(message: ClientMessage) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  function connect() {
    socketRef.current?.close();
    localStorage.setItem(SERVER_KEY, JSON.stringify({ host, port }));
    setStatusText("Connecting...");

    const socket = new WebSocket(`ws://${host}:${port}/ws`);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      const session = sessionRef.current;
      if (session) {
        sendMessage({
          type: "auth",
          deviceId: session.deviceId,
          token: session.token,
        });
        setStatusText("Authenticating...");
      } else {
        setView("pairing");
        setStatusText("");
      }
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;

      if (message.type === "server_state") {
        setServerName(message.hostName);
      }

      if (message.type === "auth_result") {
        if (message.ok) {
          setView("ready");
          setStatusText("");
        } else {
          sessionRef.current = null;
          localStorage.removeItem(SESSION_KEY);
          setView("pairing");
          setStatusText("Session expired — re-pair required");
        }
      }

      if (message.type === "pair_result") {
        if (message.ok && message.deviceId && message.token) {
          const session: Session = {
            deviceId: message.deviceId,
            token: message.token,
            deviceName,
          };
          sessionRef.current = session;
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
          setView("ready");
          setStatusText("");
        } else {
          setStatusText(message.message ?? "Pairing failed");
        }
      }

      if (message.type === "error") {
        setStatusText(message.message);
      }
    });

    socket.addEventListener("close", () => {
      setView("setup");
      setStatusText("Disconnected");
    });

    socket.addEventListener("error", () => {
      setStatusText("Connection failed");
    });
  }

  function pair() {
    sendMessage({ type: "pair_request", pairCode, deviceName });
    setStatusText("Pairing...");
  }

  function disconnect() {
    sessionRef.current = null;
    localStorage.removeItem(SESSION_KEY);
    socketRef.current?.close();
    setView("setup");
    setStatusText("");
  }

  function flushMovement(force = false) {
    const now = performance.now();
    if (!force && now - movementRef.current.lastSentAt < SEND_INTERVAL) return;
    const { dx, dy } = movementRef.current;
    if (dx !== 0 || dy !== 0) {
      sendMessage({ type: "mouse_move", dx, dy });
      movementRef.current = { dx: 0, dy: 0, lastSentAt: now };
    }
  }

  if (view === "setup") {
    return (
      <main className="app-shell">
        <section className="panel">
          <h1>Window Controller</h1>
          {statusText && <p className="status-text">{statusText}</p>}
          <label>
            Host
            <input value={host} onChange={(e) => setHost(e.target.value)} />
          </label>
          <label>
            Port
            <input value={port} onChange={(e) => setPort(e.target.value)} />
          </label>
          <label>
            Device name
            <input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </label>
          <div className="actions">
            <button onClick={connect}>Connect</button>
          </div>
        </section>
      </main>
    );
  }

  if (view === "pairing") {
    return (
      <main className="app-shell">
        <section className="panel">
          <h1>Pair Device</h1>
          {serverName && <p className="server-name">PC: {serverName}</p>}
          {statusText && <p className="status-text">{statusText}</p>}
          <label>
            Pair code
            <input
              value={pairCode}
              onChange={(e) => setPairCode(e.target.value)}
              placeholder="Enter code shown on PC"
              inputMode="numeric"
              autoComplete="off"
            />
          </label>
          <div className="actions">
            <button onClick={pair}>Pair</button>
            <button
              className="btn-secondary"
              onClick={() => {
                socketRef.current?.close();
                setView("setup");
                setStatusText("");
              }}
            >
              Back
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="panel status-bar">
        <span className="server-name">{serverName || host}</span>
        <button className="btn-small btn-secondary" onClick={disconnect}>
          Disconnect
        </button>
      </section>

      <section
        className="touchpad"
        onPointerDown={(e) => {
          pointerDownRef.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!pointerDownRef.current) return;
          movementRef.current.dx += e.movementX;
          movementRef.current.dy += e.movementY;
          flushMovement();
        }}
        onPointerUp={() => {
          pointerDownRef.current = false;
          flushMovement(true);
        }}
        onPointerCancel={() => {
          pointerDownRef.current = false;
        }}
        onDoubleClick={() =>
          sendMessage({ type: "mouse_button", button: "left", action: "click" })
        }
      >
        <span className="touchpad-hint">Touchpad · double-tap to click</span>
      </section>

      <section className="button-row">
        <button
          onClick={() =>
            sendMessage({
              type: "mouse_button",
              button: "left",
              action: "click",
            })
          }
        >
          Left Click
        </button>
        <button
          onClick={() =>
            sendMessage({
              type: "mouse_button",
              button: "right",
              action: "click",
            })
          }
        >
          Right Click
        </button>
      </section>

      <section className="button-row">
        <button
          onClick={() =>
            sendMessage({ type: "scroll", deltaX: 0, deltaY: 120 })
          }
        >
          Scroll Up
        </button>
        <button
          onClick={() =>
            sendMessage({ type: "scroll", deltaX: 0, deltaY: -120 })
          }
        >
          Scroll Down
        </button>
      </section>

      <section className="button-row button-row-3">
        <button onClick={() => sendMessage({ type: "volume", action: "down" })}>
          Volume -
        </button>
        <button onClick={() => sendMessage({ type: "volume", action: "mute" })}>
          Mute
        </button>
        <button onClick={() => sendMessage({ type: "volume", action: "up" })}>
          Volume +
        </button>
      </section>
    </main>
  );
}
