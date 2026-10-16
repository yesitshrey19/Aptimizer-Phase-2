"""Direct tests for the floor-plan rule book's fifteen hard rules (validate.py, H01-H15).

One reference 2BHK plan passes every rule. Each failing case changes ONE thing in a copy of
it and asserts that exactly that rule fires -- so a test can only pass for the reason it
names. Where a rule has a numeric limit, a case sitting exactly on the limit must pass, which
pins the comparison (< versus <=) as well as the threshold.

Plan coordinates are integer millimetres. The entrance is on the y = 0 edge, facing +y.

    y=10000 +--------+------+----------+
            |  MB    |  AT  |    B     |
    y= 6000 +--------+------+----------+
            |C |  CT  |
    y= 4000 |  +------+------+---------+
            |F |    L        |    K    |
    y=    0 +--+-------------+---------+
            x=0 1200 2000   6000      9000
"""
import sys, os
from dataclasses import replace
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest

from floorplan import spec, validate as V
from floorplan.spec import RectMM, RoomType as T
from floorplan.validate import PartyWall, PlanDoor, PlanFurniture, PlanRoom, PlanView


def room(rid, rtype, x, y, w, h, **kw):
    return PlanRoom(rid, rtype, RectMM(x, y, w, h), **kw)


def square(x, y, side):
    return ((x, y), (x + side, y), (x + side, y + side), (x, y + side))


ROOMS = (
    room("F", T.FOYER, 0, 0, 2000, 1500),
    room("L", T.LIVING, 2000, 0, 4000, 4000, facade_mm=4000, furniture_fit="fits"),
    room("K", T.KITCHEN, 6000, 0, 3000, 2500, facade_mm=3000, furniture_fit="fits"),
    room("C", T.CORRIDOR, 0, 1500, 1200, 4500),
    room("CT", T.COMMON_TOILET, 2000, 4000, 2000, 1500),
    room("MB", T.MASTER_BEDROOM, 0, 6000, 4000, 4000, facade_mm=4000, furniture_fit="fits"),
    room("AT", T.ATTACHED_TOILET, 4000, 8000, 1500, 2000),
    room("B", T.BEDROOM, 5500, 6000, 3500, 3500, facade_mm=3500, furniture_fit="fits"),
)

DOORS = (
    PlanDoor("D-main", "", "F", role="main", kind="swing", swing_room="F",
             swing_polygon=square(200, 0, 900)),
    PlanDoor("D-FL", "F", "L", role="through", kind="opening"),
    PlanDoor("D-FC", "F", "C", role="through", kind="opening"),
    PlanDoor("D-LK", "L", "K", serves_room="K", kind="sliding"),
    PlanDoor("D-CT", "C", "CT", serves_room="CT", kind="sliding"),
    PlanDoor("D-MB", "C", "MB", serves_room="MB", kind="sliding"),
    PlanDoor("D-B", "C", "B", serves_room="B", kind="sliding"),
    PlanDoor("D-AT", "MB", "AT", role="ensuite", serves_room="AT", kind="sliding"),
)

BASE = PlanView(
    unit_id="ref-2bhk", unit_type="2bhk", rooms=ROOMS, doors=DOORS,
    envelope=RectMM(0, 0, 9000, 10000),
    entry_point=(1000, 0), entry_inward=(0, 1),
    floor_below_rooms=ROOMS,           # an identical floor below stacks wet over wet
    party_walls=(),                    # this unit has none, which passes H15
)


def with_room(plan, rid, **changes):
    rooms = tuple(replace(r, **changes) if r.id == rid else r for r in plan.rooms)
    return replace(plan, rooms=rooms)


def with_door(plan, did, **changes):
    doors = tuple(replace(d, **changes) if d.id == did else d for d in plan.doors)
    return replace(plan, doors=doors)


def fired(plan):
    return V.validate_plan(plan).codes_fired


def only(plan, code):
    """Assert the plan is rejected by `code` and by nothing else."""
    assert fired(plan) == (code,), f"expected only {code}, got {fired(plan)}"


# ----------------------------------------------------------------------- the reference plan
def test_reference_plan_passes_every_rule():
    report = V.validate_plan(BASE)
    assert report.accepted, [v.message for v in report.hard]
    assert report.codes_fired == ()


