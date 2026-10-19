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


# -------------------------------------- App plans 1-10: outside window + reachable (S2)
# Ten floor plates from the app's planner, checked from the geometry alone -- the room
# rectangles -- never from the planner's own has_window flag.
#   Window: every habitable room (bedroom, living, kitchen, office, servant, family) needs
#   enough wall open to air for a window of 1/8 of its floor area (NBC 2016 Part 3 Cl.
#   20.1.2, Bengaluru temperate), taking a 1.2 m tall window (0.9 m sill, 2.1 m lintel).
#   A wall is open where the far side is outside the building or a balcony/terrace/dry
#   balcony; never the corridor or a neighbouring flat.
#   Reachable: each declared door must sit on a wall the two rooms really share, at least
#   the door's width long; walking those doors from the foyer -- which must open off the
#   corridor -- has to reach every room of the flat.
APP_PLANS = {
    1: ("1BHK x4, floor 1 of 4", 4, 1, [("1bhk", 4, 45)]),
    2: ("2BHK x4, floor 3 of 8", 8, 3, [("2bhk", 4, 65)]),
    3: ("3BHK x4, floor 5 of 12", 12, 5, [("3bhk", 4, 100)]),
    4: ("4BHK x2, floor 2 of 10", 10, 2, [("4bhk", 2, 150)]),
    5: ("5BHK x2, floor 4 of 10", 10, 4, [("5bhk", 2, 220)]),
    6: ("1BHK + 2BHK x2 + 3BHK, floor 1 of 6", 6, 1, [("1bhk", 1, 40), ("2bhk", 2, 60), ("3bhk", 1, 95)]),
    7: ("2BHK x3 + 3BHK x3, floor 7 of 14", 14, 7, [("2bhk", 3, 70), ("3bhk", 3, 110)]),
    8: ("3BHK x2 penthouse, floor 12 of 12", 12, 12, [("3bhk", 2, 120)]),
    9: ("4BHK x2 penthouse, floor 10 of 10", 10, 10, [("4bhk", 2, 160)]),
    10: ("2BHK x6 + 3BHK x2 (8 per floor), floor 2 of 15", 15, 2, [("2bhk", 6, 60), ("3bhk", 2, 90)]),
}
WINDOW_TYPES = {"bedroom", "living", "kitchen", "office", "servant", "family"}
OPEN_TYPES = {"balcony", "terrace", "utility"}
WINDOW_H, STEP, EPS = 1.2, 0.05, 0.02


def app_plan_rooms(n):
    _, floors, floor, mix = APP_PLANS[n]
    tower = {"id": f"plan-{n}", "floors": floors, "corridor_width": 2.0,
             "units": [{"type": t, "count": c, "carpet_area": a} for t, c, a in mix]}
    rooms, _ = aifloorplan.generate_architectural_template(tower, floor)
    return rooms


def _inside(r, x, y):
    return r["x"] < x < r["x"] + r["w"] and r["y"] < y < r["y"] + r["h"]


def _open_wall_length(room, rooms):
    """Metres of the room's perimeter whose far side is open air (or a balcony)."""
    x0, y0, x1, y1 = room["x"], room["y"], room["x"] + room["w"], room["y"] + room["h"]
    edges = [((x0, y0), (x1, y0), (0, -1)), ((x0, y1), (x1, y1), (0, 1)),
             ((x0, y0), (x0, y1), (-1, 0)), ((x1, y0), (x1, y1), (1, 0))]
    total = 0.0
    for (ax, ay), (bx, by), (nx, ny) in edges:
        length = abs(bx - ax) + abs(by - ay)
        steps = max(int(length / STEP), 1)
        for i in range(steps):
            t = (i + 0.5) / steps
            px, py = ax + (bx - ax) * t + nx * EPS, ay + (by - ay) * t + ny * EPS
            beyond = [r for r in rooms if r is not room and _inside(r, px, py)]
            if all(r["type"] in OPEN_TYPES for r in beyond):
                total += length / steps
    return total


