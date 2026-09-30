import test from 'node:test';
import assert from 'node:assert/strict';

import { installModalFocusManager } from '../public/modal-focus.js';

const FOCUSABLE_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);

class FakeElement {
  constructor(doc, tag, { id = '', classes = [], attrs = {}, disabled = false } = {}) {
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.classNames = new Set(classes);
    this.classList = {
      add: (...names) => names.forEach((name) => this.classNames.add(name)),
      remove: (...names) => names.forEach((name) => this.classNames.delete(name)),
      contains: (name) => this.classNames.has(name),
    };
    this.attrs = new Map(Object.entries(attrs));
    this.disabled = disabled;
    this.rendered = true;
    this.style = { display: 'block', visibility: 'visible' };
    this.children = [];
    this.parent = null;
    this.inert = false;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
    return this;
  }

  get isConnected() {
    let node = this;
    while (node.parent) node = node.parent;
    return node === this.ownerDocument.body;
  }

  get tabIndex() {
    if (this.attrs.has('tabindex')) return Number(this.attrs.get('tabindex'));
    return FOCUSABLE_TAGS.has(this.tagName) || (this.tagName === 'A' && this.attrs.has('href')) ? 0 : -1;
  }

  // Implements the selector used by modal-focus.js:
  // a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])
  matchesFocusableSelector() {
    if (this.tagName === 'A' && this.attrs.has('href')) return true;
    if (FOCUSABLE_TAGS.has(this.tagName)) return true;
    return this.attrs.has('tabindex') && this.attrs.get('tabindex') !== '-1';
  }

  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  querySelectorAll() {
    return this.descendants().filter((element) => element.matchesFocusableSelector());
  }

  // Implements closest('[inert], [hidden], .hidden'); `inert` reflects to an attribute.
  closest() {
    for (let node = this; node; node = node.parent) {
      if (node.inert || node.attrs.has('hidden') || node.classNames.has('hidden')) return node;
    }
    return null;
  }

  contains(node) {
    for (let current = node; current; current = current.parent) {
      if (current === this) return true;
    }
    return false;
  }

  getClientRects() {
    return this.rendered && this.style.display !== 'none' ? [{ width: 10, height: 10 }] : [];
  }

