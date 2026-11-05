export type Lang = 'zh' | 'en';
export interface Part { key: string; hex: string; label: { zh: string; en: string } }
export interface Figure {
  id: string; kind: 'figure' | 'relief'; accent: string;
  name: { zh: string; en: string }; note: { zh: string; en: string };
  size: string; partsCount: number; file: string;
  parts: Part[];
}
const L = (zh: string, en: string) => ({ zh, en });
const hx = (hex: string, zh: string, en: string): Part => ({ key: hex.toLowerCase(), hex: '#' + hex.toLowerCase(), label: L(zh, en) });

export const FIGURES: Figure[] = [
  {
    id: 'cat-fig', kind: 'figure', accent: '#F3F0EA',
    name: L('猫猫看书手办', 'Cat with a book'),
    note: L('眯眼微笑、捧着打开的书，桌上有手机与多肉，头顶「!!」与闪光。分件 5 件 + 一体版。', 'Eyes closed in a smile, holding an open book; phone and succulent on the desk, “!!” and sparkles above. 5 parts + one-piece.'),
    size: '82.0 × 50.0 × 68.3', partsCount: 5, file: 'cat-fig.glb',
    parts: [
      hx('F3F0EA','猫毛','Fur'), hx('F2B9C2','耳内','Inner ear'), hx('262626','线条','Linework'),
      hx('2C3B57','书封','Book cover'), hx('F4EBD6','书页','Pages'), hx('E06A6A','发圈','Tail band'),
      hx('C9A27A','桌面','Desk'), hx('3C4048','手机','Phone'), hx('EDEDED','数据线','Cable'),
      hx('D8875E','花盆','Pot'), hx('5B2F1F','盆线','Pot lines'), hx('8FBF7F','多肉','Succulent'),
      hx('6B4B35','土','Soil'), hx('F5C84B','闪光','Sparkle'), hx('E2574C','感叹号','Exclaim'), hx('DDEBF2','支杆','Stem'),
    ],
  },
  {
    id: 'pig-fig', kind: 'figure', accent: '#F7CFCF',
    name: L('小猪敲电脑手办', 'Pig at the laptop'),
    note: L('坐在桌前敲键盘，头顶麦克风吊杆与两个「??」，旁边有小盆栽。分件 6 件 + 一体版。', 'Typing at a laptop under a boom mic with two “??” overhead and a tiny pot beside. 6 parts + one-piece.'),
    size: '84.0 × 53.0 × 66.0', partsCount: 6, file: 'pig-fig.glb',
    parts: [
      hx('F7CFCF','猪身','Body'), hx('F2A9B3','腮红','Blush'), hx('1E1E1E','线条','Linework'),
      hx('3B3D44','电脑','Laptop'), hx('4A7CC4','贴纸','Sticker'), hx('C8CDD5','键帽','Keys'),
      hx('55585F','麦克风','Mic'), hx('2A2A2A','吊杆','Boom'), hx('C9A27A','桌面','Desk'),
      hx('B9727D','花盆','Pot'), hx('86B67A','叶子','Leaf'), hx('6B4B35','土','Soil'),
      hx('DDEBF2','问号','Question'), hx('EFEAE0','高光','Highlight'), hx('2F3A4A','深灰','Deep grey'),
      hx('3A3A3A','中灰','Mid grey'), hx('5A5F68','冷灰','Cool grey'),
    ],
  },
  {
    id: 'cat-relief', kind: 'relief', accent: '#E4DCF5',
    name: L('猫猫浮雕冰箱贴', 'Cat fridge magnet'),
    note: L('浮雕冰箱贴，背面两个 Ø10 磁铁槽。翻到背面可以看到磁铁位。', 'Relief magnet; two Ø10 magnet pockets on the back. Flip to see the slots.'),
    size: '69.0 × 65.0 × 7.6', partsCount: 1, file: 'cat-relief.glb',
    parts: [
      hx('FFFFFF','底板','Plate'), hx('F3F0EA','猫毛','Fur'), hx('F2B9C2','耳内','Inner ear'),
      hx('262626','线条','Linework'), hx('2C3B57','书封','Book'), hx('F4EBD6','书页','Pages'),
      hx('E06A6A','发圈','Band'), hx('C9A27A','桌面','Desk'), hx('3C4048','手机','Phone'),
      hx('EDEDED','线','Cable'), hx('D8875E','花盆','Pot'), hx('5B2F1F','盆线','Pot line'),
      hx('8FBF7F','多肉','Leaf'), hx('F5C84B','闪光','Sparkle'), hx('E2574C','感叹号','Exclaim'),
    ],
  },
  {
    id: 'pig-relief', kind: 'relief', accent: '#F7CFCF',
    name: L('小猪浮雕冰箱贴', 'Pig fridge magnet'),
    note: L('浮雕冰箱贴，背面两个 Ø10 磁铁槽。翻到背面可以看到磁铁位。', 'Relief magnet; two Ø10 magnet pockets on the back. Flip to see the slots.'),
    size: '67.8 × 56.4 × 8.1', partsCount: 1, file: 'pig-relief.glb',
    parts: [
      hx('FFFFFF','底板','Plate'), hx('F7CFCF','猪身','Body'), hx('F4B3BD','腮红','Blush'),
      hx('F2A9B3','深腮','Deep blush'), hx('1E1E1E','线条','Linework'), hx('3B3D44','电脑','Laptop'),
      hx('4A7CC4','贴纸','Sticker'), hx('C8CDD5','键帽','Keys'), hx('55585F','麦克风','Mic'),
      hx('2A2A2A','吊杆','Boom'), hx('C9A27A','桌面','Desk'), hx('B9727D','花盆','Pot'),
      hx('86B67A','叶子','Leaf'), hx('EFEAE0','高光','Highlight'), hx('262626','深线','Dark line'),
      hx('3A3A3A','中灰','Mid grey'),
    ],
  },
];
export const find = (id: string) => FIGURES.find((f) => f.id === id)!;
export const posterUrl = (id: string, kind: 'hero' | 'sheet' | 'front' | 'back' | 'sm' = 'hero') =>
  `./posters/${id}-${kind}.jpg`;
