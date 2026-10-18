"""Vastu in true compass directions, graded the way the manuals word the anchors.

* A tower turned on site turns every sector with it (design_guide.compass_offset).
* Anchors are graded ideal (target quadrant, the Aptimizer manual's wording) / acceptable
  (the manual's fallback) / missed / forbidden; "never" sectors count in either reading
  the manuals use (3x3 sector or quadrant). A South-facing flat's kitchen targets NW.
* Every flat has a pooja: a room, or the manual's niche in the living room.
* The planner keeps every anchor out of forbidden sectors, on both sides of the corridor
  and with the building turned on site.
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


@pytest.mark.parametrize("key,cell,facing,grade", [
    ("pooja", (8.0, 1.0), None, "ideal"),          # NE quadrant
    ("pooja", (4.0, 1.0), None, "acceptable"),     # N sector: "default to East or North"
    ("pooja", (4.5, 8.0), None, "forbidden"),      # S: "never ... the South"
    ("kitchen", (8.0, 8.0), None, "ideal"),        # SE
    ("kitchen", (1.0, 1.0), None, "acceptable"),   # NW: "secondary valid node"
    ("kitchen", (1.0, 1.0), "S", "ideal"),         # South facing: "Kitchen must route to NW"
    ("kitchen", (8.0, 8.0), "S", "acceptable"),
    ("master", (1.0, 8.0), None, "ideal"),         # SW
    ("master", (2.0, 5.5), None, "ideal"),         # W sector, SW quadrant
    ("master", (7.0, 3.5), None, "forbidden"),     # E by sector, but in the NE quadrant: "never NE"
])
def test_anchor_grades_follow_the_manual(key, cell, facing, grade):
    room = _room(*cell)
    room["id"], room["type"] = ("u-mbed", "bedroom") if key == "master" else (f"u-{key}", key)
    assert vastu.sector_report([room], BOX, facing)[key]["grade"] == grade


def test_living_room_niche_counts_as_the_pooja():
    living = {"id": "u-living", "type": "living", "x": 0.0, "y": 0.0, "w": 9.0, "h": 4.0,
              "pooja_niche": {"x": 8.4, "y": 0.0, "w": 0.6, "h": 0.45}}
    assert vastu.sector_report([living], BOX)["pooja"]["grade"] == "ideal"


def _forbidden(mix, rotation=0.0):
    out = []
    tower = {"id": "t", "floors": 12, "corridor_width": 1.8, "plan_rotation_deg": rotation,
             "units": [{"type": t, "count": c, "carpet_area": a} for t, c, a in mix]}
    for floor in (2, 12):
        rooms, validation = aifloorplan.generate_architectural_template(tower, floor)
        for uid, audit in validation["vastu"]["unit_audits"].items():
            out += [(uid, audit["unit_type"], k) for k, r in audit["anchors"].items() if r.get("grade") == "forbidden"]
    return out


@pytest.mark.parametrize("rotation", [0.0, 90.0, 180.0])
@pytest.mark.parametrize("mix", [
    [("1bhk", 4, 45), ("2bhk", 1, 65), ("3bhk", 1, 95)],
    [("1bhk", 4, 65), ("2bhk", 2, 80)],
    [("2bhk", 2, 75), ("3bhk", 2, 110)],
    [("3bhk", 4, 120)],
    [("4bhk", 2, 160)],
    [("5bhk", 2, 250)], [("5bhk", 2, 360)],
])
def test_planner_keeps_anchor_rooms_out_of_forbidden_sectors(mix, rotation):
    assert _forbidden(mix, rotation) == []


def test_every_flat_has_a_pooja():
    tower = {"id": "t", "floors": 12, "corridor_width": 1.8,
             "units": [{"type": "1bhk", "count": 4, "carpet_area": 45}, {"type": "2bhk", "count": 2, "carpet_area": 65}]}
    rooms, validation = aifloorplan.generate_architectural_template(tower, 3)
    assert all(a["anchors"]["pooja"]["placed"] for a in validation["vastu"]["unit_audits"].values())
