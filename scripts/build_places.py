"""원유철_데이터.xlsx → data/places.json (좌표 포함).

사용법: python scripts/build_places.py <xlsx 경로>
키: 환경 변수 KAKAO_REST_API_KEY, 없으면 ~/.config/kakao/.env 에서 읽는다. 키 값은 출력하지 않는다.
이미 있는 places.json 의 같은 주소 좌표는 재사용하므로, 다시 돌려도 새 주소만 API를 부른다.
"""
import csv
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "places.json"
REPORT = ROOT / "data" / "geocode_report.csv"
OVERRIDES = ROOT / "data" / "coord_overrides.csv"
SCHOOL_ADDR = "충북 충주시 대소원면 대학로 50"
EMPTY = {"확인 필요", "확인 안 됨", "", None}
CATEGORY_CODE = {"음식점": "FD6", "카페": "CE7"}
# 문을 닫은 가게: 엑셀에 남아 있어도 places.json 에 넣지 않는다
CLOSED = {"사천마라탕교통대점"}  # 2026-10-26 폐업 확인
# 충주시 전체를 넉넉히 덮는 사각형. 이 밖의 좌표는 오변환으로 본다.
CHUNGJU = (36.80, 37.25, 127.65, 128.20)


def load_key():
    key = os.environ.get("KAKAO_REST_API_KEY")
    env = Path.home() / ".config" / "kakao" / ".env"
    if not key and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "KAKAO_REST_API_KEY":
                key = value.strip().strip('"').strip("'")
    if not key:
        sys.exit("KAKAO_REST_API_KEY 가 없습니다 (환경 변수 또는 ~/.config/kakao/.env)")
    return key


def kakao(key, path, **params):
    url = f"https://dapi.kakao.com{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {key}"})
    with urllib.request.urlopen(req, timeout=10) as res:
        return json.load(res)["documents"]


def in_chungju(lat, lng):
    return CHUNGJU[0] <= lat <= CHUNGJU[1] and CHUNGJU[2] <= lng <= CHUNGJU[3]


def km(a, b):
    """두 (lat, lng) 사이 직선거리(km)."""
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def geocode(key, address, name, category, school):
    docs = kakao(key, "/v2/local/search/address.json", query=address)
    if docs:
        return float(docs[0]["y"]), float(docs[0]["x"]), "address"
    params = {"query": name, "x": school[1], "y": school[0], "radius": 20000}
    if category in CATEGORY_CODE:
        params["category_group_code"] = CATEGORY_CODE[category]
    for d in kakao(key, "/v2/local/search/keyword.json", **params):
        if "충주" in (d.get("road_address_name") or d.get("address_name") or ""):
            return float(d["y"]), float(d["x"]), "keyword"
    return None, None, "failed"


def clean(v):
    return None if v in EMPTY else v


def main(xlsx):
    ws = openpyxl.load_workbook(xlsx, read_only=True)["맛집카페"]
    rows = list(ws.iter_rows(values_only=True))
    head = rows[0]
    rows = [dict(zip(head, r)) for r in rows[1:] if r[0] and r[0] not in CLOSED]

    cache = {}
    if OUT.exists():
        for p in json.loads(OUT.read_text(encoding="utf-8"))["places"]:
            if p["lat"] is not None and p["coordSource"] != "manual":
                cache[p["address"]] = (p["lat"], p["lng"], p["coordSource"])
    overrides = {}
    if OVERRIDES.exists():
        with OVERRIDES.open(encoding="utf-8-sig") as f:
            overrides = {r["이름"]: (float(r["lat"]), float(r["lng"])) for r in csv.DictReader(f)}

    key = None
    calls = 0

    def api_key():
        nonlocal key
        key = key or load_key()
        return key

    if SCHOOL_ADDR in cache:
        school = cache[SCHOOL_ADDR][:2]
    else:
        d = kakao(api_key(), "/v2/local/search/address.json", query=SCHOOL_ADDR)[0]
        school, calls = (float(d["y"]), float(d["x"])), calls + 1

    places, report = [], []
    for r in rows:
        name, addr = r["이름"], r["위치"]
        if name in overrides:
            lat, lng, src = *overrides[name], "manual"
        elif addr in cache:
            lat, lng, src = cache[addr]
        else:
            lat, lng, src = geocode(api_key(), addr, name, r["분류"], school)
            calls += 1 if src == "address" else 2
            if lat is not None:
                cache[addr] = (lat, lng, src)
        warn = ""
        if lat is not None and not in_chungju(lat, lng):
            warn, lat, lng, src = "충주 범위 밖 좌표", None, None, "failed"
        elif lat is not None and km(school, (lat, lng)) > (r["거리"] or 0) + 0.3:
            warn = f"직선 {km(school, (lat, lng)):.1f}km > 걷는 길 {r['거리']}km"
        report.append({"이름": name, "위치": addr, "방법": src, "lat": lat, "lng": lng, "경고": warn})
        places.append({
            "id": name,
            "name": name,
            "address": addr,
            "lat": lat,
            "lng": lng,
            "coordSource": src,
            "distanceKm": r["거리"],
            "zone": r["구역"],
            "category": r["분류"],
            "rating": r["별점"],
            "recommendCount": r["추천 수"],
            "summary": clean(r["평가 한 줄 요약"]),
            "detail": clean(r["자세히"]),
            "menu": clean(r["대표 메뉴"]),
            "priceRange": clean(r["가격대"]),
            "hours": clean(r["영업시간"]),
            "closedDays": clean(r["휴무일"]),
            "soloDining": clean(r["혼밥"]),
            "waitTip": clean(r.get("웨이팅 팁")),
            "parking": clean(r.get("주차")),
            "naverUrl": r["지도"],
            "photoUrl": clean(r["사진 링크"]),
            "checkedAt": r["확인한 날"],
        })

    # 자체 점검: 원본과 개수·고유 id 가 맞아야 한다
    assert len(places) == len(rows), "행 수 불일치"
    assert len({p["id"] for p in places}) == len(places), "이름(id) 중복"

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"generatedAt": date.today().isoformat(), "school": school, "places": places},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    with REPORT.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(report[0]))
        w.writeheader()
        w.writerows(report)

    by = {}
    for x in report:
        by[x["방법"]] = by.get(x["방법"], 0) + 1
    print(f"{len(places)}곳 저장 → {OUT.relative_to(ROOT)} | 방법별 {by} | API 호출 약 {calls}건")
    for x in report:
        if x["경고"] or x["방법"] in ("keyword", "failed"):
            print(f"  확인 필요: {x['이름']} ({x['방법']}) {x['경고']}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
