#include <napi.h>

#ifdef _WIN32
#include <windows.h>
#endif

namespace {

#ifdef _WIN32
DWORD MouseButtonFlag(const std::string& button, const std::string& action) {
  if (button == "left" && action == "down") return MOUSEEVENTF_LEFTDOWN;
  if (button == "left" && action == "up") return MOUSEEVENTF_LEFTUP;
  if (button == "right" && action == "down") return MOUSEEVENTF_RIGHTDOWN;
  if (button == "right" && action == "up") return MOUSEEVENTF_RIGHTUP;
  if (button == "middle" && action == "down") return MOUSEEVENTF_MIDDLEDOWN;
  if (button == "middle" && action == "up") return MOUSEEVENTF_MIDDLEUP;
  return 0;
}

void SendMouseButton(const std::string& button, const std::string& action) {
  if (action == "click") {
    SendMouseButton(button, "down");
    SendMouseButton(button, "up");
    return;
  }

  INPUT input = {};
  input.type = INPUT_MOUSE;
  input.mi.dwFlags = MouseButtonFlag(button, action);
  SendInput(1, &input, sizeof(INPUT));
}

WORD KeyCodeFromString(const std::string& key) {
  if (key.size() == 1) {
    SHORT vk = VkKeyScanA(key[0]);
    return LOBYTE(vk);
  }
  if (key == "Enter") return VK_RETURN;
  if (key == "Escape") return VK_ESCAPE;
  if (key == "Backspace") return VK_BACK;
  if (key == "Tab") return VK_TAB;
  return 0;
}

void SendKey(WORD vk, bool keyUp) {
  INPUT input = {};
  input.type = INPUT_KEYBOARD;
  input.ki.wVk = vk;
  input.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0;
  SendInput(1, &input, sizeof(INPUT));
}

WORD ModifierVk(const std::string& modifier) {
  if (modifier == "ctrl") return VK_CONTROL;
  if (modifier == "alt") return VK_MENU;
  if (modifier == "shift") return VK_SHIFT;
  if (modifier == "meta") return VK_LWIN;
  return 0;
}

WORD VolumeVk(const std::string& action) {
  if (action == "up") return VK_VOLUME_UP;
  if (action == "down") return VK_VOLUME_DOWN;
  if (action == "mute") return VK_VOLUME_MUTE;
  return 0;
}
#endif

Napi::Value MoveMouse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
#ifdef _WIN32
  LONG dx = info[0].As<Napi::Number>().Int32Value();
  LONG dy = info[1].As<Napi::Number>().Int32Value();
  INPUT input = {};
  input.type = INPUT_MOUSE;
  input.mi.dwFlags = MOUSEEVENTF_MOVE;
  input.mi.dx = dx;
  input.mi.dy = dy;
  SendInput(1, &input, sizeof(INPUT));
#endif
  return env.Undefined();
}

Napi::Value MouseButton(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
#ifdef _WIN32
  std::string button = info[0].As<Napi::String>().Utf8Value();
  std::string action = info[1].As<Napi::String>().Utf8Value();
  SendMouseButton(button, action);
#endif
  return env.Undefined();
}

Napi::Value Scroll(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
#ifdef _WIN32
  LONG deltaY = info[1].As<Napi::Number>().Int32Value();
  INPUT input = {};
  input.type = INPUT_MOUSE;
  input.mi.dwFlags = MOUSEEVENTF_WHEEL;
  input.mi.mouseData = static_cast<DWORD>(deltaY);
  SendInput(1, &input, sizeof(INPUT));
#endif
  return env.Undefined();
}

Napi::Value KeyPress(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
#ifdef _WIN32
  std::string key = info[0].As<Napi::String>().Utf8Value();
  std::string action = info[1].As<Napi::String>().Utf8Value();
  auto modifiers = info[2].As<Napi::Array>();

  for (uint32_t i = 0; i < modifiers.Length(); i++) {
    SendKey(ModifierVk(modifiers.Get(i).As<Napi::String>().Utf8Value()), false);
  }

  WORD vk = KeyCodeFromString(key);
  if (vk != 0) {
    if (action == "press") {
      SendKey(vk, false);
      SendKey(vk, true);
    } else if (action == "down") {
      SendKey(vk, false);
    } else if (action == "up") {
      SendKey(vk, true);
    }
  }

  for (int32_t i = static_cast<int32_t>(modifiers.Length()) - 1; i >= 0; i--) {
    SendKey(ModifierVk(modifiers.Get(i).As<Napi::String>().Utf8Value()), true);
  }
#endif
  return env.Undefined();
}

Napi::Value TextInput(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
#ifdef _WIN32
  std::u16string text = info[0].As<Napi::String>().Utf16Value();
  for (char16_t ch : text) {
    INPUT inputs[2] = {};
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.dwFlags = KEYEVENTF_UNICODE;
    inputs[0].ki.wScan = ch;
    inputs[1] = inputs[0];
    inputs[1].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
    SendInput(2, inputs, sizeof(INPUT));
  }
#endif
  return env.Undefined();
}

Napi::Value Volume(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
#ifdef _WIN32
  std::string action = info[0].As<Napi::String>().Utf8Value();
  WORD vk = VolumeVk(action);
  if (vk != 0) {
    SendKey(vk, false);
    SendKey(vk, true);
  }
#endif
  return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("moveMouse", Napi::Function::New(env, MoveMouse));
  exports.Set("mouseButton", Napi::Function::New(env, MouseButton));
  exports.Set("scroll", Napi::Function::New(env, Scroll));
  exports.Set("keyPress", Napi::Function::New(env, KeyPress));
  exports.Set("textInput", Napi::Function::New(env, TextInput));
  exports.Set("volume", Napi::Function::New(env, Volume));
  return exports;
}

}  // namespace

NODE_API_MODULE(input_controller, Init)
