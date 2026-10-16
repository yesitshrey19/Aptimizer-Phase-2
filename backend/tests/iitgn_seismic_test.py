"""Phase II Stage 3 solved examples: seismic base shear and wind k2 against published answers.

IITGN-WB-EQ3 (V3.0), Example 1 -- equivalent static method, IS 1893 (Part 1):2016.
Four-storey RC office, plan 15 m (y) x 20 m (x), storeys 4.2 + 3 x 3.2 m, Zone V, medium
soil (Type II), brick-infilled frames, I = 1.0, R = 5. Floors: DL 12 kN/m2, LL 4 kN/m2.
Roof: DL 10 kN/m2, LL 1.5 kN/m2 (not lumped). Published answers, pp. 5-6:
    W = 15,600 kN; Ta = 0.28 s (X), 0.32 s (Y); Ah = 0.09; VB = 1,404 kN;
    Q4..Q1 = 595, 492, 240, 77 kN.
The Phase II tracking sheet locks these at +/-1%.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest

import engineering as E
import iscodes as C

TOL = 0.01      # the locked Phase II tolerance for solved examples

AREA = 15.0 * 20.0
Z = C.ZONE_FACTOR["V"]
I, R = 1.0, 5.0


def close(actual, expected, tol=TOL):
    return abs(actual - expected) <= tol * abs(expected)


def iitgn_chain():
    weights = E.storey_seismic_weights(4, AREA, dead=12.0, live=4.0, roof_dead=10.0)
    levels = E.storey_levels(4, 3.2, first_storey_height=4.2)
    ta_x, _ = C.seismic_period(13.8, 20.0, "brick_infill")
    ta_y, _ = C.seismic_period(13.8, 15.0, "brick_infill")
    sa = E.spectral_acceleration(ta_x, "II")
    ah, _ = C.ah_with_minimum(Z * I * sa / (2 * R), "V")
    vb = ah * sum(weights)
    return weights, levels, ta_x, ta_y, sa, ah, vb, E.storey_forces(vb, weights, levels)


# ----------------------------------------------------------------------- IITGN Example 1
def test_storey_weights_take_half_live_load_and_none_at_the_roof():
    weights = iitgn_chain()[0]
    assert weights == pytest.approx([4200.0, 4200.0, 4200.0, 3000.0])


def test_seismic_weight_w():
    assert close(sum(iitgn_chain()[0]), 15600.0)


def test_floor_levels():
    assert iitgn_chain()[1] == pytest.approx([4.2, 7.4, 10.6, 13.8])


@pytest.mark.parametrize("index,expected", [(2, 0.28), (3, 0.32)], ids=["X", "Y"])
def test_fundamental_period_uses_d_along_the_force(index, expected):
    # The example prints 0.28 and 0.32 to two decimals; 0.09 x 13.8 / sqrt(d) is 0.2777
    # and 0.3207, so this compares at the example's own precision.
    assert round(iitgn_chain()[index], 2) == expected


def test_spectral_acceleration_on_the_plateau():
    assert iitgn_chain()[4] == 2.5


def test_design_horizontal_coefficient_ah():
    assert close(iitgn_chain()[5], 0.09)


def test_design_base_shear_vb():
    assert close(iitgn_chain()[6], 1404.0)


@pytest.mark.parametrize("level,expected", [(4, 595.0), (3, 492.0), (2, 240.0), (1, 77.0)])
def test_storey_force(level, expected):
    assert close(iitgn_chain()[7][level - 1], expected)


def test_storey_forces_add_up_to_base_shear():
    *_, vb, forces = iitgn_chain()
    assert sum(forces) == pytest.approx(vb)


def test_tower_path_reproduces_the_example():
    """The same building through the app's own per-tower function, not just the helpers."""
    tower = {"id": "t", "name": "IITGN Ex 1", "floors": 4, "height_m": 13.8, "floor_height": 3.2,
             "ground_floor_height": 4.2, "footprint_sqm": AREA, "builtup_sqm": 4 * AREA,
             "plan_x_m": 20.0, "plan_y_m": 15.0}
    loads = {"derived": {"dead_raw": 12.0, "dead": 12.0, "live": 4.0},
             "seismic_inputs": {"roof_dead_raw": 10.0}}
    out = E._tower_seismic(tower, Z, "II", R, I, E.spectral_acceleration, loads, "brick_infill", "V")
    assert close(out["seismic_weight_kn"], 15600.0)
    assert close(out["ah"], 0.09)
    assert close(out["base_shear_kn"], 1404.0)
    by_level = {s["level"]: s["force_kn"] for s in out["storey_forces"]}
    for level, expected in {4: 595.0, 3: 492.0, 2: 240.0, 1: 77.0}.items():
        assert close(by_level[level], expected), (level, by_level[level])


def test_live_load_fraction_switches_at_3_kn_per_m2():
    assert E.seismic_live_fraction(3.0) == 0.25
    assert E.seismic_live_fraction(3.01) == 0.50


def test_infilled_period_is_not_capped_by_the_bare_frame_formula():
    """A tall slender plan: 0.09 h / sqrt(d) exceeds 0.075 h^0.75. Cl. 7.6.2(c) applies as
    written, so the bare-frame value must not replace it."""
    h, d = 60.0, 8.0
    ta, _ = C.seismic_period(h, d, "brick_infill")
    assert ta == pytest.approx(0.09 * h / d ** 0.5)
    assert ta > 0.075 * h ** 0.75


# ----------------------------------------------------------------------- IS 875-3 Table 2 k2
@pytest.mark.parametrize("h,expected", [
    (10, 1.00), (15, 1.05), (20, 1.07), (30, 1.12), (50, 1.17), (100, 1.24),   # table rows
    (5, 1.00),                                                                 # below 10 m
    (12, 1.02), (25, 1.095), (40, 1.145), (60, 1.184), (80, 1.212),            # interpolated
    (250, 1.30),                                                               # above 200 m
])
def test_wind_k2_terrain_category_2(h, expected):
    assert close(C.wind_k2(h), expected)