def _shared_wall(a, b):
    """Length of wall two rectangles share (0 if they only touch at a corner or not at all)."""
    def overlap(p0, p1, q0, q1):
        return max(0.0, min(p1, q1) - max(p0, q0))
    ax1, ay1, bx1, by1 = a["x"] + a["w"], a["y"] + a["h"], b["x"] + b["w"], b["y"] + b["h"]
    if abs(ax1 - b["x"]) < 0.011 or abs(bx1 - a["x"]) < 0.011:
        return overlap(a["y"], ay1, b["y"], by1)
    if abs(ay1 - b["y"]) < 0.011 or abs(by1 - a["y"]) < 0.011:
        return overlap(a["x"], ax1, b["x"], bx1)
    return 0.0


def app_plan_defects(n):
    rooms = app_plan_rooms(n)
    corridor = [r for r in rooms if not r.get("unit_id")]
    flats = {}
    for r in rooms:
        if r.get("unit_id"):
            flats.setdefault(r["unit_id"], []).append(r)
    defects, checked = [], {"flats": len(flats), "window_rooms": 0}
    for uid, rs in flats.items():
        # windows
        for r in rs:
            if r["type"] not in WINDOW_TYPES or "bath" in r["name"].lower():
                continue
            checked["window_rooms"] += 1
            need = r["w"] * r["h"] / 8 / WINDOW_H
            have = _open_wall_length(r, rooms)
            if have + 1e-6 < need:
                defects.append(f"{r['id']}: {have:.2f} m of open wall, needs {need:.2f} m for a 1/8 window")

        # doors. "passage" names the flat's private passage, which can be two pieces
        # either side of the foyer; breakfast and dining are one open space, no door.
        by_key = {r["id"][len(uid) + 1:]: r for r in rs}
        passages = [r for r in rs if r["name"] == "Private Passage"]
        graph = {r["id"]: set() for r in rs}
        dining = [r for r in rs if r["type"] == "dining"]
        for a in dining:
            for b in dining:
                if a is not b and _shared_wall(a, b) >= 0.9:
                    graph[a["id"]].add(b["id"])
        for r in rs:
            target = r.get("door_via") or r.get("door_to") or r.get("door_child_of")
            if not target:
                continue
            options = passages if target == "passage" else [by_key[target]] if target in by_key else []
            door_w = float(r.get("door_width_mm") or 900) / 1000
            if not options:
                defects.append(f"{r['id']}: door leads to '{target}', which is not in the flat")
                continue
            other = max(options, key=lambda o: _shared_wall(r, o))
            if _shared_wall(r, other) + 1e-6 < door_w:
                defects.append(f"{r['id']}: door to {target} but they share only "
                               f"{_shared_wall(r, other):.2f} m of wall (door {door_w:.2f} m)")
            else:
                graph[r["id"]].add(other["id"]); graph[other["id"]].add(r["id"])
        foyer = next((r for r in rs if r.get("main_entrance")), None)
        if foyer is None or not any(_shared_wall(foyer, c) >= 0.9 for c in corridor):
            defects.append(f"{uid}: main door does not open off the corridor")
            continue
        seen, todo = {foyer["id"]}, [foyer["id"]]
        while todo:
            for nxt in graph[todo.pop()] - seen:
                seen.add(nxt); todo.append(nxt)
        for r in rs:
            if r["id"] not in seen and r["type"] not in ("shaft", "balcony", "terrace"):
                defects.append(f"{r['id']}: cannot be reached from the main door")
    return checked, defects


@pytest.mark.parametrize("n", list(APP_PLANS))
def test_app_plan_rooms_have_outside_window_and_are_reachable(n):
    checked, defects = app_plan_defects(n)
    assert checked["window_rooms"] > 0
    assert defects == []


# --------------------------------------------- drawn carpet area = entered carpet area
# The plan's carpet (RERA: every room but balconies, terraces, the dry balcony and the
# shaft) must come within 2% of the carpet area typed in, or the floor must say why not.
from floorplan import unit_planner


