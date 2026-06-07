const fs = require('fs');
const path = require('path');
const { PNG } = require('../apps/mobile/node_modules/pngjs');

const root = path.join(__dirname, '..');
const mobileRoot = path.join(root, 'apps', 'mobile');
const assetRoot = path.join(mobileRoot, 'assets');
const storeRoot = path.join(assetRoot, 'store');
const screenshotRoot = path.join(storeRoot, 'screenshots');

const colors = {
  navy: [15, 23, 42, 255],
  slate: [30, 41, 59, 255],
  panel: [17, 24, 39, 255],
  panel2: [31, 41, 55, 255],
  green: [34, 197, 94, 255],
  cyan: [34, 211, 238, 255],
  blue: [59, 130, 246, 255],
  violet: [139, 92, 246, 255],
  amber: [245, 158, 11, 255],
  red: [239, 68, 68, 255],
  white: [248, 250, 252, 255],
  muted: [148, 163, 184, 255],
  transparent: [0, 0, 0, 0],
};

const font = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['11111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '#': ['01010', '11111', '01010', '01010', '11111', '01010', '00000'],
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function createPng(width, height, color = colors.transparent) {
  const png = new PNG({ width, height });
  fillRect(png, 0, 0, width, height, color);
  return png;
}

function blend(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ];
}

function setPixel(png, x, y, color) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const index = (png.width * y + x) << 2;
  png.data[index] = color[0];
  png.data[index + 1] = color[1];
  png.data[index + 2] = color[2];
  png.data[index + 3] = color[3];
}

function fillRect(png, x, y, width, height, color) {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(png.width, Math.ceil(x + width));
  const bottom = Math.min(png.height, Math.ceil(y + height));
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      setPixel(png, px, py, color);
    }
  }
}

function fillGradient(png, topColor, bottomColor) {
  for (let y = 0; y < png.height; y += 1) {
    const color = blend(topColor, bottomColor, y / Math.max(1, png.height - 1));
    fillRect(png, 0, y, png.width, 1, color);
  }
}

function fillCircle(png, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(png, x, y, color);
    }
  }
}

function roundedRect(png, x, y, width, height, radius, color) {
  fillRect(png, x + radius, y, width - radius * 2, height, color);
  fillRect(png, x, y + radius, width, height - radius * 2, color);
  fillCircle(png, x + radius, y + radius, radius, color);
  fillCircle(png, x + width - radius, y + radius, radius, color);
  fillCircle(png, x + radius, y + height - radius, radius, color);
  fillCircle(png, x + width - radius, y + height - radius, radius, color);
}

function strokeRect(png, x, y, width, height, thickness, color) {
  fillRect(png, x, y, width, thickness, color);
  fillRect(png, x, y + height - thickness, width, thickness, color);
  fillRect(png, x, y, thickness, height, color);
  fillRect(png, x + width - thickness, y, thickness, height, color);
}

