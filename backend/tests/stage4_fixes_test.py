"""Phase II Stage 4 findings: phasing, basement sizing, crane rule."""
import sys, os, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import engine, equipment as EQ, schedule as SC
from defaults import default_project


def _project(n_towers=3, floors=10):
    p = default_project("S4", "C", "Bengaluru", "S", "o")
    base = p["towers"][0]; base["floors"] = floors
    p["towers"] = [dict(copy.deepcopy(base), id=f"t{i}", name=f"Tower {i+1}") for i in range(n_towers)]
    return p


def test_phasing_lengthens_the_programme():
    p = _project()
    a = engine.analyse(p)
    parallel = SC.plan_schedule(p, a, {})["duration_months"]
    phased = SC.plan_schedule(p, a, {"towers_at_once": 1})["duration_months"]
    assert phased > parallel * 1.5


def test_basement_covers_required_parking():
    p = _project(n_towers=4, floors=14)
    a = engine.analyse(p)
    pk = a["parking"]
    base = next(s for s in a["boq"]["services"] if s["key"] == "basement")
    assert base["quantity"] >= (pk["required_slots"] - pk["ground_slots"]) * pk["area_per_slot_actual"] - 1e-6


def test_no_tower_crane_up_to_four_floors():
    for floors, cranes in ((4, 0), (5, 1)):
        p = _project(n_towers=1, floors=floors)
        r = EQ.plan_equipment(p, engine.analyse(p)["boq"])
        assert r["summary"]["tower_cranes"] == cranes
