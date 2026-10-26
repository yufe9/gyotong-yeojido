"""음식 종류별 미리보기 이미지(누끼 합성)를 만든다.

무료 사진(CC0·퍼블릭 도메인·CC BY)을 받아 rembg 로 배경을 지우고,
종류마다 1~3개를 겹쳐 800×800 투명 webp 로 저장한다. 출처는 img/food/CREDITS.md 에 쓴다.

    pip install pillow "rembg[cpu]"
    python scripts/make_food_images.py              # 전체
    python scripts/make_food_images.py pasta pub    # 일부만
    python scripts/make_food_images.py --board out.jpg   # 비교판도 함께

사진을 바꾸려면 아래 FOODS 의 항목만 고치면 된다. 첫 항목이 앞(크게), 나머지는 뒤(작게).
"""
import io, os, sys, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'img', 'food')
CACHE = os.path.join(ROOT, 'scripts', '.cache', 'food')
SIZE, MAX_BYTES = 800, 150_000
UA = {'User-Agent': 'gyotong-yeojido/1.0 (https://github.com/yufe9/gyotong-yeojido)'}


def commons(name, author, license, **opt):
    return opt | {'url': 'https://commons.wikimedia.org/wiki/Special:FilePath/' + urllib.parse.quote(name) + '?width=1400',
            'page': 'https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(name.replace(' ', '_')),
            'title': name, 'author': author, 'license': license}


def flickr(url, page, title, author, license, **opt):
    return opt | {'url': url, 'page': page, 'title': title, 'author': author, 'license': license}


