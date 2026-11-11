// ───────── Figma 플러그인: deck → 슬라이드 ─────────
// 원칙: 흰 배경·검은 글씨, 색은 노랑(형광펜)·빨강(작은 표시) 두 가지만,
// 반복 머리글/바닥글 없음, 페이지 번호만, 읽는 순서(왼→오, 위→아래)대로 배치.

figma.showUI(__html__, { width: 440, height: 700, themeColors: true });

var W = 1920, H = 1080;
var MX = 120, TOP = 104, BOTTOM = 120, CW = W - MX * 2;

var TH = { bg: '#FFFFFF', text: '#111111', sub: '#505055', line: '#E2E2DF', ph: '#EFEFED' };
var STYLE_W = {
  'Thin': 100, 'ExtraLight': 200, 'Extra Light': 200, 'Light': 300, 'Regular': 400, 'Medium': 500,
  'SemiBold': 600, 'Semi Bold': 600, 'Bold': 700, 'ExtraBold': 800, 'Extra Bold': 800, 'Black': 900
};
var C = null;

function rgb(hex) {
  var h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}
function solid(hex, opacity) { var p = { type: 'SOLID', color: rgb(hex) }; if (opacity !== undefined) p.opacity = opacity; return [p]; }
function pick(v, d) { return v === undefined || v === null ? d : v; }
function arr(v) { return v ? (Array.isArray(v) ? v : [v]) : []; }
function pad(n) { return n < 10 ? '0' + n : String(n); }
function item(it) {
  if (typeof it === 'string') return { head: it, body: '' };
  return { head: it.head || it.title || it.label || '', body: it.body || it.desc || it.note || '' };
}

// ───────── 폰트 ─────────
async function resolveFont(pref) {
  var list = await figma.listAvailableFontsAsync();
  var fams = {};
  list.forEach(function (f) { (fams[f.fontName.family] = fams[f.fontName.family] || []).push(f.fontName.style); });
  var cands = [pref, 'Pretendard', 'Pretendard Variable', 'SUIT', 'Noto Sans KR', 'Spoqa Han Sans Neo', 'Inter'];
  for (var i = 0; i < cands.length; i++) {
    var fam = cands[i];
    if (!fam || !fams[fam]) continue;
    var map = {};
    fams[fam].forEach(function (s) { if (STYLE_W[s] !== undefined) map[STYLE_W[s]] = s; });
    if (!map[400]) continue;
    var font = { family: fam, map: map };
    // fn()은 굵게 처리 시 weight+200(최대 900)까지 요청하므로 매핑된 굵기를 전부 로드
    var need = Object.keys(map).map(function (w) { return map[w]; });
    for (var j = 0; j < need.length; j++) await figma.loadFontAsync({ family: fam, style: need[j] });
    return font;
  }
  throw new Error('사용 가능한 폰트를 찾지 못했습니다.');
}
function styleFor(font, w) {
  var best = null, bd = 1e9;
  Object.keys(font.map).forEach(function (k) {
    var d = Math.abs(Number(k) - w) + (Number(k) < w ? 0.5 : 0);
    if (d < bd) { bd = d; best = font.map[k]; }
  });
  return best;
}
function fn(w) { return { family: C.font.family, style: styleFor(C.font, w) }; }

// ───────── 글자 너비 측정 (줄바꿈·형광펜 위치 계산용) ─────────
function measure(str, size, weight, ls) {
  if (!str) return 0;
  var key = size + '|' + weight + '|' + ls + '|' + str;
  if (C.mcache[key] !== undefined) return C.mcache[key];
  var m = C.meter;
  m.fontName = fn(weight);
  m.fontSize = size;
  m.letterSpacing = { unit: 'PERCENT', value: ls };
  m.characters = str;
  return (C.mcache[key] = m.width);
}

// 직접 줄바꿈: 한국어 단어 단위(어절)로 끊어 Figma의 글자 단위 줄바꿈을 막습니다.
function wrap(text, size, weight, ls, width) {
  var lines = [], p0 = 0;
  text.split('\n').forEach(function (para) {
    var cur = null, re = /\S+/g, m;
    if (!para.trim()) lines.push([p0, p0]);
    while ((m = re.exec(para))) {
      var ws = p0 + m.index, we = ws + m[0].length;
      var cand = cur ? [cur[0], we] : [ws, we];
      if (measure(text.slice(cand[0], cand[1]), size, weight, ls) <= width) { cur = cand; continue; }
      if (cur) lines.push(cur);
      if (measure(text.slice(ws, we), size, weight, ls) <= width) { cur = [ws, we]; continue; }
      var s = ws;
      for (var k = ws + 1; k <= we; k++) {
        if (measure(text.slice(s, k), size, weight, ls) > width && k - 1 > s) { lines.push([s, k - 1]); s = k - 1; }
      }
      cur = [s, we];
    }
    if (cur) lines.push(cur);
    p0 += para.length + 1;
  });
  return lines;
}

