"""Phase II Stage 2 tracking rows run in code instead of by hand.

Three groups, each the app's own function against an independent calculation:

* Areas U1-U10 (rows S2-001..S2-031): engine.tower_metrics against the stated formula --
  built-up = (carpet + balcony) x 1.10, super built-up = built-up x 1.25 -- worked out
  here with plain arithmetic on the inputs, never by calling the engine twice.
* FAR and ground coverage T1-T10: engine.analyse's compliance verdict for plots built to
  sit below, exactly at and just above the FAR 3.0 and coverage 40% limits.
* DXF and IFC exports X1-X3: three layouts from the app's own site planner, exported by
  bim.py, then re-read with ezdxf and ifcopenshell (independent readers) and measured.

`stage2_rows()` returns every row's (app answer, correct answer) so the tracking sheet is
filled from the same numbers these tests assert. Tolerances are the locked ones: +/-2%
for areas, verdicts exact, +/-0.1% for exports.
"""
import os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ezdxf
import pytest

import bim, engine
from defaults import default_project
from siteplan.plan import plan_site

WALL, LOADING = 0.10, 0.25          # engine defaults the formula above states


# ----------------------------------------------------------------------- areas, U1-U10
# (carpet m2, balcony m2, flats per floor, floors). U9 and U10 mix two flat types.
AREA_CASES = {
    "U1": [(45.0, 5.0, 8, 4)],
    "U2": [(60.0, 8.0, 4, 5)],
    "U3": [(65.0, 0.0, 6, 10)],
    "U4": [(95.0, 12.0, 4, 12)],
    "U5": [(52.5, 6.5, 6, 7)],
    "U6": [(110.0, 15.0, 2, 15)],
    "U7": [(38.0, 3.0, 10, 3)],
    "U8": [(140.0, 20.0, 2, 20)],
    "U9": [(60.0, 8.0, 4, 8), (95.0, 12.0, 2, 8)],
    "U10": [(45.0, 5.0, 6, 12), (65.0, 8.0, 4, 12), (95.0, 12.0, 2, 12)],
}


def _area_tower(case):
    floors = case[0][3]
    return {"id": "t", "name": "Area test", "floors": floors,
            "units": [{"id": f"u{i}", "type": "custom", "count": n, "carpet_area": c, "balcony_area": b}
                      for i, (c, b, n, _) in enumerate(case)]}


def area_row(key):
    case = AREA_CASES[key]
    app = engine.tower_metrics(_area_tower(case), {})
    carpet = sum(c * n * f for c, b, n, f in case)
    builtup = sum((c + b) * n * f for c, b, n, f in case) * (1 + WALL)
    return {"carpet": (app["carpet_sqm"], carpet),
            "built-up": (app["apartment_builtup_sqm"], builtup),
            "super built-up": (app["super_builtup_sqm"], builtup * (1 + LOADING))}


# ----------------------------------------------------------------------- FAR / coverage, T1-T10
# One tower, 1 flat of 100 m2 carpet per floor, no core: built-up = 110 m2 per floor.
# FAR rows vary the plot; coverage rows vary the footprint. (target, rule, side of limit)
FAR_LIMIT, COVERAGE_LIMIT = 3.0, 40.0
PLOT_CASES = {
    "T1": ("far", 2.5, "below"), "T2": ("far", 2.9, "below"), "T3": ("far", 3.0, "exactly at"),
    "T4": ("far", 3.01, "just above"), "T5": ("far", 3.5, "above"),
    "T6": ("coverage", 35.0, "below"), "T7": ("coverage", 39.9, "just below"),
    "T8": ("coverage", 40.0, "exactly at"), "T9": ("coverage", 40.1, "just above"),
    "T10": ("coverage", 60.0, "above"),
}


