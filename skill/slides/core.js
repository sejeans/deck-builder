// ───────── deck core: slides.md → deck 객체, 문구 점검 ─────────
// Figma 플러그인(code.js)과 Claude Code 검사 도구(check.js)가 같은 코드를 씁니다.

var DeckCore = (function () {
  var LAYOUTS = ['cover', 'agenda', 'section', 'report', 'statement', 'bullets', 'stats', 'steps', 'compare', 'table',
    'image', 'image-text', 'images', 'quote', 'closing'];
  var KEYS = ['meta', 'caption', 'source', 'side', 'full', 'number', 'notes', 'highlight', 'style', 'layout', 'widths', 'ratio'];

  function unquote(v) { v = String(v).trim(); return v.replace(/^["'](.*)["']$/, '$1'); }
  function parts(s) { return s.split(/\s+(?:—|--)\s+/).map(function (x) { return x.trim(); }); }

  // "핵심 — 설명" → "**핵심** — 설명" (보고서형 본문용)
  function boldHead(t) {
    if (/\*\*/.test(t)) return t;
    var p = parts(t);
    return p.length > 1 ? '**' + p[0] + '** — ' + p.slice(1).join(' — ') : t;
  }

  function parseImage(line) {
    var m = /^!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+"([^"]*)")?\s*\)$/.exec(line.trim());
    if (!m) return null;
    var o = { src: m[2] };
    if (m[1]) o.caption = m[1];
    if (m[3] && /contain|fit/.test(m[3])) o.fit = 'contain';
    if (m[3] && /cover|fill/.test(m[3])) o.fit = 'cover';
    return o;
  }


  // ───── 도식 문법 ─────
  // ```flow : Mermaid flowchart 부분집합 (LR/TD, [박스] (둥근) ([시작·끝]) {판단} [(저장소)] [/입출력/],
  //           -->, -->|라벨|, -- 라벨 -->, -.-> 점선, ==> 강조, ->/→ 간단 화살표, :::hl 강조, subgraph … end)
  // ```vs / ```change : # 패널 제목, - 항목, -> 가운데 라벨
  function makeDiagram(kind, src) {
    if (kind === 'vs' || kind === 'change' || kind === 'compare') return { type: 'diagram', kind: kind === 'compare' ? 'vs' : kind, spec: parseVs(src, kind) };
    if (kind === 'mermaid' || kind === 'flowchart' || kind === 'cause') kind = 'flow';
    return { type: 'diagram', kind: 'flow', spec: parseFlow(src, kind) };
  }

  var ARROW = /(-->\|[^|]*\||-\.->\|[^|]*\||==>\|[^|]*\||--\s[^<>]*?\s-->|-\.+->|==+>|-{2,}>|->|→)/y;
  var SHAPES = [
    [/^([^\s\[\](){}]+)\(\[(.*)\]\)$/, 'stadium'],
    [/^([^\s\[\](){}]+)\[\((.*)\)\]$/, 'db'],
    [/^([^\s\[\](){}]+)\[\/(.*)\/\]$/, 'io'],
    [/^([^\s\[\](){}]+)\(\((.*)\)\)$/, 'circle'],
    [/^([^\s\[\](){}]+)\{(.*)\}$/, 'decision'],
    [/^([^\s\[\](){}]+)\((.*)\)$/, 'round'],
    [/^([^\s\[\](){}]+)\[(.*)\]$/, 'box']
  ];

  function splitArrows(line) {
    var out = [], depth = 0, buf = '', i = 0;
    while (i < line.length) {
      var ch = line[i];
      if (depth === 0) {
        ARROW.lastIndex = i;
        var m = ARROW.exec(line);
        if (m && (ch !== '-' || buf.trim()) ) { out.push(buf); out.push(m[1]); buf = ''; i += m[1].length; continue; }
      }
      if ('[({'.indexOf(ch) >= 0) depth++;
      else if (')]}'.indexOf(ch) >= 0) depth = Math.max(0, depth - 1);
      buf += ch; i++;
    }
    out.push(buf);
    return out;
  }

  function parseFlow(src, hint) {
    var g = { dir: hint === 'cause' ? 'LR' : 'LR', nodes: {}, order: [], edges: [], groups: [] };
    var byText = {}, auto = 0, grp = null;
    function node(tok) {
      tok = tok.trim();
      if (!tok) return null;
      var cls = null, m = /:::([\w-]+)\s*$/.exec(tok);
      if (m) { cls = m[1]; tok = tok.slice(0, m.index).trim(); }
      var id = null, text, shape;
      for (var k = 0; k < SHAPES.length; k++) {
        if ((m = SHAPES[k][0].exec(tok))) { id = m[1]; text = m[2].trim().replace(/^"(.*)"$/, '$1'); shape = SHAPES[k][1]; break; }
      }
      if (!id) {
        if (g.nodes[tok]) id = tok;
        else if (byText[tok]) id = byText[tok];
        else if (/^[A-Za-z_][\w-]*$/.test(tok) && tok.length <= 3) id = tok;
        else { id = 'n' + (++auto); text = tok; }
      }
      var n = g.nodes[id];
      if (!n) {
        n = g.nodes[id] = { id: id, text: text !== undefined ? text : id, shape: shape || 'box', cls: null, group: grp ? grp.index : -1 };
        g.order.push(id);
        if (grp) grp.ids.push(id);
      } else {
        if (text !== undefined) n.text = text;
        if (shape) n.shape = shape;
      }
      byText[n.text] = id;
      if (cls) n.cls = cls;
      return id;
    }
    String(src).split('\n').forEach(function (raw) {
      var t = raw.trim().replace(/;$/, '');
      if (!t || /^%%/.test(t) || /^classDef\b|^style\b|^linkStyle\b/.test(t)) return;
      var m;
      if ((m = /^(?:flowchart|graph|direction)\s+(LR|RL|TD|TB|BT)\b/i.exec(t)) || (m = /^(LR|RL|TD|TB|BT)$/i.exec(t))) {
        g.dir = /^(LR|RL)$/i.test(m[1]) ? 'LR' : 'TD'; return;
      }
      if ((m = /^subgraph\s+(.*)$/.exec(t))) {
        var title = m[1].replace(/^[\w-]+\s*\[(.*)\]$/, '$1').replace(/^"(.*)"$/, '$1');
        grp = { index: g.groups.length, title: title, ids: [] }; g.groups.push(grp); return;
      }
      if (/^end$/.test(t)) { grp = null; return; }
      if ((m = /^class\s+([\w,\s-]+?)\s+([\w-]+)$/.exec(t))) {
        m[1].split(/[,\s]+/).forEach(function (id) { if (g.nodes[id]) g.nodes[id].cls = m[2]; });
        return;
      }
      var parts = splitArrows(t);
      var prev = null;
      for (var i = 0; i < parts.length; i += 2) {
        var ids = parts[i].split(/\s+&\s+/).map(node).filter(Boolean);
        if (prev && i > 0) {
          var a = parts[i - 1], lab = null;
          var lm = /\|([^|]*)\|/.exec(a) || /^--\s(.*?)\s-->$/.exec(a);
          if (lm) lab = lm[1].trim();
          var style = /-\./.test(a) ? 'dashed' : /==/.test(a) ? 'thick' : 'solid';
          prev.forEach(function (f) { ids.forEach(function (to) { g.edges.push({ from: f, to: to, label: lab, style: style }); }); });
        }
        prev = ids;
      }
    });
    return g;
  }

  function parseVs(src, kind) {
    var spec = { mode: kind === 'change' ? 'change' : 'vs', panels: [], label: '' };
    var p = null;
    String(src).split('\n').forEach(function (raw) {
      var t = raw.replace(/\s+$/, ''), tt = t.trim(), m;
      if (!tt) return;
      if ((m = /^#+\s+(.*)$/.exec(tt))) { p = { title: m[1], items: [] }; spec.panels.push(p); return; }
      if ((m = /^(?:->|→|=>)\s*(.*)$/.exec(tt))) { spec.label = m[1]; return; }
      if (!p) { p = { title: '', items: [] }; spec.panels.push(p); }
      if ((m = /^(\s*)[-*•]\s+(.*)$/.exec(t))) { p.items.push({ text: boldHead(m[2]), level: m[1].length >= 2 ? 2 : 1 }); return; }
      p.items.push({ text: tt, level: 0 });
    });
    return spec;
  }

  function parseSlide(chunk, index, total, mode) {
    var s = { blocks: [], _items: [], _ordered: false, _groups: [], _quote: [], _text: [], _rows: [], _images: [], _h1: null, _h2: null };
    var group = null, cur = null;   // cur: 이어 붙일 블록(list/table/lead)
    var fence = null;               // ```flow / ```vs / ```change 도식
    function push(b) { s.blocks.push(b); cur = b; return b; }

    chunk.split('\n').forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      var t = line.trim();
      if (fence) {
        if (/^```\s*$/.test(t)) { push(makeDiagram(fence.kind, fence.lines.join('\n'))); fence = null; cur = null; }
        else fence.lines.push(line);
        return;
      }
      var fm = /^```\s*([\w-]*)\s*$/.exec(t);
      if (fm) { fence = { kind: (fm[1] || 'flow').toLowerCase(), lines: [] }; return; }
      if (!t) { if (cur && cur.type !== 'list') cur = null; return; }
      var m;
      if ((m = /^<!--\s*([\w-]+)\s*-->$/.exec(t)) && LAYOUTS.indexOf(m[1]) >= 0) { s.layout = m[1]; return; }
      if (/^<!--[\s\S]*-->$/.test(t)) return;
      if (t === '|||') { push({ type: 'col' }); cur = null; return; }
      if ((m = /^###\s+(.*)$/.exec(t))) { group = { label: m[1], items: [] }; s._groups.push(group); push({ type: 'heading', text: m[1] }); cur = null; return; }
      if ((m = /^##\s+(.*)$/.exec(t))) { s._h2 = m[1]; return; }
      if ((m = /^#\s+(.*)$/.exec(t))) { s._h1 = m[1]; return; }
      if ((m = /^>\s?(.*)$/.exec(t))) {
        s._quote.push(m[1]);
        if (cur && cur.type === 'lead') cur.text += '\n' + m[1]; else push({ type: 'lead', text: m[1] });
        return;
      }
      if ((m = /^(?:→|=>)\s*(.*)$/.exec(t))) { push({ type: 'callout', text: m[1] }); return; }
      if (/^\|/.test(t)) {
        if (/^\|[\s:|-]+\|?$/.test(t)) return;
        var row = t.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
        s._rows.push(row);
        if (cur && cur.type === 'table') cur.rows.push(row); else push({ type: 'table', rows: [row] });
        return;
      }
      var img = parseImage(t);
      if (img) { s._images.push(img); push({ type: 'image', image: img }); cur = null; return; }
      if ((m = /^(\s*)(?:[-*•])\s+(.*)$/.exec(line)) || (m = /^(\s*)\d+[.)]\s+(.*)$/.exec(line))) {
        var ordered = /^\s*\d/.test(line);
        var level = m[1].replace(/\t/g, '    ').length >= 2 ? 2 : 1;
        if (ordered && level === 1) s._ordered = true;
        if (level === 1) (group ? group.items : s._items).push(m[2]);
        if (!(cur && cur.type === 'list')) push({ type: 'list', ordered: ordered && level === 1, items: [] });
        cur.items.push({ text: m[2], level: level });
        return;
      }
      if ((m = /^([a-z]+)\s*:\s*(.*)$/i.exec(t)) && KEYS.indexOf(m[1].toLowerCase()) >= 0) {
        var k = m[1].toLowerCase();
        if (k === 'highlight') {
          var tb = s.blocks.filter(function (b) { return b.type === 'table'; }).pop();
          if (tb) tb.highlightRow = Number(unquote(m[2]));
        }
        s[k] = unquote(m[2]);
        return;
      }
      s._text.push(t);
      if (cur && cur.type === 'para') cur.text += '\n' + t; else push({ type: 'para', text: t });
    });
    if (fence) push(makeDiagram(fence.kind, fence.lines.join('\n')));
    return finish(s, index, total, mode);
  }

  function inferTalk(s, index, total) {
    if (index === 0) return 'cover';
    if (s.blocks.some(function (b) { return b.type === 'diagram'; })) return 'report';
    if (total > 1 && index === total - 1 && !s._items.length && !s._images.length && !s._rows.length && !s._quote.length) return 'closing';
    if (s._rows.length) return 'table';
    if (s._groups.length >= 2) return 'compare';
    if (s._images.length >= 2) return 'images';
    if (s._images.length === 1) return (s._items.length || s._text.length) ? 'image-text' : 'image';
    if (s._quote.length && s.source) return 'quote';
    if (s._quote.length) return 'statement';
    if (s._ordered && s._items.length >= 3) return 'steps';
    if (s._items.length) return 'bullets';
    if (s._h1 && !s._text.length) return 'section';
    return 'statement';
  }

  function inferReport(s, index, total) {
    if (index === 0) return 'cover';
    var body = s.blocks.length;
    var onlyImg = body && s.blocks.every(function (b) { return b.type === 'image'; });
    if ((!body || onlyImg) && total > 1 && index === total - 1) return 'closing';
    if (!body && s._h1) return 'section';
    var kinds = s.blocks.map(function (b) { return b.type; });
    if (s._quote.length && s.source && kinds.every(function (k) { return k === 'lead'; })) return 'quote';
    return 'report';
  }

  function itemObj(x) {
    var p = parts(x);
    return p.length > 1 ? { head: p[0], body: p.slice(1).join(' — ') } : x;
  }

  function finish(s, index, total, mode) {
    var lay = s.layout || (mode === 'talk' ? inferTalk(s, index, total) : inferReport(s, index, total));
    var o = { layout: lay };
    var text = s._text.join('\n');
    if (s._h1) o.title = s._h1;
    if (s._h2) o.sub = s._h2;
    ['meta', 'caption', 'source', 'side', 'notes', 'style', 'number'].forEach(function (k) { if (s[k] !== undefined) o[k] = s[k]; });
    if (s.full !== undefined) o.full = /^(true|yes|1)$/i.test(s.full);
    var leadB = s.blocks.filter(function (b) { return b.type === 'lead'; })[0];
    if (leadB && lay !== 'statement' && lay !== 'quote') o.lead = leadB.text;

    switch (lay) {
      case 'report':
        var cols = [[]];
        var hasCol = s.blocks.some(function (b) { return b.type === 'col'; });
        var hcount = 0;
        s.blocks.forEach(function (b) {
          if (b === leadB) return;
          // ### 묶음이 두 개면 자동으로 좌우 2단
          if (!hasCol && s._groups.length === 2 && b.type === 'heading' && ++hcount === 2 && cols[0].length) cols.push([]);
          if (b.type === 'col') { cols.push([]); return; }
          if (b.type === 'list') b = { type: 'list', ordered: b.ordered, items: b.items.map(function (it) { return { text: boldHead(it.text), level: it.level }; }) };
          if (b.type === 'image') b = { type: 'image', image: b.image };
          cols[cols.length - 1].push(b);
        });
        o.cols = cols.filter(function (c) { return c.length; });
        if (s.ratio) o.ratio = s.ratio.split(/[:/, ]+/).map(Number);
        break;
      case 'cover':
        if (!o.sub && text) o.sub = text;
        if (s._images[0]) o.image = s._images[0];
        break;
      case 'agenda':
        o.items = s._items.map(itemObj);
        break;
      case 'section': case 'closing':
        if (!o.sub && text) o.sub = text;
        if (lay === 'closing' && s._images[0]) o.image = s._images[0];
        break;
      case 'statement':
        o.text = s._quote.length ? s._quote.join('\n') : (text || o.title || '');
        if (s._quote.length && text && !o.sub) o.sub = text;
        if (!s._quote.length && !text) delete o.title;
        break;
      case 'quote':
        o.text = s._quote.join('\n');
        break;
      case 'bullets': case 'steps':
        o.items = s._items.map(itemObj);
        if (text && !o.sub) o.sub = text;
        break;
      case 'stats':
        o.items = s._items.map(function (x) { var p = parts(x); return { label: p[0], value: p[1] || '', note: p[2] || '' }; });
        if (s.highlight) o.highlight = Number(s.highlight) - 1;
        break;
      case 'compare':
        o.left = { label: (s._groups[0] || {}).label || '', items: ((s._groups[0] || {}).items || []).map(itemObj) };
        o.right = { label: (s._groups[1] || {}).label || '', items: ((s._groups[1] || {}).items || []).map(itemObj) };
        break;
      case 'table':
        o.rows = s._rows;
        if (s.highlight) o.highlightRow = Number(s.highlight);
        if (s.widths) o.widths = s.widths.split(/[,\s]+/).map(Number);
        if (text && !o.caption) o.caption = text;
        break;
      case 'image':
        o.image = s._images[0] || null;
        if (o.image && o.image.caption && !o.caption) o.caption = o.image.caption;
        break;
      case 'image-text':
        o.image = s._images[0] || null;
        o.items = s._items.map(itemObj);
        if (text) o.text = text;
        break;
      case 'images':
        o.images = s._images;
        break;
    }
    return o;
  }

  function parseFront(md) {
    var meta = {}, body = md;
    var m = /^﻿?---\s*\n([\s\S]*?)\n---\s*\n/.exec(md);
    if (m) {
      body = md.slice(m[0].length);
      m[1].split('\n').forEach(function (l) {
        var k = /^([\w-]+)\s*:\s*(.*)$/.exec(l.trim());
        if (k) meta[k[1]] = unquote(k[2]);
      });
    }
    return { meta: meta, body: body };
  }

  function mdToDeck(md) {
    var fr = parseFront(String(md).replace(/\r\n?/g, '\n'));
    var mode = fr.meta.style === 'talk' ? 'talk' : 'report';
    var chunks = fr.body.split(/\n\s*---\s*\n/).filter(function (c) { return c.trim(); });
    return {
      title: fr.meta.title || '',
      style: mode,
      theme: fr.meta.theme || 'paper',
      date: fr.meta.date || '',
      font: fr.meta.font,
      colors: { highlight: fr.meta.highlight || undefined, point: fr.meta.accent || fr.meta.point || undefined },
      numbering: { skipCover: fr.meta.numberCover !== 'true', total: fr.meta.numbering === 'total' },
      slides: chunks.map(function (c, i) { return parseSlide(c, i, chunks.length, mode); })
    };
  }

  function parse(src) {
    var t = String(src || '').trim();
    if (!t) throw new Error('내용이 비어 있습니다.');
    if (t[0] === '{') return JSON.parse(t);
    return mdToDeck(t);
  }

  // ───── 점검 ─────
  function arr(v) { return v ? (Array.isArray(v) ? v : [v]) : []; }
  function plain(s) { return String(s || '').replace(/\*\*|==/g, ''); }
  var BANNED = /(프로젝트\s*\d*\s*팀|\d+\s*조\b|팀\s*\d+|team\s*\d+|copyright|ⓒ|©|all rights reserved)/i;
  var AI_WORDS = /(혁신적|획기적|시너지|극대화|도모|결론적으로|다양한 측면|중요한 역할|한눈에 보는|게임 ?체인저|새로운 지평)/;
  var EMOJI = /[☀-➿]|[\uD83C-\uD83E][\uDC00-\uDFFF]/;

  function imageRefs(deck) {
    var out = [];
    function add(r) { if (!r) return; var s = typeof r === 'string' ? r : r.src; if (s) out.push(s); }
    (deck.slides || []).forEach(function (s) {
      add(s.image); arr(s.images).forEach(add);
      arr(s.cols).forEach(function (c) { c.forEach(function (b) { if (b.type === 'image') add(b.image); }); });
    });
    return out;
  }

  // 순환을 제외한 최장 경로 길이(단계 수)
  function flowDepth(g) {
    var rank = {}, back = {}, st = {}, adj = {};
    g.edges.forEach(function (e, i) { (adj[e.from] = adj[e.from] || []).push(i); });
    function dfs(u) { st[u] = 1; (adj[u] || []).forEach(function (i) { var v = g.edges[i].to; if (st[v] === 1) back[i] = true; else if (!st[v]) dfs(v); }); st[u] = 2; }
    g.order.forEach(function (id) { rank[id] = 0; if (!st[id]) dfs(id); });
    for (var k = 0; k <= g.order.length; k++) g.edges.forEach(function (e, i) { if (!back[i] && rank[e.to] < rank[e.from] + 1) rank[e.to] = rank[e.from] + 1; });
    return 1 + Math.max.apply(null, [0].concat(g.order.map(function (id) { return rank[id]; })));
  }

  function lintReport(s, p, out) {
    var blocks = [].concat.apply([], arr(s.cols));
    var lists = blocks.filter(function (b) { return b.type === 'list'; });
    var tables = blocks.filter(function (b) { return b.type === 'table'; });
    var images = blocks.filter(function (b) { return b.type === 'image'; });
    var callouts = blocks.filter(function (b) { return b.type === 'callout'; });
    blocks.filter(function (b) { return b.type === 'diagram'; }).forEach(function (d) {
      images.push(d);
      if (d.kind === 'flow') {
        var n = d.spec.order.length;
        if (n < 2) out.push(p + '흐름도 노드가 ' + n + '개 — 문법을 확인하세요(A --> B)');
        if (n > 14) out.push(p + '흐름도 노드가 ' + n + '개 — 12개 안팎으로 묶으세요');
        var depth = flowDepth(d.spec);
        if (d.spec.dir === 'TD' && depth > 8) out.push(p + '세로 흐름도가 ' + depth + '단계 — 글씨가 작아집니다. 7단계 이하로 묶거나 LR로');
        if (d.spec.dir !== 'TD' && depth > 7) out.push(p + '가로 흐름도가 ' + depth + '단계 — 6단계 이하로 묶거나 슬라이드를 나누세요');
        d.spec.order.forEach(function (id) { var tx = plain(d.spec.nodes[id].text); if (tx.length > 28) out.push(p + '흐름도 "' + tx.slice(0, 10) + '…" 상자 글이 깁니다(28자 이내)'); });
      } else if (d.spec.panels.length < 2) out.push(p + '비교 도식은 # 제목으로 패널을 2개 이상 만드세요');
    });
    if (!s.lead) out.push(p + '핵심 메시지(> 한 문장)가 없습니다 — 이 장의 결론을 쓰세요');
    if (s.lead && plain(s.lead).length > 90) out.push(p + '핵심 메시지가 깁니다(90자 이내)');
    var top = 0, chars = plain(s.lead).length;
    lists.forEach(function (l) {
      l.items.forEach(function (it, k) {
        if (it.level === 1) top++;
        chars += plain(it.text).length;
        if (plain(it.text).length > 110) out.push(p + '항목 "' + plain(it.text).slice(0, 12) + '…" 이 깁니다(110자 이내) — 하위 항목으로 쪼개세요');
      });
    });
    blocks.forEach(function (b) { if (b.type === 'para') { chars += plain(b.text).length; if (plain(b.text).length > 140) out.push(p + '문단이 줄글입니다 — 항목으로 구조화하세요'); } });
    if (top > 6) out.push(p + '큰 항목이 ' + top + '개 — 6개 이하로 묶거나 슬라이드를 나누세요');
    if (chars > 620) out.push(p + '글이 ' + chars + '자 — 600자 안쪽으로 줄이거나 나누세요');
    tables.forEach(function (t) {
      var marked = t.highlightRow !== undefined || /==/.test(JSON.stringify(t.rows));
      if (!marked) out.push(p + '표에서 봐야 할 행·칸을 표시하세요 (highlight: n 또는 ==값==)');
      if (t.rows.length > 9) out.push(p + '표가 ' + t.rows.length + '행 — 핵심 행만 남기세요');
    });
    if ((tables.length || images.length) && !s.lead && !callouts.length)
      out.push(p + '표·그림을 어떻게 읽어야 하는지 문장(> 또는 →)이 필요합니다');
  }

  function lint(deck) {
    var out = [];
    (deck.slides || []).forEach(function (s, i) {
      var p = (i + 1) + '쪽 ';
      var lay = s.layout || 'bullets';
      if (LAYOUTS.indexOf(lay) < 0) out.push(p + '알 수 없는 layout "' + lay + '"');
      if (s.title && plain(s.title).length > 30 && lay !== 'cover') out.push(p + '제목이 깁니다(30자 이내)');
      if (lay === 'report') lintReport(s, p, out);
      else {
        var items = arr(s.items);
        var max = lay === 'agenda' ? 7 : lay === 'steps' ? 5 : lay === 'stats' ? 5 : 4;
        if (items.length > max) out.push(p + '항목 ' + items.length + '개 — ' + max + '개 이하로 나누세요');
        items.forEach(function (it, k) {
          var head = typeof it === 'string' ? it : (it.head || it.label || '');
          var body = typeof it === 'string' ? '' : (it.body || it.note || '');
          if (plain(head).length > 40) out.push(p + (k + 1) + '번 항목이 깁니다(40자 이내)');
          if (plain(body).length > 70) out.push(p + (k + 1) + '번 설명이 깁니다(70자 이내)');
        });
        if (lay === 'statement' && plain(s.text).length > 70) out.push(p + '핵심 문장이 깁니다(70자 이내)');
        if (lay === 'table' && s.highlightRow === undefined && !/==/.test(JSON.stringify(s.rows))) out.push(p + '표에서 봐야 할 행·칸을 표시하세요');
      }
      if ((lay === 'image' || lay === 'image-text') && !s.image) out.push(p + '사진이 지정되지 않았습니다');
      var all = JSON.stringify(s);
      var marks = (all.match(/==[^=]+==/g) || []).length;
      if (marks > 3) out.push(p + '형광펜 강조가 ' + marks + '곳 — 3곳 이하로');
      if (lay !== 'cover' && BANNED.test(all)) out.push(p + '팀명·저작권 같은 반복 표기는 표지 meta에만');
      var ai = AI_WORDS.exec(all);
      if (ai) out.push(p + '상투적 표현 "' + ai[1] + '" — 구체적으로 바꾸세요');
      if (EMOJI.test(all) || /[!！]/.test(plain(s.title) + plain(s.lead))) out.push(p + '이모지·느낌표는 빼세요');
    });
    return out;
  }

  return { parse: parse, mdToDeck: mdToDeck, lint: lint, imageRefs: imageRefs, LAYOUTS: LAYOUTS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DeckCore;