# key: (한글 이름, [사진, ...])
FOODS = {
    'jjamppong': ('짬뽕·짜장', [commons('Jjamppong (Korean Chines seafood noodle soup).jpg', 'Jungyeon', 'CC0'),
                               commons('Jajangmyeon 짜장면.jpg', '사랑', 'Public domain')]),
    'malatang': ('마라탕', [commons('Bowl of YGF Malatang.jpg', 'Fumikas Sagisavas', 'CC0'),
                          commons('Malatang from South Korea.jpg', '오모군', 'CC BY 3.0')]),
    'gukbap': ('국밥·찌개', [commons('Kongnamul-gukbap.jpg', 'Lee Eunyoung', 'CC0'),
                           commons('Korean soup-Sundae gukbap-01.jpg', 'pcamp', 'CC BY 2.0')]),
    'bbq': ('고기구이', [commons('Samgyeopsal (pork belly).jpg', 'idkjm123', 'CC0'),
                      commons('Korean.cuisine-Samgyeopsal-08.jpg', 'VirtualErn', 'CC BY 2.0')]),
    'dakgalbi': ('닭갈비·찜닭', [commons('Chuncheon sizzling chicken (Dakgalbi).jpg', 'Fumikas Sagisavas', 'CC0'),
                              commons('Korean.food-Andong-Jjimdakk.jpg', 'ebifry', 'CC BY 2.0')]),
    'chicken': ('치킨', [commons('Fried-Chicken-Set.jpg', 'Evan-Amos', 'CC0'),
                       commons('Korean Chicken.jpg', 'Douglas Paul Perkins', 'CC BY 3.0')]),
    'burger': ('버거', [commons('NYC-Diner-Bacon-Cheeseburger.jpg', 'Evan-Amos', 'Public domain'),
                      commons('Cheeseburger (2).jpg', 'Renee Comet', 'Public domain')]),
    'bunsik': ('분식', [commons('Vegen rice pasta (spicy ver.) - korpan.jpg', 'Andy Li', 'CC0'),
                      commons('Gimbap 3.jpg', 'Lisy_', 'CC0')]),
    'rice': ('덮밥·도시락', [commons('Brighton Bibimbap (mushroom) - Time For Kimchi 2023-12-15.jpg', 'Andy Li', 'CC0'),
                          flickr('https://live.staticflickr.com/3118/2682217994_b328f2818b_b.jpg',
                                 'https://www.flickr.com/photos/92203585@N00/2682217994',
                                 'Bulgogi donburi', 'jetalone', 'CC BY 2.0')]),
    'noodle': ('국수', [commons('Korean.noodle-Kalguksu-01.jpg', 'jslander', 'CC BY 2.0', model='u2net'),
                      commons('Korean.food-Makguksu-01.jpg', 'pcamp', 'CC BY 2.0')]),
    'donkatsu': ('돈가스', [commons('Miso tonkatsu at Toyota Automobile Museum cafe 2022.jpg', 'Masahiko OHKUBO', 'CC BY 2.0'),
                          commons('Tonkatsu (3103951877).jpg', 'David Pursehouse', 'CC BY 2.0')]),
    'sushi': ('초밥·우동', [commons('Salmon Sushi.jpg', 'Switchercat', 'Public domain'),
                          commons('Juicy Chicken Udon (dashi broth) - MOGUMOGU 2024-10-02.jpg', 'Andy Li', 'CC0')]),
    'pasta': ('파스타', [commons('Natto spaghetti 001.jpg', 'Ocdp', 'CC0'),
                       commons('Ankake-spaghetti 001.jpg', 'Ocdp', 'CC0')]),
    'burrito': ('부리또·바비큐', [commons('Breakfast burritos.jpg', 'jeffreyw', 'CC BY 2.0'),
                              flickr('https://live.staticflickr.com/4005/5076902674_42cc566f9c_b.jpg',
                                     'https://www.flickr.com/photos/72949902@N00/5076902674',
                                     'Taco', 'TheCulinaryGeek', 'CC BY 2.0')]),
    'salad': ('샐러드·샌드위치', [commons('5aday salad.jpg', 'US Government', 'Public domain'),
                              commons('Diner-Bacon-&-Egg-Sandwich-On-Roll.jpg', 'Evan-Amos', 'Public domain')]),
    'cafeteria': ('학식', [flickr('https://live.staticflickr.com/65535/52474644565_713da2236d_b.jpg',
                          'https://www.flickr.com/photos/41284017@N08/52474644565',
                          'School lunch tray (20221028-FNS-RC-0008)', 'USDA', 'Public domain mark')]),
    'coffee': ('커피', [commons('Cup of coffee with beans.jpg', 'Petr Kratochvil', 'CC0', model='u2net'),
                      flickr('https://live.staticflickr.com/5283/5355832765_cfecba5068_b.jpg',
                             'https://www.flickr.com/photos/51018933@N08/5355832765',
                             'latte art', 'renee_mcgurk', 'CC BY 2.0')]),
    'bread': ('빵', [commons('Croissant-Petr Kratochvil.jpg', 'Petr Kratochvil', 'CC0'),
                    flickr('https://live.staticflickr.com/5153/14158739752_cb794c4c21_b.jpg',
                           'https://www.flickr.com/photos/15216811@N06/14158739752',
                           'Handmade baguette', 'Nicola since 1972', 'CC BY 2.0')]),
    'dessert': ('디저트', [commons('Putchin Pudding 001.jpg', 'Ocdp', 'CC0'),
                         commons('Waffles with maple syrup and butter on a white plate.jpg', 'TheCulinaryGeek', 'CC BY 2.0'),
                         flickr('https://live.staticflickr.com/262/32007037132_228d3787ec_b.jpg',
                                'https://www.flickr.com/photos/87537074@N03/32007037132',
                                'Mango Bingsu', 'promoterest', 'Public domain mark')]),
    # 분류 타일(음식점·카페). 주점 타일은 pub 를 그대로 쓴다.
    'cat-food': ('음식점', [commons('NYC-Diner-Bacon-Cheeseburger.jpg', 'Evan-Amos', 'Public domain'),
                          commons('Jjamppong (Korean Chines seafood noodle soup).jpg', 'Jungyeon', 'CC0'),
                          commons('Natto spaghetti 001.jpg', 'Ocdp', 'CC0')]),
    'cat-cafe': ('카페', [commons('Cup of coffee with beans.jpg', 'Petr Kratochvil', 'CC0', model='u2net'),
                        commons('Putchin Pudding 001.jpg', 'Ocdp', 'CC0'),
                        commons('Croissant-Petr Kratochvil.jpg', 'Petr Kratochvil', 'CC0')]),
    'pub': ('주점', [commons('Golbaengi-muchim 1.jpg', 'lazy fri13th', 'CC BY 2.0'),
                   flickr('https://live.staticflickr.com/3906/14814702098_0776a509ae_b.jpg',
                          'https://www.flickr.com/photos/49889671@N03/14814702098',
                          'Three Beer Glasses', 'Didriks', 'CC BY 2.0'),
                   flickr('https://live.staticflickr.com/7324/8729194308_c5b090ef94_b.jpg',
                          'https://www.flickr.com/photos/87117631@N00/8729194308',
                          'Korean Fried Chicken (Closeup)', 'Gary Soup', 'CC BY 2.0')]),
}

# 앞 접시는 크게 아래쪽에, 뒤 접시는 작게 위쪽에. (중심 x, 바닥 y, 최대 크기) — 800 기준
LAYOUT = {
    1: [(400, 720, 640)],
    2: [(470, 740, 560), (285, 470, 420)],
    3: [(400, 750, 520), (230, 450, 360), (580, 430, 340)],
}