  focus() {
    this.ownerDocument.activeElement = this;
    this.ownerDocument.dispatch('focusin', { target: this });
  }
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
    this.body = new FakeElement(this, 'body');
    this.activeElement = this.body;
  }

  element(tag, options) {
    return new FakeElement(this, tag, options);
  }

  getElementById(id) {
    return this.body.descendants().find((element) => element.id === id) ?? null;
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type, event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  key(key, { shiftKey = false } = {}) {
    const event = {
      key,
      shiftKey,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    this.dispatch('keydown', event);
    return event;
  }
}

function installPage() {
  const originals = new Map(['getComputedStyle', 'MutationObserver']
    .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const observers = [];
  Object.defineProperty(globalThis, 'getComputedStyle', {
    configurable: true,
    writable: true,
    value: (element) => element.style,
  });
  Object.defineProperty(globalThis, 'MutationObserver', {
    configurable: true,
    writable: true,
    value: class {
      constructor(callback) {
        this.callback = callback;
        this.targets = [];
        observers.push(this);
      }

      observe(target, options) {
        this.targets.push({ target, options });
      }
    },
  });

  const doc = new FakeDocument();
  const el = (tag, options) => doc.element(tag, options);
  const page = el('main', { id: 'page' }).append(
    el('button', { id: 'start-button' }),
    el('button', { id: 'guided-cell-pointer' }),
    el('a', { id: 'page-link', attrs: { href: '#help' } }),
  );
  // Like index.html, overlays are programmatically focusable but outside the tab order.
  const overlay = (id, ...children) => el('div', {
    id,
    classes: ['modal-overlay', 'hidden'],
    attrs: { tabindex: '-1' },
  }).append(...children);
  doc.body.append(
    page,
    overlay('control-settings-overlay'),
    overlay('tutorial-overlay'),
    overlay('ad-modal-overlay'),
    overlay(
      'modal-overlay',
      el('button', { id: 'modal-close' }),
      el('button', { id: 'modal-disabled', disabled: true }),
      el('button', { id: 'modal-unrendered' }),
      el('div', { id: 'modal-skipped', attrs: { tabindex: '-1' } }),
      el('div', { id: 'modal-custom', attrs: { tabindex: '0' } }),
    ),
    overlay('lobby-overlay', el('input', { id: 'lobby-name' }), el('button', { id: 'lobby-go' })),
  );
  doc.getElementById('modal-unrendered').rendered = false;

  return {
    doc,
    byId: (id) => doc.getElementById(id),
    observers,
    // Deliver the attribute mutation the way the browser's observer would.
    setOpen(id, open) {
      doc.getElementById(id).classList[open ? 'remove' : 'add']('hidden');
      for (const observer of observers) observer.callback([]);
    },
    restore() {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('watches every dialog overlay and the page body for visibility changes', () => {
  const page = installPage();
  try {
    installModalFocusManager(page.doc);
    const [observer] = page.observers;
    assert.deepEqual(
      observer.targets.slice(0, 5).map(({ target, options }) => [target.id, options.attributeFilter]),
      [
        ['control-settings-overlay', ['class']],
        ['tutorial-overlay', ['class']],
        ['ad-modal-overlay', ['class']],
        ['modal-overlay', ['class']],
        ['lobby-overlay', ['class']],
      ],
    );
    assert.deepEqual(observer.targets.at(-1), { target: page.doc.body, options: { childList: true } });
    assert.equal(page.byId('page').inert, false, 'with no dialog open the page stays interactive');
    assert.equal(page.byId('modal-overlay').inert, true, 'closed dialogs stay out of the tab order');
  } finally {
    page.restore();
  }
});

test('moves focus into an opened dialog and makes the rest of the page inert', () => {
  const page = installPage();
  try {
    installModalFocusManager(page.doc);
    page.byId('start-button').focus();
    page.setOpen('modal-overlay', true);

    assert.equal(page.doc.activeElement, page.byId('modal-close'));
    assert.equal(page.byId('page').inert, true);
    assert.equal(page.byId('modal-overlay').inert, false);
    assert.equal(page.byId('lobby-overlay').inert, true);
  } finally {
    page.restore();
  }
});

test('returns focus to the control that opened the dialog when it closes', () => {
  const page = installPage();
  try {
    installModalFocusManager(page.doc);
    page.byId('page-link').focus();
    page.setOpen('modal-overlay', true);
    page.setOpen('modal-overlay', false);

    assert.equal(page.doc.activeElement, page.byId('page-link'));
    assert.equal(page.byId('page').inert, false);
    assert.equal(page.byId('modal-overlay').inert, true);
  } finally {
    page.restore();
  }
});

test('falls back to the guided pointer, then the first page control, when the opener is gone', () => {
  const page = installPage();
  try {
    installModalFocusManager(page.doc);
    page.byId('start-button').focus();
    page.setOpen('modal-overlay', true);
    page.byId('start-button').disabled = true;
    page.setOpen('modal-overlay', false);
    assert.equal(page.doc.activeElement, page.byId('guided-cell-pointer'));

    page.setOpen('modal-overlay', true);
    page.byId('guided-cell-pointer').style.visibility = 'hidden';
    page.setOpen('modal-overlay', false);
    assert.equal(page.doc.activeElement, page.byId('page-link'));
  } finally {
    page.restore();
  }
});

test('traps Tab and Shift+Tab inside the dialog and skips controls that cannot take focus', () => {
  const page = installPage();
  try {
    installModalFocusManager(page.doc);
    const outside = page.doc.key('Tab');
    assert.equal(outside.defaultPrevented, false, 'Tab is untouched while no dialog is open');

    page.setOpen('modal-overlay', true);
    const forward = page.doc.key('Tab');
    assert.equal(forward.defaultPrevented, true);
    assert.equal(page.doc.activeElement, page.byId('modal-custom'));
    page.doc.key('Tab');
    assert.equal(page.doc.activeElement, page.byId('modal-close'), 'focus wraps to the first control');
    page.doc.key('Tab', { shiftKey: true });
    assert.equal(page.doc.activeElement, page.byId('modal-custom'), 'Shift+Tab wraps backwards');

    const escape = page.doc.key('Escape');
    assert.equal(escape.defaultPrevented, false, 'other keys are left to the dialog');
  } finally {
    page.restore();
  }
});

test('focuses the dialog itself when it has no focusable controls', () => {
  const page = installPage();
  try {
    installModalFocusManager(page.doc);
    page.setOpen('control-settings-overlay', true);
    assert.equal(page.doc.activeElement, page.byId('control-settings-overlay'));
    page.doc.key('Tab');
    assert.equal(page.doc.activeElement, page.byId('control-settings-overlay'));
  } finally {
    page.restore();
  }
});

test('pulls focus that escapes to the page back into the dialog', () => {
  const page = installPage();
  try {
    installModalFocusManager(page.doc);
    page.setOpen('lobby-overlay', true);
    assert.equal(page.doc.activeElement, page.byId('lobby-name'));
    page.byId('lobby-go').focus();
    assert.equal(page.doc.activeElement, page.byId('lobby-go'), 'moving within the dialog is allowed');

    page.byId('page-link').focus();
    assert.equal(page.doc.activeElement, page.byId('lobby-name'));
  } finally {
    page.restore();
  }
});

test('gives priority to the topmost dialog and restores the dialog underneath', () => {
  const page = installPage();
  try {
    installModalFocusManager(page.doc);
    page.setOpen('lobby-overlay', true);
    page.byId('lobby-go').focus();
    page.setOpen('control-settings-overlay', true);
    assert.equal(page.doc.activeElement, page.byId('control-settings-overlay'));
    assert.equal(page.byId('lobby-overlay').inert, true, 'the lower dialog is inert while settings are open');

    page.setOpen('control-settings-overlay', false);
    assert.equal(page.doc.activeElement, page.byId('lobby-go'));
    assert.equal(page.byId('lobby-overlay').inert, false);
  } finally {
    page.restore();
  }
});

test('ignores overlays hidden by computed style and re-homes focus when a control disappears', () => {
  const page = installPage();
  try {
    const sync = installModalFocusManager(page.doc);
    const modal = page.byId('modal-overlay');
    modal.style.display = 'none';
    page.setOpen('modal-overlay', true);
    assert.equal(page.byId('page').inert, false, 'a display:none overlay is not an open dialog');

    modal.style.display = 'block';
    sync();
    page.byId('modal-custom').focus();
    page.byId('modal-custom').rendered = false;
    sync();
    assert.equal(page.doc.activeElement, page.byId('modal-close'));
  } finally {
    page.restore();
  }
});