def test_reference_plan_checks_everything_it_can():
    """Only H04 may be unchecked, and only for the corridor: neither NBC nor the rule book
    states a corridor area, so the validator records it rather than inventing one."""
    unchecked = V.validate_plan(BASE).unchecked
    assert [u.code for u in unchecked] == ["H04"]
    assert unchecked[0].room_ids == ("C",)


def test_every_hard_rule_has_a_failing_case_below():
    covered = {name[len("test_h"):len("test_h") + 2] for name in globals()
               if name.startswith("test_h") and "_fails" in name}
    assert {c[1:] for c in spec.HARD_CODES} == covered


# ----------------------------------------------------------------------- H01 one entrance
def test_h01_fails_with_a_second_entrance():
    plan = replace(BASE, doors=BASE.doors + (PlanDoor("D-2", "", "L", kind="sliding"),))
    only(plan, "H01")


def test_h01_passes_with_a_kitchen_service_door():
    service = PlanDoor("D-svc", "", "K", role="service", kind="sliding")
    assert fired(replace(BASE, doors=BASE.doors + (service,))) == ()


# ----------------------------------------------------------------------- H02 main door into foyer
def test_h02_fails_when_main_door_opens_into_living():
    plan = with_door(BASE, "D-main", room_b="L", swing_room="L")
    only(plan, "H02")


# ----------------------------------------------------------------------- H03 light and air
def test_h03_fails_when_bedroom_facade_is_below_2500mm():
    only(with_room(BASE, "B", facade_mm=2499), "H03")


def test_h03_passes_at_exactly_2500mm():
    assert fired(with_room(BASE, "B", facade_mm=2500)) == ()


def test_h03_fails_for_a_landlocked_bedroom_even_with_a_shaft():
    plan = with_room(BASE, "B", facade_mm=0, shaft_clear_mm2=700 * 700)
    only(plan, "H03")


def test_h03_passes_for_a_kitchen_on_a_600mm_shaft():
    plan = with_room(BASE, "K", facade_mm=0, shaft_clear_mm2=600 * 600)
    assert fired(plan) == ()


# ----------------------------------------------------------------------- H04 minimum area
def test_h04_fails_for_a_kitchen_below_5_5_m2():
    only(with_room(BASE, "K", rect=RectMM(6000, 0, 3000, 1830)), "H04")   # 5.49 m2


def test_h04_passes_for_a_kitchen_at_exactly_5_5_m2():
    assert fired(with_room(BASE, "K", rect=RectMM(6000, 0, 2200, 2500))) == ()


def test_h04_uses_the_verified_nbc_figure_for_the_kitchen():
    m = spec.min_area(T.KITCHEN, unit_type="2bhk")
    assert m.value == 5_500_000 and m.verified


# ----------------------------------------------------------------------- H05 minimum width
def test_h05_fails_for_a_bedroom_narrower_than_2700mm():
    only(with_room(BASE, "B", rect=RectMM(5500, 6000, 2600, 4000)), "H05")


def test_h05_passes_for_a_bedroom_exactly_2700mm_wide():
    assert fired(with_room(BASE, "B", rect=RectMM(5500, 6000, 2700, 4000))) == ()


# ----------------------------------------------------------------------- H06 aspect ratio
def test_h06_fails_for_a_master_bedroom_above_1_to_1_6():
    only(with_room(BASE, "MB", rect=RectMM(0, 6000, 3500, 5650)), "H06")


def test_h06_passes_for_a_master_bedroom_at_exactly_1_to_1_6():
    assert fired(with_room(BASE, "MB", rect=RectMM(0, 6000, 3500, 5600))) == ()


# ----------------------------------------------------------------------- H07 furniture fit
@pytest.mark.parametrize("result", ["no_fit", "undecided"])
def test_h07_fails_when_bedroom_furniture_does_not_fit(result):
    only(with_room(BASE, "B", furniture_fit=result), "H07")


def test_h07_is_unchecked_not_passed_when_never_run():
    report = V.validate_plan(with_room(BASE, "B", furniture_fit=None))
    assert report.accepted and "H07" in [u.code for u in report.unchecked]


# ----------------------------------------------------------------------- H08 reachability
def test_h08_fails_for_a_bedroom_reached_only_through_another_bedroom():
    only(with_door(BASE, "D-B", room_a="MB"), "H08")


