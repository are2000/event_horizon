/**
 * dom-stub.mjs
 * ----------------------------------------------------------------------------
 * A ~200 line DOM good enough to run the real game (and its DOM overlay) in
 * Node. No jsdom, no dependencies — the repo is deliberately zero-dep.
 *
 * It supports exactly what the codebase touches:
 *   - createElement / appendChild / removeChild / remove
 *   - className + classList (kept in sync, because the UI uses both)
 *   - style (plain properties + setProperty for CSS custom properties)
 *   - dataset, textContent, innerHTML, attributes, disabled
 *   - addEventListener / removeEventListener + a `dispatch` test helper
 *   - querySelector / querySelectorAll for '.class', 'tag' and [attr="v"]
 *   - getBoundingClientRect, overridable per element via `el._rect`
 *   - a recording 2D context so render code can be asserted on
 *
 * Layout: the stub has no layout engine, so tests that need hit testing set
 *   el._rect = { left, top, width, height }
 * (InventoryUI also accepts a `geometry` object directly, which is usually
 * easier than faking real rectangles).
 */

/* -------------------------------------------------------------- classList -- */
class ClassList {
  constructor(el) {
    this.el = el;
    this.set = new Set();
  }

  _sync() {
    this.el._className = Array.from(this.set).join(' ');
  }

  add(...names) {
    for (const n of names) if (n) this.set.add(n);
    this._sync();
  }

  remove(...names) {
    for (const n of names) this.set.delete(n);
    this._sync();
  }

  toggle(name, force) {
    const on = force === undefined ? !this.set.has(name) : !!force;
    if (on) this.set.add(name);
    else this.set.delete(name);
    this._sync();
    return on;
  }

  contains(name) {
    return this.set.has(name);
  }

  get length() {
    return this.set.size;
  }
}

/* ------------------------------------------------------------------ style -- */
function makeStyle() {
  const style = {
    _vars: {},
    setProperty(key, value) {
      style._vars[key] = value;
      style[key] = value;
    },
    getPropertyValue(key) {
      return style._vars[key] ?? style[key] ?? '';
    },
    removeProperty(key) {
      delete style._vars[key];
      delete style[key];
    },
    get cssText() {
      return Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';');
    },
  };
  return style;
}

/* -------------------------------------------------------------- selectors -- */
/**
 * Supports 'tag', '.class', '#id', '[attr="value"]' and combinations of those
 * (no descendant/child combinators — the codebase doesn't use them).
 */
function parseSelector(sel) {
  const out = { tag: null, classes: [], attrs: [], id: null };
  const re = /(^[a-zA-Z][\w-]*)|\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g;
  let m;
  while ((m = re.exec(sel))) {
    if (m[1]) out.tag = m[1].toUpperCase();
    else if (m[2]) out.classes.push(m[2]);
    else if (m[3]) out.id = m[3];
    else if (m[4]) out.attrs.push([m[4], m[5] ?? null]);
  }
  return out;
}

function matches(el, spec) {
  if (spec.tag && el.tagName !== spec.tag) return false;
  if (spec.id && el.id !== spec.id) return false;
  for (const c of spec.classes) if (!el.classList.contains(c)) return false;
  for (const [key, value] of spec.attrs) {
    const got = el.getAttribute(key);
    if (got === null) return false;
    if (value !== null && got !== value) return false;
  }
  return true;
}

/* ---------------------------------------------------------------- element -- */
export class El {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = makeStyle();
    this.dataset = {};
    this._attrs = {};
    this._className = '';
    this._text = '';
    this._html = '';
    this._listeners = new Map();
    this._classList = new ClassList(this);
    this._rect = null;
    this.id = '';
    this.type = '';
    this.disabled = false;
  }

  get classList() {
    return this._classList;
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value ?? '');
    this._classList.set = new Set(this._className.split(/\s+/).filter(Boolean));
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i !== -1) this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }

  remove() {
    this.parentNode?.removeChild(this);
    return this;
  }

  get firstChild() {
    return this.children[0] ?? null;
  }

  get textContent() {
    if (this.children.length === 0) return this._text;
    return this.children.map((c) => c.textContent).join('');
  }

  set textContent(value) {
    this._text = String(value ?? '');
    this.children.length = 0;
  }

  get innerHTML() {
    return this._html;
  }

  set innerHTML(value) {
    this._html = String(value ?? '');
    for (const c of this.children) c.parentNode = null;
    this.children.length = 0;
  }

  setAttribute(key, value) {
    this._attrs[key] = String(value);
    if (key === 'id') this.id = String(value);
    if (key.startsWith('data-')) {
      this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    }
  }

  getAttribute(key) {
    return this._attrs[key] ?? null;
  }

  removeAttribute(key) {
    delete this._attrs[key];
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }

  removeEventListener(type, fn) {
    const list = this._listeners.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  }

  /** Test helper: fire every listener for `type` with a synthetic event. */
  dispatch(type, event = {}) {
    const list = this._listeners.get(type) ?? [];
    const evt = {
      type,
      target: this,
      currentTarget: this,
      preventDefault() {},
      stopPropagation() {},
      ...event,
    };
    for (const fn of Array.from(list)) fn(evt);
    return evt;
  }

  hasListener(type) {
    return (this._listeners.get(type) ?? []).length > 0;
  }

  *walk() {
    for (const child of this.children) {
      yield child;
      yield* child.walk();
    }
  }

  querySelectorAll(sel) {
    const spec = parseSelector(sel);
    const out = [];
    for (const el of this.walk()) if (matches(el, spec)) out.push(el);
    return out;
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }

  closest(sel) {
    const spec = parseSelector(sel);
    let node = this;
    while (node) {
      if (matches(node, spec)) return node;
      node = node.parentNode;
    }
    return null;
  }

  getBoundingClientRect() {
    const r = this._rect ?? { left: 0, top: 0, width: 0, height: 0 };
    return {
      left: r.left, top: r.top, width: r.width, height: r.height,
      right: r.left + r.width, bottom: r.top + r.height,
      x: r.left, y: r.top,
    };
  }

  focus() {}
  blur() {}
}