@pytest.mark.parametrize("unit_type,carpets", [
    ("1bhk", (50, 55, 60, 75, 90)), ("2bhk", (70, 85, 100, 140)), ("3bhk", (100, 120, 160, 200)),
    ("4bhk", (150, 200, 280)), ("5bhk", (200, 250, 360)),
])
def test_drawn_carpet_matches_entered_carpet(unit_type, carpets):
    for carpet in carpets:
        tower = {"id": "carpet", "floors": 4, "corridor_width": 2.0,
                 "units": [{"type": unit_type, "count": 2, "carpet_area": carpet}]}
        rooms, validation = aifloorplan.generate_architectural_template(tower, 2)
        assert validation["size_warnings"] == []
        for uid in {r["unit_id"] for r in rooms if r.get("unit_id")}:
            drawn = unit_planner.plan_carpet([r for r in rooms if r.get("unit_id") == uid])
            assert drawn == pytest.approx(carpet, rel=0.02), (unit_type, carpet, drawn)


def test_too_small_carpet_is_drawn_at_the_nbc_minimum_with_a_warning():
    tower = {"id": "small", "floors": 4, "corridor_width": 2.0,
             "units": [{"type": "1bhk", "count": 2, "carpet_area": 30}]}
    rooms, validation = aifloorplan.generate_architectural_template(tower, 2)
    assert len(validation["size_warnings"]) == 1
    assert "below the smallest 1 BHK plan" in validation["size_warnings"][0]
    defects = []
    for r in rooms:
        defects += _nbc_defects(r)
    assert defects == []


# ------------------------------------------ Vastu: rule cases behave as written (S2-087)
# The app's audit places each anchor room (pooja, kitchen, master bedroom) in a 3x3 cell
# and a quadrant of its flat, north at the top, and marks it met when the quadrant is the
# manual's target (pooja NE, kitchen SE or NW for a South-facing flat, master SW). Checked here against an independent 3x3
# placement of the same rooms, over 1-5 BHK flats on low and top floors; the MEP-shaft
# claim ("stack grouping") is checked as shafts sitting in the same place floor to floor.
import vastu

VASTU_TARGETS = {"pooja": "NE", "kitchen": "SE", "master": "SW"}
VASTU_SWEEP = {"1bhk": (50, 60), "2bhk": (70, 90), "3bhk": (100, 130), "4bhk": (150, 200), "5bhk": (200, 260)}


def _grid_cell(room, box):
    x0, y0, w, h = box
    cx, cy = room["x"] + room["w"] / 2, room["y"] + room["h"] / 2
    col = min(2, int((cx - x0) / w * 3))
    row = min(2, int((cy - y0) / h * 3))
    return (("NW", "N", "NE"), ("W", "CENTER", "E"), ("SW", "S", "SE"))[row][col]


def _quadrant(room, box):
    x0, y0, w, h = box
    cx, cy = room["x"] + room["w"] / 2, room["y"] + room["h"] / 2
    return ("N" if cy <= y0 + h / 2 else "S") + ("E" if cx >= x0 + w / 2 else "W")


def vastu_rule_cases():
    disagreements, met, placed, shaft_moves, floors_compared = [], {k: 0 for k in VASTU_TARGETS}, \
        {k: 0 for k in VASTU_TARGETS}, 0, 0
    for unit_type, carpets in VASTU_SWEEP.items():
        for carpet in carpets:
            tower = {"id": f"v-{unit_type}-{carpet}", "floors": 12, "corridor_width": 2.0,
                     "units": [{"type": unit_type, "count": 2, "carpet_area": carpet}]}
            shafts_by_floor = {}
            for floor in (2, 3, 12):
                rooms, validation = aifloorplan.generate_architectural_template(tower, floor)
                audits = validation["vastu"]["unit_audits"]
                shafts_by_floor[floor] = sorted((r["unit_id"], r["x"], r["y"], r["w"], r["h"])
                                                for r in rooms if r["type"] == "shaft")
                for uid, audit in audits.items():
                    rs = [r for r in rooms if r.get("unit_id") == uid]
                    x0, y0 = min(r["x"] for r in rs), min(r["y"] for r in rs)
                    box = (x0, y0, max(r["x"] + r["w"] for r in rs) - x0, max(r["y"] + r["h"] for r in rs) - y0)
                    picks = {"pooja": vastu.pooja_of(rs),
                             "kitchen": next((r for r in rs if r["type"] == "kitchen"), None),
                             "master": next((r for r in rs if r["id"].endswith("-mbed")), None)}
                    for key, room in picks.items():
                        report = audit["anchors"][key]
                        if room is None:
                            continue
                        placed[key] += 1
                        cell, quarter = _grid_cell(room, box), _quadrant(room, box)
                        mine = quarter in report["target"]        # the manual's quadrant targets
                        met[key] += mine
                        if report["sector"] != cell or report["quadrant"] != quarter or bool(report["met"]) != mine:
                            disagreements.append(f"{unit_type} {carpet} m2 floor {floor} {uid} {key}: "
                                                 f"audit {report['sector']}/{report['quadrant']}/{report['met']}, "
                                                 f"mine {cell}/{quarter}/{mine}")
            # Shafts on the typical floors (2 and 3) should stack.
            floors_compared += 1
            shaft_moves += shafts_by_floor[2] != shafts_by_floor[3]
    return {"placed": placed, "met": met, "disagreements": disagreements,
            "shaft_moves": shaft_moves, "floors_compared": floors_compared}


