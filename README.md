# PrizeDraw

방송 화면 공유에 맞춘 학번 기반 경품 추첨 웹앱입니다.

## 기능

- CSV 또는 텍스트 붙여넣기 참가자 입력
- 학번 정규화, 형식 검증, 중복 제거
- 참가자 목록 고정 후 seed 생성
- SHA-256 기반 재현 가능한 추첨
- 3등 20명, 2등 1명, 1등 1명 순차 공개
- 방송용 전체 화면 UI와 마스킹 학번 표시
- 결과 JSON/CSV 다운로드

## 개발

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
```
