import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { ServerState } from "../../shared/types.js";

declare global {
  interface Window {
    api: {
      getState(): Promise<ServerState>;
      onStateUpdate(cb: (state: ServerState) => void): () => void;
      openBrowser(url: string): void;
    };
  }
}

export function App() {
  const [state, setState] = useState<ServerState | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    window.api.getState().then(setState);
    return window.api.onStateUpdate(setState);
  }, []);

  useEffect(() => {
    if (!state?.addresses[0]) { setQrDataUrl(""); return; }
    const url = `http://${state.addresses[0]}:${state.port}`;
    QRCode.toDataURL(url, { width: 180, margin: 1 }).then(setQrDataUrl).catch(() => {});
  }, [state?.addresses[0], state?.port]);

  if (!state) return <div className="loading">Starting...</div>;

  const primary = state.addresses[0];
  const mobileUrl = primary ? `http://${primary}:${state.port}` : null;

  return (
    <main className="app">
      <header className="app-header">
        <h1>Window Controller</h1>
        <p className="hostname">{state.hostName}</p>
      </header>

      <section className="card">
        <h2>Pair Code</h2>
        <p className="pair-code">{state.pairCode}</p>
      </section>

      <section className="card">
        <h2>Connected Device</h2>
        {state.connectedDevice ? (
          <p className="device-name connected">{state.connectedDevice}</p>
        ) : (
          <p className="muted">None</p>
        )}
      </section>

      <section className="card qr-section">
        <h2>Scan to Open Mobile UI</h2>
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR code" className="qr-image" />
        ) : (
          <div className="qr-placeholder">No network</div>
        )}
        {state.addresses.length > 0 && (
          <ul className="address-list">
            {state.addresses.map((addr) => (
              <li key={addr}>
                <button
                  className="address-btn"
                  onClick={() =>
                    window.api.openBrowser(`http://${addr}:${state.port}`)
                  }
                >
                  http://{addr}:{state.port}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!mobileUrl && <p className="muted">No network interfaces found</p>}
      </section>
    </main>
  );
}