def test_h08_passes_for_an_attached_toilet_through_its_bedroom():
    assert "H08" not in fired(BASE)          # AT is reached only through MB in the reference


# ----------------------------------------------------------------------- H09 door swings
def _swing(plan, did, poly):
    return with_door(plan, did, kind="swing", swing_polygon=poly)


def test_h09_fails_when_two_door_leaves_overlap():
    plan = _swing(_swing(BASE, "D-MB", square(200, 5000, 900)), "D-CT", square(600, 5300, 900))
    only(plan, "H09")


def test_h09_passes_when_door_leaves_are_apart():
    plan = _swing(_swing(BASE, "D-MB", square(100, 6000, 800)), "D-CT", square(2100, 4000, 800))
    assert fired(plan) == ()


def test_h09_fails_when_a_leaf_sweeps_fixed_furniture():
    plan = _swing(BASE, "D-B", square(5600, 6000, 900))
    plan = with_door(plan, "D-B", swing_room="B")
    wardrobe = PlanFurniture("B", "wardrobe", RectMM(5600, 6000, 600, 1800), fixed=True)
    only(replace(plan, furniture=(wardrobe,)), "H09")


def test_h09_passes_when_the_furniture_is_movable():
    plan = with_door(_swing(BASE, "D-B", square(5600, 6000, 900)), "D-B", swing_room="B")
    chair = PlanFurniture("B", "chair", RectMM(5600, 6000, 600, 600), fixed=False)
    assert fired(replace(plan, furniture=(chair,))) == ()


# ----------------------------------------------------------------------- H10 circulation
# Foyer 3.0 m2 + corridor 5.4 m2 = 8.4 m2 of circulation.
def test_h10_fails_above_15_percent_of_carpet():
    only(replace(BASE, carpet_area_mm2=55_900_000), "H10")                # 15.03%


def test_h10_passes_at_exactly_15_percent():
    assert fired(replace(BASE, carpet_area_mm2=56_000_000)) == ()          # 15.00%


# ----------------------------------------------------------------------- H11 zone order
def test_h11_fails_when_bedrooms_lie_between_entrance_and_living():
    """Entering from the far (y = 10000) edge puts both bedrooms before the living room."""
    only(replace(BASE, entry_point=(1000, 10000), entry_inward=(0, -1)), "H11")


# ----------------------------------------------------------------------- H12 wet stacking
def test_h12_fails_for_a_kitchen_over_a_bedroom():
    below = (room("B-below", T.BEDROOM, 6000, 0, 3000, 3000),)
    only(replace(BASE, floor_below_rooms=below), "H12")


def test_h12_passes_on_the_lowest_floor():
    assert fired(replace(BASE, floor_below_rooms=None, is_lowest_floor=True)) == ()


# ----------------------------------------------------------------------- H13 toilet doors
def test_h13_fails_for_a_toilet_door_into_the_kitchen():
    extra = PlanDoor("D-CT-K", "CT", "K", kind="sliding")
    only(replace(BASE, doors=BASE.doors + (extra,)), "H13")


# ----------------------------------------------------------------------- H14 one door per room
def test_h14_fails_for_a_bedroom_with_two_doors():
    extra = PlanDoor("D-B2", "L", "B", serves_room="B", kind="sliding")
    only(replace(BASE, doors=BASE.doors + (extra,)), "H14")


def test_h14_passes_for_a_master_bedroom_with_an_ensuite_door():
    assert "H14" not in fired(BASE)          # D-AT is charged to AT, not to MB


# ----------------------------------------------------------------------- H15 party walls
def _wall(segments):
    return PartyWall("PW", "v", tuple(segments), required_lo=0, required_hi=10000)


def test_h15_fails_for_a_staggered_party_wall():
    only(replace(BASE, party_walls=(_wall([(9000, 0, 5000), (9100, 5000, 10000)]),)), "H15")


def test_h15_fails_for_a_party_wall_with_a_gap():
    only(replace(BASE, party_walls=(_wall([(9000, 0, 4000), (9000, 4500, 10000)]),)), "H15")


def test_h15_passes_for_a_continuous_straight_party_wall():
    plan = replace(BASE, party_walls=(_wall([(9000, 0, 6000), (9000, 6000, 10000)]),))
    assert fired(plan) == ()
