// DEER homepage asset generator
// Creates minimal editorial SVG placeholders under public/assets/home/.
// These are stand-ins for real campaign photography — replace the files
// (keeping the same paths) once real assets exist. Rerun: node scripts/generate-home-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'home');

const PALETTES = {
  ivory: { bg: '#F2F0EB', fg: '#141414', muted: '#8B887F' },
  charcoal: { bg: '#151515', fg: '#F2F0EB', muted: '#8A8A84' },
  sand: { bg: '#DDD3C2', fg: '#1B1B18', muted: '#7C7364' },
  denim: { bg: '#33404F', fg: '#F2F0EB', muted: '#9AA7B4' },
  sage: { bg: '#AEB4A3', fg: '#1B1B18', muted: '#5E6658' },
  clay: { bg: '#B07D62', fg: '#F7F4EF', muted: '#7C4F3A' },
  stone: { bg: '#9B9B93', fg: '#141414', muted: '#4A4A44' },
  ink: { bg: '#101014', fg: '#EDEBE4', muted: '#7A7A80' },
};

// ---- garment glyphs (stroke line art, minimal fashion drawings) ----
const GLYPHS = {
  shirt:
    'M 320 300 L 580 300 L 720 520 L 585 585 L 500 445 L 500 800 L 400 800 L 400 445 L 315 585 L 180 520 Z',
  tshirt:
    'M 340 300 L 560 300 L 700 520 L 580 565 L 545 430 L 545 800 L 355 800 L 355 430 L 320 565 L 200 520 Z',
  jeans:
    'M 300 250 L 600 250 L 600 285 L 600 800 L 500 800 L 500 445 L 490 445 L 490 800 L 410 800 L 410 445 L 400 445 L 400 800 L 300 800 L 300 445 L 300 285 Z',
  trousers:
    'M 300 240 L 600 240 L 600 270 L 600 800 L 505 800 L 505 455 L 395 455 L 395 800 L 300 800 L 300 270 Z',
  cargo:
    'M 300 240 L 600 240 L 600 270 L 600 800 L 505 800 L 505 455 L 395 455 L 395 800 L 300 800 L 300 270 Z',
  shorts:
    'M 315 260 L 585 260 L 600 300 L 600 480 L 510 480 L 500 380 L 400 380 L 390 480 L 300 480 L 300 300 Z',
  shoes:
    'M 150 760 L 750 760 Q 800 760 800 800 Q 800 838 750 838 L 150 838 Q 100 838 100 800 Q 100 760 150 760 Z',
  overshirt:
    'M 300 280 L 600 280 L 740 460 L 600 540 L 560 420 L 560 800 L 340 800 L 340 420 L 300 540 L 160 460 Z',
  perfumebottle:
    'M 380 420 L 520 420 L 520 800 L 380 800 Z M 395 340 L 505 340 L 505 420 L 395 420 Z M 420 300 L 480 300 L 480 340 L 420 340 Z',
  sunglass:
    'M 220 520 Q 220 470 320 470 L 440 470 Q 470 470 470 520 L 470 560 Q 470 610 370 610 L 300 610 Q 220 610 220 560 Z M 470 520 L 430 520 L 430 560 L 500 560 Q 500 610 560 610 L 630 610 Q 680 610 680 560 L 680 520 Q 680 470 580 470 L 530 470',
  plustee:
    'M 300 290 L 600 290 L 780 530 L 600 590 L 560 430 L 560 800 L 340 800 L 340 430 L 300 590 L 120 530 Z',
};

const GLYPH_NAMES = {
  shirt: 'Shirts',
  tshirt: 'T-Shirts',
  jeans: 'Jeans',
  trousers: 'Trousers',
  cargo: 'Cargos',
  shorts: 'Shorts',
  shoes: 'Shoes',
  overshirt: 'Overshirt',
  perfumebottle: 'Perfumes',
  sunglass: 'Sunglasses',
  plustee: 'Plus Size',
};

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Abstract standing figure for "lifestyle / person wearing" compositions.
function figure(px, py, scale, fg, variant) {
  const s = (v) => v * scale;
  const head = `M ${px + s(-34)} ${py + s(-150)} Q ${px + s(-34)} ${py + s(-205)} ${px} ${py + s(-205)} Q ${px + s(34)} ${py + s(-205)} ${px + s(34)} ${py + s(-150)} Q ${px + s(34)} ${py + s(-120)} ${px} ${py + s(-120)} Q ${px + s(-34)} ${py + s(-120)} ${px + s(-34)} ${py + s(-150)} Z`;
  const torso = `M ${px + s(-70)} ${py + s(-108)} L ${px + s(70)} ${py + s(-108)} L ${px + s(88)} ${py + s(60)} L ${px + s(52)} ${py + s(64)} L ${px + s(30)} ${py + s(-8)} L ${px + s(30)} ${py + s(420)} L ${px + s(-30)} ${py + s(420)} L ${px + s(-30)} ${py + s(-8)} L ${px + s(-52)} ${py + s(64)} L ${px + s(-88)} ${py + s(60)} Z`;
  const seam = `M ${px} ${py + s(-108)} L ${px} ${py + s(420)}`;
  if (variant === 'thin') {
    return `<path fill="${fg}" fill-opacity="0.92" d="${head}"/><path fill="${fg}" fill-opacity="0.92" d="${torso}"/><path stroke="${fg}" stroke-opacity="0.35" stroke-width="${s(4)}" d="${seam}"/>`;
  }
  return `<path fill="${fg}" fill-opacity="0.88" d="${head}"/><path fill="${fg}" fill-opacity="0.88" d="${torso}"/><path stroke="${fg}" stroke-opacity="0.4" stroke-width="${s(5)}" d="${seam}"/>`;
}

