import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
const SESSION_KEY = "wc-session";
const SERVER_KEY = "wc-server";
const SEND_INTERVAL = 1000 / 60;
function loadSession() {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    }
    catch {
        return null;
    }
}
function loadServer() {
    try {
        const s = JSON.parse(localStorage.getItem(SERVER_KEY) ?? "null");
        if (s?.host && s?.port)
            return s;
    }
    catch {
        // fall through
    }
    return { host: window.location.hostname || "192.168.0.10", port: "4580" };
}
export function App() {
    const savedServer = loadServer();
    const savedSession = loadSession();
    const [host, setHost] = useState(savedServer.host);
    const [port, setPort] = useState(savedServer.port);
    const [deviceName, setDeviceName] = useState(savedSession?.deviceName ?? "My Phone");
    const [pairCode, setPairCode] = useState("");
    const [view, setView] = useState("setup");
    const [statusText, setStatusText] = useState(savedSession ? "Connecting..." : "");
    const [serverName, setServerName] = useState("");
    const socketRef = useRef(null);
    const sessionRef = useRef(savedSession);
    const movementRef = useRef({ dx: 0, dy: 0, lastSentAt: 0 });
    const pointerDownRef = useRef(false);
    useEffect(() => {
        if (sessionRef.current) {
            connect();
        }
        return () => socketRef.current?.close();
    }, []);
    function sendMessage(message) {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN)
            return;
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
                sendMessage({ type: "auth", deviceId: session.deviceId, token: session.token });
                setStatusText("Authenticating...");
            }
            else {
                setView("pairing");
                setStatusText("");
            }
        });
        socket.addEventListener("message", (event) => {
            const message = JSON.parse(String(event.data));
            if (message.type === "server_state") {
                setServerName(message.hostName);
            }
            if (message.type === "auth_result") {
                if (message.ok) {
                    setView("ready");
                    setStatusText("");
                }
                else {
                    sessionRef.current = null;
                    localStorage.removeItem(SESSION_KEY);
                    setView("pairing");
                    setStatusText("Session expired — re-pair required");
                }
            }
            if (message.type === "pair_result") {
                if (message.ok && message.deviceId && message.token) {
                    const session = {
                        deviceId: message.deviceId,
                        token: message.token,
                        deviceName,
                    };
                    sessionRef.current = session;
                    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
                    setView("ready");
                    setStatusText("");
                }
                else {
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
        if (!force && now - movementRef.current.lastSentAt < SEND_INTERVAL)
            return;
        const { dx, dy } = movementRef.current;
        if (dx !== 0 || dy !== 0) {
            sendMessage({ type: "mouse_move", dx, dy });
            movementRef.current = { dx: 0, dy: 0, lastSentAt: now };
        }
    }
    if (view === "setup") {
        return (_jsx("main", { className: "app-shell", children: _jsxs("section", { className: "panel", children: [_jsx("h1", { children: "Window Controller" }), statusText && _jsx("p", { className: "status-text", children: statusText }), _jsxs("label", { children: ["Host", _jsx("input", { value: host, onChange: (e) => setHost(e.target.value) })] }), _jsxs("label", { children: ["Port", _jsx("input", { value: port, onChange: (e) => setPort(e.target.value) })] }), _jsxs("label", { children: ["Device name", _jsx("input", { value: deviceName, onChange: (e) => setDeviceName(e.target.value) })] }), _jsx("div", { className: "actions", children: _jsx("button", { onClick: connect, children: "Connect" }) })] }) }));
    }
    if (view === "pairing") {
        return (_jsx("main", { className: "app-shell", children: _jsxs("section", { className: "panel", children: [_jsx("h1", { children: "Pair Device" }), serverName && _jsxs("p", { className: "server-name", children: ["PC: ", serverName] }), statusText && _jsx("p", { className: "status-text", children: statusText }), _jsxs("label", { children: ["Pair code", _jsx("input", { value: pairCode, onChange: (e) => setPairCode(e.target.value), placeholder: "Enter code shown on PC", inputMode: "numeric", autoComplete: "off" })] }), _jsxs("div", { className: "actions", children: [_jsx("button", { onClick: pair, children: "Pair" }), _jsx("button", { className: "btn-secondary", onClick: () => {
                                    socketRef.current?.close();
                                    setView("setup");
                                    setStatusText("");
                                }, children: "Back" })] })] }) }));
    }
    return (_jsxs("main", { className: "app-shell", children: [_jsxs("section", { className: "panel status-bar", children: [_jsx("span", { className: "server-name", children: serverName || host }), _jsx("button", { className: "btn-small btn-secondary", onClick: disconnect, children: "Disconnect" })] }), _jsx("section", { className: "touchpad", onPointerDown: (e) => {
                    pointerDownRef.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                }, onPointerMove: (e) => {
                    if (!pointerDownRef.current)
                        return;
                    movementRef.current.dx += e.movementX;
                    movementRef.current.dy += e.movementY;
                    flushMovement();
                }, onPointerUp: () => {
                    pointerDownRef.current = false;
                    flushMovement(true);
                }, onPointerCancel: () => {
                    pointerDownRef.current = false;
                }, onDoubleClick: () => sendMessage({ type: "mouse_button", button: "left", action: "click" }), children: _jsx("span", { className: "touchpad-hint", children: "Touchpad \u00B7 double-tap to click" }) }), _jsxs("section", { className: "button-row", children: [_jsx("button", { onClick: () => sendMessage({ type: "mouse_button", button: "left", action: "click" }), children: "Left Click" }), _jsx("button", { onClick: () => sendMessage({ type: "mouse_button", button: "right", action: "click" }), children: "Right Click" })] }), _jsxs("section", { className: "button-row", children: [_jsx("button", { onClick: () => sendMessage({ type: "scroll", deltaX: 0, deltaY: 120 }), children: "Scroll Up" }), _jsx("button", { onClick: () => sendMessage({ type: "scroll", deltaX: 0, deltaY: -120 }), children: "Scroll Down" })] }), _jsxs("section", { className: "button-row button-row-3", children: [_jsx("button", { onClick: () => sendMessage({ type: "volume", action: "down" }), children: "Volume -" }), _jsx("button", { onClick: () => sendMessage({ type: "volume", action: "mute" }), children: "Mute" }), _jsx("button", { onClick: () => sendMessage({ type: "volume", action: "up" }), children: "Volume +" })] })] }));
}
