# Mockup Over — Chrome Extension (Manifest V3)

Project wireframes, primitive shapes, and UI Kit components over any live webpage, web app, or image using a scroll-anchored, semitransparent Shadow DOM canvas.

## Installation (Load Unpacked)

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this project folder (`Mockup Over Chrome Extention`).
4. Navigate to any website (`http://` or `https://`) and click the **Mockup Over** extension icon (or press `Alt+Shift+M`).

## Features & Shortcuts

| Shortcut / Control | Action |
|---|---|
| `V` | **Select / Move / Resize** tool (8-point resize handles, double-click any element to edit text inline) |
| `P` | **Pass-Through Mode (`Live Click`)** — interact directly with the underlying webpage while keeping mockup visible |
| `R` | **Rectangle** wireframe / shape |
| `O` | **Circle / Ellipse** shape |
| `L` | **Line** tool |
| `A` | **Arrow** tool |
| `D` | **Freehand Draw** brush |
| `T` | **Text Label** tool |
| **❖ UI Kit ▾** | Place **Button**, **Input Field**, **Card Block**, **Modal Dialog**, **Image Placeholder**, or **Navbar** |
| **Fill / ⊘ / Stroke / Alpha** | Change fill color, toggle transparent wireframe fill (`⊘`), border stroke color, and element opacity |
| **Dimmer / 🌙 / ☀️** | Adjust semitransparent canvas backdrop opacity (`0%–90%`) and switch between Dark and Light tint |
| `Ctrl+Z` / `Ctrl+Y` | **Undo / Redo** |
| `Delete` / `Backspace` | **Delete** selected element |
| **📋 Copy** / **⬇ PNG** | Hide HUD and capture pixel-accurate composite PNG of live page + mockup overlay to clipboard or file |
| `Esc` | Deselect element or hide overlay |
