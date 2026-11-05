export type Lang = 'zh' | 'en';
const dict = {
  eyebrow: { zh: '手办 · 冰箱贴 · 原创', en: 'Figures · magnets · original' },
  title: { zh: '臭猪臭猫', en: 'Pig & Cat' },
  lead: { zh: '四个完整模型：猫猫看书、小猪敲电脑，各有立体手办与浮雕冰箱贴。拖一拖、拆开看颜色、翻到背面看磁铁槽。', en: 'Four complete models: cat with a book and pig at the laptop, each as a figure and a fridge magnet. Orbit, explode by colour, flip the relief to see magnet slots.' },
  spin: { zh: '旋转', en: 'Spin' }, explode: { zh: '拆分颜色', en: 'Explode' }, flip: { zh: '看背面', en: 'Flip back' }, reset: { zh: '复位', en: 'Reset' },
  hint: { zh: '拖动旋转 · 双指 / 滚轮缩放', en: 'Drag to turn · pinch / scroll to zoom' },
  loading: { zh: '加载模型…', en: 'Loading…' },
  renders: { zh: '效果图', en: 'Renders' },
  credit: { zh: '建模 · lotus · Notion 项目「臭猪臭猫｜手办与浮雕冰箱贴建模完整项目 v1」', en: 'Modelled by lotus · Notion project “Lotus30 figures & relief magnets v1”' },
  size: { zh: '尺寸', en: 'Size' }, parts: { zh: '颜色', en: 'Colours' }, mm: { zh: 'mm', en: 'mm' },
  kind_figure: { zh: '立体手办', en: 'Figure' }, kind_relief: { zh: '浮雕冰箱贴', en: 'Fridge magnet' },
};
export const t = (k: keyof typeof dict, lang: Lang) => dict[k][lang];
