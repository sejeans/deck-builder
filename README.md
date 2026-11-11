# Deck Builder

프로젝트 폴더 → (Claude Code) `slides.md` + 차트 → (Figma 플러그인) 슬라이드

```
deck-builder/
├─ figma-plugin/      Figma에 import 하는 플러그인 (manifest.json, code.js, ui.html)
├─ skill/slides/      Claude Code 스킬: 원고 작성 규칙, check.js, slidechart.py, 예시
├─ src/               플러그인 원본 (core.js = md 해석·점검, plugin.js = 그리기)
└─ build.sh           src → figma-plugin/code.js 로 합치기
```

## 설치 (한 번)

**Figma 플러그인** — Figma 데스크톱 → Plugins → Development → Import plugin from manifest… → `figma-plugin/manifest.json`
폰트는 [Pretendard](https://github.com/orioncactus/pretendard) 권장 (없으면 SUIT → Noto Sans KR → Inter).

**Claude Code 스킬** — 모든 프로젝트에서 쓰려면:
```bash
mkdir -p ~/.claude/skills && cp -r skill/slides ~/.claude/skills/slides
```
한 프로젝트에서만 쓰려면 그 프로젝트의 `.claude/skills/slides`에 복사.
차트용: `pip install matplotlib`

## 쓰는 법

1. 프로젝트 폴더에서 Claude Code에게 "발표 자료 만들어줘 (10분, 수업 발표)"
   → `slides/slides.md`, `slides/assets/*.png`, `slides/charts/*.py` 생성, 점검 통과까지 수정
2. 원고를 직접 고치고 싶으면 `slides.md`를 편집 (마크다운이라 바로 읽힘)
3. Figma → Plugins → Development → Deck Builder → slides.md 열기 → assets 파일 끌어 놓기 → 생성
4. 발표: ▶ Present 후 방향키 / PDF: 슬라이드 전체 선택 → Export PDF

## 고정 디자인 규칙

기본은 **보고서형**(슬라이드만 읽어도 이해되는 형식): 모든 내용 슬라이드에 `큰 흐름(섹션) → 세부 제목 → 핵심 메시지 → 구분선 → 구조화된 본문`. 목차는 섹션 슬라이드에서 자동 생성. 본문 글자는 공간에 맞춰 0.8–1.2배로 자동 조절. 글이 적은 발표형은 slides.md 맨 위에 `style: talk`.

- 기본은 논문 발표형(`theme: paper`): 남색 띠 머리·바닥, 소제목 남색 상자, 번호 항목은 01·02 원+띠, `**굵게**` 남색·`==강조==` 주황, 옅은 회색 원 장식. 예전 흰 배경·노랑·빨강 디자인은 `theme: plain`
- 강조는 형광펜 또는 굵게. 숫자를 크게 키우지 않음
- 읽는 순서대로 배치: 수치는 "무엇 → 얼마 → 부연" 한 줄, 차트 슬라이드는 "제목 → 요점(왼) → 차트(오)"
- 머리글·바닥글·팀명 반복 없음, 페이지 번호만 우하단(표지 제외)
- 한국어는 어절 단위로 직접 줄바꿈(글자 중간에서 끊기지 않게), 넘치면 글자 크기 축소 후 경고

색을 바꾸려면 slides.md 맨 위 `highlight:` / `accent:` 또는 플러그인의 "색 바꾸기".

## 도식

`slides.md` 안에 ```` ```flow ````(Mermaid 흐름도 문법), ```` ```vs ````, ```` ```change ```` 블록을 쓰면 **Figma 도형**으로 그려집니다. 상자는 자동 레이아웃 프레임이라 글자를 고치면 상자 크기가 따라 맞춰집니다. 화살표는 일반 벡터라서, 상자를 옮길 때는 화살표도 같이 옮겨야 합니다(Figma 디자인 파일에는 따라 움직이는 연결선 기능이 없음). 예시는 `skill/slides/example/diagrams.md`에 있습니다.

## 고칠 때

`src/`를 수정한 뒤 `./build.sh` → Figma에서 플러그인 다시 실행(재import 불필요).
