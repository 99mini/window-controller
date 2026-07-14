import path from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { ModifierKey, MouseButton } from "@window-controller/protocol";

export type NativeDriver = {
  moveMouse(dx: number, dy: number): void;
  mouseButton(button: MouseButton, action: "click" | "down" | "up"): void;
  scroll(deltaX: number, deltaY: number): void;
  keyPress(key: string, action: "press" | "down" | "up", modifiers: ModifierKey[]): void;
  textInput(text: string): void;
  volume(action: "up" | "down" | "mute"): void;
};

function createMockDriver(): NativeDriver {
  return {
    moveMouse(dx, dy) { console.log("[mock] mouse_move", { dx, dy }); },
    mouseButton(button, action) { console.log("[mock] mouse_button", { button, action }); },
    scroll(deltaX, deltaY) { console.log("[mock] scroll", { deltaX, deltaY }); },
    keyPress(key, action, modifiers) { console.log("[mock] key", { key, action, modifiers }); },
    textInput(text) { console.log("[mock] text", { text }); },
    volume(action) { console.log("[mock] volume", { action }); },
  };
}

export function loadInputDriver(addonPath?: string): NativeDriver {
  if (process.platform !== "win32") {
    return createMockDriver();
  }

  try {
    const require = createRequire(__filename);

    const candidates: string[] = [];
    if (addonPath) candidates.push(addonPath);
    // dev: __dirname = out/main/ → 4 levels up = monorepo root
    candidates.push(
      path.join(
        __dirname,
        "../../../../native/input-controller/build/Release/input_controller.node",
      ),
    );

    const resolved = candidates.find((c) => existsSync(c));
    if (!resolved) {
      throw new Error(
        `input_controller.node not found. Tried:\n${candidates.join("\n")}`,
      );
    }
    return require(resolved) as NativeDriver;
  } catch (error) {
    console.warn("Native addon not loaded, falling back to mock driver.", error);
    return createMockDriver();
  }
}