function drawText(png, text, x, y, scale, color) {
  let cursor = x;
  const chars = String(text).toUpperCase().split('');
  for (const ch of chars) {
    const rows = font[ch] || font[' '];
    for (let row = 0; row < rows.length; row += 1) {
      for (let col = 0; col < rows[row].length; col += 1) {
        if (rows[row][col] === '1') {
          fillRect(png, cursor + col * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cursor += 6 * scale;
  }
}

function textWidth(text, scale) {
  return String(text).length * 6 * scale;
}

function centeredText(png, text, y, scale, color) {
  drawText(png, text, Math.round((png.width - textWidth(text, scale)) / 2), y, scale, color);
}

function drawLogoMark(png, cx, cy, size) {
  const unit = size / 18;
  roundedRect(png, cx - size / 2, cy - size / 2, size, size, Math.round(size * 0.18), [22, 31, 50, 255]);
  strokeRect(png, cx - size / 2, cy - size / 2, size, size, Math.max(2, Math.round(unit)), [51, 65, 85, 255]);
  fillRect(png, cx - unit * 5, cy + unit * 2, unit * 3, unit * 5, colors.green);
  fillRect(png, cx - unit, cy - unit * 4, unit * 3, unit * 11, colors.cyan);
  fillRect(png, cx + unit * 4, cy - unit * 7, unit * 3, unit * 14, colors.blue);
  fillCircle(png, cx + unit * 5.5, cy - unit * 8.5, unit * 2.2, colors.amber);
  fillRect(png, cx - unit * 7, cy + unit * 8, unit * 14, unit * 1.3, colors.violet);
}

function savePng(relativePath, png) {
  const fullPath = path.join(root, relativePath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, PNG.sync.write(png));
}

function drawIcon() {
  const png = createPng(1024, 1024, colors.navy);
  fillGradient(png, [17, 24, 39, 255], [23, 37, 84, 255]);
  fillCircle(png, 775, 190, 140, [34, 197, 94, 70]);
  fillCircle(png, 245, 780, 190, [59, 130, 246, 60]);
  roundedRect(png, 192, 192, 640, 640, 150, [15, 23, 42, 245]);
  strokeRect(png, 192, 192, 640, 640, 10, [51, 65, 85, 255]);
  drawLogoMark(png, 512, 462, 300);
  centeredText(png, 'LEWORD', 708, 18, colors.white);
  return png;
}

function drawAdaptiveIcon() {
  const png = createPng(1024, 1024, colors.transparent);
  drawLogoMark(png, 512, 455, 430);
  centeredText(png, 'LEWORD', 725, 18, colors.white);
  return png;
}

function drawSplash() {
  const png = createPng(1242, 1242, colors.transparent);
  drawLogoMark(png, 621, 540, 300);
  centeredText(png, 'LEWORD', 760, 30, colors.white);
  centeredText(png, 'MOBILE', 850, 18, colors.muted);
  return png;
}

function drawFeatureGraphic() {
  const png = createPng(1024, 500, colors.navy);
  fillGradient(png, [15, 23, 42, 255], [22, 78, 99, 255]);
  fillCircle(png, 880, 80, 180, [34, 197, 94, 60]);
  drawLogoMark(png, 165, 250, 170);
  drawText(png, 'LEWORD MOBILE', 300, 150, 22, colors.white);
  drawText(png, 'PC GRADE KEYWORD WORKERS', 305, 245, 10, colors.muted);
  roundedRect(png, 310, 315, 470, 62, 18, [34, 197, 94, 255]);
  drawText(png, 'FAST MOBILE RESULTS', 340, 336, 8, colors.navy);
  return png;
}

function drawPhoneChrome(png, title, subtitle) {
  fillGradient(png, [15, 23, 42, 255], [30, 41, 59, 255]);
  roundedRect(png, 64, 72, 1162, 2650, 60, [17, 24, 39, 255]);
  strokeRect(png, 64, 72, 1162, 2650, 4, [51, 65, 85, 255]);
  fillRect(png, 64, 72, 1162, 190, [15, 23, 42, 255]);
  drawText(png, 'LEWORD', 120, 128, 14, colors.white);
  roundedRect(png, 905, 125, 220, 56, 22, [22, 163, 74, 255]);
  drawText(png, 'SERVER', 940, 145, 6, colors.white);
  centeredText(png, title, 330, 14, colors.white);
  centeredText(png, subtitle, 435, 7, colors.muted);
}

function drawMetricCard(png, x, y, w, h, label, value, accent) {
  roundedRect(png, x, y, w, h, 28, colors.panel2);
  drawText(png, label, x + 32, y + 34, 6, colors.muted);
  drawText(png, value, x + 32, y + 95, 14, accent);
}

function drawScreenshot(name, mode) {
  const png = createPng(1290, 2796, colors.navy);
  const titles = {
    home: ['CATEGORY HUNT', 'ONE TOPIC DEEP HUNT'],
    progress: ['SERVER QUEUE', 'LIVE PC WORKERS'],
    results: ['SSS RESULTS', 'MEASURED METRICS'],
    mindmap: ['MINDMAP EXPAND', 'LINKED ARTICLE IDEAS'],
    inbox: ['TODAY INBOX', 'FRESH WINS READY'],
  };
  drawPhoneChrome(png, titles[mode][0], titles[mode][1]);

  if (mode === 'home') {
    const names = ['POLICY', 'CELEB', 'FINANCE', 'HEALTH', 'EDU', 'IT'];
    for (let i = 0; i < names.length; i += 1) {
      const x = 118 + (i % 2) * 540;
      const y = 610 + Math.floor(i / 2) * 230;
      roundedRect(png, x, y, 500, 170, 30, i === 0 ? [34, 197, 94, 255] : colors.panel2);
      drawText(png, names[i], x + 42, y + 62, 12, i === 0 ? colors.navy : colors.white);
    }
    roundedRect(png, 118, 1450, 1054, 150, 36, colors.violet);
    drawText(png, 'START GOLDEN HUNT', 275, 1500, 14, colors.white);
  }

  if (mode === 'progress') {
    drawMetricCard(png, 118, 610, 320, 190, 'QUEUE', '03', colors.cyan);
    drawMetricCard(png, 485, 610, 320, 190, 'SSS', '27', colors.green);
    drawMetricCard(png, 852, 610, 320, 190, 'ETA', '42S', colors.amber);
    roundedRect(png, 118, 920, 1054, 82, 38, [51, 65, 85, 255]);
    roundedRect(png, 118, 920, 780, 82, 38, colors.green);
    for (let i = 0; i < 6; i += 1) {
      roundedRect(png, 118, 1090 + i * 185, 1054, 125, 24, colors.panel2);
      drawText(png, `WORKER ${i + 1} VERIFIED`, 160, 1130 + i * 185, 8, colors.muted);
    }
  }

  if (mode === 'results') {
    const grades = ['SSS', 'SSS', 'SSS', 'S+'];
    for (let i = 0; i < grades.length; i += 1) {
      const y = 610 + i * 260;
      roundedRect(png, 118, y, 1054, 205, 26, colors.panel2);
      roundedRect(png, 160, y + 45, 150, 52, 18, i < 3 ? colors.red : colors.green);
      drawText(png, grades[i], 188, y + 61, 7, colors.white);
      drawText(png, `KEYWORD ${i + 1}`, 350, y + 50, 10, colors.white);
      drawText(png, 'VOL 12800  DOC 940', 350, y + 120, 6, colors.muted);
    }
  }

  if (mode === 'mindmap') {
    fillCircle(png, 645, 980, 135, colors.violet);
    centeredText(png, 'SEED', 945, 10, colors.white);
    const nodes = [
      [300, 760, 'HOW TO'],
      [940, 760, 'PRICE'],
      [300, 1240, 'BENEFIT'],
      [940, 1240, 'DATE'],
      [645, 1510, 'FAQ'],
    ];
    nodes.forEach(([x, y, label]) => {
      fillRect(png, Math.min(x, 645), Math.min(y, 980), Math.abs(x - 645) + 4, 4, [71, 85, 105, 255]);
      roundedRect(png, x - 145, y - 58, 290, 116, 28, colors.panel2);
      drawText(png, label, x - 95, y - 18, 8, colors.white);
    });
  }

  if (mode === 'inbox') {
    for (let i = 0; i < 5; i += 1) {
      const y = 600 + i * 255;
      roundedRect(png, 118, y, 1054, 200, 28, colors.panel2);
      drawText(png, i === 0 ? 'FRESH SSS' : 'RECOMMEND', 160, y + 38, 8, i === 0 ? colors.green : colors.cyan);
      drawText(png, `IDEA ${i + 1}`, 160, y + 98, 12, colors.white);
      drawText(png, 'PREWARMED BY SERVER', 160, y + 156, 6, colors.muted);
      roundedRect(png, 970, y + 62, 135, 72, 22, colors.green);
      drawText(png, 'OPEN', 995, y + 86, 6, colors.navy);
    }
  }

  savePng(`apps/mobile/assets/store/screenshots/${name}.png`, png);
}

function main() {
  ensureDir(assetRoot);
  ensureDir(storeRoot);
  ensureDir(screenshotRoot);

  savePng('apps/mobile/assets/icon.png', drawIcon());
  savePng('apps/mobile/assets/adaptive-icon.png', drawAdaptiveIcon());
  savePng('apps/mobile/assets/splash.png', drawSplash());
  savePng('apps/mobile/assets/store/feature-graphic.png', drawFeatureGraphic());

  drawScreenshot('01-category-hunt', 'home');
  drawScreenshot('02-server-progress', 'progress');
  drawScreenshot('03-sss-results', 'results');
  drawScreenshot('04-mindmap-expand', 'mindmap');
  drawScreenshot('05-recommendation-inbox', 'inbox');

  console.log('[mobile-generate-assets] wrote mobile app and store PNG assets');
}

if (require.main === module) {
  main();
}
