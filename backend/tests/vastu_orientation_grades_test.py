"""Vastu in true compass directions, graded the way the manuals word the anchors.

* A tower turned on site turns every sector with it (design_guide.compass_offset).
* Anchors are graded ideal / acceptable (the manual's fallback) / missed / forbidden;
  "never" sectors count in either reading the manuals use (3x3 sector or quadrant).
* The planner avoids forbidden placements: across 1-5 BHK flats on both sides of the
  corridor the only ones left are compact north-row 1 BHKs, whose bedroom is too narrow
  to carry the shaft that moving it west requires.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest

import aifloorplan, vastu
from defaults import apply_layout_to_tower
from floorplan.design_guide import mandala_zone_of

BOX = {"x": 0.0, "y": 0.0, "w": 9.0, "h": 9.0}


def _room(cx, cy):      # a 1 m room centred at plan (cx, cy); y runs south
    return {"x": cx - 0.5, "y": cy - 0.5, "w": 1.0, "h": 1.0}


@pytest.mark.parametrize("rot,expected", [
    (0, "NE"),      # plan as drawn
    (90, "NW"),     # plan-east turned to north: the plan's NE corner faces north-west
    (180, "SW"),
    (270, "SE"),
])
def test_sector_turns_with_the_building(rot, expected):
    assert mandala_zone_of(_room(8.0, 1.0), {**BOX, "rot_deg": rot}) == expected


def test_quadrant_turns_with_the_building():
    assert vastu.sector_of(_room(8.0, 1.0), {**BOX, "rot_deg": 180}) == "SW"


@pytest.mark.parametrize("rot,facing", [(0, "South facing"), (90, "East facing"), (180, "North facing"),
                                        (45, "South-East facing")])
def test_entrance_facing_turns_with_the_building(rot, facing):
    assert aifloorplan._true_facing("S", rot) == facing


def test_site_rotation_reaches_the_tower():
    tower = {"floors": 4}
    apply_layout_to_tower(tower, {"floors": 4, "rotation_deg": 30, "width_m": 40, "depth_m": 18}, "Tower A")
    assert tower["plan_rotation_deg"] == 30
    apply_layout_to_tower(tower, {"floors": 4, "rotation_deg": 30, "width_m": 18, "depth_m": 40}, "Tower A")
    assert tower["plan_rotation_deg"] == 120      # the long (corridor) axis runs along depth


@pytest.mark.parametrize("key,cell,grade", [
    ("pooja", (8.0, 1.0), "ideal"),          # NE
    ("pooja", (8.0, 4.5), "acceptable"),     # E: "default to East or North"
    ("pooja", (4.5, 8.0), "forbidden"),      # S: "never ... the South"
    ("kitchen", (8.0, 8.0), "ideal"),        # SE
    ("kitchen", (1.0, 1.0), "acceptable"),   # NW: "secondary valid node"
    ("master", (1.0, 8.0), "ideal"),         # SW
    ("master", (7.0, 3.5), "forbidden"),     # E by sector, but in the NE quadrant: "never NE"
])
def test_anchor_grades_follow_the_manual(key, cell, grade):
    room = _room(*cell)
    room["id"], room["type"] = ("u-mbed", "bedroom") if key == "master" else (f"u-{key}", key)
    assert vastu.sector_report([room], BOX)[key]["grade"] == grade


def _forbidden(mix, rotation=0.0):
    out = []
    tower = {"id": "t", "floors": 12, "corridor_width": 1.8, "plan_rotation_deg": rotation,
             "units": [{"type": t, "count": c, "carpet_area": a} for t, c, a in mix]}
    for floor in (2, 12):
        rooms, validation = aifloorplan.generate_architectural_template(tower, floor)
        for uid, audit in validation["vastu"]["unit_audits"].items():
            out += [(uid, audit["unit_type"], k) for k, r in audit["anchors"].items() if r.get("grade") == "forbidden"]
    return out


@pytest.mark.parametrize("rotation", [0.0, 180.0])
@pytest.mark.parametrize("mix", [
    [("1bhk", 4, 65), ("2bhk", 2, 80)],
    [("2bhk", 2, 75), ("3bhk", 2, 110)],
    [("3bhk", 4, 120)],
    [("4bhk", 2, 160)],
    [("5bhk", 2, 250)], [("5bhk", 2, 360)],
])
def test_planner_keeps_anchor_rooms_out_of_forbidden_sectors(mix, rotation):
    assert _forbidden(mix, rotation) == []


def test_compact_north_row_1bhk_is_the_one_known_exception():
    left = _forbidden([("1bhk", 4, 45)])
    assert left and all(t.startswith("1bhk") and k == "master" for _, t, k in left)
