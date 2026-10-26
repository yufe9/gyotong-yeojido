"""Pretendard 서브셋을 다시 만들고, 화면에 쓰는 글자가 빠짐없이 들어갔는지 검사한다.

담는 글자 = 한글 2,350자(KS X 1001, 검색창 입력용) + 영문·숫자·기본 기호
          + index.html·*.js·data/places.json 에 실제로 나오는 모든 글자.

    pip install fonttools brotli
    python scripts/subset_fonts.py          # 다시 만들고 검사
    python scripts/subset_fonts.py --check  # 검사만(빠진 글자가 있으면 종료 코드 1)
"""
import json, os, re, sys, urllib.request
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, 'fonts')
CACHE = os.path.join(ROOT, 'scripts', '.cache', 'fonts')
VERSION = '1.3.9'
WEIGHTS = ['Regular', 'SemiBold', 'Bold']
SRC = 'https://cdn.jsdelivr.net/npm/pretendard@{v}/dist/web/static/woff2/Pretendard-{w}.woff2'
TEXT_FILES = ['index.html', 'app.js', 'logic.js', 'motion.js']


def strings(v):
    if isinstance(v, str):
        yield v
    elif isinstance(v, dict):
        for x in v.values():
            yield from strings(x)
    elif isinstance(v, list):
        for x in v:
            yield from strings(x)


def used_chars():
    # 주석(<!-- -->, /* */, //)은 화면에 나오지 않으므로 뺀다
    no_comments = lambda s: re.sub(r'<!--.*?-->|/\*.*?\*/|(?<![:\'"])//[^\n]*', '', s, flags=re.S)
    text = ''.join(no_comments(open(os.path.join(ROOT, f), encoding='utf-8').read()) for f in TEXT_FILES)
    text += ''.join(strings(json.load(open(os.path.join(ROOT, 'data', 'places.json'), encoding='utf-8'))))
    return {c for c in text if c.isprintable() and not c.isspace()}


def ksx1001_hangul():
    out = set()
    for cp in range(0xAC00, 0xD7A4):
        try:
            # 파이썬 euc-kr 은 2,350자 밖의 한글도 8바이트 조합형으로 인코딩하므로 2바이트만 센다
            if len(chr(cp).encode('euc-kr')) == 2:
                out.add(chr(cp))
        except UnicodeEncodeError:
            pass
    return out


def missing(path, chars):
    cmap = TTFont(path).getBestCmap()
    return sorted(c for c in chars if ord(c) not in cmap)


def build(chars):
    os.makedirs(CACHE, exist_ok=True)
    for w in WEIGHTS:
        src = os.path.join(CACHE, f'Pretendard-{w}.woff2')
        if not os.path.exists(src):
            urllib.request.urlretrieve(SRC.format(v=VERSION, w=w), src)
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.hinting = False  # 화면용 웹폰트라 힌팅은 빼서 용량을 줄인다
        font = subset.load_font(src, opts)
        sub = subset.Subsetter(opts)
        sub.populate(text=''.join(sorted(chars)))
        sub.subset(font)
        out = os.path.join(FONTS, f'Pretendard-{w}.subset.woff2')
        subset.save_font(font, out, opts)
        print(f'{w:9} {os.path.getsize(out) // 1024}KB')


def main():
    used = used_chars()
    base = ksx1001_hangul() | {chr(c) for c in range(0x20, 0x7F)} | set('·…“”‘’★–—→←↑↓°×')
    if '--check' not in sys.argv:
        build(base | used)
    bad = False
    for w in WEIGHTS:
        miss = missing(os.path.join(FONTS, f'Pretendard-{w}.subset.woff2'), used)
        # 원본 글꼴에도 없는 글자(이모지 등)는 시스템 글꼴로 대체된다
        print(f'{w}: 화면 글자 {len(used)}자 중 빠진 글자 {len(miss)}자', ''.join(miss))
        bad |= bool(miss)
    sys.exit(1 if bad and '--check' in sys.argv else 0)


if __name__ == '__main__':
    main()
