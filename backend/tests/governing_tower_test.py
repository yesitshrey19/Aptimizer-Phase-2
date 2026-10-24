"""Project-level seismic and wind headlines describe one real tower, not a blend.

Found in Phase II Stage 3 (Rishav): with towers of 8 and 12 floors the headline summed W
over both towers and took d from their combined footprint, giving a base shear for a
building that does not exist.
"""
import sys, os, copy, math
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest

import engine, engineering as E
from defaults import default_project


@pytest.fixture(scope="module")
def eng():
    p = default_project("G", "QA", "Bengaluru", "G-1", "owner")
    b = copy.deepcopy(p["towers"][0]); b["id"], b["name"] = "tb", "Tower B"
    p["towers"][0]["floors"], b["floors"] = 8, 12
    p["towers"].append(b)
    return E.analyse_engineering(p, engine.analyse(p))["modules"]


def test_headline_base_shear_is_the_governing_towers(eng):
    s = eng["seismic"]
    outs = {o["label"]: o["value"] for o in s["outputs"]}
    gov = max(s["per_tower"], key=lambda t: t["base_shear_kn"])
    assert s["governing_tower"] == gov["name"] == "Tower B"
    assert outs["Design base shear VB"] == pytest.approx(gov["base_shear_kn"], abs=0.1)
    assert outs["Seismic weight W"] == pytest.approx(gov["seismic_weight_kn"], abs=0.1)
    assert outs["Fundamental period Ta"] == pytest.approx(gov["period_s"], abs=1e-3)


def test_wind_face_is_the_tallest_towers_plate(eng):
    outs = {o["label"]: o for o in eng["loads"]["outputs"]}
    assert outs["Effective frontal area Ae"]["note"].startswith(f"{round(math.sqrt(620.0), 1)} m wide")
