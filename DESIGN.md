# Mockup Over — Chrome Extension Design Specification

## 1. Understanding Summary

- **What**: Chrome Manifest V3 browser extension injecting a scroll-anchored, semitransparent mockup canvas over any live webpage, web app, or image.
- **Why**: Enable rapid visual prototyping and redesign projection directly on top of existing live UI without rebuilding pages in external design tools.
- **Who**: Designers, product managers, developers, and stakeholders communicating UI changes over live pages.
- **Core Toolkit**:
  - **Primitives**: Rectangle, Circle/Ellipse, Line, Arrow, Text, Freehand brush.
  - **UI Kit Presets**: Button, Input field, Card, Modal, Image placeholder, Navbar.
  - **Canvas Controls**: Select/Move/Resize/Delete, Undo/Redo, stroke/fill/opacity styling, backdrop dimmer opacity slider + color tint, and Pass-Through mode toggle (interact with live page underneath).
- **Export & Persistence**:
  - **Composite PNG Export**: Captures underlying visible page + backdrop dimmer + mockup overlay into a downloadable PNG or clipboard image.
  - **Auto-Save**: Per-URL auto-save in `chrome.storage.local` (`origin + pathname`) so page reloads preserve work.
- **Key Constraints**: Manifest V3 security rules (`activeTab`, `scripting`, `storage`, `unlimitedStorage`), zero CSS/JS collision with host page via Shadow DOM isolation.
- **Explicit Non-Goals (v1)**: Cloud sync/accounts, multi-user real-time collaboration, DOM-to-code export, multi-screen full-page stitching across infinite-scroll pages (v1 exports visible viewport composite).

---

## 2. Assumptions & Non-Functional Requirements

- **Performance**: 60fps interaction and dragging; zero impact on host page load when extension is inactive (on-demand content script/overlay activation).
- **Scale**: Local single-user tool; smoothly handles 100–300 mockup objects per page and dozens of saved URL states in `chrome.storage.local`.
- **Security & Privacy**: 100% offline/local execution; no external network requests or telemetry; requires only `activeTab`, `scripting`, `storage`, and `unlimitedStorage`.
- **Reliability**: Auto-saves debounced (400ms on change) keyed by normalized URL (`origin + pathname`).
- **Maintenance**: Zero-build, modular vanilla JS/CSS structure for direct Chrome `Load unpacked` installation and straightforward maintenance.

---

## 3. Decision Log

| ID | Decision | Alternatives Considered | Rationale |
|----|----------|-------------------------|-----------|
| **D1** | Document-anchored stage (`position: absolute` synced to document scroll size) | Fixed viewport overlay (`position: fixed`), Standalone screenshot tab | Keeps mockup elements aligned with underlying webpage sections as user scrolls. |
| **D2** | Shadow DOM + Interactive SVG/HTML Scene Graph | Raw HTML5 2D `<canvas>` engine, Bundled Fabric.js/Konva | Zero-build MV3 simplicity, CSS isolation from host page, native inline text editing, crisp multi-part UI Kit components, and immunity to GPU canvas height limits on tall pages. |
| **D3** | Hide HUD toolbar briefly + `chrome.tabs.captureVisibleTab()` for PNG export | `html2canvas` / manual DOM-to-canvas re-rendering | Native browser tab capture renders cross-origin images, web fonts, iframes, and Shadow DOM overlay with 100% pixel accuracy at native `devicePixelRatio`. |
| **D4** | `chrome.storage.local` keyed by `origin + pathname` with 400ms debounce | Manual file save only, `window.localStorage` on host origin | Persists across reloads without polluting host site storage or failing on strict site policies. |

---

## 4. Final Design

