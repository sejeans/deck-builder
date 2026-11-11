"""슬라이드용 차트 스타일 — 흰 배경, 회색 기본, 강조 1곳만 남색, 강조 구간은 주황(논문 발표형 덱 색).

    import slidechart as sc
    fig, ax = sc.figure("wide")   # wide: 본문 폭 전체, col: 보고서형 2단의 한쪽, side/half/third: 발표형
    sc.bar(ax, ["이동평균", "ARIMA", "LightGBM"], [71, 79, 92], emphasize=[2], fmt="{:.0f}%")
    sc.save(fig, "slides/assets/accuracy.png")

규칙: 차트 안에 제목을 넣지 않는다(슬라이드 제목이 결론). 범례 대신 선 끝에 이름을 쓴다.
"""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

# 슬라이드 칸 크기(px). 플러그인 레이아웃과 맞춰 두었습니다.
SIZES = {"wide": (1680, 600), "col": (880, 620), "side": (1056, 740), "half": (800, 820), "third": (540, 620)}
INK, SUB, GRID, BASE = "#111111", "#505055", "#E2E2DF", "#B9B9BE"
POINT, HIGHLIGHT = "#12306B", "#F2A900"


def _font() -> str:
    names = {f.name for f in font_manager.fontManager.ttflist}
    for fam in ("Pretendard", "Pretendard Variable", "SUIT", "Noto Sans KR", "Noto Sans CJK KR",
                "Apple SD Gothic Neo", "AppleGothic", "Malgun Gothic", "NanumGothic"):
        if fam in names:
            return fam
    return "sans-serif"


def setup(point: str = POINT, highlight: str = HIGHLIGHT) -> None:
    global POINT, HIGHLIGHT
    POINT, HIGHLIGHT = point, highlight
    plt.rcParams.update({
        "font.family": _font(), "axes.unicode_minus": False,
        "font.size": 19, "text.color": INK, "axes.labelcolor": SUB,
        "xtick.color": INK, "ytick.color": SUB, "xtick.labelsize": 19, "ytick.labelsize": 17,
        "axes.edgecolor": GRID, "axes.spines.top": False, "axes.spines.right": False,
        "axes.spines.left": False, "axes.grid": True, "axes.grid.axis": "y",
        "grid.color": GRID, "grid.linewidth": 1, "axes.axisbelow": True,
        "xtick.major.size": 0, "ytick.major.size": 0,
        "figure.facecolor": "white", "axes.facecolor": "white", "savefig.facecolor": "white",
    })


def figure(size: str = "wide"):
    setup(POINT, HIGHLIGHT)
    w, h = SIZES[size]
    fig, ax = plt.subplots(figsize=(w / 100, h / 100), dpi=100)
    return fig, ax


def bar(ax, labels, values, emphasize=(), fmt="{:,.0f}", horizontal=False):
    """막대: 기본 회색, emphasize 인덱스만 남색. 값은 막대 끝에 직접 표시."""
    colors = [POINT if i in emphasize else BASE for i in range(len(values))]
    if horizontal:
        bars = ax.barh(labels, values, color=colors, height=0.56)
        ax.invert_yaxis()
        ax.grid(False); ax.grid(True, axis="x")
        ax.tick_params(axis="x", labelbottom=False)
        for b, v, i in zip(bars, values, range(len(values))):
            ax.text(b.get_width(), b.get_y() + b.get_height() / 2, "  " + fmt.format(v), va="center",
                    fontweight="bold" if i in emphasize else "normal", color=INK)
    else:
        bars = ax.bar(labels, values, color=colors, width=0.56)
        ax.tick_params(axis="y", labelleft=False)
        for b, v, i in zip(bars, values, range(len(values))):
            ax.text(b.get_x() + b.get_width() / 2, b.get_height(), fmt.format(v), ha="center", va="bottom",
                    fontweight="bold" if i in emphasize else "normal", color=INK)
        ax.margins(y=0.15)
    return ax


def line(ax, x, series: dict, emphasize=None, fmt="{:,.0f}", label_end=True):
    """선: 강조 계열만 남색·굵게, 나머지 회색. 범례 없이 선 끝에 이름."""
    for name, ys in series.items():
        hot = name == emphasize
        ax.plot(x, ys, color=POINT if hot else BASE, linewidth=3.2 if hot else 2, zorder=3 if hot else 2)
        if label_end:
            ax.annotate(f"  {name} {fmt.format(ys[-1])}", (x[-1], ys[-1]), va="center",
                        color=INK if hot else SUB, fontweight="bold" if hot else "normal", annotation_clip=False)
    ax.margins(x=0.02)
    return ax


def band(ax, x0, x1, label=None):
    """주황 강조 구간(예: 혼잡 시간대)."""
    ax.axvspan(x0, x1, color=HIGHLIGHT, alpha=0.35, linewidth=0, zorder=0)
    if label:
        ax.text((x0 + x1) / 2, 1.0, label, transform=ax.get_xaxis_transform(), ha="center", va="bottom", color=INK)
    return ax


def save(fig, path: str):
    fig.tight_layout(pad=0.6)
    fig.savefig(path, dpi=200)
    plt.close(fig)
    return path
