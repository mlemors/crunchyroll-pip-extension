const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function load(file, document = {}) {
  const handlers = {};
  const context = vm.createContext({
    URL, console, document: { readyState: 'loading', addEventListener() {}, ...document },
    chrome: {
      scripting: { executeScript: async ({ func }) => func() },
      tabs: { query: async () => [] },
      commands: { onCommand: { addListener(fn) { handlers.command = fn; } } },
      action: { onClicked: { addListener(fn) { handlers.click = fn; } } }
    }
  });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  return { context, handlers };
}
function video(options = {}) {
  return { paused: false, readyState: 2, hasAttribute: () => true,
    removeAttribute() { this.removed = true; }, ...options };
}

for (const file of ['content.js', 'background.js']) {
  const toggle = file === 'content.js' ? 'togglePiP()' : 'runTogglePip(1)';
  test(`${file}: exits existing PiP even when no current video is found`, async () => {
    let exited = 0;
    const { context } = load(file, { pictureInPictureElement: {},
      exitPictureInPicture: async () => exited++, querySelectorAll: () => [] });
    await vm.runInContext(toggle, context);
    assert.equal(exited, 1);
  });
  test(`${file}: chooses a ready paused video over unloaded placeholder`, async () => {
    let entered = 0;
    const selected = video({ paused: true, requestPictureInPicture: async () => entered++ });
    const { context } = load(file, { pictureInPictureEnabled: true,
      querySelectorAll: () => [video({ paused: true, readyState: 0 }), selected] });
    await vm.runInContext(toggle, context);
    assert.equal(entered, 1);
    assert.equal(selected.disablePictureInPicture, false);
    assert.equal(selected.removed, true);
  });
  test(`${file}: WebKit fallback actually toggles off`, async () => {
    let mode;
    const { context } = load(file, { querySelectorAll: () => [video({
      webkitPresentationMode: 'picture-in-picture', webkitSetPresentationMode(value) { mode = value; }
    })] });
    await vm.runInContext(toggle, context);
    assert.equal(mode, 'inline');
  });
}
test('background: only HTTPS Crunchyroll hosts are allowed', () => {
  const { context } = load('background.js');
  for (const url of ['https://crunchyroll.com/watch/x', 'https://www.crunchyroll.com/de/watch/x']) {
    assert.equal(context.isCrunchyrollUrl(url), true);
  }
  for (const url of ['http://crunchyroll.com', 'https://crunchyroll.com.evil.test', 'file:///watch/x', 'garbage']) {
    assert.equal(context.isCrunchyrollUrl(url), false);
  }
});
test('background: tab lookup failure is handled', async () => {
  const { context, handlers } = load('background.js');
  context.chrome.tabs.query = async () => { throw new Error('Tab closed'); };
  let warned = false;
  context.console = { warn() { warned = true; } };
  await handlers.command('toggle-pip');
  assert.equal(warned, true);
});
test('content: mutation bursts schedule one refresh and bind all videos', () => {
  const { context } = load('content.js', { querySelectorAll: () => [video(), video()] });
  const callbacks = [];
  let bound = 0;
  let mounted = 0;
  context.requestAnimationFrame = (fn) => callbacks.push(fn);
  context.bindVideoListeners = () => bound++;
  context.mountPipButtonInControls = () => mounted++;
  context.scheduleMount(); context.scheduleMount(); context.scheduleMount();
  assert.equal(callbacks.length, 1);
  callbacks.shift()();
  assert.equal(bound, 2);
  assert.equal(mounted, 1);
  context.scheduleMount();
  assert.equal(callbacks.length, 1);
});
test('content: player controls accept nested wrappers without CSS class dependency', () => {
  const stack = {};
  const wrapper = { parentElement: stack, className: 'new-player-wrapper' };
  const subtitle = { parentElement: { parentElement: wrapper }, className: 'control' };
  const pipWrapper = { parentElement: null, nextSibling: null };
  const pipButton = { parentElement: pipWrapper, className: 'control' };
  const { context } = load('content.js', {
    querySelector: () => stack,
    getElementById: (id) => id === 'cr-pip-helper-wrapper' ? pipWrapper : pipButton
  });
  context.isEpisodePage = () => true;
  context.getActiveVideo = () => video();
  context.findSubtitleButton = (controls) => { assert.equal(controls, stack); return subtitle; };
  context.normalizePipButtonStyle = () => {};
  context.getShortcutLabel = () => 'Alt+Shift+P';
  let inserted = false;
  stack.insertBefore = (element, before) => {
    assert.equal(element, pipWrapper); assert.equal(before, wrapper); inserted = true;
  };
  context.mountPipButtonInControls();
  assert.equal(inserted, true);
});
