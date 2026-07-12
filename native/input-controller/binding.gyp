{
  "targets": [
    {
      "target_name": "input_controller",
      "sources": ["src/input_controller.cc"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
      "defines": ["NAPI_CPP_EXCEPTIONS"],
      "conditions": [
        [
          "OS=='win'",
          {
            "libraries": ["user32.lib"]
          }
        ]
      ]
    }
  ]
}
