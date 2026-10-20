# 교통여지도

한국교통대 학생들이 추천한 충주 맛집·카페·주점 95곳을 카카오맵 위에서 보고 고르는 모바일 웹앱.

- 서버 없는 정적 사이트: `index.html` + `style.css` + `app.js` (+ `logic.js`)
- 데이터: `data/places.json` — 원본 엑셀을 `scripts/build_places.py`로 한 번 변환(좌표 포함). 앱은 실행 중 카카오 로컬 API를 부르지 않는다.
- 지도: 카카오맵 JavaScript SDK. JavaScript 키는 공개용이며 카카오 콘솔의 허용 도메인으로 보호한다.

## 로컬 실행

```bash
python -m http.server 8080   # http://localhost:8080
node --test logic.test.mjs   # 필터·정렬·경계 계산 테스트
```

## 데이터 다시 만들기

```bash
python scripts/build_places.py <원유철_데이터.xlsx 경로>
```

REST API 키는 환경 변수 `KAKAO_REST_API_KEY` 또는 `~/.config/kakao/.env`에서 읽는다. 저장소에는 넣지 않는다.

## 라이선스

- 글꼴: Pretendard (SIL OFL 1.1, `fonts/Pretendard-LICENSE.txt`)
- 로고 글씨: 송명체 Song Myung (SIL OFL 1.1)를 윤곽선으로 변환
- 색: 한국교통대 온라인 컬러시스템 (KNUT Burgundy `#770E06`, KNUT Red `#AB2328`)