function frame(bg, fg) {
  return `<rect x="26" y="26" width="848" height="1048" fill="none" stroke="${fg}" stroke-opacity="0.18" stroke-width="2"/>`;
}

function wordmark(x, y, size, color, opacity = 1) {
  return `<text x="${x}" y="${y}" font-family="Georgia, 'Times New Roman', serif" font-size="${size}" letter-spacing="${size * 0.34}" fill="${color}" fill-opacity="${opacity}">DEER</text>`;
}

function label(x, y, text, color, size = 26, spacing = 8) {
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="${size}" letter-spacing="${spacing}" fill="${color}">${esc(text.toUpperCase())}</text>`;
}

// Person / lifestyle composition (used for ads, posters, category "person" images)
function personSvg(paletteKey, { cropCenter = 1, figureTilt = 0, labelText = null, variant = 'full' } = {}) {
  const p = PALETTES[paletteKey];
  const cy = cropCenter; // 1 = centered, >1 = upper, <1 = lower focus
  const px = 450;
  const py = 990 - 540 * cropCenter;
  const rot = figureTilt ? ` transform="rotate(${figureTilt} 450 640)"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1100" preserveAspectRatio="xMidYMid slice">
  <rect width="900" height="1100" fill="${p.bg}"/>
  <g${rot}>${figure(px, py, 1.55, p.fg, variant)}</g>
  ${frame(p.bg, p.fg)}
  ${wordmark(70, 100, 40, p.fg, 0.9)}
  ${labelText ? label(70, 1030, labelText, p.fg, 22, 9) : ''}
</svg>`;
}

// Product composition (clean garment line art on light background)
function productSvg(glyph, paletteKey = 'ivory') {
  const p = PALETTES[paletteKey];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1100" preserveAspectRatio="xMidYMid slice">
  <rect width="900" height="1100" fill="${p.bg}"/>
  <circle cx="450" cy="545" r="330" fill="${p.fg}" fill-opacity="0.045"/>
  <g fill="none" stroke="${p.fg}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
    <path d="${GLYPHS[glyph]}"/>
  </g>
  ${frame(p.bg, p.fg)}
  ${wordmark(70, 100, 40, p.fg, 0.85)}
  ${label(70, 1030, GLYPH_NAMES[glyph] || glyph, p.muted, 20, 8)}
</svg>`;
}