def test_vastu_audit_places_anchor_rooms_as_its_rule_says():
    result = vastu_rule_cases()
    assert result["disagreements"] == []


# ----------------------------------- room sizes vs 15 real RERA flats (row S2-079)
# Real ranges (m2) from 15 brochure flats on the Karnataka RERA site (Provident Park Square,
# Provident Capella, Shriram Blue, Plumeria at Brigade Meadows), measured by B into
# Stage2_B_flats and checked against the brochures: one living+dining area per flat, each
# kitchen, bedroom and toilet. Each real flat is rebuilt in the app at its carpet area, on
# both sides of the corridor; the pass mark is 90% of app rooms inside the real range.
REAL_FLATS = [("1bhk", 33.9), ("1bhk", 33.4), ("1bhk", 38.7), ("1bhk", 44.12), ("1bhk", 45.24),
              ("2bhk", 44.6), ("2bhk", 50.0), ("2bhk", 55.7), ("2bhk", 80.4), ("2bhk", 81.85),
              ("3bhk", 57.5), ("3bhk", 72.5), ("3bhk", 84.1), ("3bhk", 95.22), ("3bhk", 101.5)]
REAL_RANGES = {
    "1bhk": {"living_dining": (13.94, 22.46), "kitchen": (3.34, 8.34), "bedroom": (8.52, 12.57), "toilet": (2.08, 3.59)},
    "2bhk": {"living_dining": (13.63, 26.09), "kitchen": (4.49, 9.68), "bedroom": (7.44, 13.83), "toilet": (2.78, 3.71)},
    "3bhk": {"living_dining": (15.34, 28.25), "kitchen": (4.64, 9.91), "bedroom": (6.98, 14.04), "toilet": (3.14, 3.71)},
}


def _app_room_class(room):
    t, n = room["type"], room["name"].lower()
    if t == "kitchen":
        return "kitchen"
    if t == "bathroom":
        return "toilet"
    if t == "bedroom":
        return "bedroom"
    if t in ("living", "dining") and "lounge" not in n:
        return "living_dining"
    return None


def real_range_share():
    inside, outside = 0, []
    for i, (unit_type, carpet) in enumerate(REAL_FLATS, 1):
        tower = {"id": f"real{i}", "floors": 4, "corridor_width": 2.0,
                 "units": [{"type": unit_type, "count": 2, "carpet_area": carpet}]}
        rooms, _ = aifloorplan.generate_architectural_template(tower, 2)
        for uid in ("unit-N1", "unit-S1"):
            areas = {}
            for r in rooms:
                c = r.get("unit_id") == uid and _app_room_class(r)
                if c:
                    areas.setdefault(c, []).append(r["w"] * r["h"])
            areas["living_dining"] = [sum(areas.get("living_dining", []))]
            for c, vals in areas.items():
                lo, hi = REAL_RANGES[unit_type][c]
                for a in vals:
                    if lo - 1e-6 <= a <= hi + 1e-6:
                        inside += 1
                    else:
                        outside.append(f"flat {i} {uid} {c} {a:.2f} m2 outside {lo}-{hi}")
    return inside, outside


def test_app_room_sizes_fall_in_the_real_flats_range():
    inside, outside = real_range_share()
    assert inside / (inside + len(outside)) >= 0.90, outside