def _plot_project(rule, target):
    p = default_project("FAR test", "C", "Bengaluru", "S", "o")
    floors = 10
    builtup = 110.0 * floors
    if rule == "far":
        plot_area, footprint = builtup / target, 100.0
    else:
        plot_area = 1000.0
        footprint = plot_area * target / 100.0
    p["plot"] = {"length": plot_area / 20.0, "width": 20.0}
    p["towers"] = [{"id": "t", "name": "T", "floors": floors, "footprint_area": footprint,
                    "units": [{"id": "u", "type": "custom", "count": 1, "carpet_area": 100.0,
                               "balcony_area": 0.0}]}]
    p.pop("site_layout", None)
    return p


def plot_row(key):
    rule, target, side = PLOT_CASES[key]
    a = engine.analyse(_plot_project(rule, target))
    code = "FAR-01" if rule == "far" else "GC-01"
    res = next(r for r in a["compliance"]["results"] if r["code"] == code)
    measured = a["areas"]["far"] if rule == "far" else a["areas"]["ground_coverage_pct"]
    limit = FAR_LIMIT if rule == "far" else COVERAGE_LIMIT
    expected = "Pass" if target <= limit else "Fail"
    return {"app": res["status"].title(), "correct": expected, "rule": rule, "target": target,
            "measured": measured, "side": side, "limit": res["threshold"]}


# ----------------------------------------------------------------------- exports, X1-X3
EXPORT_SITES = {"X1": (12.97, 77.59), "X2": (13.05, 77.62), "X3": (12.91, 77.64)}


def _shoelace(pts):
    pts = list(pts)
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]))) / 2.0


def _export_project(key):
    lat, lng = EXPORT_SITES[key]
    p = default_project(f"Export {key}", "C", "Bengaluru", "S", "o", latitude=lat, longitude=lng)
    p["site_layout"] = plan_site(p)
    return p


def export_row(key):
    p = _export_project(key)
    towers = p["site_layout"]["towers"]
    app_footprint = sum(float(t["footprint_sqm"]) for t in towers)
    app_slab_area = sum(float(t["footprint_sqm"]) * int(t["floors"]) for t in towers)

    doc = ezdxf.read(__import__("io").StringIO(bim.export_siteplan_dxf(p).decode("utf-8")))
    dxf_footprint = sum(_shoelace([(v[0], v[1]) for v in e.get_points("xy")])
                        for e in doc.modelspace().query('LWPOLYLINE[layer=="A-TOWER-FOOT"]'))

    import ifcopenshell
    fd, path = tempfile.mkstemp(suffix=".ifc")
    os.close(fd)
    try:
        with open(path, "wb") as fh:
            fh.write(bim.export_ifc4(p))
        model = ifcopenshell.open(path)
        ifc_slab_area = 0.0
        for slab in model.by_type("IfcSlab"):
            solid = slab.Representation.Representations[0].Items[0]
            pts = [tuple(c.Coordinates[:2]) for c in solid.SweptArea.OuterCurve.Points][:-1]
            ifc_slab_area += _shoelace(pts)
        ifc_storeys = len(model.by_type("IfcBuildingStorey"))
    finally:
        os.remove(path)
    return {"dxf": (dxf_footprint, app_footprint), "ifc": (ifc_slab_area, app_slab_area),
            "storeys": (ifc_storeys, sum(int(t["floors"]) for t in towers)),
            "towers": len(towers)}


def stage2_rows():
    return {"areas": {k: area_row(k) for k in AREA_CASES},
            "plots": {k: plot_row(k) for k in PLOT_CASES},
            "exports": {k: export_row(k) for k in EXPORT_SITES}}


# ----------------------------------------------------------------------- the tests
def within(app, correct, pct):
    return abs(app - correct) <= pct / 100.0 * abs(correct)


@pytest.mark.parametrize("key", list(AREA_CASES))
@pytest.mark.parametrize("area", ["carpet", "built-up", "super built-up"])
def test_area_matches_the_formula_within_2pct(key, area):
    app, correct = area_row(key)[area]
    assert within(app, correct, 2.0), (key, area, app, correct)


@pytest.mark.parametrize("key", list(AREA_CASES))
def test_carpet_le_builtup_le_super_builtup(key):
    r = area_row(key)
    assert r["carpet"][0] <= r["built-up"][0] <= r["super built-up"][0]


