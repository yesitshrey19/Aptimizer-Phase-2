"""Fire checks against NBC 2016 Part 4 as printed (pages photographed by the Phase II
team, Stage 3, 23 Oct 2026):
  p. 7  Cl. 1.2      Part 4 applies to all high-rise buildings (+ special buildings)
  p. 11 Cl. 2.38     high-rise building: 15 m or above
  p. 33 Cl. 4.4.2.4.3.1  buildings under 1.2 have a minimum of two staircases
  p. 33 Cl. 4.4.2.4.3.2(e)  stair width 1.25 m for apartments (A-4)
  p. 9  Cl. 2.24 / p. 87 Annex E-2  one firefighting shaft (with fireman's lift) per
        residential tower in a high-rise
  p. 88 Annex E-4(d) refuge above 24 m: at/just above 24 m, then every 15 m; apartments
        with balconies exempt, except at 60 m and every 30 m above it
  p. 32 Table 5      travel distance 30 m (residential, construction types 1-2)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest

import engine, engineering as E
from defaults import default_project


def fire(floors, stairs=1, lifts=0, refuge=0, travel=25.0, balconies=None, fh=3.0):
    p = default_project("F", "QA", "Bengaluru", "F-1", "owner")
    t = p["towers"][0]
    t["floors"], t["floor_height"] = floors, fh
    t["staircases"] = [{"id": "s", "count": stairs, "width": 1.25, "type": "dog-legged", "location": "core"}]
    t["lifts"] = [{"id": "l", "count": lifts, "capacity": 8, "location": "core"}] if lifts else []
    t["max_travel_distance"] = travel
    p.setdefault("engineering", {}).update(refuge_floors_provided=refuge, apartments_have_balconies=balconies)
    m = E.analyse_engineering(p, engine.analyse(p))["modules"]["fire"]
    by = lambda start: next(c for c in m["checks"] if c["label"].startswith(start))
    return m, by


@pytest.mark.parametrize("floors,stairs,status", [(4, 1, "pass"), (5, 1, "fail"), (5, 2, "pass")])
def test_two_staircases_from_15_m(floors, stairs, status):
    """12 m: one stair is fine. 15 m is high-rise: two needed."""
    _, by = fire(floors, stairs=stairs)
    assert by("2 staircases")["status"] == status


@pytest.mark.parametrize("floors,lifts,status", [(4, 0, "pass"), (5, 0, "fail"), (5, 1, "pass")])
def test_fire_lift_from_15_m(floors, lifts, status):
    _, by = fire(floors, lifts=lifts)
    assert by("Fire lift from")["status"] == status


def test_refuge_not_needed_up_to_24_m():
    m, by = fire(8, balconies=False)          # 24 m
    assert m["refuge_floors"] == [] and by("Refuge area")["status"] == "pass"


def test_refuge_for_flats_without_balconies_at_24_m_then_every_15_m():
    m, _ = fire(20, balconies=False)          # 60 m; floor 9 is at 24 m, 14 at 39 m, 19 at 54 m
    assert m["refuge_floors"] == [9, 14, 19]


def test_balcony_flats_are_exempt_up_to_60_m():
    m, by = fire(14, balconies=True)          # 42 m, like the approved P4 blocks
    assert m["refuge_floors"] == [] and by("Refuge area")["status"] == "pass"


def test_balcony_flats_above_60_m_need_refuge_at_60_m_and_every_30_m():
    m, _ = fire(32, balconies=True)           # 96 m; floor 21 at 60 m, floor 31 at 90 m
    assert m["refuge_floors"] == [21, 31]


def test_balconies_are_read_from_the_flats_by_default():
    m, _ = fire(14)                            # default flats carry balcony area
    assert m["refuge_floors"] == []


@pytest.mark.parametrize("travel,status", [(30.0, "pass"), (31.0, "fail")])
def test_travel_distance_30_m(travel, status):
    _, by = fire(4, travel=travel)
    assert by("Travel distance")["status"] == status


def test_apartment_stair_width_1_25_m():
    _, by = fire(4)
    assert by("Stair width")["status"] == "pass"
