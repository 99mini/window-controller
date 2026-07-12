import path from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { ModifierKey, MouseButton } from "@window-controller/protocol";

type NativeDriver = {
  moveMouse(dx: number, dy: number): void;
  mouseButton(button: MouseButton, action: "click" | "down" | "up"): void;
  scroll(deltaX: number, deltaY: number): void;
  keyPress(
    key: string,
    action: "press" | "down" | "up",
    modifiers: ModifierKey[],
  ): void;
  textInput(text: string): void;
};

function createMockDriver(): NativeDriver {
  return {
    moveMouse(dx, dy) {
      console.log("[mock] mouse_move", { dx, dy });
    },
    mouseButton(button, action) {
      console.log("[mock] mouse_button", { button, action });
    },
    scroll(deltaX, deltaY) {
      console.log("[mock] scroll", { deltaX, deltaY });
    },
    keyPress(key, action, modifiers) {
      console.log("[mock] key", { key, action, modifiers });
    },
    textInput(text) {
      console.log("[mock] text", { text });
    },
  };
}

export function loadInputDriver(): NativeDriver {
  if (process.platform !== "win32") {
    return createMockDriver();
  }

  try {
    const require = createRequire(import.meta.url);
    const addonCandidates = [
      path.join(process.cwd(), "native", "input_controller.node"),
      path.join(
        process.cwd(),
        "..",
        "..",
        "native",
        "input-controller",
        "build",
        "Release",
        "input_controller.node",
      ),
    ];
    const addonPath = addonCandidates.find((candidate) =>
      existsSync(candidate),
    );
    if (!addonPath) {
      throw new Error("input_controller.node not found in known locations");
    }
    return require(addonPath) as NativeDriver;
  } catch (error) {
    console.warn(
      "Native addon not loaded, falling back to mock driver.",
      error,
    );
    return createMockDriver();
  }
}
