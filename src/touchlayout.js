// Draggable touch-button layout editor (from Mini Royale). Press the gear button on a touch screen,
// drag any button / the joystick / the weapon strip, then SAVE (stored in localStorage) or RESET.
const KEY = 'savage-warrior-touch-layout-v1';
const $ = (id) => document.getElementById(id);

const items = () => [...document.querySelectorAll('#touchUI .tbtn, #joyZone, #tHotbar')];
const idOf = (el) => (el.dataset.act ? 'act:' + el.dataset.act : el.id);
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch { return {}; } };

function place(el, x, y) {
  const maxX = window.innerWidth - el.offsetWidth, maxY = window.innerHeight - el.offsetHeight;
  el.style.left = `${Math.max(0, Math.min(maxX, x))}px`;
  el.style.top = `${Math.max(0, Math.min(maxY, y))}px`;
  el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
}

function clear(el) { el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.transform = ''; }

function applySaved() {
  const saved = read();
  for (const el of items()) {
    const p = saved[idOf(el)];
    if (p) place(el, p.x * window.innerWidth, p.y * window.innerHeight);
  }
}

export function initTouchLayout() {
  const ui = $('touchUI'), edit = $('btnEditLayout'), save = $('layoutSave'), reset = $('layoutReset');
  if (!ui || !edit) return;
  applySaved();
  window.addEventListener('resize', applySaved);
  window.addEventListener('orientationchange', () => setTimeout(applySaved, 250));

  const setEditing = (on) => {
    ui.classList.toggle('editing', on);
    save.classList.toggle('hidden', !on);
    reset.classList.toggle('hidden', !on);
  };
  edit.addEventListener('click', () => setEditing(!ui.classList.contains('editing')));
  save.addEventListener('click', () => {
    const out = {};
    for (const el of items()) {
      if (!el.style.left) continue;
      const r = el.getBoundingClientRect();
      out[idOf(el)] = { x: r.left / window.innerWidth, y: r.top / window.innerHeight };
    }
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* storage may be blocked */ }
    setEditing(false);
  });
  reset.addEventListener('click', () => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    items().forEach(clear);
    setEditing(false);
  });

  let drag = null;
  for (const el of items()) {
    el.addEventListener('touchstart', (e) => {
      if (!ui.classList.contains('editing')) return;
      e.preventDefault();
      const t = e.changedTouches[0], r = el.getBoundingClientRect();
      drag = { el, id: t.identifier, dx: t.clientX - r.left, dy: t.clientY - r.top };
    }, { passive: false });
  }
  document.addEventListener('touchmove', (e) => {
    if (!drag) return;
    for (const t of e.changedTouches) if (t.identifier === drag.id) { e.preventDefault(); place(drag.el, t.clientX - drag.dx, t.clientY - drag.dy); }
  }, { passive: false });
  const end = (e) => { if (drag) for (const t of e.changedTouches) if (t.identifier === drag.id) drag = null; };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
}