@pytest.mark.parametrize("key", list(PLOT_CASES))
def test_far_and_coverage_verdict_flips_at_the_limit(key):
    r = plot_row(key)
    assert r["app"] == r["correct"], r


@pytest.mark.parametrize("key", list(EXPORT_SITES))
@pytest.mark.parametrize("fmt", ["dxf", "ifc"])
def test_exported_areas_match_the_app_within_0_1pct(key, fmt):
    r = export_row(key)
    app, correct = r[fmt]
    assert within(app, correct, 0.1), (key, fmt, app, correct)
    assert r["storeys"][0] == r["storeys"][1]


def test_a_scheme_designed_exactly_at_far_3_passes_despite_float_noise():
    """Found while running T3: one floor of 110 m2 carpet on a plot sized for FAR 3.0 computes
    as 3.000000000000001 and used to fail as "actual 3.0 violates maximum 3.0"."""
    p = default_project("edge", "C", "Bengaluru", "S", "o")
    p["plot"] = {"length": 110.0 * 1.1 / 3.0 / 20.0, "width": 20.0}
    p["towers"] = [{"id": "t", "name": "T", "floors": 1, "footprint_area": 50.0,
                    "units": [{"id": "u", "count": 1, "carpet_area": 110.0, "balcony_area": 0}]}]
    p.pop("site_layout", None)
    a = engine.analyse(p)
    assert a["areas"]["far"] > 3.0                       # the noise is really there
    res = next(r for r in a["compliance"]["results"] if r["code"] == "FAR-01")
    assert res["status"] == "pass"


def test_a_real_excess_over_far_3_still_fails():
    r = plot_row("T4")                                   # FAR 3.01
    assert r["app"] == "Fail"


# ----------------------------------------------------------------------- parking, M1-M5 and RERA
# RMP-2015 Table 23 item 13, worked by hand: 1 car per unit of 50-150 m2, 1 per 2 units
# below 50 m2, 2 above 150 m2 and 3 above 375 m2 (as the approved BBMP plans apply it),
# plus 10% visitors on top rounded to the nearest car. (units per floor, unit area) over
# 10 floors; the expected totals below were worked out by hand from that rule.
PARKING_MIXES = {
    "M1": ([(4, 65.0), (2, 95.0)], 66),      # 60 x 1 = 60, +6
    "M2": ([(3, 45.0), (3, 65.0)], 50),      # 30 x 0.5 + 30 x 1 = 45, +5
    "M3": ([(2, 240.0), (2, 95.0)], 66),     # 20 x 2 + 20 x 1 = 60, +6
    "M4": ([(4, 35.0)], 22),                 # 40 x 0.5 = 20, +2
    "M5": ([(1, 350.0), (1, 420.0)], 55),    # 10 x 2 + 10 x 3 = 50, +5
}


def _parking_tower(name, floors, units):
    return {"id": name, "name": name, "floors": floors, "footprint_area": 500.0,
            "units": [{"id": f"{name}{i}", "type": "custom", "count": c, "carpet_area": a,
                       "balcony_area": 0} for i, (c, a) in enumerate(units)]}


def parking_required(towers, plot=(100.0, 100.0)):
    p = default_project("Parking test", "C", "Bengaluru", "S", "o")
    p["plot"] = {"length": plot[0], "width": plot[1]}
    p["towers"] = towers
    p.pop("site_layout", None)
    return engine.analyse(p)["parking"]["required_slots"]


@pytest.mark.parametrize("key", list(PARKING_MIXES))
def test_parking_matches_rmp_2015_table_23(key):
    units, expected = PARKING_MIXES[key]
    assert parking_required([_parking_tower(key, 10, units)]) == expected