/* ------------------------------------------------------------------ stub --- */
export function installDomStub({ width = 390, height = 844, dpr = 3 } = {}) {
  /** Canvas draw calls, recorded on demand. */
  const rec = { on: false, calls: [] };

  const ctx2d = new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => {
        if (rec.on) {
          rec.calls.push({
            m: prop,
            args,
            fill: target.fillStyle,
            stroke: target.strokeStyle,
            alpha: target.globalAlpha,
            composite: target.globalCompositeOperation,
          });
        }
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return { addColorStop() {} };
        if (prop === 'measureText') return { width: String(args[0] ?? '').length * 5.4 };
        if (prop === 'createPattern') return {};
        return undefined;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });

  const handlerMap = () => new Map();
  const addHandler = (map, type, fn) => {
    if (!map.has(type)) map.set(type, []);
    map.get(type).push(fn);
  };
  const fire = (map, type, event = {}) => {
    const list = map.get(type) || [];
    for (const fn of Array.from(list)) {
      fn({ preventDefault() {}, stopPropagation() {}, ...event });
    }
  };

  const canvasHandlers = handlerMap();
  const canvas = new El('canvas');
  canvas.id = 'game';
  canvas.width = 0;
  canvas.height = 0;
  canvas.clientWidth = width;
  canvas.clientHeight = height;
  canvas.getContext = () => ctx2d;
  canvas._rect = { left: 0, top: 0, width, height };
  canvas.addEventListener = (t, fn) => addHandler(canvasHandlers, t, fn);
  canvas.removeEventListener = () => {};

  const windowHandlers = handlerMap();
  const win = {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: dpr,
    location: { search: '' },
    addEventListener: (t, fn) => addHandler(windowHandlers, t, fn),
    removeEventListener: (t, fn) => {
      const list = windowHandlers.get(t) ?? [];
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    // no visualViewport on purpose: exercises the feature-detection branch
  };

  const documentHandlers = handlerMap();
  const byId = new Map([['game', canvas]]);
  const uiLayer = new El('div');
  uiLayer.id = 'ui-layer';
  byId.set('ui-layer', uiLayer);
  const app = new El('div');
  app.id = 'app';
  byId.set('app', app);
  app.appendChild(canvas);
  app.appendChild(uiLayer);

  const doc = {
    hidden: false,
    body: new El('body'),
    documentElement: new El('html'),
    getElementById: (id) => byId.get(id) ?? null,
    createElement: (tag) => new El(tag),
    addEventListener: (t, fn) => addHandler(documentHandlers, t, fn),
    removeEventListener: () => {},
    querySelector: (sel) => doc.body.querySelector(sel),
    querySelectorAll: (sel) => doc.body.querySelectorAll(sel),
  };

  global.window = win;
  global.document = doc;
  global.getComputedStyle = () => ({ getPropertyValue: () => '0px' });
  global.requestAnimationFrame = win.requestAnimationFrame;
  global.cancelAnimationFrame = win.cancelAnimationFrame;
  if (!global.navigator) global.navigator = { userAgent: 'node' };

  return {
    window: win,
    document: doc,
    canvas,
    ctx2d,
    uiLayer,
    canvasHandlers,
    windowHandlers,
    documentHandlers,
    fire,
    El,
    startRecording() {
      rec.calls = [];
      rec.on = true;
    },
    stopRecording() {
      rec.on = false;
      return rec.calls;
    },
  };
}