### 4.1 File & Module Structure
```text
Mockup Over Chrome Extention/
├── manifest.json          # MV3 manifest (activeTab, scripting, storage, unlimitedStorage)
├── background.js          # Service worker: icon click toggle, script injection, captureVisibleTab
├── content/
│   ├── overlay.js         # Shadow DOM host, HUD toolbar, stage controller, history, storage, export
│   └── overlay.css        # Scoped Shadow DOM styles for HUD toolbar, handles, and UI Kit presets
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 4.2 Component Architecture
1. **`background.js` (Service Worker)**:
   - Listens to `chrome.action.onClicked` to inject `content/overlay.js` if not present, or dispatch `{ type: 'TOGGLE_MOCKUP_OVERLAY' }` to toggle visibility.
   - Listens to `{ type: 'CAPTURE_VISIBLE_TAB' }` from content script, calls `chrome.tabs.captureVisibleTab(null, { format: 'png' })`, and returns `{ dataUrl }`.
   - Sets badge text (`ON` / `""`) on active tab to reflect overlay status.

2. **Shadow DOM Host (`#mockup-over-extension-root`)**:
   - Mounted on `document.documentElement` with high `z-index` (`2147483646`).
   - Uses Shadow Root with encapsulated stylesheet (`overlay.css`).

3. **Document-Anchored Stage (`.mo-stage`)**:
   - `position: absolute; top: 0; left: 0;` matching `Math.max(document.documentElement.scrollWidth, window.innerWidth)` × `Math.max(document.documentElement.scrollHeight, window.innerHeight)` via `ResizeObserver`.
   - **Backdrop Dimmer Layer (`.mo-backdrop`)**: Configurable opacity (`0%` to `90%`) and tint mode (Dark `#0f172a` or Light `#ffffff`) to subdue existing webpage and make wireframe projections pop.
   - **SVG Layer (`.mo-svg-layer`)**: Renders vector primitives (`line`, `arrow`, `freehand` paths).
   - **Object Layer (`.mo-objects-layer`)**: Renders interactive positioned elements (`rect`, `circle`, `text`, and UI Kit blocks: `button`, `input`, `card`, `modal`, `image`, `navbar`) with 8-point resize handles and inline double-click text editing.
   - **Pass-Through Mode**: When enabled, `.mo-stage` applies `pointer-events: none` so user can click, type, or open menus on the live page underneath while viewing their overlay.

4. **Floating HUD Toolbar (`.mo-hud`)**:
   - `position: fixed; top: 16px; left: 50%; transform: translateX(-50%);` (draggable anywhere on viewport).
   - **Tool Group**: Select (`V`), Pan/Pass-Through (`P`), Rectangle (`R`), Circle (`O`), Line (`L`), Arrow (`A`), Freehand (`D`), Text (`T`), UI Kit dropdown (`Button`, `Input`, `Card`, `Modal`, `Image Placeholder`, `Navbar`).
   - **Style Controls**: Fill color + transparent toggle, Stroke color + width, Element opacity, Backdrop dimmer slider + Dark/Light toggle.
   - **Action Group**: Undo (`Ctrl+Z`), Redo (`Ctrl+Y`), Delete (`Del`/`Backspace`), Clear All, Copy PNG to Clipboard, Download PNG, Close (`Esc`).

### 4.3 Data Flow & State Schema
```json
{
  "version": 1,
  "backdropOpacity": 0.35,
  "backdropTheme": "dark",
  "elements": [
    {
      "id": "el_1730612000_1",
      "type": "rect | circle | line | arrow | freehand | text | ui-button | ui-input | ui-card | ui-modal | ui-image | ui-navbar",
      "x": 120,
      "y": 240,
      "width": 200,
      "height": 48,
      "x2": 320,
      "y2": 288,
      "points": [[120, 240], [125, 245]],
      "fill": "#3b82f6",
      "stroke": "#1d4ed8",
      "strokeWidth": 2,
      "opacity": 0.95,
      "text": "Get Started",
      "fontSize": 16
    }
  ]
}
```

### 4.4 Edge Cases & Error Handling
- **Restricted URLs (`chrome://`, `edge://`, `about:`, Chrome Web Store)**: Catch `chrome.scripting.executeScript` errors in `background.js` and set temporary `ERR` badge title explaining Chrome security restriction.
- **SPA Route Changes & Dynamic Height**: `ResizeObserver` updates stage dimensions; URL change detection loads/saves state per path.
- **Keyboard Shortcut Isolation**: `keydown` listeners only trigger when overlay is active and user is not typing inside an inline-edited mockup label or host page input.