# The approved plans' own REQUIRED figures (sanction drawings). P3's 84 also carries 16 cars
# for an 812 m2 clubhouse (Table 23 item 16), which the app does not model, so its flats-only
# figure 60 + 6 = 66 is what the app can be held to.
RERA_PARKING = {
    "P4": ([("A", 13, [(3, 238.56)]), ("B", 13, [(1, 238.56), (2, 176.85)]),
            ("C", 14, [(2, 96.33), (2, 101.06)]), ("D", 14, [(2, 96.33), (2, 101.06)]),
            ("E", 14, [(3, 140.77)]), ("F", 14, [(4, 140.77)]), ("G", 14, [(2, 140.77), (2, 96.33)])],
           (190.519, 100.0), 464),
    "P2": ([("A", 4, [(35, 87.6)])], (122.4077, 100.0), 154),
    "P3": ([("A", 12, [(1, 340.0), (1, 410.0)])], (61.708, 50.0), 66),
}


@pytest.mark.parametrize("key", list(RERA_PARKING))
def test_parking_matches_the_approved_bbmp_plans(key):
    towers, plot, expected = RERA_PARKING[key]
    assert parking_required([_parking_tower(*t) for t in towers], plot) == expected


# ------------------------------------------------- NBC 2016 Part 3 room minimums (row S2)
# Every room of every flat the app's floor planner draws, against NBC 2016 Part 3 minima
# typed in here from the book (Cl. 12.2-12.4, p. 43-44), not read from floorplan/spec.py:
# habitable 7.5 m2 and 2.4 m wide with at least one room >= 9.5 m2 per flat (12.2.2),
# kitchen 5.5 m2 and 1.8 m (12.3.2), bath + WC 2.8 m2 and 1.2 m, WC alone 1.1 m2 and
# 0.9 m (12.4.2). Sweep: 1-5 BHK across their carpet ranges, low/mid floors and the
# penthouse top floor.
import aifloorplan

NBC_HABITABLE = {"bedroom", "living", "servant", "office", "family", "study", "guest"}
NBC_SWEEP = {"1bhk": range(25, 91, 5), "2bhk": range(40, 141, 5), "3bhk": range(60, 201, 5),
             "4bhk": range(90, 281, 10), "5bhk": range(130, 361, 10)}
NBC_FLOORS = ((4, 1), (4, 3), (12, 6), (12, 12))


def _nbc_defects(room):
    name, rtype = room["name"].lower(), room["type"]
    area, width = room["w"] * room["h"], min(room["w"], room["h"])
    if rtype == "bathroom" or any(k in name for k in ("bath", "toilet", "powder")):
        a_min, w_min = (1.1, 0.9) if "powder" in name else (2.8, 1.2)
    elif rtype in NBC_HABITABLE:
        a_min, w_min = 7.5, 2.4
    elif rtype == "kitchen":
        a_min, w_min = 5.5, 1.8
    else:
        return []
    out = []
    if area < a_min - 1e-6:
        out.append(f"{room['id']} {area:.2f} m2 < {a_min}")
    if width < w_min - 1e-6:
        out.append(f"{room['id']} {width:.2f} m wide < {w_min}")
    return out


def nbc_room_defects():
    defects, flats = [], 0
    for unit_type, carpets in NBC_SWEEP.items():
        for carpet in carpets:
            for floors, floor in NBC_FLOORS:
                tower = {"id": f"nbc-{unit_type}-{carpet}", "floors": floors, "corridor_width": 2.0,
                         "units": [{"type": unit_type, "count": 2, "carpet_area": carpet}]}
                rooms, _ = aifloorplan.generate_architectural_template(tower, floor)
                by_flat = {}
                for r in rooms:
                    if r.get("unit_id"):
                        by_flat.setdefault(r["unit_id"], []).append(r)
                for uid, rs in by_flat.items():
                    flats += 1
                    tag = f"{unit_type} {carpet} m2 floor {floor}/{floors}"
                    habitable = [r["w"] * r["h"] for r in rs
                                 if r["type"] in NBC_HABITABLE and "bath" not in r["name"].lower()]
                    if habitable and max(habitable) < 9.5 - 1e-6:
                        defects.append(f"{tag} {uid}: no habitable room >= 9.5 m2")
                    defects += [f"{tag} {d}" for r in rs for d in _nbc_defects(r)]
    return flats, defects


def test_every_planned_room_meets_nbc_2016_part_3_minimums():
    flats, defects = nbc_room_defects()
    assert flats == 864
    assert defects == []
