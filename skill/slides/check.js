#!/usr/bin/env node
// slides.md 점검: node check.js slides/slides.md [사진폴더]
// - 플러그인과 같은 규칙으로 문구를 점검하고, 빠진 사진을 찾고, slides.deck.json을 함께 씁니다.
const fs = require('fs');
const path = require('path');
const core = require('./core.js');

const file = process.argv[2];
if (!file) { console.error('사용법: node check.js slides.md [assets 폴더]'); process.exit(2); }
const assets = process.argv[3] || path.join(path.dirname(file), 'assets');

const deck = core.parse(fs.readFileSync(file, 'utf8'));
const warns = core.lint(deck);

const have = fs.existsSync(assets) ? fs.readdirSync(assets).map((n) => n.toLowerCase()) : [];
const base = (n) => n.toLowerCase().replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]+$/, '');
for (const r of core.imageRefs(deck)) {
  if (r === 'auto' || /^https?:/i.test(r)) continue;
  if (!have.some((h) => h === path.basename(r).toLowerCase() || base(h) === base(r))) warns.push(`사진 없음: ${r} (${assets})`);
}

const out = file.replace(/\.md$/i, '') + '.deck.json';
fs.writeFileSync(out, JSON.stringify(deck, null, 2));

console.log(`${deck.slides.length}장 · ` + deck.slides.map((s, i) => `${i + 1}:${s.layout}`).join(' '));
if (warns.length) { console.log('\n점검할 곳'); warns.forEach((w) => console.log('· ' + w)); process.exit(1); }
console.log('점검 통과');
