// Mockup Over — Content Script & Interactive Shadow DOM Overlay Engine
(() => {
  if (window.__MOCKUP_OVER_INSTANCE__) {
    window.__MOCKUP_OVER_INSTANCE__.toggle();
    return;
  }

  const STORAGE_PREFIX = 'mockup_state::';
  const MAX_HISTORY = 50;

  const DEFAULT_PRESET_SIZES = {
    'rect': { width: 180, height: 110, text: '' },
    'circle': { width: 120, height: 120, text: '' },
    'text': { width: 180, height: 44, text: 'Double-click to edit' },
    'ui-button': { width: 150, height: 44, text: 'Primary Action', fill: '#2563eb', stroke: '#1d4ed8', textColor: '#ffffff' },
    'ui-input': { width: 260, height: 44, text: 'Search or enter value...', fill: '#ffffff', stroke: '#94a3b8', textColor: '#475569' },
    'ui-card': { width: 300, height: 190, text: 'Card Title\nSupporting description text for this feature card projection.', fill: '#ffffff', stroke: '#cbd5e1', textColor: '#0f172a' },
    'ui-modal': { width: 420, height: 260, text: 'Confirm Action\nAre you sure you want to apply this layout modification to the live view?', fill: '#ffffff', stroke: '#94a3b8', textColor: '#0f172a' },
    'ui-image': { width: 280, height: 180, text: 'Image / Media (16:9)', fill: '#e2e8f0', stroke: '#64748b', textColor: '#f8fafc' },
    'ui-navbar': { width: 680, height: 58, text: 'BrandLogo | Overview   Features   Pricing   Docs', fill: '#0f172a', stroke: '#334155', textColor: '#f8fafc' }
  };

  class MockupOverApp {
    constructor() {
      this.active = true;
      this.tool = 'select';
      this.passThrough = false;
      this.selectedId = null;
      this.editingId = null;

      this.state = {
        version: 1,
        backdropOpacity: 0.30,
        backdropTheme: 'dark', // 'dark' | 'light'
        elements: []
      };

      this.defaultStyle = {
        fill: '#3b82f6',
        transparentFill: false,
        stroke: '#1d4ed8',
        strokeWidth: 2,
        opacity: 0.92,
        fontSize: 15
      };

      this.history = [];
      this.historyIndex = -1;
      this.saveTimer = null;
      this.interaction = null;

      this.initDOM();
      this.bindEvents();
      this.loadState().then(() => {
        this.pushHistory();
        this.renderAll();
      });
    }

    getStorageKey() {
      return `${STORAGE_PREFIX}${location.origin}${location.pathname}`;
    }

    initDOM() {
      this.host = document.createElement('div');
      this.host.id = 'mockup-over-extension-root';
      this.shadow = this.host.attachShadow({ mode: 'open' });

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('content/overlay.css')
        : 'content/overlay.css';
      this.shadow.appendChild(link);

      // Stage container (scrolls with document)
      this.stage = document.createElement('div');
      this.stage.className = 'mo-stage';

      // Semitransparent Backdrop Dimmer
      this.backdrop = document.createElement('div');
      this.backdrop.className = 'mo-backdrop';
      this.stage.appendChild(this.backdrop);

      // SVG Layer for Line, Arrow, Freehand
      this.svgNS = 'http://www.w3.org/2000/svg';
      this.svgLayer = document.createElementNS(this.svgNS, 'svg');
      this.svgLayer.setAttribute('class', 'mo-svg-layer');
      this.svgDefs = document.createElementNS(this.svgNS, 'defs');
      this.svgLayer.appendChild(this.svgDefs);
      this.svgGroup = document.createElementNS(this.svgNS, 'g');
      this.svgLayer.appendChild(this.svgGroup);
      this.stage.appendChild(this.svgLayer);

      // HTML Mockup Objects Layer
      this.objectsLayer = document.createElement('div');
      this.objectsLayer.className = 'mo-objects-layer';
      this.stage.appendChild(this.objectsLayer);

      // Floating HUD Toolbar
      this.hud = document.createElement('div');
      this.hud.className = 'mo-hud';
      this.hud.innerHTML = this.buildHudHTML();

      // Toast Notification
      this.toastEl = document.createElement('div');
      this.toastEl.className = 'mo-toast mo-hidden';

      this.shadow.appendChild(this.stage);
      this.shadow.appendChild(this.hud);
      this.shadow.appendChild(this.toastEl);
      document.documentElement.appendChild(this.host);

      this.updateStageDimensions();
    }

    buildHudHTML() {
      return `
        <span class="mo-grip" title="Drag toolbar">⋮⋮</span>
        <button class="mo-btn mo-active" data-tool="select" title="Select / Move / Resize (V)">↖ Select</button>
        <button class="mo-btn" data-action="passthrough" title="Pass-Through Mode: Click live page underneath (P)">👁 Live Click</button>
        <div class="mo-divider"></div>

        <button class="mo-btn" data-tool="rect" title="Rectangle (R)">▭ Rect</button>
        <button class="mo-btn" data-tool="circle" title="Circle / Ellipse (O)">◯ Circle</button>
        <button class="mo-btn" data-tool="line" title="Line (L)">╱ Line</button>
        <button class="mo-btn" data-tool="arrow" title="Arrow (A)">↗ Arrow</button>
        <button class="mo-btn" data-tool="freehand" title="Freehand Draw (D)">✎ Draw</button>
        <button class="mo-btn" data-tool="text" title="Text Label (T)">T Text</button>

        <div class="mo-dropdown-wrap">
          <button class="mo-btn" data-action="toggle-uikit" title="UI Kit Mockup Components">❖ UI Kit ▾</button>
          <div class="mo-dropdown-menu mo-hidden" id="mo-uikit-menu">
            <button class="mo-dropdown-item" data-tool="ui-button">🔘 Button</button>
            <button class="mo-dropdown-item" data-tool="ui-input">⌨️ Input Field</button>
            <button class="mo-dropdown-item" data-tool="ui-card">🗂️ Card Block</button>
            <button class="mo-dropdown-item" data-tool="ui-modal">🪟 Modal Dialog</button>
            <button class="mo-dropdown-item" data-tool="ui-image">🖼️ Image Box</button>
            <button class="mo-dropdown-item" data-tool="ui-navbar">🧭 Navbar</button>
          </div>
        </div>

        <div class="mo-divider"></div>

        <div class="mo-control-group" title="Fill Color & Wireframe Mode">
          <span class="mo-label">Fill</span>
          <input type="color" class="mo-color-input" id="mo-fill-color" value="#3b82f6">
          <button class="mo-btn" data-action="toggle-nofill" id="mo-nofill-btn" title="Toggle Transparent Wireframe Fill">⊘</button>
        </div>

        <div class="mo-control-group" title="Stroke / Border Color">
          <span class="mo-label">Stroke</span>
          <input type="color" class="mo-color-input" id="mo-stroke-color" value="#1d4ed8">
        </div>

        <div class="mo-control-group" title="Element Opacity">
          <span class="mo-label">Alpha</span>
          <input type="range" class="mo-range" id="mo-el-opacity" min="0.15" max="1" step="0.05" value="0.92">
        </div>

        <div class="mo-control-group" title="Backdrop Canvas Dimmer Opacity & Theme">
          <span class="mo-label">Dimmer</span>
          <input type="range" class="mo-range" id="mo-backdrop-opacity" min="0" max="0.9" step="0.05" value="0.30">
          <button class="mo-btn" data-action="toggle-theme" id="mo-theme-btn" title="Switch Dark / Light Backdrop Tint">🌙</button>
        </div>

        <div class="mo-divider"></div>

        <button class="mo-btn" data-action="undo" title="Undo (Ctrl+Z)">↶</button>
        <button class="mo-btn" data-action="redo" title="Redo (Ctrl+Y)">↷</button>
        <button class="mo-btn mo-btn-danger" data-action="delete" title="Delete Selected (Del)">🗑</button>
        <button class="mo-btn mo-btn-danger" data-action="clear" title="Clear All Mockups">Clear</button>

        <div class="mo-divider"></div>

        <button class="mo-btn" data-action="copy-png" title="Copy Composite PNG to Clipboard">📋 Copy</button>
        <button class="mo-btn mo-btn-export" data-action="export-png" title="Download Composite PNG (Page + Mockup)">⬇ PNG</button>
        <button class="mo-btn" data-action="close" title="Hide Overlay (Esc)">✕</button>
      `;
    }

    bindEvents() {
      // Keep stage synced with full document scroll dimensions
      this.resizeObserver = new ResizeObserver(() => this.updateStageDimensions());
      if (document.body) this.resizeObserver.observe(document.body);
      this.resizeObserver.observe(document.documentElement);
      window.addEventListener('resize', () => this.updateStageDimensions());
      window.addEventListener('scroll', () => this.updateStageDimensions(), { passive: true });

      // HUD clicks & controls
      this.hud.addEventListener('click', (e) => this.onHudClick(e));

      const fillInput = this.hud.querySelector('#mo-fill-color');
      const strokeInput = this.hud.querySelector('#mo-stroke-color');
      const opacityInput = this.hud.querySelector('#mo-el-opacity');
      const backdropInput = this.hud.querySelector('#mo-backdrop-opacity');

      fillInput.addEventListener('input', (e) => {
        this.defaultStyle.fill = e.target.value;
        this.defaultStyle.transparentFill = false;
        this.updateNoFillButton();
        this.applyStyleToSelected({ fill: e.target.value, transparentFill: false });
      });

      strokeInput.addEventListener('input', (e) => {
        this.defaultStyle.stroke = e.target.value;
        this.applyStyleToSelected({ stroke: e.target.value });
      });

      opacityInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.defaultStyle.opacity = val;
        this.applyStyleToSelected({ opacity: val });
      });

      backdropInput.addEventListener('input', (e) => {
        this.state.backdropOpacity = parseFloat(e.target.value);
        this.renderBackdrop();
        this.scheduleSave();
      });

      // HUD Draggable Grip
      const grip = this.hud.querySelector('.mo-grip');
      grip.addEventListener('pointerdown', (e) => this.startHudDrag(e));

      // Stage pointer interactions
      this.stage.addEventListener('pointerdown', (e) => this.onStagePointerDown(e));
      window.addEventListener('pointermove', (e) => this.onWindowPointerMove(e));
      window.addEventListener('pointerup', (e) => this.onWindowPointerUp(e));

      // Double click on element for inline text editing
      this.stage.addEventListener('dblclick', (e) => this.onStageDoubleClick(e));

      // Keyboard shortcuts
      window.addEventListener('keydown', (e) => this.onKeyDown(e));

      // Extension message listener
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
          if (msg && msg.type === 'TOGGLE_MOCKUP_OVERLAY') {
            this.toggle();
            sendResponse({ active: this.active });
          }
        });
      }
    }

    updateStageDimensions() {
      if (!this.active) return;
      const docEl = document.documentElement;
      const body = document.body;
      const width = Math.max(
        docEl ? docEl.scrollWidth : 0,
        body ? body.scrollWidth : 0,
        window.innerWidth
      );
      const height = Math.max(
        docEl ? docEl.scrollHeight : 0,
        body ? body.scrollHeight : 0,
        window.innerHeight
      );
      this.stage.style.width = `${width}px`;
      this.stage.style.height = `${height}px`;
      this.svgLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    toggle(forceState) {
      this.active = typeof forceState === 'boolean' ? forceState : !this.active;
      this.host.classList.toggle('mo-hidden', !this.active);
      if (this.active) {
        this.updateStageDimensions();
        this.renderAll();
      }
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'OVERLAY_STATE_CHANGED', active: this.active }).catch(() => {});
      }
    }

    showToast(text, duration = 2200) {
      this.toastEl.textContent = text;
      this.toastEl.classList.remove('mo-hidden');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        this.toastEl.classList.add('mo-hidden');
      }, duration);
    }

    onHudClick(e) {
      const toolBtn = e.target.closest('[data-tool]');
      if (toolBtn) {
        const chosenTool = toolBtn.getAttribute('data-tool');
        this.setTool(chosenTool);
        this.hud.querySelector('#mo-uikit-menu').classList.add('mo-hidden');
        return;
      }

      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      const action = actionBtn.getAttribute('data-action');

      switch (action) {
        case 'toggle-uikit':
          this.hud.querySelector('#mo-uikit-menu').classList.toggle('mo-hidden');
          break;
        case 'passthrough':
          this.setPassThrough(!this.passThrough);
          break;
        case 'toggle-nofill':
          this.defaultStyle.transparentFill = !this.defaultStyle.transparentFill;
          this.updateNoFillButton();
          this.applyStyleToSelected({ transparentFill: this.defaultStyle.transparentFill });
          break;
        case 'toggle-theme':
          this.state.backdropTheme = this.state.backdropTheme === 'dark' ? 'light' : 'dark';
          this.renderBackdrop();
          this.scheduleSave();
          break;
        case 'undo':
          this.undo();
          break;
        case 'redo':
          this.redo();
          break;
        case 'delete':
          this.deleteSelected();
          break;
        case 'clear':
          if (this.state.elements.length > 0 && confirm('Clear all mockup elements on this page?')) {
            this.state.elements = [];
            this.selectedId = null;
            this.pushHistory();
            this.renderAll();
            this.scheduleSave();
          }
          break;
        case 'copy-png':
          this.exportCompositePNG(true);
          break;
        case 'export-png':
          this.exportCompositePNG(false);
          break;
        case 'close':
          this.toggle(false);
          break;
      }
    }

    updateNoFillButton() {
      const btn = this.hud.querySelector('#mo-nofill-btn');
      if (btn) {
        btn.classList.toggle('mo-active', Boolean(this.defaultStyle.transparentFill));
      }
    }

    setTool(toolName) {
      this.commitInlineEdit();
      this.tool = toolName;
      if (this.passThrough) {
        this.setPassThrough(false);
      }
      this.hud.querySelectorAll('[data-tool]').forEach((btn) => {
        btn.classList.toggle('mo-active', btn.getAttribute('data-tool') === toolName);
      });
      const uikitTrigger = this.hud.querySelector('[data-action="toggle-uikit"]');
      if (uikitTrigger) {
        uikitTrigger.classList.toggle('mo-active', toolName.startsWith('ui-'));
      }
      this.stage.classList.toggle('mo-tool-draw', toolName !== 'select');
    }

    setPassThrough(enabled) {
      this.commitInlineEdit();
      this.passThrough = enabled;
      this.stage.classList.toggle('mo-passthrough', enabled);
      const btn = this.hud.querySelector('[data-action="passthrough"]');
      if (btn) {
        btn.classList.toggle('mo-passthrough-active', enabled);
        btn.textContent = enabled ? '👁 Live Click: ON' : '👁 Live Click';
      }
      if (enabled) {
        this.selectedId = null;
        this.renderAll();
        this.showToast('Pass-Through ON: Click & interact with live page underneath');
      } else {
        this.showToast('Canvas Edit Mode active');
      }
    }

    startHudDrag(e) {
      e.preventDefault();
      const rect = this.hud.getBoundingClientRect();
      this.hud.style.left = `${rect.left}px`;
      this.hud.style.top = `${rect.top}px`;
      this.hud.style.transform = 'none';

      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = rect.left;
      const origTop = rect.top;

      const onMove = (ev) => {
        const nx = Math.max(8, Math.min(window.innerWidth - rect.width - 8, origLeft + (ev.clientX - startX)));
        const ny = Math.max(8, Math.min(window.innerHeight - rect.height - 8, origTop + (ev.clientY - startY)));
        this.hud.style.left = `${nx}px`;
        this.hud.style.top = `${ny}px`;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }

    getPageCoords(e) {
      return {
        x: e.clientX + window.scrollX,
        y: e.clientY + window.scrollY
      };
    }

    onStagePointerDown(e) {
      if (!this.active || this.passThrough || e.button !== 0) return;

      // Close UI Kit dropdown if open
      this.hud.querySelector('#mo-uikit-menu').classList.add('mo-hidden');

      // If currently editing text inline and clicking inside it, let native cursor work
      if (this.editingId) {
        const editingNode = e.target.closest(`[data-id="${this.editingId}"]`);
        if (editingNode) return;
        this.commitInlineEdit();
      }

      const pt = this.getPageCoords(e);

      // Check resize handle or endpoint handle first
      const handleEl = e.target.closest('[data-handle]');
      if (handleEl && this.selectedId) {
        e.preventDefault();
        e.stopPropagation();
        const el = this.getElementById(this.selectedId);
        if (!el) return;
        this.interaction = {
          mode: 'resize',
          handle: handleEl.getAttribute('data-handle'),
          startPt: pt,
          orig: JSON.parse(JSON.stringify(el))
        };
        return;
      }

      // If in Select mode, check if clicking an existing element
      if (this.tool === 'select') {
        const hitNode = e.target.closest('[data-id]');
        if (hitNode) {
          e.preventDefault();
          const id = hitNode.getAttribute('data-id');
          this.selectElement(id);
          const el = this.getElementById(id);
          if (el) {
            this.interaction = {
              mode: 'move',
              startPt: pt,
              orig: JSON.parse(JSON.stringify(el)),
              moved: false
            };
          }
        } else {
          this.selectElement(null);
        }
        return;
      }

      // Drawing a new primitive or UI Kit preset
      e.preventDefault();
      const id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const preset = DEFAULT_PRESET_SIZES[this.tool] || { width: 140, height: 90, text: '' };

      let newEl;
      if (this.tool === 'line' || this.tool === 'arrow') {
        newEl = {
          id,
          type: this.tool,
          x: pt.x,
          y: pt.y,
          x2: pt.x,
          y2: pt.y,
          stroke: this.defaultStyle.stroke,
          strokeWidth: 3,
          opacity: this.defaultStyle.opacity
        };
      } else if (this.tool === 'freehand') {
        newEl = {
          id,
          type: 'freehand',
          points: [[pt.x, pt.y]],
          stroke: this.defaultStyle.stroke,
          strokeWidth: 3,
          opacity: this.defaultStyle.opacity
        };
      } else {
        const isUiPreset = this.tool.startsWith('ui-');
        newEl = {
          id,
          type: this.tool,
          x: pt.x,
          y: pt.y,
          width: 4,
          height: 4,
          fill: isUiPreset ? preset.fill : this.defaultStyle.fill,
          transparentFill: isUiPreset ? false : Boolean(this.defaultStyle.transparentFill),
          stroke: isUiPreset ? preset.stroke : this.defaultStyle.stroke,
          strokeWidth: this.defaultStyle.strokeWidth,
          opacity: this.defaultStyle.opacity,
          text: preset.text || '',
          textColor: preset.textColor || '#0f172a',
          fontSize: this.defaultStyle.fontSize
        };
      }

      this.state.elements.push(newEl);
      this.selectedId = id;
      this.interaction = {
        mode: 'create',
        tool: this.tool,
        startPt: pt,
        el: newEl
      };
      this.renderAll();
    }

    onWindowPointerMove(e) {
      if (!this.interaction) return;
      const pt = this.getPageCoords(e);
      const dx = pt.x - this.interaction.startPt.x;
      const dy = pt.y - this.interaction.startPt.y;

      if (this.interaction.mode === 'move') {
        const el = this.getElementById(this.selectedId);
        if (!el) return;
        this.interaction.moved = true;
        const orig = this.interaction.orig;
        if (el.type === 'line' || el.type === 'arrow') {
          el.x = orig.x + dx;
          el.y = orig.y + dy;
          el.x2 = orig.x2 + dx;
          el.y2 = orig.y2 + dy;
        } else if (el.type === 'freehand') {
          el.points = orig.points.map(([px, py]) => [px + dx, py + dy]);
        } else {
          el.x = orig.x + dx;
          el.y = orig.y + dy;
        }
        this.renderAll();
        return;
      }

      if (this.interaction.mode === 'resize') {
        const el = this.getElementById(this.selectedId);
        if (!el) return;
        const orig = this.interaction.orig;
        const h = this.interaction.handle;

        if (h === 'start') {
          el.x = pt.x;
          el.y = pt.y;
        } else if (h === 'end') {
          el.x2 = pt.x;
          el.y2 = pt.y;
        } else {
          let nx = orig.x;
          let ny = orig.y;
          let nw = orig.width;
          let nh = orig.height;

          if (h.includes('e')) nw = Math.max(24, orig.width + dx);
          if (h.includes('s')) nh = Math.max(24, orig.height + dy);
          if (h.includes('w')) {
            const possibleW = orig.width - dx;
            if (possibleW >= 24) {
              nw = possibleW;
              nx = orig.x + dx;
            }
          }
          if (h.includes('n')) {
            const possibleH = orig.height - dy;
            if (possibleH >= 24) {
              nh = possibleH;
              ny = orig.y + dy;
            }
          }
          el.x = nx;
          el.y = ny;
          el.width = nw;
          el.height = nh;
        }
        this.renderAll();
        return;
      }

      if (this.interaction.mode === 'create') {
        const el = this.interaction.el;
        if (el.type === 'line' || el.type === 'arrow') {
          el.x2 = pt.x;
          el.y2 = pt.y;
        } else if (el.type === 'freehand') {
          const last = el.points[el.points.length - 1];
          if (!last || Math.hypot(pt.x - last[0], pt.y - last[1]) > 2) {
            el.points.push([pt.x, pt.y]);
          }
        } else {
          el.x = Math.min(this.interaction.startPt.x, pt.x);
          el.y = Math.min(this.interaction.startPt.y, pt.y);
          el.width = Math.max(8, Math.abs(dx));
          el.height = Math.max(8, Math.abs(dy));
        }
        this.renderAll();
      }
    }

    onWindowPointerUp() {
      if (!this.interaction) return;
      const inter = this.interaction;
      this.interaction = null;

      if (inter.mode === 'create') {
        const el = inter.el;
        const preset = DEFAULT_PRESET_SIZES[el.type] || { width: 160, height: 100 };

        // If user just clicked without dragging much, apply default preset dimensions
        if (el.type === 'line' || el.type === 'arrow') {
          if (Math.hypot(el.x2 - el.x, el.y2 - el.y) < 10) {
            el.x2 = el.x + 140;
            el.y2 = el.y;
          }
        } else if (el.type !== 'freehand') {
          if (el.width < 16 && el.height < 16) {
            el.width = preset.width;
            el.height = preset.height;
          }
        }

        // Switch back to Select tool automatically after placing shapes/UI blocks (except freehand)
        if (el.type !== 'freehand') {
          this.setTool('select');
        }
        this.pushHistory();
        this.renderAll();
        this.scheduleSave();

        if (el.type === 'text') {
          this.startInlineEdit(el.id);
        }
        return;
      }

      if (inter.mode === 'move' && inter.moved) {
        this.pushHistory();
        this.scheduleSave();
      } else if (inter.mode === 'resize') {
        this.pushHistory();
        this.scheduleSave();
      }
    }

    onStageDoubleClick(e) {
      if (!this.active || this.passThrough) return;
      const hitNode = e.target.closest('[data-id]');
      if (!hitNode) return;
      const id = hitNode.getAttribute('data-id');
      const el = this.getElementById(id);
      if (!el || el.type === 'line' || el.type === 'arrow' || el.type === 'freehand') return;
      e.preventDefault();
      e.stopPropagation();
      this.startInlineEdit(id);
    }

    startInlineEdit(id) {
      this.selectedId = id;
      this.editingId = id;
      this.renderAll();
      const node = this.objectsLayer.querySelector(`[data-id="${id}"] .mo-editable`);
      if (node) {
        node.setAttribute('contenteditable', 'true');
        node.focus();
        const range = document.createRange();
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    commitInlineEdit() {
      if (!this.editingId) return;
      const id = this.editingId;
      this.editingId = null;
      const node = this.objectsLayer.querySelector(`[data-id="${id}"] .mo-editable`);
      const el = this.getElementById(id);
      if (node && el) {
        const newText = node.innerText.trim();
        if (newText !== el.text) {
          el.text = newText;
          this.pushHistory();
          this.scheduleSave();
        }
      }
      this.renderAll();
    }

    onKeyDown(e) {
      if (!this.active) return;

      // Ignore shortcuts if typing in host input or inline editor
      const activeTag = document.activeElement && document.activeElement.tagName;
      if (this.editingId) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.commitInlineEdit();
        }
        return;
      }
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedId) {
          e.preventDefault();
          this.deleteSelected();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (this.selectedId) {
          this.selectElement(null);
        } else {
          this.toggle(false);
        }
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'v') this.setTool('select');
        else if (k === 'p') this.setPassThrough(!this.passThrough);
        else if (k === 'r') this.setTool('rect');
        else if (k === 'o') this.setTool('circle');
        else if (k === 'l') this.setTool('line');
        else if (k === 'a') this.setTool('arrow');
        else if (k === 'd') this.setTool('freehand');
        else if (k === 't') this.setTool('text');
      }
    }

    getElementById(id) {
      return this.state.elements.find((el) => el.id === id) || null;
    }

    selectElement(id) {
      this.commitInlineEdit();
      this.selectedId = id;
      const el = this.getElementById(id);
      if (el) {
        if (el.fill) this.hud.querySelector('#mo-fill-color').value = el.fill;
        if (el.stroke) this.hud.querySelector('#mo-stroke-color').value = el.stroke;
        if (typeof el.opacity === 'number') this.hud.querySelector('#mo-el-opacity').value = el.opacity;
        this.defaultStyle.transparentFill = Boolean(el.transparentFill);
        this.updateNoFillButton();
      }
      this.renderAll();
    }

    applyStyleToSelected(patch) {
      if (!this.selectedId) return;
      const el = this.getElementById(this.selectedId);
      if (!el) return;
      Object.assign(el, patch);
      this.renderAll();
      this.scheduleSave();
    }

    deleteSelected() {
      if (!this.selectedId) return;
      this.state.elements = this.state.elements.filter((el) => el.id !== this.selectedId);
      this.selectedId = null;
      this.pushHistory();
      this.renderAll();
      this.scheduleSave();
    }

    pushHistory() {
      const snap = JSON.stringify(this.state.elements);
      if (this.historyIndex >= 0 && this.history[this.historyIndex] === snap) return;
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(snap);
      if (this.history.length > MAX_HISTORY) {
        this.history.shift();
      }
      this.historyIndex = this.history.length - 1;
    }

    undo() {
      if (this.historyIndex <= 0) return;
      this.historyIndex -= 1;
      this.state.elements = JSON.parse(this.history[this.historyIndex]);
      this.selectedId = null;
      this.renderAll();
      this.scheduleSave();
    }

    redo() {
      if (this.historyIndex >= this.history.length - 1) return;
      this.historyIndex += 1;
      this.state.elements = JSON.parse(this.history[this.historyIndex]);
      this.selectedId = null;
      this.renderAll();
      this.scheduleSave();
    }

    renderBackdrop() {
      const op = this.state.backdropOpacity;
      const isDark = this.state.backdropTheme === 'dark';
      this.backdrop.style.backgroundColor = isDark
        ? `rgba(15, 23, 42, ${op})`
        : `rgba(255, 255, 255, ${op})`;

      const themeBtn = this.hud.querySelector('#mo-theme-btn');
      if (themeBtn) {
        themeBtn.textContent = isDark ? '🌙' : '☀️';
      }
      const slider = this.hud.querySelector('#mo-backdrop-opacity');
      if (slider && parseFloat(slider.value) !== op) {
        slider.value = op;
      }
    }

    renderAll() {
      this.renderBackdrop();
      this.svgDefs.innerHTML = '';
      this.svgGroup.innerHTML = '';
      this.objectsLayer.innerHTML = '';

      for (const el of this.state.elements) {
        if (el.type === 'line' || el.type === 'arrow' || el.type === 'freehand') {
          this.renderVectorElement(el);
        } else {
          this.renderBoxElement(el);
        }
      }
    }

    renderVectorElement(el) {
      const isSelected = el.id === this.selectedId;
      const g = document.createElementNS(this.svgNS, 'g');
      if (isSelected) g.setAttribute('class', 'mo-svg-selected');

      if (el.type === 'line' || el.type === 'arrow') {
        if (el.type === 'arrow') {
          const markerId = `arrow_${el.id}`;
          const marker = document.createElementNS(this.svgNS, 'marker');
          marker.setAttribute('id', markerId);
          marker.setAttribute('viewBox', '0 0 10 10');
          marker.setAttribute('refX', '8');
          marker.setAttribute('refY', '5');
          marker.setAttribute('markerWidth', '6');
          marker.setAttribute('markerHeight', '6');
          marker.setAttribute('orient', 'auto-start-reverse');
          const path = document.createElementNS(this.svgNS, 'path');
          path.setAttribute('d', 'M 0 1 L 10 5 L 0 9 z');
          path.setAttribute('fill', el.stroke || '#1d4ed8');
          marker.appendChild(path);
          this.svgDefs.appendChild(marker);
        }

        const line = document.createElementNS(this.svgNS, 'line');
        line.setAttribute('x1', el.x);
        line.setAttribute('y1', el.y);
        line.setAttribute('x2', el.x2);
        line.setAttribute('y2', el.y2);
        line.setAttribute('stroke', el.stroke || '#1d4ed8');
        line.setAttribute('stroke-width', el.strokeWidth || 3);
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('opacity', el.opacity ?? 0.95);
        line.setAttribute('class', 'mo-svg-shape');
        if (el.type === 'arrow') {
          line.setAttribute('marker-end', `url(#arrow_${el.id})`);
        }

        const hitLine = document.createElementNS(this.svgNS, 'line');
        hitLine.setAttribute('x1', el.x);
        hitLine.setAttribute('y1', el.y);
        hitLine.setAttribute('x2', el.x2);
        hitLine.setAttribute('y2', el.y2);
        hitLine.setAttribute('stroke', 'transparent');
        hitLine.setAttribute('stroke-width', '16');
        hitLine.setAttribute('class', 'mo-svg-hit');
        hitLine.setAttribute('data-id', el.id);

        g.appendChild(line);
        g.appendChild(hitLine);
        this.svgGroup.appendChild(g);

        if (isSelected && !this.passThrough) {
          this.appendEndpointHandle(el.x, el.y, 'start');
          this.appendEndpointHandle(el.x2, el.y2, 'end');
        }
        return;
      }

      if (el.type === 'freehand' && Array.isArray(el.points) && el.points.length > 0) {
        const d = el.points
          .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt[0]} ${pt[1]}`)
          .join(' ');
        const path = document.createElementNS(this.svgNS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', el.stroke || '#1d4ed8');
        path.setAttribute('stroke-width', el.strokeWidth || 3);
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('opacity', el.opacity ?? 0.95);
        path.setAttribute('class', 'mo-svg-shape');

        const hitPath = document.createElementNS(this.svgNS, 'path');
        hitPath.setAttribute('d', d);
        hitPath.setAttribute('fill', 'none');
        hitPath.setAttribute('stroke', 'transparent');
        hitPath.setAttribute('stroke-width', '16');
        hitPath.setAttribute('class', 'mo-svg-hit');
        hitPath.setAttribute('data-id', el.id);

        g.appendChild(path);
        g.appendChild(hitPath);
        this.svgGroup.appendChild(g);
      }
    }

    appendEndpointHandle(x, y, handleName) {
      const h = document.createElement('div');
      h.className = 'mo-endpoint';
      h.style.left = `${x}px`;
      h.style.top = `${y}px`;
      h.setAttribute('data-handle', handleName);
      this.objectsLayer.appendChild(h);
    }

    renderBoxElement(el) {
      const isSelected = el.id === this.selectedId;
      const wrapper = document.createElement('div');
      wrapper.className = `mo-el mo-type-${el.type}${isSelected ? ' mo-selected' : ''}`;
      wrapper.setAttribute('data-id', el.id);
      wrapper.style.left = `${el.x}px`;
      wrapper.style.top = `${el.y}px`;
      wrapper.style.width = `${el.width}px`;
      wrapper.style.height = `${el.height}px`;
      wrapper.style.opacity = el.opacity ?? 0.92;

      const content = document.createElement('div');
      content.className = 'mo-el-content';

      const bgFill = el.transparentFill || el.type === 'text' ? 'transparent' : (el.fill || '#3b82f6');
      const borderStroke = el.type === 'text' ? 'none' : `${el.strokeWidth || 2}px solid ${el.stroke || '#1d4ed8'}`;
      content.style.backgroundColor = bgFill;
      content.style.border = borderStroke;
      content.style.color = el.textColor || '#0f172a';
      content.style.fontSize = `${el.fontSize || 15}px`;

      content.innerHTML = this.buildBoxInnerHTML(el);
      wrapper.appendChild(content);

      if (isSelected && !this.passThrough && this.editingId !== el.id) {
        for (const dir of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
          const handle = document.createElement('div');
          handle.className = `mo-handle mo-handle-${dir}`;
          handle.setAttribute('data-handle', dir);
          wrapper.appendChild(handle);
        }
      }

      this.objectsLayer.appendChild(wrapper);
    }

    escapeHTML(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    buildBoxInnerHTML(el) {
      const safeText = this.escapeHTML(el.text);

      switch (el.type) {
        case 'ui-button':
          return `<div class="mo-editable" style="color: ${el.textColor || '#ffffff'}">${safeText || 'Button'}</div>`;

        case 'ui-input':
          return `
            <div class="mo-ui-input-inner">
              <div class="mo-editable" style="flex:1">${safeText || 'Input placeholder...'}</div>
              <span>⌕</span>
            </div>
          `;

        case 'ui-card': {
          const lines = safeText.split('\n');
          const title = lines[0] || 'Card Heading';
          const body = lines.slice(1).join('\n') || 'Card body content...';
          return `
            <div class="mo-editable" style="display:flex;flex-direction:column;gap:8px;height:100%">
              <div class="mo-ui-card-header">${title}</div>
              <div class="mo-ui-card-body">${body}</div>
            </div>
          `;
        }

        case 'ui-modal': {
          const lines = safeText.split('\n');
          const title = lines[0] || 'Modal Title';
          const body = lines.slice(1).join('\n') || 'Modal dialog projection content...';
          return `
            <div class="mo-ui-modal-top">
              <span>${title}</span>
              <div class="mo-ui-modal-dots">
                <span class="mo-ui-modal-dot"></span>
                <span class="mo-ui-modal-dot"></span>
              </div>
            </div>
            <div class="mo-ui-modal-body mo-editable">${body}</div>
            <div class="mo-ui-modal-footer">
              <span class="mo-ui-pill mo-ui-pill-secondary">Cancel</span>
              <span class="mo-ui-pill">Confirm</span>
            </div>
          `;
        }

        case 'ui-image':
          return `<div class="mo-ui-image-badge mo-editable">${safeText || 'Image / Media'}</div>`;

        case 'ui-navbar': {
          const parts = safeText.split('|');
          const brand = (parts[0] || 'Brand').trim();
          const links = (parts[1] || 'Home   Products   About').trim();
          return `
            <div class="mo-ui-nav-brand">${brand}</div>
            <div class="mo-ui-nav-links mo-editable">${links}</div>
            <span class="mo-ui-pill">Sign Up</span>
          `;
        }

        case 'text':
          return `<div class="mo-editable" style="color:${el.stroke || '#0f172a'};font-weight:600;">${safeText || 'Text'}</div>`;

        default:
          return `<div class="mo-editable">${safeText}</div>`;
      }
    }

    scheduleSave() {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveState(), 400);
    }

    async saveState() {
      const key = this.getStorageKey();
      const payload = {
        version: 1,
        backdropOpacity: this.state.backdropOpacity,
        backdropTheme: this.state.backdropTheme,
        elements: this.state.elements
      };
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({ [key]: payload });
        } else {
          localStorage.setItem(key, JSON.stringify(payload));
        }
      } catch (err) {
        console.warn('[Mockup Over] Auto-save failed:', err);
      }
    }

    async loadState() {
      const key = this.getStorageKey();
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const res = await chrome.storage.local.get(key);
          if (res && res[key]) {
            this.state = Object.assign(this.state, res[key]);
          }
        } else {
          const raw = localStorage.getItem(key);
          if (raw) {
            this.state = Object.assign(this.state, JSON.parse(raw));
          }
        }
      } catch (err) {
        console.warn('[Mockup Over] Failed to load saved state:', err);
      }
    }

    async exportCompositePNG(copyToClipboard = false) {
      this.commitInlineEdit();
      const prevSelected = this.selectedId;
      this.selectedId = null;
      this.renderAll();

      // Hide HUD & toast during screenshot capture
      this.hud.classList.add('mo-export-hide');
      this.toastEl.classList.add('mo-hidden');

      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 65)));

      let dataUrl = null;
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' });
          if (response && response.ok && response.dataUrl) {
            dataUrl = response.dataUrl;
          }
        }
      } catch (err) {
        console.error('[Mockup Over] captureVisibleTab error:', err);
      } finally {
        this.hud.classList.remove('mo-export-hide');
        this.selectedId = prevSelected;
        this.renderAll();
      }

      if (!dataUrl) {
        this.showToast('Export requires active Chrome Extension tab capture permission');
        return;
      }

      if (copyToClipboard) {
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          this.showToast('Composite PNG copied to clipboard!');
        } catch (err) {
          console.error('[Mockup Over] Clipboard error:', err);
          this.showToast('Clipboard write failed — downloading PNG instead');
          this.triggerDownload(dataUrl);
        }
      } else {
        this.triggerDownload(dataUrl);
        this.showToast('Composite PNG downloaded!');
      }
    }

    triggerDownload(dataUrl) {
      const a = document.createElement('a');
      const hostName = (location.hostname || 'page').replace(/[^a-z0-9.-]/gi, '_');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = dataUrl;
      a.download = `mockup-${hostName}-${stamp}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  window.__MOCKUP_OVER_INSTANCE__ = new MockupOverApp();
})();
