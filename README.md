# 교통여지도

한국교통대 학생들이 추천한 충주 맛집·카페·주점 94곳을 음식 그림으로 고르고, 필요할 때 카카오맵에서 위치를 보는 모바일 웹앱.

- 서버 없는 정적 사이트: `index.html` + `style.css` + `app.js` (+ `logic.js` 순수 계산, `motion.js` 애니메이션, `glass.js` 유리 반사광·굴절)
- 화면: 홈(분류 타일·음식 종류 칩·구역·오늘의 추천·카드 목록) → 가게 상세 → 지도. 주소는 `#/`, `#/p/<가게>`, `#/map`, `#/map/<가게>`.
- 화면 너비: 640px 미만은 휴대폰, 640~1023px은 태블릿(카드 3열), 1024px 이상은 PC — 왼쪽 유리 사이드바(홈·지도·명소 버튼, 검색·칩·구역·정렬, 가게 목록) + 오른쪽 홈 그리드 또는 지도. PC에서 상세는 화면을 바꾸지 않고 오른쪽 위 패널로 열린다. `/` 검색, `Esc` 닫기.
- 데이터: `data/places.json` — 원본 엑셀을 `scripts/build_places.py`로 한 번 변환(좌표 포함). 앱은 실행 중 카카오 로컬 API를 부르지 않는다.
- 지도: 카카오맵 JavaScript SDK. JavaScript 키는 공개용이며 카카오 콘솔의 허용 도메인으로 보호한다.
- 애니메이션: Anime.js 4.5.0(CDN). 못 불러오거나 '동작 줄이기' 설정이면 애니메이션 없이 그대로 동작한다.
- 음식 사진: 가게 사진이 아니라 메뉴 종류(`logic.js`의 `foodType()`)별 AI 생성 예시 사진이다. 같은 종류 안에서도 `foodPhoto()`가 이름과 첫 메뉴로 변형 사진(뼈해장국·막창)을 고른다. `img/food/<key>.webp`(960px) + `<key>-480.webp`(480px)를 `srcset`으로 고른다.

## 교통대 명소 · 학생 제보 (Supabase)

맛집과 따로 **교통대 명소**를 지도에 띄운다. 학생이 지도에 핀을 꽂고 사진 1~3장과 글을 보내면 **승인 대기**가 되고, 운영자가 `admin.html`에서 승인한 것만 지도에 별 모양 핀으로 뜬다.

- 지도 위 **맛집 · 명소 · 함께** 버튼으로 바꿔 본다. PC는 사이드바 맨 위 **명소** 칸.
- **제보하기:** 휴대폰은 지도를 길게 누르기, PC는 오른쪽 클릭, 또는 **[제보]** 버튼을 누른 뒤 지도를 한 번 누르기.
- 사진은 브라우저에서 긴 변 1600px webp로 다시 그려 올린다(촬영 위치 등 EXIF가 남지 않음, 한 장 2MB 이하).
- 글 20~500자, 닉네임은 선택, 이메일·전화번호는 받지 않는다. 같은 기기는 1분에 1건, 서버는 10분에 대기 30건까지만 받는다.
- 서버 접속 정보는 `supa.js` 맨 위(Project URL, **publishable 키**). 이 두 값은 공개돼도 된다. **`sb_secret_…`·`service_role` 키는 어떤 파일에도 넣지 않는다.**

### 처음 한 번 설정하기 (약 10분)

1. **표·보관함 만들기** — [supabase.com](https://supabase.com) → `gyotong-yeojido` 프로젝트 → 왼쪽 **SQL Editor** → **New query** → `supabase/schema.sql` 내용을 **전부** 붙여넣고 **Run**. 여러 번 다시 실행해도 안전하다.
2. **운영자 등록** — 같은 SQL Editor에서 새 쿼리로 아래 한 줄을 **내 이메일로 바꿔서** Run. (이메일은 저장소 파일에 쓰지 않는다.)
   ```sql
   insert into public.admins (email) values ('내이메일@example.com') on conflict do nothing;
   ```
3. **로그인 메일이 돌아올 주소 허용** — 왼쪽 **Authentication → URL Configuration**
   - **Site URL**: `https://yufe9.github.io/gyotong-yeojido/`
   - **Redirect URLs**에 두 줄 추가: `https://yufe9.github.io/gyotong-yeojido/admin.html`, `http://localhost:8080/admin.html`
4. **막힘 확인** — 터미널에서 `node scripts/check_rls.mjs`. 모두 "통과"여야 한다. (확인용 제보 1건이 '대기'에 남으니 admin.html에서 거절하면 사진까지 지워진다.)

### 운영자: 승인하는 방법

1. `admin.html`(예: `https://yufe9.github.io/gyotong-yeojido/admin.html`)을 연다.
2. 운영자 이메일을 넣고 **로그인 링크 받기** → 메일의 링크를 **같은 기기**에서 누르면 로그인된다.
3. **대기** 탭에서 사진과 글을 본다.
   - **승인**: 그대로 지도에 공개
   - **수정 후 승인**: 칸을 고친 뒤 누르면 고친 내용으로 공개
   - **거절**: 공개하지 않고, 올라온 사진 파일도 지운다
4. **승인됨** 탭에서 공개된 명소를 고치거나 내릴 수 있다.
5. **직접 등록**: 운영자로 로그인한 채로 앱 지도에서 길게 누르기(PC는 오른쪽 클릭) → 저장하면 승인 없이 바로 공개된다.

> 권한은 화면이 아니라 서버(RLS)가 지킨다. 익명은 "대기로 추가"와 "승인된 것 읽기"만 할 수 있고, 대기 목록 보기·수정·삭제·운영자 명단 보기는 막혀 있다.
> 더 강한 봇 막기가 필요하면 Cloudflare Turnstile(무료 사람 확인)을 붙일 수 있다(아직 넣지 않음).

## 로컬 실행

```bash
python -m http.server 8080   # http://localhost:8080 (카카오 콘솔에 등록된 주소)
node --test logic.test.mjs   # 필터·정렬·경계·음식 종류·검색·명소 제보 검사 테스트
node scripts/check_rls.mjs   # Supabase 막힘(RLS) 실제 확인
```

## 음식 사진 다시 만들기

Gemini로 만든 2048×2048 PNG(약 8MB, 저장소 밖 `..\제미나이_이미지작업\AI사진\`)를 줄여 webp 두 크기로 저장한다. 원본 PNG는 커밋하지 않는다.
사진을 추가하려면 스크립트의 `PHOTOS`에 한 줄 넣는다. 같은 종류 안의 변형 사진(예: 부대찌개)이면 `logic.js`의 `PHOTO_VARIANTS`와 `app.js`의 `PHOTO_ALT`에도 넣는다.
출처는 실행할 때 `img/food/CREDITS.md`로 다시 쓰인다.

```bash
pip install pillow
python scripts/make_food_images.py ../제미나이_이미지작업/AI사진                 # 전체
python scripts/make_food_images.py ../제미나이_이미지작업/AI사진 pasta --board 비교판.jpg
```


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
- 색: 삿포로 테마(하늘 `#d3e5ef`, 잉크 `#0c1a24`, 뮤트 `#3f5464`, 가로등빛 구리색 강조 `#9a4c0c`). 값은 `style.css` 맨 위 `:root`에만 있다
- 유리: Liquid Glass 기법(블러 + 반사층 + 포인터 반사광). SVG 굴절은 크롬 계열 PC에서 검색창·탭 바·상세 시트에만
