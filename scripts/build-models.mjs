// 把原始 GLB（Z 轴向上、毫米）优化成网页用的 GLB：
// 转 Y 轴向上 → 居中落地 → 焊接 → 减面 → 重新计算法线 → 量化 → meshopt 压缩
// 用法：MASCOT_SRC=/path/to/source-glb node scripts/build-models.mjs [id-version ...]
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { weld, simplify, quantize, meshopt, dedup, prune, reorder, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.env.MASCOT_SRC || path.resolve('source');
const OUT = path.resolve('public/models');
const META = path.resolve('src/data/model-meta.json');

// version: v1 = 圆润（平滑法线），pixel = 方块（硬边法线）
const JOBS = [
  ['claude', 'v1', 'out/crab.glb'], ['codex', 'v1', 'out/codex.glb'], ['qoder', 'v1', 'out/qoder.glb'],
  ['zcode', 'v1', 'out/zcode.glb'], ['notion', 'v1', 'out/notion.glb'], ['antigravity', 'v1', 'out/antigravity.glb'],
  ['claude', 'pixel', 'out2/Pixel_ClaudeCode_Cowboy.glb'], ['codex', 'pixel', 'out2/Pixel_Codex_Terminal.glb'],
  ['qoder', 'pixel', 'out2/Pixel_Qoder_Monocle.glb'], ['zcode', 'pixel', 'out2/Pixel_ZCode_Bot.glb'],
  ['notion', 'pixel', 'out2/Pixel_Notion_Cube.glb'], ['antigravity', 'pixel', 'out2/Pixel_Antigravity_Arch.glb'],
];
const CFG = {
  v1: { ratio: 0.22, error: 0.004, crease: 70, smooth: 6 },
  pixel: { ratio: 1, error: 0, crease: 25 },
};

// Taubin 平滑（λ|μ，几乎不缩体积）：去掉 marching-cubes 的台阶/颗粒感
function taubin(pos, idx, iters, lambda = 0.5, mu = -0.53) {
  const nV = pos.length / 3; const deg = new Uint32Array(nV + 1);
  const edges = new Set(); const pairs = [];
  const add = (a, b) => { const k = a < b ? a * nV + b : b * nV + a; if (!edges.has(k)) { edges.add(k); pairs.push(a, b); deg[a + 1]++; deg[b + 1]++; } };
  for (let t = 0; t < idx.length; t += 3) { add(idx[t], idx[t + 1]); add(idx[t + 1], idx[t + 2]); add(idx[t + 2], idx[t]); }
  for (let i = 0; i < nV; i++) deg[i + 1] += deg[i];
  const fill = deg.slice(); const nb = new Uint32Array(pairs.length);
  for (let i = 0; i < pairs.length; i += 2) { nb[fill[pairs[i]]++] = pairs[i + 1]; nb[fill[pairs[i + 1]]++] = pairs[i]; }
  let cur = Float32Array.from(pos); let nxt = new Float32Array(pos.length);
  for (let it = 0; it < iters * 2; it++) {
    const f = it % 2 === 0 ? lambda : mu;
    for (let v = 0; v < nV; v++) {
      const s = deg[v], e = deg[v + 1]; const n = e - s; let ax = 0, ay = 0, az = 0;
      for (let j = s; j < e; j++) { const u = nb[j] * 3; ax += cur[u]; ay += cur[u + 1]; az += cur[u + 2]; }
      const o = v * 3;
      if (n === 0) { nxt[o] = cur[o]; nxt[o + 1] = cur[o + 1]; nxt[o + 2] = cur[o + 2]; continue; }
      nxt[o] = cur[o] + f * (ax / n - cur[o]); nxt[o + 1] = cur[o + 1] + f * (ay / n - cur[o + 1]); nxt[o + 2] = cur[o + 2] + f * (az / n - cur[o + 2]);
    }
    [cur, nxt] = [nxt, cur];
  }
  pos.set(cur);
}

const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toHex = (c) => '#' + c.slice(0, 3).map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');

function creasedNormals(pos, idx, creaseDeg) {
  const nTri = idx.length / 3;
  const fn = new Float32Array(nTri * 3);
  for (let t = 0; t < nTri; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    fn[t * 3] = uy * vz - uz * vy; fn[t * 3 + 1] = uz * vx - ux * vz; fn[t * 3 + 2] = ux * vy - uy * vx;
  }
  const nV = pos.length / 3;
  const counts = new Uint32Array(nV + 1);
  for (let i = 0; i < idx.length; i++) counts[idx[i] + 1]++;
  for (let i = 0; i < nV; i++) counts[i + 1] += counts[i];
  const fill = counts.slice(); const adj = new Uint32Array(idx.length);
  for (let t = 0; t < nTri; t++) for (let k = 0; k < 3; k++) adj[fill[idx[t * 3 + k]]++] = t;
  const cosT = Math.cos((creaseDeg * Math.PI) / 180);
  const nPos = new Float32Array(idx.length * 3), nNrm = new Float32Array(idx.length * 3);
  const len = (t) => Math.hypot(fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]) || 1;
  for (let t = 0; t < nTri; t++) {
    const lt = len(t);
    for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k];
      let sx = 0, sy = 0, sz = 0;
      for (let j = counts[v]; j < counts[v + 1]; j++) {
        const u = adj[j];
        const lu = len(u);
        const d = (fn[t * 3] * fn[u * 3] + fn[t * 3 + 1] * fn[u * 3 + 1] + fn[t * 3 + 2] * fn[u * 3 + 2]) / (lt * lu);
        if (d >= cosT) { sx += fn[u * 3] / lu; sy += fn[u * 3 + 1] / lu; sz += fn[u * 3 + 2] / lu; } // 等权重，避免大面压小面
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      const o = (t * 3 + k) * 3;
      nPos[o] = pos[v * 3]; nPos[o + 1] = pos[v * 3 + 1]; nPos[o + 2] = pos[v * 3 + 2];
      nNrm[o] = sx / l; nNrm[o + 1] = sy / l; nNrm[o + 2] = sz / l;
    }
  }
  return { nPos, nNrm };
}

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.dirname(META), { recursive: true });
const meta = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : {};
const only = process.argv.slice(2);

