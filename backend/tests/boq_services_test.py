"""Services and external works in the BOQ (Phase II Stage 4).

Without them the BOQ came in 44-73% under the construction cost P2-P4 declared to RERA.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest

import engine
from defaults import default_project


def bill(floors=12, **extra):
    p = default_project("S", "C", "Bengaluru", "S", "o")
    p["towers"][0]["floors"] = floors
    p.update(extra)
    return engine.analyse(p)["boq"]


def test_services_are_in_the_works_total():
    b = bill()
    assert b["services_total"] > 0
    assert b["works_total"] == pytest.approx(b["material_total"] + b["labour_total"]
                                             + b["equipment_total"] + b["services_total"], abs=0.05)


def test_each_service_line_is_quantity_times_rate():
    for s in bill()["services"]:
        assert s["amount"] == pytest.approx(s["quantity"] * s["rate"], abs=0.05)


def test_fire_fighting_only_for_high_rise():
    assert "fire_fighting" not in {s["key"] for s in bill(floors=4)["services"]}     # 12 m
    assert "fire_fighting" in {s["key"] for s in bill(floors=5)["services"]}         # 15 m


def test_open_air_amenities_are_external_works_not_built_area():
    keys = {s["key"]: s for s in bill()["services"]}
    # default amenities: clubhouse 300 + gym 80 + pool 150 built; play area 100 is open-air
    assert keys["amenities"]["quantity"] == pytest.approx(530.0)


def test_rates_are_editable_per_project():
    b = bill(services_rates={"lift_each": 3000000})
    lift = next(s for s in b["services"] if s["key"] == "lifts")
    assert lift["rate"] == 3000000
