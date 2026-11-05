import './style.css';
import { FIGURES, find, posterUrl, type Lang } from './data/figures';
import { t } from './i18n';
import { Viewer } from './viewer';

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const state = {
  id: FIGURES[0].id,
  lang: ((): Lang => { const s = localStorage.getItem('lotus30.lang'); if (s === 'zh' || s === 'en') return s; return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'; })(),
  explode: false, flip: false, spin: true, hidden: new Set<string>(),
};
const hash = location.hash.replace(/^#\/?/, '');
if (FIGURES.some((f) => f.id === hash)) state.id = hash;

let viewer: Viewer | null = null;
const L = () => state.lang;

function applyI18n() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((e) => {
    const k = e.dataset.i18n as Parameters<typeof t>[0]; try { e.textContent = t(k, L()); } catch { /* */ }
  });
  $('#lang').textContent = state.lang === 'zh' ? 'EN' : '中';
  document.title = state.lang === 'zh' ? '臭猪臭猫｜手办与浮雕冰箱贴 · 3D 展示' : 'Pig & Cat · figures & magnets · 3D';
  renderRail(); renderDetail(); renderGallery();
}

function renderRail() {
  const rail = $('#rail'); rail.innerHTML = '';
  for (const f of FIGURES) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.id = f.id;
    b.setAttribute('aria-selected', String(f.id === state.id));
    b.innerHTML = `<img src="${posterUrl(f.id, 'sm')}" alt="" width="76" height="76" loading="lazy"><span>${f.name[L()]}</span>`;
    b.addEventListener('click', () => select(f.id));
    rail.appendChild(b);
  }
}
function renderDetail() {
  const f = find(state.id); const lang = L();
  const parts = f.parts.map((p) => {
    const off = state.hidden.has(p.key);
    return `<li><button type="button" class="${off ? 'off' : ''}" data-part="${p.key}" aria-pressed="${!off}"><span class="sw" style="--c:${p.hex}"></span>${p.label[lang]}</button></li>`;
  }).join('');
  $('#detail').innerHTML = `
    <p class="meta">${t(f.kind === 'figure' ? 'kind_figure' : 'kind_relief', lang)} · ${f.size} ${t('mm', lang)}</p>
    <h2>${f.name[lang]}</h2>
    <p class="note">${f.note[lang]}</p>
    <p class="meta">${t('parts', lang)}</p>
    <ul class="parts">${parts}</ul>`;
  $('#detail').querySelectorAll<HTMLButtonElement>('[data-part]').forEach((b) => {
    b.addEventListener('click', () => {
      const k = b.dataset.part!; if (state.hidden.has(k)) state.hidden.delete(k); else state.hidden.add(k);
      viewer?.setHidden(state.hidden); renderDetail();
    });
  });
  $('#tFlip').hidden = f.kind !== 'relief';
}
function renderGallery() {
  const g = $('#ggrid'); g.innerHTML = '';
  for (const f of FIGURES) {
    for (const kind of (['hero', 'front', 'back', 'sheet'] as const)) {
      const fig = document.createElement('figure');
      fig.innerHTML = `<img src="${posterUrl(f.id, kind)}" alt="" loading="lazy"><figcaption>${f.name[L()]} · ${kind}</figcaption>`;
      g.appendChild(fig);
    }
  }
}

async function select(id: string) {
  if (id === state.id && viewer) return;
  state.id = id; state.hidden.clear(); state.flip = false; state.explode = false;
  location.hash = id;
  ($('#poster') as HTMLImageElement).src = posterUrl(id, 'hero');
  $('#loading').classList.remove('off');
  document.querySelectorAll('.rail button').forEach((b) => b.setAttribute('aria-selected', String((b as HTMLElement).dataset.id === id)));
  $('#tExplode').setAttribute('aria-pressed', 'false');
  $('#tFlip').setAttribute('aria-pressed', 'false');
  renderDetail();
  if (!viewer) return;
  await viewer.show(id, 'v1');
  viewer.setExplode(false); viewer.resetHidden(); viewer.resetView();
  $('#loading').classList.add('off');
  document.querySelector('.viewer-host')?.classList.add('on');
}

async function boot() {
  applyI18n();
  ($('#poster') as HTMLImageElement).src = posterUrl(state.id, 'hero');
  try {
    viewer = new Viewer($('#host'), { onFirstFrame: () => { $('#loading').classList.add('off'); document.querySelector('.viewer-host')?.classList.add('on'); } });
    viewer.controls.autoRotate = state.spin;
    await viewer.show(state.id, 'v1');
  } catch (e) {
    console.error(e); $('#loading').querySelector('i')!.textContent = 'WebGL unavailable — showing posters';
  }
  $('#lang').addEventListener('click', () => { state.lang = state.lang === 'zh' ? 'en' : 'zh'; localStorage.setItem('lotus30.lang', state.lang); applyI18n(); });
  $('#tSpin').addEventListener('click', () => { state.spin = !state.spin; $('#tSpin').setAttribute('aria-pressed', String(state.spin)); if (viewer) viewer.controls.autoRotate = state.spin; });
  $('#tExplode').addEventListener('click', () => { state.explode = !state.explode; $('#tExplode').setAttribute('aria-pressed', String(state.explode)); viewer?.setExplode(state.explode); });
  $('#tFlip').addEventListener('click', () => {
    state.flip = !state.flip; $('#tFlip').setAttribute('aria-pressed', String(state.flip));
    if (!viewer) return;
    // orbit to the back / front
    const c = viewer.controls; const cam = viewer.camera;
    const r = cam.position.length();
    cam.position.set(state.flip ? 0.2 : 2.2, state.flip ? 1.2 : 1.7, state.flip ? -5.2 : 5.4);
    cam.position.setLength(r); c.update();
  });
  $('#tReset').addEventListener('click', () => { state.explode = false; state.flip = false; state.hidden.clear(); $('#tExplode').setAttribute('aria-pressed', 'false'); $('#tFlip').setAttribute('aria-pressed', 'false'); viewer?.setExplode(false); viewer?.resetHidden(); viewer?.resetView(); renderDetail(); });
  renderRail(); renderDetail(); renderGallery();
}
boot();