def fetch(src):
    os.makedirs(CACHE, exist_ok=True)
    name = urllib.parse.quote(src['title'], safe='')[:120]
    path = os.path.join(CACHE, name + '.jpg')
    if not os.path.exists(path):
        req = urllib.request.Request(src['url'], headers=UA)
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        im = Image.open(io.BytesIO(data)).convert('RGB')
        im.thumbnail((1400, 1400))
        im.save(path, quality=92)
    return path


_sessions = {}


def cutout(path, model='isnet-general-use'):
    """배경을 지우고, 가장 큰 덩어리(접시) 근처만 남겨 가장자리를 다듬는다."""
    out = f'{path[:-4]}.{model}.png'
    if os.path.exists(out):
        return Image.open(out)
    import numpy as np, cv2
    from rembg import new_session, remove
    if model not in _sessions:
        _sessions[model] = new_session(model)
    im = remove(Image.open(path), session=_sessions[model])
    a = np.array(im.getchannel('A'))
    n, labels, stats, _ = cv2.connectedComponentsWithStats((a > 40).astype('uint8'), 8)
    if n > 1:
        big = stats[1:, cv2.CC_STAT_AREA].max()
        keep = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= big * 0.08]
        a = np.where(np.isin(labels, keep), a, 0).astype('uint8')
    alpha = Image.fromarray(a).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    im.putalpha(alpha)
    im = im.crop(alpha.point(lambda v: 255 if v > 20 else 0).getbbox())
    im.save(out)
    return im


def compose(items):
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    slots = LAYOUT[len(items)]
    placed = []
    for im, (cx, bottom, box) in zip(items, slots):
        im = im.copy()
        im.thumbnail((box, box), Image.LANCZOS)
        placed.append((im, cx - im.width // 2, bottom - im.height))
    front, fx, fy = placed[0]
    # 바닥 그림자 하나: 앞 접시 아래 납작한 타원
    shadow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    w = int(front.width * 0.82)
    h = max(18, int(front.width * 0.10))
    cx, by = fx + front.width // 2, fy + front.height
    ImageDraw.Draw(shadow).ellipse((cx - w // 2, by - h * 0.7, cx + w // 2, by + h * 0.3), fill=(0, 0, 0, 70))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(16)))
    for im, x, y in reversed(placed):  # 뒤 접시부터 그린다
        canvas.alpha_composite(im, (x, y))
    return canvas


def save_webp(im, path):
    for q in (80, 74, 68, 60, 52):
        im.save(path, 'WEBP', quality=q, method=6)
        if os.path.getsize(path) <= MAX_BYTES:
            return q
    return q


def write_credits():
    lines = ['# 음식 미리보기 이미지 출처', '',
             '`scripts/make_food_images.py` 가 아래 사진의 배경을 지우고 합성해 만든다. 모두 상업적 이용·수정이 허용된다.', '',
             '| 이미지 | 원본 | 작가 | 라이선스 |', '|---|---|---|---|']
    for key, (label, srcs) in FOODS.items():
        for s in srcs:
            lines.append(f"| `{key}.webp` {label} | [{s['title']}]({s['page']}) | {s['author']} | {s['license']} |")
    open(os.path.join(OUT, 'CREDITS.md'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')


def board(keys, path):
    T, COLS = 300, 5
    rows = (len(keys) + COLS - 1) // COLS
    sheet = Image.new('RGB', (COLS * T, rows * (T + 40)), 'white')
    font = ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf', 20) if os.name == 'nt' else ImageFont.load_default()
    d = ImageDraw.Draw(sheet)
    for i, key in enumerate(keys):
        x, y = (i % COLS) * T, (i // COLS) * (T + 40)
        d.rounded_rectangle((x + 8, y + 8, x + T - 8, y + T - 8), 24, fill=(242, 242, 247))
        im = Image.open(os.path.join(OUT, key + '.webp'))
        im.thumbnail((T - 40, T - 40))
        sheet.paste(im, (x + 20, y + 20), im)
        kb = os.path.getsize(os.path.join(OUT, key + '.webp')) // 1024
        d.text((x + 14, y + T), f'{FOODS[key][0]}  {key} · {kb}KB', fill=(28, 28, 30), font=font)
    sheet.save(path, quality=85)


def main(argv):
    board_path = None
    if '--board' in argv:
        i = argv.index('--board')
        board_path = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    keys = argv or list(FOODS)
    os.makedirs(OUT, exist_ok=True)
    for key in keys:
        label, srcs = FOODS[key]
        items = [cutout(fetch(s), s.get('model', 'isnet-general-use')) for s in srcs]
        q = save_webp(compose(items), os.path.join(OUT, key + '.webp'))
        print(f'{key:10} {label:10} q{q} {os.path.getsize(os.path.join(OUT, key + ".webp")) // 1024}KB')
    write_credits()
    if board_path:
        board(list(FOODS), board_path)


if __name__ == '__main__':
    main(sys.argv[1:])
