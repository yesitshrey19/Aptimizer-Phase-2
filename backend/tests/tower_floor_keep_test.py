"""A floor count the user typed survives an automatic site re-layout.

Found in Phase II Stage 3: a tester set towers to 8 and 12 floors in Apartment Planning,
then the 3D view re-ran the site layout and silently put them back to the engine's 19 and
20 (the most the FAR allows), so every per-tower figure was for the wrong building.
"""
import sys, os, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from defaults import default_project, towers_from_site_layout

ENGINE = [{"name": "Tower A", "floors": 19, "floor_height_m": 3.0, "footprint_sqm": 620.0},
          {"name": "Tower B", "floors": 20, "floor_height_m": 3.0, "footprint_sqm": 620.0}]


def _two_user_towers():
    p = default_project("F", "QA", "Bengaluru", "F-1", "owner")
    a = p["towers"][0]
    b = copy.deepcopy(a); b["name"] = "Tower B"; b["id"] = "b"
    a["floors"], a["floors_set_by_user"] = 8, True
    b["floors"], b["floors_set_by_user"] = 12, True
    return [a, b]


def test_automatic_relayout_keeps_typed_floors():
    out = towers_from_site_layout(_two_user_towers(), ENGINE)
    assert [t["floors"] for t in out] == [8, 12]
    assert all(t.get("floors_set_by_user") for t in out)


def test_apply_site_layout_takes_the_engine_floors_and_clears_the_mark():
    out = towers_from_site_layout(_two_user_towers(), ENGINE, override_floors=True)
    assert [t["floors"] for t in out] == [19, 20]
    assert not any(t.get("floors_set_by_user") for t in out)


def test_towers_never_edited_still_follow_the_engine():
    towers = _two_user_towers()
    for t in towers:
        t.pop("floors_set_by_user")
    assert [t["floors"] for t in towers_from_site_layout(towers, ENGINE)] == [19, 20]


def test_stored_floor_plans_above_the_kept_top_floor_are_dropped():
    towers = _two_user_towers()
    towers[0]["floor_layouts"] = {"1": {}, "8": {}, "15": {}}
    out = towers_from_site_layout(towers, ENGINE)
    assert set(out[0]["floor_layouts"]) == {"1", "8"}
