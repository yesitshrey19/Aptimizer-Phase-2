"""Apply site layout fills the plate with flats; low towers are re-levelled within the rules."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest

from defaults import default_tower, apply_layout_to_tower, fit_units_to_plate
from siteplan.config import SiteLayoutConfig
from siteplan.fitness import PackContext, TowerPlacement, required_spacing
from siteplan.pack import raise_floors
from shapely.geometry import box


def big_flats_tower():
    t = default_tower("Tower A")
    t["units"] = [{"id": "u", "type": "custom", "count": 3, "carpet_area": 238.56, "balcony_area": 5}]
    return t


def test_apply_site_layout_fills_a_big_plate_with_more_flats():
    # Phase II replay: a 1,260 m2 plate kept the brief's 3 flats (715 m2 of carpet).
    t = apply_layout_to_tower(big_flats_tower(), {"floors": 24, "footprint_sqm": 1259.7}, "Tower A",
                              override_floors=True)
    assert t["units"][0]["count"] > 3 and t.get("units_fitted_to_plate")
    used = t["units"][0]["count"] * (238.56 + 5) * 1.1
    assert used <= 1259.7 * 1.15


def test_automatic_relayout_keeps_the_users_flats():
    t = apply_layout_to_tower(big_flats_tower(), {"floors": 24, "footprint_sqm": 1259.7}, "Tower A")
    assert t["units"][0]["count"] == 3


def test_a_brief_that_already_fits_is_left_alone():
    t = big_flats_tower()
    t["footprint_area"] = 3 * 243.56 * 1.1 + 60
    assert fit_units_to_plate(t) is False and t["units"][0]["count"] == 3


def test_the_mix_keeps_its_proportions():
    t = default_tower("Tower A")
    t["units"] = [{"id": "a", "type": "custom", "count": 2, "carpet_area": 100, "balcony_area": 0},
                  {"id": "b", "type": "custom", "count": 4, "carpet_area": 60, "balcony_area": 0}]
    t["footprint_area"] = 2000.0
    assert fit_units_to_plate(t)
    a, b = (u["count"] for u in t["units"])
    assert b / a == pytest.approx(2.0, rel=0.2)


def _ctx(cfg, area=1e6):
    plot = box(-500, -500, 500, 500)
    return PackContext(region=plot, roads=box(0, 0, 0, 0).buffer(0), plot_area=area, cfg=cfg, envelope=None)


def _t(x, floors):
    return TowerPlacement(polygon=box(x, 0, x + 40, 15), cx=x + 20, cy=7.5, width=40, depth=15,
                          rotation_deg=0, floors=floors, floor_height=3.0)


def test_relevelling_trades_one_tall_tower_for_taller_neighbours():
    # Three blocks 30 m apart; the middle one at 24 floors forces 0.5 x mean height gaps
    # that hold its neighbours at 4. Levelled, all three can stand at 20 floors.
    cfg = SiteLayoutConfig()
    towers = [_t(0, 4), _t(70, 24), _t(140, 4)]
    before = sum(t.floor_area for t in towers)
    towers, notes = raise_floors(towers, _ctx(cfg))
    assert sum(t.floor_area for t in towers) > before and notes
    for i in range(3):
        for j in range(i + 1, 3):
            assert towers[i].polygon.distance(towers[j].polygon) >= required_spacing(towers[i], towers[j], cfg) - 1e-6


def test_relevelling_never_passes_the_far_cap():
    cfg = SiteLayoutConfig.from_dict({"far_cap": 1.0})
    towers = [_t(0, 4), _t(200, 4)]
    towers, _ = raise_floors(towers, _ctx(cfg, area=2 * 600 * 10))
    assert sum(t.floor_area for t in towers) <= 1.0 * 2 * 600 * 10 + 1e-6
