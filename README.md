# 교통여지도

한국교통대 학생들이 추천한 충주 맛집·카페·주점 95곳을 음식 그림으로 고르고, 필요할 때 카카오맵에서 위치를 보는 모바일 웹앱.

- 서버 없는 정적 사이트: `index.html` + `style.css` + `app.js` (+ `logic.js` 순수 계산, `motion.js` 애니메이션)
- 화면: 홈(분류 타일·음식 종류 칩·구역·오늘의 추천·카드 목록) → 가게 상세 → 지도. 주소는 `#/`, `#/p/<가게>`, `#/map`, `#/map/<가게>`.
- 데이터: `data/places.json` — 원본 엑셀을 `scripts/build_places.py`로 한 번 변환(좌표 포함). 앱은 실행 중 카카오 로컬 API를 부르지 않는다.
- 지도: 카카오맵 JavaScript SDK. JavaScript 키는 공개용이며 카카오 콘솔의 허용 도메인으로 보호한다.
- 애니메이션: Anime.js 4.5.0(CDN). 못 불러오거나 '동작 줄이기' 설정이면 애니메이션 없이 그대로 동작한다.
- 음식 사진: 가게 사진이 아니라 메뉴 종류(`logic.js`의 `foodType()`)별 AI 생성 예시 사진이다. 같은 종류 안에서도 `foodPhoto()`가 이름과 첫 메뉴로 변형 사진(뼈해장국·막창)을 고른다. `img/food/<key>.webp`(960px) + `<key>-480.webp`(480px)를 `srcset`으로 고른다.

## 로컬 실행

```bash
python -m http.server 8080   # http://localhost:8080 (카카오 콘솔에 등록된 주소)
node --test logic.test.mjs   # 필터·정렬·경계·음식 종류·검색 테스트
```

## 음식 사진 다시 만들기

Gemini로 만든 2048×2048 PNG(약 8MB, 저장소 밖 `..\제미나이_이미지작업\AI사진\`)를 줄여 webp 두 크기로 저장한다. 원본 PNG는 커밋하지 않는다.
사진을 추가하려면 스크립트의 `PHOTOS`에 한 줄 넣고, 그 key를 `app.js`의 `OLD_IMG`와 스크립트의 `OLD`에서 지운다.
출처는 실행할 때 `img/food/CREDITS.md`로 다시 쓰인다.

```bash
pip install pillow
python scripts/make_food_images.py ../제미나이_이미지작업/AI사진                 # 전체
python scripts/make_food_images.py ../제미나이_이미지작업/AI사진 pasta --board 비교판.jpg
```

학식·커피·빵·디저트·주점·카페 타일은 아직 AI 사진이 없어 예전 누끼 합성 그림을 회색 원에 넣어 보여 준다.

## 글꼴 서브셋 다시 만들기

화면 문구나 데이터를 바꾸면 다시 만들고, 빠진 글자가 없는지 확인한다.

```bash
pip install fonttools brotli
python scripts/subset_fonts.py           # 다시 만들고 검사
python scripts/subset_fonts.py --check   # 검사만
```

## 데이터 다시 만들기

```bash
python scripts/build_places.py <원유철_데이터.xlsx 경로>
```

REST API 키는 환경 변수 `KAKAO_REST_API_KEY` 또는 `~/.config/kakao/.env`에서 읽는다. 저장소에는 넣지 않는다.

## 라이선스

- 글꼴: Pretendard (SIL OFL 1.1, `fonts/Pretendard-LICENSE.txt`)
- 음식 사진: Gemini로 생성(원유철). 아직 남은 옛 그림의 원본 사진은 `img/food/CREDITS.md` (CC0·퍼블릭 도메인·CC BY)
- 로고 글씨: 송명체 Song Myung (SIL OFL 1.1)를 윤곽선으로 변환 (`img/logo.svg`, 지금 화면에서는 쓰지 않음)
- 애니메이션: Anime.js (MIT)
- 색: 한국교통대 온라인 컬러시스템 (KNUT Burgundy `#770E06`, KNUT Red `#AB2328`)