for (const [id, ver, file] of JOBS) {
  const key = `${id}-${ver}`;
  if (only.length && !only.includes(key)) continue;
  const cfg = CFG[ver];
  const doc = await io.read(path.join(SRC, file));
  const root = doc.getRoot();

  // 1) Z-up(前方=-Y) → Y-up(前方=+Z)：(x,y,z) -> (x,z,-y)；居中、底面落在 y=0
  const prims = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    for (const p of mesh.listPrimitives()) prims.push({ name: node.getName(), p });
  }
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const { p } of prims) {
    const pa = p.getAttribute('POSITION'); const a = pa.getArray();
    for (let i = 0; i < a.length; i += 3) {
      const x = a[i], y = a[i + 2], z = -a[i + 1]; a[i] = x; a[i + 1] = y; a[i + 2] = z;
      mn = [Math.min(mn[0], x), Math.min(mn[1], y), Math.min(mn[2], z)];
      mx = [Math.max(mx[0], x), Math.max(mx[1], y), Math.max(mx[2], z)];
    }
  }
  const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, cy = mn[1];
  for (const { p } of prims) { const pa = p.getAttribute('POSITION'); const a = pa.getArray(); for (let i = 0; i < a.length; i += 3) { a[i] -= cx; a[i + 1] -= cy; a[i + 2] -= cz; } pa.setArray(a); }
  const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];

  // 2) 材质：原始颜色值本来就是 sRGB，转成 glTF 要求的线性值；每个颜色一个材质，名字=零件名
  const mats = new Map();
  const parts = [];
  for (const { name, p } of prims) {
    const old = p.getMaterial(); const c = old.getBaseColorFactor();
    const partName = name.replace(/^[A-Za-z0-9]+_[A-Za-z0-9]+(?=(black|white|green|blue|pink|red|yellow|body|hat|orange|brown)$)/, '');
    let m = mats.get(partName);
    if (!m) {
      m = doc.createMaterial(partName).setBaseColorFactor([srgb2lin(c[0]), srgb2lin(c[1]), srgb2lin(c[2]), 1]).setRoughnessFactor(0.45).setMetallicFactor(0);
      mats.set(partName, m);
      parts.push({ name: partName, hex: toHex(c) });
    }
    p.setMaterial(m);
    p.getAttribute('POSITION');
  }
  // 重命名节点/网格为零件名
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const pn = node.getName().replace(/^[A-Za-z0-9]+_[A-Za-z0-9]+(?=(black|white|green|blue|pink|red|yellow|body|hat|orange|brown)$)/, '');
    node.setName(pn); mesh.setName(pn);
  }
  for (const m of root.listMaterials()) if (!mats.has(m.getName())) m.dispose();

  // 3) 焊接 + 平滑 + 减面
  await doc.transform(weld({ tolerance: 1e-4 }));
  if (cfg.smooth) for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) { const a = p.getAttribute('POSITION'); const arr = a.getArray(); taubin(arr, p.getIndices().getArray(), cfg.smooth); a.setArray(arr); }
  let trisBefore = 0;
  for (const { p } of prims) trisBefore += p.getIndices().getCount() / 3;
  if (cfg.ratio < 1 || cfg.error > 0) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: cfg.ratio, error: cfg.error, lockBorder: false }));
  } else {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: 3e-4, lockBorder: false })); // 无损合并共面三角形
  }

  // 4) 重新计算法线（平滑/硬边）
  let trisAfter = 0;
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION').getArray(); const idx = p.getIndices().getArray();
    const { nPos, nNrm } = creasedNormals(pos, idx, cfg.crease);
    const nIdx = new Uint32Array(nPos.length / 3); for (let i = 0; i < nIdx.length; i++) nIdx[i] = i;
    p.getAttribute('POSITION').setArray(nPos);
    p.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nNrm));
    p.getIndices().setArray(nIdx);
  }
  await doc.transform(weld({ tolerance: 1e-4, toleranceNormal: 0.05 }));
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) trisAfter += p.getIndices().getCount() / 3;

  // 5) 压缩
  await doc.transform(dedup(), prune(), reorder({ encoder: MeshoptEncoder }),
    quantize({ quantizePosition: 14, quantizeNormal: 10 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const out = path.join(OUT, `${key}.glb`);
  await io.write(out, doc);
  const bytes = fs.statSync(out).size;
  meta[key] = { size_mm: size.map((x) => +x.toFixed(1)), parts, trisBefore, trisAfter, bytes };
  console.log(key.padEnd(18), `${(trisBefore / 1000) | 0}k → ${(trisAfter / 1000) | 0}k tris`, (bytes / 1024).toFixed(0) + ' KB', size.map((x) => x.toFixed(1)).join('×'));
}
fs.writeFileSync(META, JSON.stringify(meta, null, 1));
