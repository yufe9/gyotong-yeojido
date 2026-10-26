"""음식 사진(Gemini로 만든 정사각 PNG)을 앱용 webp 두 크기로 줄인다.

원본(2048×2048, 약 8MB)은 저장소 밖에 두고 폴더 경로를 인자로 준다. 원본은 커밋하지 않는다.
사진 전체를 그대로 쓴다(누끼·자르기 없음).

    pip install pillow
    python scripts/make_food_images.py <원본 폴더>                  # 전체
    python scripts/make_food_images.py <원본 폴더> pasta bbq        # 일부만
    python scripts/make_food_images.py <원본 폴더> --board 비교판.jpg

출력: img/food/<key>.webp(960px, 상세 화면) + img/food/<key>-480.webp(카드·칩).
사진을 추가하려면 PHOTOS 에 한 줄 넣고, 그 key 를 app.js 의 OLD_IMG 와 아래 OLD 에서 지운다.
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
}

# 분류 타일: 위 사진 4장을 2×2로 합친다(왼쪽 위부터).
TILES = {
    'cat-food': ('음식점', ['jjamppong', 'bbq', 'donkatsu', 'burger']),
}

# 아직 AI 사진이 없어 예전 누끼 합성(800px 한 장)을 그대로 쓰는 그림의 출처.
# 새 사진으로 바뀌면 그 줄을 지운다. 만드는 코드는 git 기록(커밋 3dab61d)에 있다.
OLD = [
    ('cafeteria', '학식', 'School lunch tray (20221028-FNS-RC-0008)', 'https://www.flickr.com/photos/41284017@N08/52474644565', 'USDA', 'Public domain mark'),
    ('coffee', '커피', 'Cup of coffee with beans.jpg', 'https://commons.wikimedia.org/wiki/File:Cup_of_coffee_with_beans.jpg', 'Petr Kratochvil', 'CC0'),
    ('coffee', '커피', 'latte art', 'https://www.flickr.com/photos/51018933@N08/5355832765', 'renee_mcgurk', 'CC BY 2.0'),
    ('bread', '빵', 'Croissant-Petr Kratochvil.jpg', 'https://commons.wikimedia.org/wiki/File:Croissant-Petr_Kratochvil.jpg', 'Petr Kratochvil', 'CC0'),
    ('bread', '빵', 'Handmade baguette', 'https://www.flickr.com/photos/15216811@N06/14158739752', 'Nicola since 1972', 'CC BY 2.0'),
    ('dessert', '디저트', 'Putchin Pudding 001.jpg', 'https://commons.wikimedia.org/wiki/File:Putchin_Pudding_001.jpg', 'Ocdp', 'CC0'),
    ('dessert', '디저트', 'Waffles with maple syrup and butter on a white plate.jpg', 'https://commons.wikimedia.org/wiki/File:Waffles_with_maple_syrup_and_butter_on_a_white_plate.jpg', 'TheCulinaryGeek', 'CC BY 2.0'),
    ('dessert', '디저트', 'Mango Bingsu', 'https://www.flickr.com/photos/87537074@N03/32007037132', 'promoterest', 'Public domain mark'),
    ('cat-cafe', '카페', 'Cup of coffee with beans.jpg', 'https://commons.wikimedia.org/wiki/File:Cup_of_coffee_with_beans.jpg', 'Petr Kratochvil', 'CC0'),
    ('cat-cafe', '카페', 'Putchin Pudding 001.jpg', 'https://commons.wikimedia.org/wiki/File:Putchin_Pudding_001.jpg', 'Ocdp', 'CC0'),
    ('cat-cafe', '카페', 'Croissant-Petr Kratochvil.jpg', 'https://commons.wikimedia.org/wiki/File:Croissant-Petr_Kratochvil.jpg', 'Petr Kratochvil', 'CC0'),
    ('pub', '주점', 'Golbaengi-muchim 1.jpg', 'https://commons.wikimedia.org/wiki/File:Golbaengi-muchim_1.jpg', 'lazy fri13th', 'CC BY 2.0'),
    ('pub', '주점', 'Three Beer Glasses', 'https://www.flickr.com/photos/49889671@N03/14814702098', 'Didriks', 'CC BY 2.0'),
    ('pub', '주점', 'Korean Fried Chicken (Closeup)', 'https://www.flickr.com/photos/87117631@N00/8729194308', 'Gary Soup', 'CC BY 2.0'),
]


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
    lines += ['', '## 아직 바꾸지 않은 그림', '',
              '무료 사진(CC0·퍼블릭 도메인·CC BY)의 배경을 지워 합성했다. 모두 상업적 이용·수정이 허용된다.', '',
              '| 이미지 | 원본 | 작가 | 라이선스 |', '|---|---|---|---|']
    lines += [f'| `{k}.webp` {label} | [{title}]({page}) | {author} | {lic} |' for k, label, title, page, author, lic in OLD]
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