// Wide banner composition
function bannerSvg(paletteKey, { eyebrow, title, sub }) {
  const p = PALETTES[paletteKey];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 700" preserveAspectRatio="xMidYMid slice">
  <rect width="1920" height="700" fill="${p.bg}"/>
  <g transform="translate(480 660) scale(2.1)">${figure(450, 640, 1, p.fg)}</g>
  <rect x="40" y="40" width="1840" height="620" fill="none" stroke="${p.fg}" stroke-opacity="0.22" stroke-width="2"/>
  <text x="980" y="268" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="30" letter-spacing="14" fill="${p.fg}" fill-opacity="0.85">${esc(eyebrow)}</text>
  <text x="980" y="392" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="128" letter-spacing="10" fill="${p.fg}">${esc(title)}</text>
  <text x="980" y="470" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" letter-spacing="8" fill="${p.fg}" fill-opacity="0.8">${esc(sub)}</text>
  <text x="70" y="120" font-family="Georgia, 'Times New Roman', serif" font-size="42" letter-spacing="14" fill="${p.fg}" fill-opacity="0.9">DEER</text>
</svg>`;
}

const files = [];
mkdirSync(join(ROOT, 'campaigns'), { recursive: true });
mkdirSync(join(ROOT, 'posters'), { recursive: true });
mkdirSync(join(ROOT, 'categories'), { recursive: true });

function emit(rel, content) {
  files.push(rel);
  writeFileSync(join(ROOT, rel), content, 'utf8');
}

// ---- Campaign marquee ads ----
const MARQUEE = [
  ['marquee-summer', 'sand', { cropCenter: 1.15, figureTilt: -2, labelText: 'Summer Shirts' }],
  ['marquee-formal', 'charcoal', { cropCenter: 1.0, figureTilt: 2, labelText: 'Formal Wear' }],
  ['marquee-denim', 'denim', { cropCenter: 1.25, figureTilt: 0, labelText: 'Denim Edit' }],
  ['marquee-travel', 'ivory', { cropCenter: 0.9, figureTilt: -1, labelText: 'Travel Capsule' }],
  ['marquee-basics', 'sage', { cropCenter: 1.1, figureTilt: 1, labelText: 'The Basics' }],
  ['marquee-shoes', 'stone', { cropCenter: 1.05, figureTilt: 0, labelText: 'Footwear' }],
  ['marquee-luxury', 'ink', { cropCenter: 1.0, figureTilt: -3, labelText: 'Quiet Luxury' }],
];
for (const [name, pal, opts] of MARQUEE) emit(`campaigns/${name}.svg`, personSvg(pal, opts));

// ---- Campaign posters ----
const POSTERS = [
  ['poster-formal', 'charcoal', { cropCenter: 1.05, figureTilt: 1, labelText: 'Formal Wear' }],
  ['poster-luxury', 'ink', { cropCenter: 0.95, figureTilt: -2, labelText: 'Luxury Edit' }],
  ['poster-basics', 'ivory', { cropCenter: 1.12, figureTilt: 2, labelText: 'Basics' }],
  ['poster-summer', 'sand', { cropCenter: 1.0, figureTilt: -1, labelText: 'Summer' }],
  ['poster-denim', 'denim', { cropCenter: 1.2, figureTilt: 0, labelText: 'Denim' }],
  ['poster-travel', 'sage', { cropCenter: 0.92, figureTilt: 1, labelText: 'Travel' }],
  ['poster-shoes', 'stone', { cropCenter: 1.08, figureTilt: -2, labelText: 'Shoes' }],
  ['poster-plus', 'clay', { cropCenter: 1.0, figureTilt: 0, labelText: 'Plus Size' }],
];
for (const [name, pal, opts] of POSTERS) emit(`posters/${name}.svg`, personSvg(pal, opts));

// ---- Full width banner ----
emit(
  'campaigns/banner-sale.svg',
  bannerSvg('charcoal', { eyebrow: 'Last Chance', title: 'UP TO 30% OFF', sub: 'The season sale — ends soon' })
);

// ---- Featured category cards (person + product) ----
const CATEGORIES = [
  ['shirts', 'shirt', 'sand'],
  ['tshirts', 'tshirt', 'ivory'],
  ['jeans', 'jeans', 'denim'],
  ['trousers', 'trousers', 'sage'],
  ['cargos', 'cargo', 'stone'],
  ['shoes', 'shoes', 'charcoal'],
  ['shorts', 'shorts', 'ivory'],
  ['plus-size', 'plustee', 'clay'],
  ['perfumes', 'perfumebottle', 'ink'],
  ['overshirt', 'overshirt', 'sand'],
];
const PERSON_OPTS = {
  shirts: { cropCenter: 1.05, figureTilt: 0, labelText: 'Shirts' },
  tshirts: { cropCenter: 1.12, figureTilt: -1, labelText: 'T-Shirts' },
  jeans: { cropCenter: 1.0, figureTilt: 1, labelText: 'Jeans' },
  trousers: { cropCenter: 1.08, figureTilt: -2, labelText: 'Trousers' },
  cargos: { cropCenter: 1.15, figureTilt: 2, labelText: 'Cargos' },
  shoes: { cropCenter: 0.95, figureTilt: 0, labelText: 'Shoes' },
  shorts: { cropCenter: 1.1, figureTilt: 1, labelText: 'Shorts' },
  'plus-size': { cropCenter: 1.0, figureTilt: 0, labelText: 'Plus Size' },
  perfumes: { cropCenter: 1.05, figureTilt: -1, labelText: 'Perfumes' },
  overshirt: { cropCenter: 1.02, figureTilt: 2, labelText: 'Overshirt' },
};
for (const [name, glyph, pal] of CATEGORIES) {
  emit(`categories/${name}-person.svg`, personSvg(pal, PERSON_OPTS[name]));
  emit(`categories/${name}-product.svg`, productSvg(glyph, pal));
}

console.log(`Generated ${files.length} assets under public/assets/home/`);
