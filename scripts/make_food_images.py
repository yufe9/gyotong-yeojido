"""음식 사진(Gemini로 만든 정사각 PNG)을 앱용 webp 두 크기로 줄인다.

원본(2048×2048, 약 8MB)은 저장소 밖에 두고 폴더 경로를 인자로 준다. 원본은 커밋하지 않는다.
사진 전체를 그대로 쓴다(누끼·자르기 없음).

    pip install pillow
    python scripts/make_food_images.py <원본 폴더>                  # 전체
    python scripts/make_food_images.py <원본 폴더> pasta bbq        # 일부만
    python scripts/make_food_images.py <원본 폴더> --board 비교판.jpg

출력: img/food/<key>.webp(960px, 상세 화면) + img/food/<key>-480.webp(카드·칩).
사진을 추가하려면 PHOTOS 에 한 줄 넣는다. 변형 사진이면 logic.js 의 PHOTO_VARIANTS 와 app.js 의 PHOTO_ALT 에도 넣는다.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'img', 'food')
SIZES = [(960, '', 180_000), (480, '-480', 60_000)]  # (한 변, 파일 꼬리, 최대 바이트)
CREDIT = 'Gemini로 생성(원유철)'

# key: (한글 이름, 원본 파일 이름)
PHOTOS = {
    'jjamppong': ('짬뽕', '짬뽕.png'),
    'malatang': ('마라탕', '마라탕.png'),
    'gukbap': ('돼지국밥', '돼지국밥.png'),
    'gukbap-bone': ('뼈해장국', '뼈해장국.png'),
    'bbq': ('삼겹살', '삼겹살.png'),
    'bbq-makchang': ('막창', '막창.png'),
    'dakgalbi': ('닭갈비', '닭갈비.png'),
    'chicken': ('치킨', '치킨.png'),
    'burger': ('햄버거', '햄버거.png'),
    'bunsik': ('분식', '분식.png'),
    'rice': ('덮밥', '덮밥.png'),
    'noodle': ('국수', '국수.png'),
    'donkatsu': ('돈가스', '돈가스.png'),
    'sushi': ('초밥과 우동', '초밥과 우동.png'),
    'pasta': ('파스타', '파스타.png'),
    'burrito': ('부리또', '부리또.png'),
    'salad': ('샌드위치 샐러드', '샌드위치 샐러드.png'),
    'cafeteria': ('학식', '학식.png'),
    'coffee': ('커피', '커피.png'),
    'bread': ('빵', '빵.png'),
    'dessert': ('푸딩·빙수·와플', '푸딩디저트.png'),
    'pub': ('안주', '안주.png'),
    # 같은 종류 안의 변형 사진(logic.js 의 PHOTO_VARIANTS 가 고른다)
    'gukbap-budae': ('부대찌개', '부대찌개.png'),
    'gukbap-kimchi': ('김치찌개', '김치찌개.png'),
    'rice-ssam': ('우렁쌈밥', '우렁쌈밥.png'),
    'burrito-bbq': ('바비큐 플래터', '밍거스.png'),
    'sushi-nigiri': ('초밥', '초밥만.png'),
    'sushi-udon': ('우동', '우동.png'),
    'bbq-jjukkumi': ('쭈꾸미', '쭈꾸미.png'),
}

# 분류 타일: 4장은 2×2(왼쪽 위부터), 3장은 왼쪽 큰 1장 + 오른쪽 위·아래 2장.
# 주점 타일은 pub(안주) 사진을 그대로 쓴다(app.js 의 CAT_IMG).
TILES = {
    'cat-food': ('음식점', ['jjamppong', 'bbq', 'donkatsu', 'burger']),
    'cat-cafe': ('카페', ['coffee', 'bread', 'dessert']),
}

def save_webp(im, path, max_bytes):
    for q in (78, 74, 70, 64, 58, 52):
        im.save(path, 'WEBP', quality=q, method=6)
        if os.path.getsize(path) <= max_bytes:
            return q
    raise SystemExit(f'{path}: q{q} 에서도 {max_bytes // 1000}KB 를 넘는다')


def save_sizes(key, im):
    out = []
    for side, tail, max_bytes in SIZES:
        path = os.path.join(OUT, key + tail + '.webp')
        q = save_webp(im.resize((side, side), Image.LANCZOS), path, max_bytes)
        out.append(f'{side}px q{q} {os.path.getsize(path) // 1024}KB')
    print(f'{key:13}', ' · '.join(out))


def load(src, key):
    im = Image.open(os.path.join(src, PHOTOS[key][1])).convert('RGB')
    if im.width != im.height:
        raise SystemExit(f'{PHOTOS[key][1]}: 정사각이 아니다 {im.size}')
    return im


def tile(src, keys):
    half = 1024
    sheet = Image.new('RGB', (half * 2, half * 2))
    if len(keys) == 3:
        # 왼쪽: 첫 사진의 가운데 세로 띠(1:2), 오른쪽: 나머지 두 장
        big = load(src, keys[0]).resize((half * 2, half * 2), Image.LANCZOS)
        sheet.paste(big.crop((half // 2, 0, half // 2 + half, half * 2)), (0, 0))
        for i, key in enumerate(keys[1:]):
            sheet.paste(load(src, key).resize((half, half), Image.LANCZOS), (half, i * half))
        return sheet
    for i, key in enumerate(keys):
        sheet.paste(load(src, key).resize((half, half), Image.LANCZOS), ((i % 2) * half, (i // 2) * half))
    return sheet


def write_credits():
    lines = ['# 음식 사진 출처', '',
             '## AI 생성 사진', '',
             '`scripts/make_food_images.py` 가 원본 PNG(저장소 밖)를 줄여 만든다. 실제 가게 메뉴 사진이 아니다.', '',
             '| 이미지 | 음식 | 출처 |', '|---|---|---|']
    lines += [f'| `{k}.webp` | {label} | {CREDIT} |' for k, (label, _) in PHOTOS.items()]
    lines += [f"| `{k}.webp` | {label} ({' · '.join(PHOTOS[x][0] for x in keys)} 2×2) | {CREDIT} |" for k, (label, keys) in TILES.items()]
    open(os.path.join(OUT, 'CREDITS.md'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')


def board(keys, path):
    T, COLS = 300, 6
    rows = (len(keys) + COLS - 1) // COLS
    sheet = Image.new('RGB', (COLS * T, rows * (T + 30)), 'white')
    font = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 16) if os.name == 'nt' else ImageFont.load_default()
    d = ImageDraw.Draw(sheet)
    for i, key in enumerate(keys):
        x, y = (i % COLS) * T, (i // COLS) * (T + 30)
        im = Image.open(os.path.join(OUT, key + '-480.webp'))
        sheet.paste(im.resize((T - 8, T - 8)), (x + 4, y + 4))
        kb = [os.path.getsize(os.path.join(OUT, key + t + '.webp')) // 1024 for _, t, _ in SIZES]
        d.text((x + 6, y + T + 4), f'{key} · {kb[0]}KB/{kb[1]}KB', fill='black', font=font)
    sheet.save(path, quality=85)


def main(argv):
    board_path = None
    if '--board' in argv:
        i = argv.index('--board')
        board_path = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    if not argv or not os.path.isdir(argv[0]):
        raise SystemExit(__doc__)
    src, keys = argv[0], argv[1:] or [*PHOTOS, *TILES]
    os.makedirs(OUT, exist_ok=True)
    for key in keys:
        save_sizes(key, tile(src, TILES[key][1]) if key in TILES else load(src, key))
    write_credits()
    if board_path:
        board([*PHOTOS, *TILES], board_path)


if __name__ == '__main__':
    main(sys.argv[1:])