// 텍스트: **굵게**, ==형광펜==
function txt(parent, s, o) {
  var raw = String(s === undefined || s === null ? '' : s).replace(/`([^`]*)`/g, '$1');
  var marks = [], text = '', re = /(\*\*|==)(.+?)\1/g, last = 0, m;
  while ((m = re.exec(raw))) {
    text += raw.slice(last, m.index);
    marks.push({ kind: m[1] === '**' ? 'bold' : 'hl', a: text.length, b: text.length + m[2].length });
    text += m[2];
    last = m.index + m[0].length;
  }
  text += raw.slice(last);

  var weight = pick(o.weight, 400);
  var size = o.size;
  var lh = pick(o.lh, size >= 44 ? 130 : 150);
  var ls = pick(o.ls, size >= 44 ? -2 : -1);
  var width = o.w ? o.w : 1e6;
  var min = pick(o.min, Math.round(size * 0.75));
  var lines;
  while (true) {
    lines = wrap(text, size, weight, ls, width * 0.97);
    if (!o.maxH || lines.length * size * lh / 100 <= o.maxH || size <= min) break;
    size -= 2;
  }
  if (o.maxH && lines.length * size * lh / 100 > o.maxH + 1) C.warn('글이 칸을 넘칩니다 — "' + text.slice(0, 16) + '…" 를 줄이세요');

  var outStarts = [], out = '';
  lines.forEach(function (l, i) { if (i) out += '\n'; outStarts.push(out.length); out += text.slice(l[0], l[1]); });
  function segs(a, b) {
    var r = [];
    lines.forEach(function (l, i) {
      var s0 = Math.max(a, l[0]), s1 = Math.min(b, l[1]);
      if (s1 > s0) r.push({ line: i, a: s0 - l[0], b: s1 - l[0], o0: outStarts[i] + s0 - l[0], o1: outStarts[i] + s1 - l[0] });
    });
    return r;
  }

  var t = figma.createText();
  t.fontName = fn(weight);
  t.characters = out || ' ';
  t.fontSize = size;
  t.fills = solid(o.color || TH.text);
  t.lineHeight = { unit: 'PERCENT', value: lh };
  t.letterSpacing = { unit: 'PERCENT', value: ls };
  if (o.align) t.textAlignHorizontal = o.align;
  parent.appendChild(t);
  if (o.w) { t.resize(o.w, Math.max(t.height, 10)); t.textAutoResize = 'HEIGHT'; }
  else t.textAutoResize = 'WIDTH_AND_HEIGHT';
  if (!parent.layoutMode || parent.layoutMode === 'NONE') {
    t.x = Math.round(o.x || 0);
    t.y = Math.round(o.y || 0);
  }

  // paper: 굵게 = 남색 글자, 형광펜 = 주황 글자 (흰 바탕 글자에만)
  var ink = C.paper && (!o.color || o.color === TH.text);
  marks.forEach(function (mk) {
    segs(mk.a, mk.b).forEach(function (sg) {
      if (mk.kind === 'bold') {
        t.setRangeFontName(sg.o0, sg.o1, fn(Math.max(weight + 200, 700)));
        if (ink) t.setRangeFills(sg.o0, sg.o1, solid(C.pt));
      } else if (C.paper) {
        t.setRangeFontName(sg.o0, sg.o1, fn(Math.max(weight + 200, 700)));
        if (ink) t.setRangeFills(sg.o0, sg.o1, solid(C.hl));
      } else {
        t.setRangeFontName(sg.o0, sg.o1, fn(Math.max(weight, 600)));
        var lt = text.slice(lines[sg.line][0], lines[sg.line][1]);
        C.hls.push({ t: t, line: sg.line, x0: measure(lt.slice(0, sg.a), size, weight, ls),
          w: measure(lt.slice(sg.a, sg.b), size, Math.max(weight, 600), ls),
          lw: measure(lt, size, weight, ls), size: size, lhPx: size * lh / 100 });
      }
    });
  });
  return t;
}

// 형광펜: 글자 아래쪽 절반을 노랑으로 (레이아웃이 끝난 뒤 최종 위치에 그림)
function paintHighlights(f) {
  C.hls.forEach(function (h) {
    var t = h.t;
    if (!alive(t)) return;            // 크기 맞추기용으로 그렸다 지운 글자(또는 그 안의 글자)
    var par = t.parent;
    // 슬라이드 안(도식 프레임 포함)의 글자만, 자동 레이아웃 상자 안은 굵게만
    var up = par; while (up && up !== f) up = up.parent;
    if (!up || (par.layoutMode && par.layoutMode !== 'NONE')) return;
    var off = t.textAlignHorizontal === 'RIGHT' ? t.width - h.lw : t.textAlignHorizontal === 'CENTER' ? (t.width - h.lw) / 2 : 0;
    var padX = h.size * 0.08;
    var r = figma.createRectangle();
    r.resize(Math.round(h.w + padX * 2), Math.round(h.size * 0.52));
    r.x = Math.round(t.x + off + h.x0 - padX);
    r.y = Math.round(t.y + h.line * h.lhPx + h.lhPx / 2 - h.size * 0.12);
    r.fills = solid(C.hl, 0.6);
    r.name = 'highlight';
    par.insertChild(par.children.indexOf(t), r);
  });
  C.hls = [];
}

// 노드와 그 조상이 아직 문서에 있는지 (지워진 노드의 parent를 읽으면 Figma가 오류를 냄)
function alive(n) {
  try {
    while (n) {
      if (n.removed) return false;
      if (n.type === 'PAGE' || n.type === 'DOCUMENT') return true;
      n = n.parent;
    }
  } catch (e) { return false; }
  return false;
}

function rect(parent, x, y, w, h, color, radius, opacity) {
  var r = figma.createRectangle();
  r.resize(Math.max(1, w), Math.max(1, h));
  r.x = Math.round(x); r.y = Math.round(y);
  r.fills = solid(color, opacity);
  if (radius) r.cornerRadius = radius;
  parent.appendChild(r);
  return r;
}

// ───────── paper(논문 발표형) 장식 ─────────
var PAPER = { soft: '#ECEEF2', decor: '#F3F5F8', white: '#FFFFFF', bar: 34, head: 140, foot: 36 };

function grad(hex) {
  var c = rgb(hex), k = 0.72;
  return [{ type: 'GRADIENT_LINEAR', gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [
    { position: 0, color: { r: c.r * k, g: c.g * k, b: c.b * k, a: 1 } },
    { position: 0.5, color: { r: c.r, g: c.g, b: c.b, a: 1 } },
    { position: 1, color: { r: c.r * k, g: c.g * k, b: c.b * k, a: 1 } }] }];
}
function bar(f, x, y, w, h) { var r = rect(f, x, y, w, h, C.pt); r.fills = grad(C.pt); r.name = 'bar'; return r; }

// 옅은 회색 원 (배경 장식, 잠금)
function decor(f) {
  [[230, 470, 110], [1440, 920, 80], [1310, 380, 42], [620, 1010, 52]].forEach(function (p) {
    var e = figma.createEllipse(); f.appendChild(e);
    e.resize(p[2] * 2, p[2] * 2); e.x = p[0] - p[2]; e.y = p[1] - p[2];
    e.fills = solid(PAPER.decor); e.name = 'decor'; e.locked = true;
  });
}

// 좌상단 덱 제목 + 부제
function deckBlock(f, x, y) {
  if (!C.deckTitle) return;
  var a = txt(f, C.deckTitle, { size: 30, weight: 700, x: x, y: y, w: 640, lh: 135, ls: -1, maxH: 90, min: 22 });
  if (C.deckSub) txt(f, C.deckSub, { size: 16, color: TH.sub, x: x, y: a.y + a.height + 16, w: 760, ls: 0, maxH: 50 });
}

// 내용 슬라이드 머리: 남색 띠 [n-k. 제목 | 덱 제목] → 핵심 메시지
function paperTitle(f, s, o) {
  var HB = PAPER.head;
  bar(f, 0, 0, W, HB);
  rect(f, 52, 0, 18, HB - 30, PAPER.white);
  C.framed = true;
  var right = W - 72, tx = 110, tw = right - tx;
  if (C.deckTitle) {
    var dk = txt(f, C.deckTitle, { size: 28, weight: 700, color: PAPER.white, w: 720, align: 'RIGHT', ls: 0, maxH: 80, min: 20 });
    dk.x = right - 720; dk.y = Math.round((HB - dk.height) / 2);
    dk.textDecoration = 'UNDERLINE';
    tw = dk.x - tx - 48;
  }
  if (!s.title) return HB + 40;
  var label = C.sec && !o.noSec ? C.sec.n + '-' + C.sec.k + '. ' + s.title : s.title;
  var t = txt(f, label, { size: 40, weight: 700, color: PAPER.white, x: tx, y: 0, w: tw, maxH: 110, min: 28 });
  t.y = Math.round((HB - t.height) / 2);
  var y = HB + 20;
  if (s.lead) {
    var ld = txt(f, s.lead, { size: 30, weight: 600, color: C.pt, x: MX, y: HB + 44, w: CW, maxH: 100, min: 24, lh: 145 });
    y = ld.y + ld.height;
  }
  if (s.sub) {
    var st = txt(f, s.sub, { size: 26, color: TH.sub, x: MX, y: y + 14, w: CW, maxH: 90 });
    y = st.y + st.height;
  }
  return y;
}

// 머리: [큰 흐름 = 섹션 번호·이름] → [세부 제목] → [핵심 메시지] → 구분선
function title(f, s, o) {
  o = o || {};
  if (C.paper) return paperTitle(f, s, o);
  var x = pick(o.x, MX), w = pick(o.w, CW);
  if (C.sec && !o.noSec && s.title) {
    var n = txt(f, pad(C.sec.n), { size: 22, weight: 700, color: C.pt, x: x, y: 56, ls: 0 });
    txt(f, C.sec.title, { size: 22, weight: 600, color: TH.sub, x: x + n.width + 14, y: 56, ls: 0 });
  }
  if (!s.title) return TOP;
  var t = txt(f, s.title, { size: C.report ? 46 : 52, weight: 700, x: x, y: TOP, w: w, maxH: 130, min: 36 });
  var y = t.y + t.height;
  if (s.lead) {
    var ld = txt(f, s.lead, { size: 30, weight: 500, x: x, y: y + 20, w: w, maxH: 100, min: 24, lh: 145 });
    y = ld.y + ld.height;
  }
  if (s.sub) {
    var st = txt(f, s.sub, { size: 28, color: TH.sub, x: x, y: y + 16, w: w, maxH: 90 });
    y = st.y + st.height;
  }
  if (C.report && !o.noRule) { rect(f, x, y + 28, w, 1, TH.line); y += 29; }
  return y;
}

function behind(f, node, newNode) { f.insertChild(f.children.indexOf(node), newNode); }

function vcenter(f, from, top, bottom) {
  var nodes = f.children.slice(from);
  if (!nodes.length) return;
  var minY = 1e9, maxY = -1e9;
  nodes.forEach(function (n) { minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + n.height); });
  var dy = Math.round((top + bottom) / 2 - (minY + maxY) / 2 - 24);
  if (minY + dy < top) dy = top - minY;
  if (dy > 0) nodes.forEach(function (n) { n.y = n.y + dy; });
}

// ───────── 이미지 ─────────
function normName(n) { return String(n).toLowerCase().replace(/^.*[\\/]/, ''); }
function stripExt(n) { return n.replace(/\.[a-z0-9]+$/, ''); }

async function getImage(ref) {
  if (!ref) return null;
  var src = typeof ref === 'string' ? ref : ref.src;
  if (!src) return null;
  if (C.cache[src]) return C.cache[src];
  var img = null;
  try {
    if (/^https?:\/\//i.test(src)) img = await figma.createImageAsync(src);
    else {
      var key = normName(src), hit = null;
      if (key === 'auto') hit = C.files.filter(function (f) { return !f.used; })[0] || null;
      else hit = C.files.filter(function (f) { return f.key === key; })[0] ||
                 C.files.filter(function (f) { return stripExt(f.key) === stripExt(key); })[0] || null;
      if (hit) { hit.used = true; img = figma.createImage(hit.bytes); }
    }
  } catch (e) { C.warn('사진을 불러오지 못했습니다: ' + src + ' (' + e.message + ')'); img = null; }
  if (!img) C.warn('사진 없음: ' + src + ' — 회색 자리표시로 넣었습니다');
  if (src !== 'auto') C.cache[src] = img;
  return img;
}

// 기본: 사진은 꽉 채움, png(차트·스크린샷)·fit:contain 은 잘리지 않게
async function photo(f, ref, x, y, w, h, o) {
  o = o || {};
  var r = figma.createRectangle();
  r.resize(Math.round(w), Math.round(h));
  r.x = Math.round(x); r.y = Math.round(y);
  r.cornerRadius = pick(o.radius, C.radius);
  f.appendChild(r);
  var src = ref && (typeof ref === 'string' ? ref : ref.src);
  var fit = (ref && typeof ref === 'object' && ref.fit) || o.fit || (/\.(png|svg)$/i.test(src || '') ? 'contain' : 'cover');
  var img = await getImage(ref);
  if (img) {
    r.fills = [{ type: 'SOLID', color: rgb(TH.bg) }, { type: 'IMAGE', imageHash: img.hash, scaleMode: fit === 'contain' ? 'FIT' : 'FILL' }];
  } else {
    r.fills = solid(TH.ph);
    var t = txt(f, '[ ' + (src || '이미지') + ' ]', { size: 22, color: TH.sub });
    t.x = Math.round(x + (w - t.width) / 2); t.y = Math.round(y + (h - t.height) / 2);
  }
  r.name = 'photo';
  return r;
}
function caption(f, s, x, y, w) { return s ? txt(f, s, { size: 22, color: TH.sub, x: x, y: y, w: w, maxH: 64 }) : null; }

// ───────── 레이아웃 ─────────
var L = {};

// paper 표지·마무리: 오른쪽 위 세로 띠, 왼쪽 아래 가로 띠, 가운데 제목, 아래 로고
async function paperEnds(f, s, closing) {
  bar(f, W - 336, 0, PAPER.bar, Math.round(H * 0.46));
  bar(f, 0, Math.round(H * 0.82), Math.round(W * 0.59), PAPER.bar);
  if (closing) {
    deckBlock(f, MX, 96);
    if (C.date) { var d = txt(f, C.date, { size: 20, color: TH.sub, ls: 0 }); d.x = W - 420 - d.width; d.y = 104; }
  }
  var cw = 1400, cx = (W - cw) / 2;
  var t = txt(f, s.title || (closing ? '감사합니다' : ''), { size: closing ? 96 : 76, weight: 700, x: cx, y: 0, w: cw, align: 'CENTER', maxH: 280, min: 52 });
  var st = s.sub ? txt(f, s.sub, { size: 30, color: TH.sub, x: cx, y: 0, w: cw, align: 'CENTER', maxH: 120 }) : null;
  var y0 = Math.round(H * 0.47 - (t.height + (st ? 24 + st.height : 0)) / 2);
  t.y = y0; if (st) st.y = y0 + t.height + 24;
  if (s.meta) txt(f, s.meta, { size: 26, weight: 500, x: cx, y: Math.round(H * 0.68), w: cw, align: 'CENTER', ls: 0 });
  if (s.image) await photo(f, s.image, (W - 360) / 2, Math.round(H * 0.82) + 70, 360, 110, { fit: 'contain', radius: 0 });
}

// paper 목차: 왼쪽 "Contents", 오른쪽 섹션 ─── 세부 제목
async function paperAgenda(f, s) {
  bar(f, 440, 0, PAPER.bar, 300);
  var ct = txt(f, s.title || 'Contents', { size: 84, weight: 600, ls: -3 });
  ct.x = Math.round(474 - ct.width / 2); ct.y = Math.round(400 - ct.height / 2);
  deckBlock(f, 820, 52);
  bar(f, 820, 216, PAPER.bar, H - 216);
  var secs = C.sections, lines = 0;
  secs.forEach(function (x) { lines += Math.max(1, x.items.length); });
  var top = 250, avail = H - top - 40;
  var k = Math.min(1, avail / (lines * 52 + secs.length * 30));
  var lh = Math.round(52 * k), sz = Math.round(28 * Math.max(k, 0.75)), gap = Math.round(30 * k), y = top;
  var nx = 900, dx2 = 1340, ix = 1390;
  secs.forEach(function (x, i) {
    var n = txt(f, (i + 1) + '. ' + x.title, { size: Math.round(40 * Math.max(k, 0.8)), weight: 700, x: nx, y: y, w: dx2 - nx - 40, ls: -1 });
    if (x.items.length) {
      var ly = Math.round(y + n.height / 2);
      vec(f, [[nx + measureW(n) + 24, ly], [dx2, ly]], false, { stroke: '#A3A7AE', weight: 1.5, dash: [3, 4], name: 'dots' });
    }
    x.items.forEach(function (it, j) {
      txt(f, (i + 1) + '.' + (j + 1) + ' ' + it, { size: sz, color: '#333338', x: ix, y: y + j * lh + Math.round((n.height - sz * 1.5) / 2), w: W - ix - 60, ls: -1, maxH: lh, min: 18 });
    });
    y += Math.max(1, x.items.length) * lh + gap;
  });
}
function measureW(t) { return Math.min(t.width, measure(t.characters, t.fontSize, 700, -1)); }

// paper 섹션: 좌상단 덱 제목, 왼쪽 세로 띠, 오른쪽 "1. 서론 / Introduction ━━━ / 세부 제목"
async function paperSection(f, s, n, items) {
  deckBlock(f, MX, 96);
  bar(f, 0, 252, PAPER.bar + 2, 296);
  var X = 800, w = W - X - MX;
  var t = txt(f, n + '. ' + (s.title || ''), { size: 76, weight: 700, x: X, y: 330, w: w, maxH: 200, min: 52 });
  var y = t.y + t.height;
  if (s.sub) { var st = txt(f, s.sub, { size: 60, weight: 500, x: X, y: y + 2, w: w, maxH: 150, min: 36 }); y = st.y + st.height; }
  bar(f, X - 10, y + 28, W - X + 4, PAPER.bar);
  y += 28 + PAPER.bar + 40;
  var lh = Math.min(50, Math.floor((H - 50 - y) / Math.max(1, items.length)));
  items.forEach(function (it, j) {
    txt(f, n + '-' + (j + 1) + ' ' + it, { size: Math.min(30, Math.round(lh * 0.62)), color: '#333338', x: X, y: y + j * lh, w: w, ls: -1 });
  });
}

L.cover = async function (f, s) {
  if (C.paper) return paperEnds(f, s, false);
  var hasImg = !!s.image;
  var tw = hasImg ? W / 2 - MX - 80 : 1400;
  if (hasImg) await photo(f, s.image, W / 2, 0, W / 2, H, { radius: 0, fit: 'cover' });
  var t = txt(f, s.title || '', { size: 72, weight: 700, x: MX, y: 0, w: tw, maxH: 300, min: 52 });
  var st = s.sub ? txt(f, s.sub, { size: 30, color: TH.sub, x: MX, y: 0, w: tw, maxH: 140 }) : null;
  var block = t.height + (st ? 28 + st.height : 0);
  var y0 = Math.round(H * 0.46 - block / 2);
  t.y = y0;
  if (st) st.y = y0 + t.height + 28;
  if (s.meta) txt(f, s.meta, { size: 24, color: TH.sub, x: MX, y: H - BOTTOM - 10, w: tw });
};

L.agenda = async function (f, s) {
  if (C.paper) return paperAgenda(f, s);
  var y = title(f, { title: s.title || '목차' }, { noSec: true });
  var items = arr(s.items).map(item);
  if (!items.length) items = C.sections.map(function (x) { return { head: x.title, body: x.sub || '' }; });
  var top = y + 72, from = f.children.length;
  var yy = top;
  items.forEach(function (it, i) {
    rect(f, MX, yy, CW, 1, TH.line);
    var num = txt(f, pad(i + 1), { size: 30, weight: 700, color: C.pt, x: MX, y: yy + 28 });
    var h = txt(f, it.head, { size: 34, weight: 700, x: MX + 96, y: yy + 26, w: 560, maxH: 100, min: 26 });
    var b = it.body ? txt(f, it.body, { size: 26, color: TH.sub, x: MX + 720, y: yy + 30, w: CW - 720, maxH: 90, min: 20 }) : null;
    yy += Math.max(h.height, b ? b.height : 0) + 56;
  });
  rect(f, MX, yy, CW, 1, TH.line);
  vcenter(f, from, top, H - BOTTOM);
};

L.section = async function (f, s) {
  if (C.paper) { ++C.section; return paperSection(f, s, s.number !== undefined ? s.number : C.section, C.sections[C.section - 1].items); }
  var n = s.number !== undefined ? s.number : pad(++C.section);
  var num = txt(f, String(n), { size: 30, weight: 600, color: C.pt, x: MX, y: 0 });
  var t = txt(f, s.title || '', { size: 64, weight: 700, x: MX, y: 0, w: 1400, maxH: 200, min: 48 });
  var st = s.sub ? txt(f, s.sub, { size: 30, color: TH.sub, x: MX, y: 0, w: 1200, maxH: 100 }) : null;
  var h = num.height + 20 + t.height + (st ? 24 + st.height : 0);
  var y = Math.round((H - h) / 2);
  num.y = y; t.y = y + num.height + 20;
  if (st) st.y = t.y + t.height + 24;
};

L.statement = async function (f, s) {
  var y0 = s.title && s.text && s.title !== s.text ? title(f, { title: s.title }) : TOP;
  var t = txt(f, s.text || s.title || '', { size: 56, weight: 700, x: MX, y: 0, w: 1440, maxH: 440, min: 44 });
  var st = s.sub ? txt(f, s.sub, { size: 28, color: TH.sub, x: MX, y: 0, w: 1200, maxH: 120 }) : null;
  var h = t.height + (st ? 36 + st.height : 0);
  var y = Math.max(y0 + 80, Math.round((H - h) / 2) - 20);
  t.y = y;
  if (st) st.y = y + t.height + 36;
};

L.bullets = async function (f, s) {
  var y = title(f, s);
  var items = arr(s.items).map(item);
  var cols = s.style === 'cols' || (s.style !== 'list' && items.length >= 2 && items.length <= 4 && items.every(function (i) { return i.body; }));
  var top = y + 96, avail = H - BOTTOM - top, from = f.children.length;
  if (cols) {
    var n = items.length, gap = 64, cw = (CW - gap * (n - 1)) / n;
    items.forEach(function (it, i) {
      var x = MX + i * (cw + gap);
      rect(f, x, top, cw, 2, TH.text);
      txt(f, pad(i + 1), { size: 24, weight: 600, color: C.pt, x: x, y: top + 32 });
      var h = txt(f, it.head, { size: 40, weight: 700, x: x, y: top + 82, w: cw, maxH: 120, min: 28 });
      if (it.body) txt(f, it.body, { size: 28, color: TH.sub, x: x, y: h.y + h.height + 18, w: cw, maxH: avail - 220, min: 22 });
    });
  } else {
    var hs = items.some(function (i) { return i.body; });
    var rows = items.map(function (it) {
      var g = { a: txt(f, it.head, { size: hs ? 40 : 42, weight: hs ? 600 : 500, x: MX + 44, y: 0, w: CW - 44, maxH: 120, min: 28 }) };
      if (it.body) g.b = txt(f, it.body, { size: 28, color: TH.sub, x: MX + 44, y: 0, w: CW - 44, maxH: 90, min: 22 });
      g.h = g.a.height + (g.b ? 10 + g.b.height : 0);
      return g;
    });
    var total = rows.reduce(function (a, r) { return a + r.h; }, 0);
    var gap = Math.min(60, Math.max(28, (avail - total) / Math.max(1, rows.length)));
    var yy = top;
    rows.forEach(function (g) {
      rect(f, MX + 4, yy + g.a.height / 2 - 4, 8, 8, C.pt, 4);
      g.a.y = yy;
      if (g.b) g.b.y = yy + g.a.height + 10;
      yy += g.h + gap;
    });
  }
  vcenter(f, from, top, H - BOTTOM);
};

// 숫자를 키우지 않습니다. 읽는 순서대로: 무엇(라벨) → 얼마(값) → 부연(설명)
L.stats = async function (f, s) {
  var y = title(f, s);
  var list = arr(s.items);
  var top = y + 88, from = f.children.length;
  var c1 = 560, c2 = 420, c3 = CW - c1 - c2;
  var hasNote = list.some(function (it) { return it.note; });
  var yy = top;
  list.forEach(function (it, i) {
    var hl = i === pick(s.highlight, -1);
    var val = String(pick(it.value, ''));
    var a = txt(f, it.label || '', { size: 36, weight: 600, x: MX, y: yy + 30, w: c1 - 40, maxH: 100, min: 26 });
    var b = txt(f, hl ? '==' + val + '==' : val, { size: 36, weight: hl ? 700 : 600, x: MX + c1, y: yy + 30, w: c2 - 40, maxH: 100, min: 26 });
    var c = it.note ? txt(f, it.note, { size: 26, color: TH.sub, x: MX + c1 + c2, y: yy + 30, w: c3, maxH: 100, min: 20 }) : null;
    var h = Math.max(a.height, b.height, c ? c.height : 0);
    // 행 안에서 글자 기준선 맞춤
    b.y = a.y + Math.round((a.height - b.height) / 2);
    if (c) c.y = a.y + Math.round((Math.min(a.height, 60) - Math.min(c.height, 40)) / 2);
    rect(f, MX, yy, CW, i ? 1 : 2, i ? TH.line : TH.text);
    yy += h + 60;
  });
  rect(f, MX, yy, CW, 1, TH.line);
  if (!hasNote) { /* 2열만 써도 왼쪽 정렬 유지 */ }
  vcenter(f, from, top - 16, H - BOTTOM);
};

L.steps = async function (f, s) {
  var y = title(f, s);
  var list = arr(s.items).map(item);
  var n = Math.max(1, list.length), gap = 48, cw = (CW - gap * (n - 1)) / n;
  var top = y + 120, from = f.children.length;
  rect(f, MX, top + 7, CW, 2, TH.line);
  list.forEach(function (it, i) {
    var x = MX + i * (cw + gap);
    rect(f, x, top, 16, 16, C.pt, 8);
    txt(f, pad(i + 1), { size: 24, weight: 600, color: C.pt, x: x, y: top + 48 });
    var h = txt(f, it.head, { size: 38, weight: 700, x: x, y: top + 94, w: cw, maxH: 120, min: 26 });
    if (it.body) txt(f, it.body, { size: 26, color: TH.sub, x: x, y: h.y + h.height + 16, w: cw, maxH: 260, min: 20 });
  });
  vcenter(f, from, y + 80, H - BOTTOM);
};

L.compare = async function (f, s) {
  var y = title(f, s) + 88;
  var cols = [s.left || {}, s.right || {}], gap = 120, cw = (CW - gap) / 2;
  var from = f.children.length, bottom = y;
  cols.forEach(function (c, i) {
    var x = MX + i * (cw + gap);
    var lb = txt(f, c.label || '', { size: 30, weight: 700, color: i ? C.pt : TH.sub, x: x, y: y });
    var yy = lb.y + lb.height + 40;
    arr(c.items).map(item).forEach(function (it) {
      var a = txt(f, it.head, { size: 38, weight: 500, x: x, y: yy, w: cw, maxH: 110, min: 26 });
      yy += a.height;
      if (it.body) { var b = txt(f, it.body, { size: 26, color: TH.sub, x: x, y: yy + 8, w: cw, maxH: 80 }); yy += 8 + b.height; }
      yy += 44;
    });
    bottom = Math.max(bottom, yy - 44);
  });
  rect(f, MX + cw + gap / 2, y, 1, bottom - y, TH.line);
  vcenter(f, from, y - 16, H - BOTTOM);
};

L.table = async function (f, s) {
  var y = title(f, s) + 72;
  var rows = arr(s.rows);
  if (!rows.length) return;
  var nc = rows[0].length;
  var widths = s.widths || rows[0].map(function () { return 1; });
  var sum = widths.reduce(function (a, b) { return a + b; }, 0);
  var rowH = Math.min(96, (H - BOTTOM - y - (s.caption ? 60 : 0)) / rows.length);
  var size = rowH < 72 ? 24 : 30;
  var numRe = /^[\d.,%+\-−~원억만천배분초개명건시간일년월 —]+$/;
  var numCol = rows[0].map(function (_, c) {
    return c > 0 && s.alignNumbers !== false && rows.slice(1).every(function (r) { return numRe.test(String(pick(r[c], '')).replace(/\*\*|==/g, '')); });
  });
  var from = f.children.length;
  rows.forEach(function (r, ri) {
    var yy = y + ri * rowH, x = MX;
    var hl = s.highlightRow === ri;
    if (hl) rect(f, MX, yy + 1, CW, rowH - 1, C.hl, 0, 0.22);
    if (ri === 1) rect(f, MX, yy, CW, 2, TH.text);
    else if (ri > 1) rect(f, MX, yy, CW, 1, TH.line);
    for (var c = 0; c < nc; c++) {
      var w = CW * widths[c] / sum;
      var t = txt(f, pick(r[c], ''), {
        size: ri ? size : 24, weight: ri ? (c === 0 || hl ? 600 : 400) : 600,
        color: ri ? TH.text : TH.sub, x: x + (c ? 24 : 0), y: 0, w: w - 32,
        align: numCol[c] ? 'RIGHT' : 'LEFT', maxH: rowH - 8, min: 16
      });
      t.y = Math.round(yy + (rowH - t.height) / 2);
      x += w;
    }
  });
  if (s.caption) caption(f, s.caption, MX, y + rows.length * rowH + 24, CW);
  vcenter(f, from, y - 16, H - BOTTOM);
};

L.image = async function (f, s) {
  if (s.full) { await photo(f, s.image, 0, 0, W, H, { radius: 0, fit: 'cover' }); C.numColor = '#FFFFFF'; return; }
  var y = s.title ? title(f, s) + 48 : TOP;
  var capH = s.caption ? 56 : 0;
  await photo(f, s.image, MX, y, CW, H - BOTTOM - y - capH);
  caption(f, s.caption, MX, H - BOTTOM - capH + 18, CW);
};

L['image-text'] = async function (f, s) {
  var src = s.image && (typeof s.image === 'string' ? s.image : s.image.src);
  var contain = (s.image && s.image.fit === 'contain') || /\.(png|svg)$/i.test(src || '');
  var items = arr(s.items).map(item);

  function points(x, w, top) {
    var nodes = [], y = top;
    if (s.text) { var b = txt(f, s.text, { size: 28, color: TH.sub, x: x, y: y, w: w, maxH: 200 }); y += b.height + 36; }
    items.forEach(function (it) {
      var a = txt(f, it.head, { size: 32, weight: it.body ? 600 : 500, x: x + 32, y: y, w: w - 32, maxH: 100, min: 24 });
      rect(f, x + 2, y + a.height / 2 - 4, 8, 8, C.pt, 4);
      y += a.height;
      if (it.body) { var bb = txt(f, it.body, { size: 26, color: TH.sub, x: x + 32, y: y + 8, w: w - 32, maxH: 80, min: 20 }); y += 8 + bb.height; }
      y += 36;
    });
    return y - 36;
  }

  if (contain) {
    // 차트·스크린샷: 제목(결론) → 요점(왼쪽) → 근거 그림(오른쪽)
    var y = title(f, s) + 56;
    var tw = 560, gx = MX + tw + 64, from = f.children.length;
    var bottom = points(MX, tw, y);
    vcenter(f, from, y, H - BOTTOM);
    await photo(f, s.image, gx, y, W - MX - gx, H - BOTTOM - y, { fit: 'contain', radius: 0 });
    return;
  }
  // 사진: 글(먼저 읽을 것)은 왼쪽, 사진은 오른쪽 반 (side: left 로 바꿀 수 있음)
  var left = s.side === 'left';
  await photo(f, s.image, left ? 0 : W / 2, 0, W / 2, H, { radius: 0, fit: 'cover' });
  if (!left) C.numColor = '#FFFFFF';
  var x = left ? W / 2 + 96 : MX, w = W / 2 - 96 - MX;
  var from2 = f.children.length;
  var t = s.title ? txt(f, s.title, { size: 48, weight: 700, x: x, y: TOP, w: w, maxH: 190, min: 36 }) : null;
  points(x, w, t ? t.y + t.height + 52 : TOP);
  vcenter(f, from2, TOP, H - BOTTOM);
};

L.images = async function (f, s) {
  var y = title(f, s) + 56;
  var list = arr(s.images);
  var n = Math.max(1, list.length), gap = 40, w = (CW - gap * (n - 1)) / n;
  var hasCap = list.some(function (i) { return typeof i === 'object' && i.caption; });
  var h = H - BOTTOM - y - (hasCap ? 64 : 0);
  for (var i = 0; i < list.length; i++) {
    var x = MX + i * (w + gap);
    await photo(f, list[i], x, y, w, h);
    if (typeof list[i] === 'object' && list[i].caption) caption(f, list[i].caption, x, y + h + 18, w);
  }
};

L.quote = async function (f, s) {
  var t = txt(f, s.text || '', { size: 48, weight: 500, x: MX + 48, y: 0, w: 1400, maxH: 420, min: 34 });
  var src = s.source ? txt(f, s.source, { size: 26, color: TH.sub, x: MX + 48, y: 0 }) : null;
  var h = t.height + (src ? 36 + src.height : 0);
  var y = Math.round((H - h) / 2);
  rect(f, MX, y + 6, 6, t.height - 12, C.hl);
  t.y = y; if (src) src.y = y + t.height + 36;
};

L.closing = async function (f, s) {
  if (C.paper) return paperEnds(f, s, true);
  var t = txt(f, s.title || '감사합니다', { size: 64, weight: 700, x: MX, y: 0, w: 1400 });
  var st = s.sub ? txt(f, s.sub, { size: 30, color: TH.sub, x: MX, y: 0, w: 1200, maxH: 140 }) : null;
  var h = t.height + (st ? 28 + st.height : 0);
  var y = Math.round((H - h) / 2);
  t.y = y; if (st) st.y = y + t.height + 28;
};


// ───────── 보고서형: 머리 + 블록 본문(목록·표·그림·해석) ─────────
L.report = async function (f, s) {
  var top = title(f, s) + 40;
  var bottom = H - 108;
  var cols = arr(s.cols).filter(function (c) { return c.length; });
  if (!cols.length) cols = [[]];
  var n = cols.length, gap = 72;
  var ratio = s.ratio && s.ratio.length === n ? s.ratio : cols.map(function (c) {
    return n > 1 && c.every(function (b) { return b.type === 'image' || b.type === 'table' || b.type === 'diagram'; }) ? 1.2 : 1;
  });
  var sum = ratio.reduce(function (a, b) { return a + b; }, 0);
  var geo = [], x = MX;
  for (var i = 0; i < n; i++) { var w = (CW - gap * (n - 1)) * ratio[i] / sum; geo.push({ x: x, w: w }); x += w + gap; }

  // 슬라이드 전체에 같은 글자 배율: 공간이 남으면 키우고(가독성), 넘치면 줄입니다.
  var scales = [1.2, 1.12, 1.06, 1, 0.93, 0.86, 0.8], pickSc = null, imgHs = null;
  for (var k = 0; k < scales.length && pickSc === null; k++) {
    var sc = scales[k], ok = true, hs = [];
    for (i = 0; i < n; i++) {
      var from = f.children.length;
      var end = await place(f, cols[i], geo[i].x, geo[i].w, top, sc, 0, false);
      f.children.slice(from).forEach(function (nd) { nd.remove(); });
      C.hls = C.hls.filter(function (h) { return alive(h.t); });
      var nImg = cols[i].filter(isFlex).length;
      var free = bottom - end;
      var need = nImg ? 300 * nImg : 0;
      if (free < need) ok = false;
      hs.push(nImg ? free / nImg : 0);
    }
    if (ok || k === scales.length - 1) { pickSc = sc; imgHs = hs; if (!ok) C.warn('본문이 넘칩니다 — 슬라이드를 나누세요'); }
  }
  for (i = 0; i < n; i++) await place(f, cols[i], geo[i].x, geo[i].w, top, pickSc, Math.max(imgHs[i], 180), true);
  footer(f, s.source);
};

function footer(f, src) {
  if (!src) return;
  var label = /^(출처|자료|source)/i.test(src) ? src : '출처: ' + src;
  var t = txt(f, label, { size: 18, color: TH.sub, x: MX, y: 0, w: CW - 240, ls: 0 });
  t.y = Math.round(H - 64 - t.height / 2);
}

async function place(f, blocks, x, w, y, sc, imgH, real) {
  var R = function (v) { return Math.round(v * sc); };
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (i) y += R(b.type === 'list' && blocks[i - 1].type === 'heading' ? 14 : 32);
    if (b.type === 'heading' && C.paper) {
      y = labelBox(f, b.text, x, w, y, sc);
    } else if (b.type === 'heading') {
      var hd = txt(f, b.text, { size: R(28), weight: 700, x: x, y: y, w: w });
      y = hd.y + hd.height;
    } else if (b.type === 'para' || b.type === 'lead') {
      var pa = txt(f, b.text, { size: R(26), weight: b.type === 'lead' ? 600 : 400, x: x, y: y, w: w, lh: 160 });
      y = pa.y + pa.height;
    } else if (b.type === 'list') {
      y = listBlock(f, b, x, w, y, sc);
    } else if (b.type === 'table') {
      y = drawTable(f, b.rows, { x: x, y: y, w: w, sc: sc, highlightRow: b.highlightRow, widths: b.widths });
    } else if (b.type === 'callout') {
      y = calloutBlock(f, b.text, x, w, y, sc);
    } else if (b.type === 'diagram' && b.kind === 'flow') {
      if (real) y += drawFlowBlock(f, b.spec, x, y, w, imgH, sc);
    } else if (b.type === 'diagram') {
      y = drawVs(f, b.spec, x, y, w, sc);
    } else if (b.type === 'image') {
      if (real) await photo(f, b.image, x, y, w, imgH, { radius: 4 });
      y += imgH;
      if (b.image && b.image.caption) { var cp = caption(f, b.image.caption, x, y + R(12), w); y = cp.y + cp.height; }
    }
  }
  return y;
}

// paper 소제목: 남색 상자 + 흰 글자 + 그림자
function labelBox(f, text, x, w, y, sc) {
  var px = Math.round(24 * sc), py = Math.round(12 * sc);
  var t = txt(f, text, { size: Math.round(28 * sc), weight: 700, color: PAPER.white, x: x + px, y: y + py, ls: 0 });
  if (t.width > w - px * 2) { t.remove(); t = txt(f, text, { size: Math.round(28 * sc), weight: 700, color: PAPER.white, x: x + px, y: y + py, w: w - px * 2, ls: 0 }); }
  var bx = rect(f, x, y, t.width + px * 2, t.height + py * 2, C.pt);
  bx.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.28 }, offset: { x: 4, y: 4 }, radius: 4, spread: 0, visible: true, blendMode: 'NORMAL' }];
  behind(f, t, bx);
  return y + t.height + py * 2 + Math.round(8 * sc);
}

// paper 번호 목록: 남색 원(01) + 회색 둥근 띠, 하위 항목은 띠 안에
function pillList(f, b, x, w, y, sc) {
  var R = function (v) { return Math.round(v * sc); };
  var d = R(64), groups = [];
  b.items.forEach(function (it) {
    if (it.level === 1 || !groups.length) groups.push({ head: it.text, subs: [] });
    else groups[groups.length - 1].subs.push(it.text);
  });
  groups.forEach(function (g, i) {
    if (i) y += R(18);
    var tx = x + d + R(30), tw = w - (tx - x) - R(32), nodes = [];
    var t = txt(f, g.head, { size: R(27), x: tx, y: y, w: tw, lh: 150 }), yy = t.y + t.height;
    nodes.push(t);
    g.subs.forEach(function (st) {
      var sn = txt(f, st, { size: R(23), color: '#3A3A3F', x: tx + R(20), y: yy + R(4), w: tw - R(20), lh: 150 });
      nodes.push(rect(f, tx + 2, yy + R(4) + sn.fontSize * 0.75 - 1, R(10), 2, "#9A9AA0"));
      nodes.push(sn); yy = sn.y + sn.height;
    });
    var ch = yy - y, h = Math.max(d + R(16), ch + R(36)), dy = Math.round((h - ch) / 2);
    nodes.forEach(function (nd) { nd.y = nd.y + dy; });
    var bg = rect(f, x + d / 2, y, w - d / 2, h, PAPER.soft, Math.min(Math.round(h / 2), R(40)));
    behind(f, t, bg);
    var c = figma.createEllipse(); f.appendChild(c);
    c.resize(d, d); c.x = Math.round(x); c.y = Math.round(y + (h - d) / 2); c.fills = solid(C.pt);
    var num = txt(f, pad(i + 1), { size: R(26), weight: 700, color: PAPER.white, ls: 0 });
    num.x = Math.round(x + (d - num.width) / 2); num.y = Math.round(c.y + (d - num.height) / 2);
    y += h;
  });
  return y;
}

function listBlock(f, b, x, w, y, sc) {
  if (C.paper && b.ordered) return pillList(f, b, x, w, y, sc);
  var n = 0;
  b.items.forEach(function (it, i) {
    var l1 = it.level === 1;
    if (i) y += Math.round((l1 ? 18 : 8) * sc);
    var size = Math.round((l1 ? 27 : 24) * sc), lhPx = size * 1.5;
    var ind = b.ordered ? Math.round(size * 1.35) : 30;
    var ix = l1 ? x + ind : x + ind + 32;
    var t = txt(f, it.text, { size: size, color: l1 ? TH.text : '#3A3A3F', x: ix, y: y, w: w - (ix - x), lh: 150 });
    if (l1) {
      if (b.ordered) txt(f, (++n) + '.', { size: size, weight: 700, color: C.pt, x: x, y: y, ls: 0 });
      else rect(f, x + 4, y + lhPx / 2 - 4, 8, 8, C.pt, 4);
    } else rect(f, x + ind + 8, y + lhPx / 2 - 1, 12, 2, '#9A9AA0');
    y = t.y + t.height;
  });
  return y;
}

function calloutBlock(f, text, x, w, y, sc) {
  if (C.paper) {
    // "→ 결론: 문장" 이면 왼쪽 남색 칸에 라벨
    var lm = /^([가-힣A-Za-z]{1,6})\s*[:：]\s*(.+)$/.exec(text);
    var label = lm ? lm[1] : null, body = lm ? lm[2] : text;
    var pd = Math.round(22 * sc), lw = label ? Math.round(170 * sc) : Math.round(10 * sc);
    var bt = txt(f, body, { size: Math.round(25 * sc), weight: 500, x: x + lw + pd, y: y + pd, w: w - lw - pd * 2, lh: 150 });
    var bh = bt.height + pd * 2;
    behind(f, bt, rect(f, x, y, w, bh, PAPER.soft));
    behind(f, bt, rect(f, x, y, lw, bh, C.pt));
    if (label) { var lt = txt(f, label, { size: Math.round(30 * sc), weight: 700, color: PAPER.white, w: lw, align: 'CENTER', ls: 0 }); lt.x = Math.round(x); lt.y = Math.round(y + (bh - lt.height) / 2); }
    return y + bh;
  }
  var pad = Math.round(20 * sc);
  var t = txt(f, text, { size: Math.round(25 * sc), weight: 500, x: x + pad + 6, y: y + pad, w: w - pad * 2 - 6, lh: 150 });
  var h = t.height + pad * 2;
  var bg = figma.createRectangle(); bg.resize(Math.round(w), Math.round(h)); bg.x = Math.round(x); bg.y = Math.round(y);
  bg.fills = solid(C.hl, 0.16); bg.name = 'callout';
  var bar = figma.createRectangle(); bar.resize(5, Math.round(h)); bar.x = Math.round(x); bar.y = Math.round(y);
  bar.fills = solid(C.hl);
  f.appendChild(bg); f.appendChild(bar);
  behind(f, t, bg); behind(f, t, bar);
  return y + h;
}

// 표: 열 너비는 내용 길이로, 숫자 열은 오른쪽 정렬, 강조 행은 옅은 노랑
function drawTable(f, rows, o) {
  var sc = o.sc || 1, x = o.x, y = o.y, w = o.w;
  var nc = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  var plainLen = function (v) { return String(pick(v, '')).replace(/\*\*|==/g, '').length; };
  var widths = o.widths;
  if (!widths) {
    widths = [];
    for (var c = 0; c < nc; c++) widths.push(Math.min(28, Math.max(5, Math.max.apply(null, rows.map(function (r) { return plainLen(r[c]); })))));
  }
  var sum = widths.reduce(function (a, b) { return a + b; }, 0);
  var numRe = /^[\d.,%+\-−~원억만천배분초개명건시간일년월pP —]+$/;
  var numCol = [];
  for (c = 0; c < nc; c++) numCol.push(c > 0 && rows.slice(1).every(function (r) { return numRe.test(String(pick(r[c], '')).replace(/\*\*|==/g, '')); }));
  var size = Math.round((o.size || 23) * sc), hsize = Math.round(20 * sc), padY = Math.round(o.padY || 13 * sc), padX = 16;
  rows.forEach(function (r, ri) {
    var cells = [], cx = x, hl = o.highlightRow === ri && ri > 0;
    for (var c = 0; c < nc; c++) {
      var cw = w * widths[c] / sum;
      cells.push(txt(f, pick(r[c], ''), {
        size: ri ? size : hsize, weight: ri ? (c === 0 || hl ? 600 : 400) : 600, color: ri ? TH.text : TH.sub,
        x: cx + padX, y: y + padY, w: cw - padX * 2, align: numCol[c] ? 'RIGHT' : 'LEFT', lh: 140, ls: 0
      }));
      cx += cw;
    }
    var rh = Math.max.apply(null, cells.map(function (t) { return t.height; })) + padY * 2;
    cells.forEach(function (t) { t.y = Math.round(y + (rh - t.height) / 2); });
    if (hl) { var bg = rect(f, x, y, w, rh, C.hl, 0, 0.25); behind(f, cells[0], bg); }
    if (C.paper && ri === 0) { behind(f, cells[0], rect(f, x, y, w, rh, '#F1F3F6')); rect(f, x, y - 2, w, 2, C.pt); }
    y += rh;
    rect(f, x, y, w, ri === 0 ? 2 : 1, ri === 0 ? (C.paper ? '#9AA0A8' : TH.text) : TH.line);
  });
  return y;
}


// ───────── 도식: 흐름도(flow)·비교(vs/change) — 모두 수정 가능한 Figma 도형 ─────────
function isFlex(b) { return b.type === 'image' || (b.type === 'diagram' && b.kind === 'flow'); }
var DG = { stroke: '#BDBDB8', edge: '#6B6B70', soft: '#F4F4F2', ink: '#161616' };
function plainOf(t) { return String(t || '').replace(/\*\*|==/g, ''); }

// 계층형 배치: 순환 간선 찾기 → 최장경로 순위 → 무게중심 정렬 → 좌표 → 꺾은선 경로
function layoutFlow(g, sc) {
  var LR = g.dir !== 'TD';
  var fs = Math.max(14, Math.round(22 * sc)), lhP = 140, lh = fs * lhP / 100;
  var padX = Math.round(22 * sc), padY = Math.round(14 * sc), maxTW = Math.round(250 * sc);
  var N = {}, ids = g.order;
  ids.forEach(function (id) {
    var n = g.nodes[id], text = plainOf(n.text), wt = n.shape === 'decision' || n.cls === 'hl' ? 600 : 500;
    var lines = wrap(text, fs, wt, -1, maxTW * 0.97);
    var tw = 0; lines.forEach(function (l) { tw = Math.max(tw, measure(text.slice(l[0], l[1]), fs, wt, -1)); });
    var th = lines.length * lh, w = Math.max(tw + padX * 2, Math.round(120 * sc)), h = th + padY * 2;
    if (n.shape === 'decision') { w = Math.round(w * 1.45 + 16 * sc); h = Math.round(h * 1.7); }
    if (n.shape === 'io') w += Math.round(36 * sc);
    if (n.shape === 'db') h += Math.round(18 * sc);
    if (n.shape === 'circle') { w = h = Math.max(w, h); }
    N[id] = { id: id, n: n, w: Math.round(w), h: Math.round(h), tw: tw, wt: wt, outs: [], ins: [] };
  });
  g.edges.forEach(function (e) { e.back = false; if (N[e.from] && N[e.to]) { N[e.from].outs.push(e); N[e.to].ins.push(e); } });
  var st = {};
  function dfs(u) { st[u] = 1; N[u].outs.forEach(function (e) { if (st[e.to] === 1) e.back = true; else if (!st[e.to]) dfs(e.to); }); st[u] = 2; }
  ids.forEach(function (id) { if (!st[id]) dfs(id); });
  var rank = {}; ids.forEach(function (id) { rank[id] = 0; });
  for (var it = 0; it < ids.length + 1; it++) {
    var ch = false;
    g.edges.forEach(function (e) { if (!e.back && N[e.from] && N[e.to] && rank[e.to] < rank[e.from] + 1) { rank[e.to] = rank[e.from] + 1; ch = true; } });
    if (!ch) break;
  }
  var layers = [];
  ids.forEach(function (id) { (layers[rank[id]] = layers[rank[id]] || []).push(id); });
  layers = layers.filter(Boolean);

  var M = function (b) { return LR ? b.w : b.h; }, X = function (b) { return LR ? b.h : b.w; };
  var gapM = Math.round((LR ? 76 : 44) * sc), gapX = Math.round((LR ? 36 : 56) * sc), gapG = Math.round(112 * sc);
  // 라벨 있는 간선이 지나는 층 사이는 넓게
  var labelGap = [];
  g.edges.forEach(function (e) {
    if (e.label && !e.back) { var r = rank[e.from]; labelGap[r] = Math.max(labelGap[r] || 0, measure(e.label, Math.round(fs * 0.85), 500, 0) + 24 * sc); }
  });
  var pos = 0, center = {};
  layers.forEach(function (layer, li) {
    var lm = Math.max.apply(null, layer.map(function (id) { return M(N[id]); }));
    layer.forEach(function (id) { N[id].m = pos + (lm - M(N[id])) / 2; N[id].layerEnd = pos + lm; });
    // 교차축: 앞 층 연결 노드들의 중심 쪽으로
    var want = layer.map(function (id, k) {
      var pr = N[id].ins.filter(function (e) { return !e.back && center[e.from] !== undefined; });
      return { id: id, k: k, d: pr.length ? pr.reduce(function (a, e) { return a + center[e.from]; }, 0) / pr.length : null };
    });
    if (li > 0) want.sort(function (a, b) {
      var ga = N[a.id].n.group, gb = N[b.id].n.group;
      if (a.d === null || b.d === null) return a.k - b.k;
      return (a.d - b.d) || (ga - gb) || (a.k - b.k);
    });
    var c = 0, placed = [];
    want.forEach(function (wv, k) {
      var b = N[wv.id], sz = X(b);
      if (k) { var pg = N[want[k - 1].id].n.group; c += (pg !== b.n.group ? gapG : gapX); }
      placed.push({ b: b, c0: c, d: wv.d }); c += sz;
    });
    // 원하는 중심과의 평균 차이만큼 층 전체를 이동
    var withD = placed.filter(function (p) { return p.d !== null; });
    var shift = withD.length ? withD.reduce(function (a, p) { return a + (p.d - (p.c0 + X(p.b) / 2)); }, 0) / withD.length : -c / 2;
    placed.forEach(function (p) { p.b.c = p.c0 + shift; center[p.b.id] = p.b.c + X(p.b) / 2; });
    pos += lm + gapM + (labelGap[li] || 0);
  });
  ids.forEach(function (id) { var b = N[id]; b.x = LR ? b.m : b.c; b.y = LR ? b.c : b.m; b.cx = b.x + b.w / 2; b.cy = b.y + b.h / 2; });

  // 그룹(subgraph) 상자
  var padG = Math.round(22 * sc), labH = Math.round(34 * sc);
  var groups = g.groups.map(function (gr) {
    var mem = gr.ids.map(function (id) { return N[id]; }).filter(Boolean);
    if (!mem.length) return null;
    var x0 = Math.min.apply(null, mem.map(function (b) { return b.x; })) - padG;
    var y0 = Math.min.apply(null, mem.map(function (b) { return b.y; })) - padG - labH;
    var x1 = Math.max.apply(null, mem.map(function (b) { return b.x + b.w; })) + padG;
    var y1 = Math.max.apply(null, mem.map(function (b) { return b.y + b.h; })) + padG;
    return { title: gr.title, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }).filter(Boolean);

  // 간선 경로
  var allR = Math.max.apply(null, ids.map(function (id) { return N[id].x + N[id].w; }));
  var allB = Math.max.apply(null, ids.map(function (id) { return N[id].y + N[id].h; }));
  var backN = 0;
  var edges = g.edges.filter(function (e) { return N[e.from] && N[e.to]; }).map(function (e) {
    var s = N[e.from], t = N[e.to], pts, k = s.outs.indexOf(e);
    var fwdOuts = s.outs.filter(function (o) { return !o.back; });
    var side = s.n.shape === 'decision' && fwdOuts.length > 1 && fwdOuts.indexOf(e) > 0;
    if (e.back) {
      var off = Math.round((36 + 18 * backN++) * sc);
      if (LR) { var Y = Math.max(s.y + s.h, t.y + t.h, allB) + off; pts = [[s.cx, s.y + s.h], [s.cx, Y], [t.cx, Y], [t.cx, t.y + t.h]]; }
      else { var Xr = Math.max(s.x + s.w, t.x + t.w, allR) + off; pts = [[s.x + s.w, s.cy], [Xr, s.cy], [Xr, t.cy], [t.x + t.w, t.cy]]; }
    } else if (LR) {
      if (side) pts = [[s.cx, t.cy < s.cy ? s.y : s.y + s.h], [s.cx, t.cy], [t.x, t.cy]];
      else if (Math.abs(s.cy - t.cy) < 2) pts = [[s.x + s.w, s.cy], [t.x, t.cy]];
      else { var xm = s.layerEnd + gapM / 2 + (labelGap[rank[e.from]] || 0) / 2; pts = [[s.x + s.w, s.cy], [xm, s.cy], [xm, t.cy], [t.x, t.cy]]; }
    } else {
      if (side) pts = [[t.cx < s.cx ? s.x : s.x + s.w, s.cy], [t.cx, s.cy], [t.cx, t.y]];
      else if (Math.abs(s.cx - t.cx) < 2) pts = [[s.cx, s.y + s.h], [t.cx, t.y]];
      else { var ym = s.layerEnd + gapM / 2; pts = [[s.cx, s.y + s.h], [s.cx, ym], [t.cx, ym], [t.cx, t.y]]; }
    }
    // 라벨: 첫 구간 옆
    var lab = null;
    if (e.label) {
      var a = pts[0], b = pts[1], horiz = Math.abs(b[1] - a[1]) < 1;
      lab = horiz ? { x: (a[0] + b[0]) / 2, y: a[1], h: true } : { x: a[0], y: (a[1] + b[1]) / 2, h: false };
    }
    return { e: e, pts: pts, lab: lab };
  });

  // 전체 경계 → 0 기준으로 이동
  var xs = [], ys = [];
  ids.forEach(function (id) { var b = N[id]; xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h); });
  groups.forEach(function (r) { xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.h); });
  edges.forEach(function (ed) { ed.pts.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
  var mx = Math.min.apply(null, xs) - 4, my = Math.min.apply(null, ys) - 4;
  ids.forEach(function (id) { N[id].x -= mx; N[id].y -= my; N[id].cx -= mx; N[id].cy -= my; });
  groups.forEach(function (r) { r.x -= mx; r.y -= my; });
  edges.forEach(function (ed) { ed.pts = ed.pts.map(function (p) { return [p[0] - mx, p[1] - my]; }); if (ed.lab) { ed.lab.x -= mx; ed.lab.y -= my; } });
  return { N: N, ids: ids, edges: edges, groups: groups, W: Math.max.apply(null, xs) - mx + 4, H: Math.max.apply(null, ys) - my + 4, fs: fs, lhP: lhP, sc: sc, LR: LR };
}

function vec(parent, pts, closed, o) {
  var minX = 1e9, minY = 1e9;
  pts.concat.apply(pts, o.extra || []).forEach(function (p) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); });
  var f1 = function (v) { return Math.round(v * 10) / 10; };
  var d = pts.map(function (p, i) { return (i ? 'L ' : 'M ') + f1(p[0] - minX) + ' ' + f1(p[1] - minY); }).join(' ') + (closed ? ' Z' : '');
  if (o.extra) d += ' ' + o.extra.map(function (seg) {
    return seg.map(function (p, i) { return (i ? 'L ' : 'M ') + f1(p[0] - minX) + ' ' + f1(p[1] - minY); }).join(' ');
  }).join(' ');
  var v = figma.createVector();
  parent.appendChild(v);
  v.vectorPaths = [{ windingRule: closed ? 'NONZERO' : 'NONE', data: d }];
  v.fills = o.fill ? solid(o.fill, o.fillOpacity) : [];
  v.strokes = solid(o.stroke || DG.edge);
  v.strokeWeight = o.weight || 2;
  v.strokeJoin = 'ROUND';
  try { v.strokeCap = 'ROUND'; } catch (e) { }
  if (o.dash) v.dashPattern = o.dash;
  v.x = Math.round(minX); v.y = Math.round(minY);
  if (o.name) v.name = o.name;
  return v;
}

function arrow(parent, pts, sc, o) {
  o = o || {};
  var all = pts.slice();
  var a = all[all.length - 2], b = all[all.length - 1];
  var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len;
  var ah = 11 * sc, aw = 7 * sc;
  var head = [[b[0] - ux * ah - uy * aw, b[1] - uy * ah + ux * aw], [b[0], b[1]], [b[0] - ux * ah + uy * aw, b[1] - uy * ah - ux * aw]];
  // 경계 계산에 화살촉도 포함되도록 extra 로 전달
  var v = vec(parent, all, false, { stroke: o.color || DG.edge, weight: o.weight || 2, dash: o.dash, name: o.name || '화살표', extra: [head] });
  return v;
}

function flowNode(fr, b, L) {
  var n = b.n, sc = L.sc, text = n.text;
  var hl = n.cls === 'hl' || n.cls === 'key', red = n.cls === 'red' || n.cls === 'accent', muted = n.cls === 'muted';
  var fill = hl ? C.hl : (n.shape === 'stadium' || n.shape === 'circle' ? DG.soft : '#FFFFFF');
  var fillOp = hl ? 0.38 : undefined;
  var stroke = red ? C.pt : hl ? '#D9B21F' : DG.stroke, sw = red || hl ? 2 : 1.5;
  var color = muted ? TH.sub : DG.ink;
  if (C.paper && n.shape === 'circle' && !hl) { fill = C.pt; stroke = C.pt; color = PAPER.white; }
  var name = plainOf(text).slice(0, 40);
  var tw = Math.ceil(b.tw / 0.97) + 2;
  if (n.shape === 'box' || n.shape === 'round' || n.shape === 'stadium') {
    var nf = figma.createFrame();
    fr.appendChild(nf);
    nf.name = name;
    nf.resize(b.w, b.h); nf.x = Math.round(b.x); nf.y = Math.round(b.y);
    nf.cornerRadius = n.shape === 'box' ? Math.round(6 * sc) : n.shape === 'round' ? Math.round(16 * sc) : Math.round(b.h / 2);
    nf.fills = solid(fill, fillOp); nf.strokes = solid(stroke); nf.strokeWeight = sw; nf.strokeAlign = 'INSIDE';
    nf.clipsContent = false;
    nf.layoutMode = 'HORIZONTAL';
    nf.primaryAxisSizingMode = 'FIXED'; nf.counterAxisSizingMode = 'FIXED';
    nf.primaryAxisAlignItems = 'CENTER'; nf.counterAxisAlignItems = 'CENTER';
    nf.resize(b.w, b.h);
    var t = txt(nf, text, { size: L.fs, weight: b.wt, color: color, w: tw, align: 'CENTER', lh: L.lhP, ls: -1 });
    t.x = Math.round((b.w - tw) / 2); t.y = Math.round((b.h - t.height) / 2);   // (자동 레이아웃이 없는 환경용)
    return nf;
  }
  var parts = [], x = b.x, y = b.y, w = b.w, h = b.h;
  if (n.shape === 'decision') {
    var pg = figma.createPolygon(); fr.appendChild(pg);
    pg.pointCount = 4; pg.resize(w, h); pg.x = Math.round(x); pg.y = Math.round(y);
    pg.fills = solid(hl ? C.hl : '#FFFFFF', hl ? 0.38 : undefined); pg.strokes = solid(stroke); pg.strokeWeight = sw;
    parts.push(pg);
  } else if (n.shape === 'io') {
    var k = 18 * sc;
    parts.push(vec(fr, [[x + k, y], [x + w, y], [x + w - k, y + h], [x, y + h]], true, { fill: fill, fillOpacity: fillOp, stroke: stroke, weight: sw }));
  } else if (n.shape === 'db') {
    var eh = Math.round(18 * sc);
    var body = rect(fr, x, y + eh / 2, w, h - eh / 2, '#FFFFFF', 0);
    body.strokes = solid(stroke); body.strokeWeight = sw; body.bottomLeftRadius = body.bottomRightRadius = Math.round(10 * sc);
    var top = figma.createEllipse(); fr.appendChild(top); top.resize(w, eh); top.x = Math.round(x); top.y = Math.round(y);
    top.fills = solid(DG.soft); top.strokes = solid(stroke); top.strokeWeight = sw;
    parts.push(body, top);
  } else {
    var el = figma.createEllipse(); fr.appendChild(el); el.resize(w, h); el.x = Math.round(x); el.y = Math.round(y);
    el.fills = solid(fill, fillOp); el.strokes = solid(stroke); el.strokeWeight = sw;
    parts.push(el);
  }
  var tt = txt(fr, text, { size: L.fs, weight: b.wt, color: color, w: tw, align: 'CENTER', lh: L.lhP, ls: -1 });
  var dy = n.shape === 'db' ? 9 * sc : 0;
  tt.x = Math.round(x + (w - tw) / 2); tt.y = Math.round(y + dy + (h - tt.height) / 2);
  parts.push(tt);
  try { var gp = figma.group(parts, fr); gp.name = name; return gp; } catch (e) { return parts[0]; }
}

function drawFlow(parent, L, ox, oy) {
  var fr = figma.createFrame();
  parent.appendChild(fr);
  fr.name = '흐름도';
  fr.fills = []; fr.clipsContent = false;
  fr.resize(Math.max(1, Math.round(L.W)), Math.max(1, Math.round(L.H)));
  fr.x = Math.round(ox); fr.y = Math.round(oy);
  var sc = L.sc;
  L.groups.forEach(function (gbox) {
    var r = rect(fr, gbox.x, gbox.y, gbox.w, gbox.h, DG.soft, Math.round(12 * sc)); r.name = '묶음';
    txt(fr, gbox.title, { size: Math.max(13, Math.round(19 * sc)), weight: 700, color: TH.sub, x: gbox.x + 16 * sc, y: gbox.y + 10 * sc, ls: 0 });
  });
  L.edges.forEach(function (ed) {
    var e = ed.e;
    arrow(fr, ed.pts, sc, { dash: e.style === 'dashed' ? [7, 6] : null, weight: e.style === 'thick' ? 3 : 2, color: e.style === 'thick' ? DG.ink : DG.edge });
    if (ed.lab) {
      var ls = Math.max(13, Math.round(L.fs * 0.85));
      var t = txt(fr, e.label, { size: ls, weight: 600, color: TH.sub, ls: 0 });
      var bx = ed.lab.h ? ed.lab.x - t.width / 2 : ed.lab.x + 10 * sc, by = ed.lab.h ? ed.lab.y - t.height - 4 * sc : ed.lab.y - t.height / 2;
      t.x = Math.round(bx); t.y = Math.round(by);
      var bg = rect(fr, bx - 4, by, t.width + 8, t.height, '#FFFFFF', 3);
      behind(fr, t, bg);
    }
  });
  L.ids.forEach(function (id) { flowNode(fr, L.N[id], L); });
  return fr;
}

// 칸(w × maxH)에 맞춰 배율을 정해 다시 배치합니다. 글자는 본문보다 크지 않게.
function drawFlowBlock(f, spec, x, y, w, maxH, sc) {
  var base = Math.min(sc, 1.1);
  var L0 = layoutFlow(spec, base);
  var s = Math.min(1.15, w / L0.W, maxH / L0.H);
  var L1 = Math.abs(s - 1) > 0.02 ? layoutFlow(spec, Math.max(0.55, base * s)) : L0;
  if (L1.W > w || L1.H > maxH) {
    var s2 = Math.min(w / L1.W, maxH / L1.H);
    L1 = layoutFlow(spec, Math.max(0.5, L1.sc * s2 * 0.98));
    if (L1.W > w + 2 || L1.H > maxH + 2) C.warn('흐름도가 칸보다 큽니다 — 노드를 줄이거나 방향(LR/TD)을 바꾸세요');
  }
  drawFlow(f, L1, x + (w - L1.W) / 2, y);
  return Math.round(L1.H);
}

// 비교: 패널 2–3개 + 가운데 VS 또는 화살표(변화)
function drawVs(f, spec, x, y, w, sc) {
  var panels = spec.panels.length ? spec.panels : [{ title: '', items: [] }];
  var n = panels.length, R = function (v) { return Math.round(v * sc); };
  var mid = spec.mode === 'change' ? R(150) : R(96);
  var pw = (w - mid * (n - 1)) / n, pad = R(30);
  var fr = figma.createFrame(); f.appendChild(fr);
  fr.name = spec.mode === 'change' ? '변화 비교' : '비교'; fr.fills = []; fr.clipsContent = false;
  fr.x = Math.round(x); fr.y = Math.round(y); fr.resize(Math.round(w), 10);
  var made = panels.map(function (p, i) {
    var pf = figma.createFrame(); fr.appendChild(pf);
    pf.name = plainOf(p.title) || ('패널 ' + (i + 1)); pf.clipsContent = false;
    pf.x = Math.round(i * (pw + mid)); pf.y = 0; pf.resize(Math.round(pw), 10);
    var after = spec.mode === 'change' && i === n - 1;
    pf.fills = solid(after ? '#FFFFFF' : DG.soft); pf.cornerRadius = R(12);
    if (after) { pf.strokes = solid(C.hl); pf.strokeWeight = 3; pf.strokeAlign = 'INSIDE'; }
    var yy = pad;
    if (p.title) {
      var ht = txt(pf, p.title, { size: R(30), weight: 700, x: pad, y: yy, w: pw - pad * 2 });
      yy = ht.y + ht.height + R(14);
      rect(pf, pad, yy, pw - pad * 2, 2, TH.text); yy += R(22);
    }
    var lst = p.items.filter(function (it) { return it.level > 0; });
    p.items.forEach(function (it) {
      if (it.level === 0) { var pt = txt(pf, it.text, { size: R(25), x: pad, y: yy, w: pw - pad * 2, lh: 150 }); yy = pt.y + pt.height + R(12); }
    });
    if (lst.length) yy = listBlock(pf, { items: lst }, pad, pw - pad * 2, yy, sc * 0.95);
    return { pf: pf, h: yy + pad };
  });
  var H = Math.max.apply(null, made.map(function (m) { return m.h; }));
  made.forEach(function (m) { m.pf.resize(Math.round(pw), Math.round(H)); });
  fr.resize(Math.round(w), Math.round(H));
  for (var i = 1; i < n; i++) {
    var cx = i * (pw + mid) - mid / 2, cy = H / 2;
    if (spec.mode === 'change') {
      arrow(fr, [[cx - mid * 0.32, cy], [cx + mid * 0.32, cy]], sc * 1.6, { color: DG.ink, weight: 3, name: '변화' });
      if (spec.label) {
        var lt = txt(fr, spec.label, { size: R(20), weight: 600, color: TH.sub, w: mid - R(8), align: 'CENTER', lh: 135, ls: 0 });
        lt.x = Math.round(cx - (mid - R(8)) / 2); lt.y = Math.round(cy - lt.height - R(14));
      }
    } else {
      var d = R(64), c = figma.createEllipse(); fr.appendChild(c);
      c.resize(d, d); c.x = Math.round(cx - d / 2); c.y = Math.round(cy - d / 2);
      c.fills = solid('#FFFFFF'); c.strokes = solid(TH.text); c.strokeWeight = 2;
      var vt = txt(fr, 'VS', { size: R(22), weight: 700, ls: 0 });
      vt.x = Math.round(cx - vt.width / 2); vt.y = Math.round(cy - vt.height / 2);
    }
  }
  return y + H;
}

// ───────── 빌드 ─────────
function plainT(v) { return String(v || '').replace(/\*\*|==/g, ''); }
// 섹션별 세부 제목 (목차·섹션 슬라이드용)
function sectionsOf(slides) {
  var out = [], cur = null;
  slides.forEach(function (x) {
    if (x.layout === 'section') { cur = { title: plainT(x.title), sub: x.sub, items: [] }; out.push(cur); }
    else if (x.layout === 'closing') cur = null;
    else if (cur && x.title && x.layout !== 'agenda' && x.layout !== 'cover') cur.items.push(plainT(x.title));
  });
  return out;
}

async function build(deck, files) {
  var slides = deck.slides || [];
  if (!slides.length) throw new Error('슬라이드가 없습니다. 슬라이드 사이는 --- 로 나눕니다.');
  var warns = [];
  var colors = deck.colors || {};
  var paper = deck.theme === 'paper';
  C = {
    paper: paper,
    hl: colors.highlight || (paper ? '#F2A900' : '#FFD43B'),
    pt: colors.point || (paper ? '#12306B' : '#E03131'),
    deckTitle: plainT(deck.title || (slides[0].layout === 'cover' ? slides[0].title : '')),
    deckSub: slides[0].layout === 'cover' ? plainT(slides[0].sub) : '',
    date: deck.date || '',
    radius: pick(deck.radius, 8),
    font: await resolveFont(deck.font),
    files: (files || []).map(function (f) { return { key: normName(f.name), bytes: f.bytes, used: false }; }),
    cache: {}, mcache: {}, hls: [], section: 0, numColor: null, where: '',
    report: deck.style !== 'talk', sec: null,
    sections: sectionsOf(slides),
    warn: function (m) { warns.push(C.where + m); }
  };
  C.meter = figma.createText();
  C.meter.fontName = fn(400);
  C.meter.textAutoResize = 'WIDTH_AND_HEIGHT';
  C.meter.visible = false;

  var slidesMode = figma.editorType === 'slides';
  var page = null;
  if (!slidesMode) {
    page = figma.createPage();
    page.name = deck.title || 'Deck';
    await figma.setCurrentPageAsync(page);
  }
  var numbering = deck.numbering || {};
  var skipCover = numbering.skipCover !== false;
  var total = slides.length, perRow = 4, frames = [];

  try {
    for (var i = 0; i < slides.length; i++) {
      var s = slides[i];
      var lay = L[s.layout] ? s.layout : 'bullets';
      C.where = (i + 1) + '쪽 ';
      C.numColor = null;
      figma.ui.postMessage({ type: 'progress', done: i, total: total });
      var f;
      if (slidesMode) f = figma.createSlide();
      else {
        f = figma.createFrame();
        f.resize(W, H);
        f.x = (i % perRow) * (W + 200);
        f.y = Math.floor(i / perRow) * (H + 320);
        f.clipsContent = true;
        page.appendChild(f);
      }
      f.name = pad(i + 1) + ' ' + String(s.title || s.text || lay).replace(/\*\*|==/g, '').slice(0, 30);
      try { f.fills = solid(TH.bg); } catch (e) { }
      C.framed = false;
      if (C.paper) decor(f);
      if (C.sec && lay !== 'section' && lay !== 'closing') C.sec.k++;

      await L[lay](f, s);
      if (lay === 'section') C.sec = { n: s.number !== undefined ? s.number : C.section, title: String(s.title || '').replace(/\*\*|==/g, ''), k: 0 };
      if (lay === 'closing') C.sec = null;
      paintHighlights(f);

      if (C.framed) bar(f, 0, H - PAPER.foot, W, PAPER.foot);
      var bare = C.paper && !C.framed;   // paper 표지·목차·섹션·마무리는 번호 없음
      if (!(s.hideNumber || bare || (lay === 'cover' && skipCover))) {
        var pn = txt(f, numbering.total ? (i + 1) + ' / ' + total : String(i + 1), { size: 20, weight: 500, color: C.framed ? PAPER.white : C.numColor || TH.sub, ls: 0 });
        pn.x = W - (C.framed ? 72 : MX) - pn.width;
        pn.y = Math.round((C.framed ? H - PAPER.foot / 2 : H - 64) - pn.height / 2);
        pn.name = 'page-number';
      }
      if (s.notes) {
        try { f.setPluginData('notes', String(s.notes)); } catch (e) { }
        if (!slidesMode && deck.notesOnCanvas !== false) {
          var nt = txt(page, '발표 노트 — ' + s.notes, { size: 26, color: '#8A8A8E', x: f.x, y: f.y + H + 32, w: W });
          nt.name = 'notes';
        }
      }
      frames.push(f);
    }
  } finally {
    try { C.meter.remove(); } catch (e) { }
  }

  if (!slidesMode) {
    try { page.flowStartingPoints = [{ nodeId: frames[0].id, name: deck.title || 'Deck' }]; } catch (e) { }
    figma.viewport.scrollAndZoomIntoView(frames);
  }
  var unused = C.files.filter(function (f) { return !f.used; }).map(function (f) { return f.key; });
  if (unused.length) warns.push('쓰이지 않은 사진: ' + unused.join(', '));
  return { count: frames.length, font: C.font.family, warnings: DeckCore.lint(deck).concat(warns) };
}

figma.ui.onmessage = async function (msg) {
  if (msg.type === 'parse') {
    try {
      var d = DeckCore.parse(msg.source);
      figma.ui.postMessage({ type: 'parsed', slides: (d.slides || []).length, refs: DeckCore.imageRefs(d), warnings: DeckCore.lint(d), colors: d.colors || {} });
    } catch (e) { figma.ui.postMessage({ type: 'parsed', error: e.message }); }
    return;
  }
  if (msg.type !== 'build') return;
  try {
    var deck = DeckCore.parse(msg.source);
    deck.colors = deck.colors || {};
    if (msg.colors) { deck.colors.highlight = msg.colors.highlight; deck.colors.point = msg.colors.point; }
    var res = await build(deck, msg.images);
    figma.ui.postMessage({ type: 'done', count: res.count, font: res.font, warnings: res.warnings });
    figma.notify(res.count + '장 생성 완료');
  } catch (e) {
    figma.ui.postMessage({ type: 'error', message: e.message || String(e) });
  }
};
