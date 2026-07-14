export type ModifierKey = "ctrl" | "alt" | "shift" | "meta";
export type MouseButton = "left" | "right" | "middle";

export type PairRequestMessage = {
  type: "pair_request";
  deviceName: string;
  pairCode: string;
};

export type AuthMessage = {
  type: "auth";
  deviceId: string;
  token: string;
};

export type MouseMoveMessage = {
  type: "mouse_move";
  dx: number;
  dy: number;
};

export type MouseButtonMessage = {
  type: "mouse_button";
  button: MouseButton;
  action: "click" | "down" | "up";
};

export type ScrollMessage = {
  type: "scroll";
  deltaX: number;
  deltaY: number;
};

export type KeyMessage = {
  type: "key";
  key: string;
  action: "press" | "down" | "up";
  modifiers?: ModifierKey[];
};

export type TextMessage = {
  type: "text";
  value: string;
};

export type VolumeMessage = {
  type: "volume";
  action: "up" | "down" | "mute";
};

export type PingMessage = {
  type: "ping";
};

export type ClientMessage =
  | PairRequestMessage
  | AuthMessage
  | MouseMoveMessage
  | MouseButtonMessage
  | ScrollMessage
  | KeyMessage
  | TextMessage
  | VolumeMessage
  | PingMessage;

export type ServerMessage =
  | {
      type: "pair_result";
      ok: boolean;
      token?: string;
      deviceId?: string;
      message?: string;
    }
  | {
      type: "auth_result";
      ok: boolean;
      message?: string;
    }
  | {
      type: "server_state";
      hostName: string;
      pairCode: string;
      port: number;
      connectedDevice?: string;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "pong";
    };

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { type?: unknown };
  return typeof candidate.type === "string";
}
