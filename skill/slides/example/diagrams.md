---
title: 도식 예시
---

# 전기차 모터 고장 분류
## 센서 시계열 기반 MiniRocket 분류 모델
meta: 2026.10 · 산업데이터공학과

---

# 연구 방법
## 데이터 변환부터 학습 절차까지

---

# 분석 파이프라인
> 시계열을 ==MiniRocket==으로 특징 벡터로 바꾼 뒤 로지스틱 회귀로 고장을 분류함

```flow
시계열 CSV --> MR[MiniRocket]:::hl --> 특징 벡터 --> LR[Logistic Regression] --> 고장 분류
```

- **MiniRocket** — 무작위 합성곱 커널로 시계열의 패턴을 고정 길이 특징으로 변환
- **Logistic Regression** — 변환된 특징으로 결함 유형(DEMAG·ECC10·ECC20·NORMAL·REDUC) 분류

---

# 데이터 경량화
> 고해상도 PNG를 시계열 CSV로 바꿔 파일 크기를 ==약 12배== 줄임

```change
# PNG (원본)
- 225개 = 5개 × 센서 3 × 결함 5 × 차량 3
- 5개 파일 15.5MB
- 2000×1280 고해상도 이미지
# CSV (변환 후)
- 81개
- 5개 합친 파일 **1.3MB**
- 핵심 특징만 추출한 시계열
-> CSV 변환
```

→ AI Hub 원본은 이미지라 그대로 학습하기 무겁기 때문에, 핵심 특징만 추출해 시계열로 변환함
source: AI Hub 전기차 모터 진동·전류 데이터

---

# 데이터 누수 방지
> 같은 CSV에서 나온 청크는 반드시 train·validation 중 한쪽에만 둠

- **청크 분리** — CSV를 2,000행씩 나눔 `chunker(chunk_size=2000)`
- **문제** — 같은 CSV의 청크는 같은 환경에서 측정된 연속 구간이라 신호 패턴이 거의 같음
- **해결** — 같은 CSV에서 나온 청크는 같은 group_key를 상속하고, group_key 단위로 분리

|||

```flow
TD
A[같은 CSV 청크가 train·val에 섞임] --> B[양쪽에 거의 같은 패턴] --> C[검증 성능 과대평가]
D[group_key 단위 분리]:::hl -.->|차단| B
```

---

# 센서별 학습 구조
> 센서 3종을 각각 같은 절차로 학습하며, 분리는 group_key 기준으로 함

```flow
S[CSV를 2,000행 청크로 분리]
subgraph Current_U
  A1[Train·Val 분리] --> A2[MiniRocket] --> A3[Logistic Regression]
end
subgraph Vib_Motor
  B1[Train·Val 분리] --> B2[MiniRocket] --> B3[Logistic Regression]
end
subgraph Vib_TM
  C1[Train·Val 분리] --> C2[MiniRocket] --> C3[Logistic Regression]
end
S --> A1 & B1 & C1
```

---

# CNN 학습 절차
> 성능 기준을 충족할 때까지 ==모델 경량화 → 재학습==을 반복함

- **입력** — NUMPY 신호 데이터와 JSON 라벨을 함께 불러옴
- **반복** — 기준 미달이면 하이퍼파라미터를 재조정해 경량화 단계부터 다시 학습
- **종료** — 기준을 충족한 모델을 최종 선정

|||

```flow
flowchart TD
S([START]) --> A[/NUMPY 데이터 · JSON 라벨 입력/] --> C[데이터 경량화] --> D[CNN 학습] --> E[모델 경량화]:::hl --> F{성능 기준 충족}
F -->|yes| G([최종 선정]) --> Z([END])
F -->|no| R(재조정 및 재학습) --> E
```

---

# 개선 방향
> 학습 속도를 먼저 개선한 뒤, 센서 통합 모델로 예측 성능을 높임

```flow
M[센서별 모델 3개] --> P1(솔버 교체) & P2(변환 결과 캐싱) & P3(슬롯 병렬 학습)
P1 & P2 & P3 --> Q[학습 속도 개선]:::red --> I(센서 통합 모델) --> R[예측 성능 개선]:::red
```

---

# 센서별 모델과 통합 모델
> 센서 3종의 특징을 합친 12채널 통합 모델로 센서 간 관계까지 학습함

```vs
# 센서별 모델
- 센서마다 피처 4개로 따로 학습
- 모델 3개, 결과도 3개
- 센서 간 관계는 반영 못 함
# 12채널 통합 모델
- 3개 센서 × 피처 4개 = **피처 12개**
- 모델 1개로 고장 분류
- ==센서 간 관계까지 학습==
```

---

# 감사합니다
