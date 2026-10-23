"""Phase II Stage 3 book examples run through the app's own functions.

Each test names the published source and page. Answers are the books' own; the app side is
the function the screens call. Where the book designs for something the app does not model
(earthquake moments on columns and footings), the test pins the app's answer and the
reason, so a change shows up here rather than silently in the tracking sheet.

Sources (free copies on public.resource.org / IITK-GSDMA):
  IITGN-WB-EQ3 V3.0 Example 1; IITK-GSDMA-EQ26 V3.0; IITK-GSDMA-EQ22 V3.0;
  SP 16:1980 Example 5 and Chart 25; SP 64:2001 Examples 1 and 22; IS 10262:2009 Annex A.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest

import engineering as E
import iscodes as C
import takeoff as T


def within(actual, expected, pct):
    return abs(actual - expected) <= pct / 100.0 * abs(expected)


# ------------------------------------------------------------------ S3-014 / S3-015 IITGN
def test_iitgn_dead_and_lumped_live_load():
    """p. 5: floors 300 m2 x 12 kN/m2, roof x 10; 50% of 4 kN/m2 lumped, none at roof."""
    dead = sum(E.storey_seismic_weights(4, 300.0, 12.0, 0.0, roof_dead=10.0))
    total = sum(E.storey_seismic_weights(4, 300.0, 12.0, 4.0, roof_dead=10.0))
    assert dead == pytest.approx(13800.0)
    assert total - dead == pytest.approx(1800.0)


# ------------------------------------------------------------------ S3-008 EQ26 base shear
def test_eq26_base_shear():
    """Sec. 1.4-1.5, pp. 13-14: W = 39,286 kN, Ta = 0.075 h^0.75 = 0.97 s (h 30.5 m),
    Zone III, I 1.5, R 5, medium soil, VB = 1,320 kN. The bare-frame period formula and
    the 50% / 0% live-load lumping are unchanged in IS 1893:2016."""
    weights = [2027, 6138, 6381, 6381, 6381, 6381, 5597]
    assert sum(weights) == 39286
    ta, _ = C.seismic_period(30.5, 22.5, "bare_frame")
    assert round(ta, 2) == 0.97
    sa = E.spectral_acceleration(ta, "II")
    ah, _ = C.ah_with_minimum(C.ZONE_FACTOR["III"] * 1.5 * sa / (2 * 5.0), "III")
    assert within(ah * sum(weights), 1320.0, 1.0)


# ------------------------------------------------------------------ S3-040..044 SP 16
@pytest.mark.parametrize("pu,fck,p,book_side_mm", [
    (3000, 20, 1.0, math.sqrt(600 * 450)),   # Example 5, p. 99: Ag 2,700 cm2, 60 x 45 cm
    (1500, 20, 0.8, math.sqrt(1500e3 / 10.12)),  # Chart 25 (p. 110) read: Pu/Ag 10.12
    (2000, 25, 1.0, math.sqrt(2000e3 / 12.66)),  # 12.66
    (4000, 25, 2.0, math.sqrt(4000e3 / 15.32)),  # 15.32
    (5000, 30, 1.5, math.sqrt(5000e3 / 15.99)),  # 15.99
])
def test_sp16_axial_column_size_within_50mm(pu, fck, p, book_side_mm):
    b, d = T.column_section(T.column_required_area(pu, fck, 415.0, p))
    assert abs(math.sqrt(b * d) - book_side_mm) <= 50.0


# ------------------------------------------------------------------ S3-045 / S3-046
@pytest.mark.parametrize("pu,fck,p,book,app", [
    (1803, 20, 2.85, (400, 500), (230, 500)),   # EQ22 Example 3, pp. 24-27
    (3027, 25, 2.79, (500, 500), (275, 650)),   # EQ26 Sec. 1.11, column C202
])
def test_seismic_columns_are_larger_than_axial_only_sizing(pu, fck, p, book, app):
    """The books size these columns for axial load AND earthquake moments; the app's
    preliminary size is axial-only, so it is expected to come out smaller."""
    b, d = T.column_section(T.column_required_area(pu, fck, 415.0, p))
    assert (b, d) == app
    assert math.sqrt(b * d) < math.sqrt(book[0] * book[1]) - 50


# ------------------------------------------------------------------ S3-025 / S3-026 SP 64
@pytest.mark.parametrize("vb,k1,k2,k3,book_pz", [
    (47, 0.90, 1.05, 1.0, 1183.88),   # Example 1, p. 30: farm building at 10 m
    (50, 1.00, 1.04, 1.0, 1622.4),    # Example 22, p. 105, Table 11: 60 m level
])
def test_sp64_design_wind_pressure(vb, k1, k2, k3, book_pz):
    vz = vb * k1 * k2 * k3 * C.WIND_K4
    assert within(0.6 * vz * vz, book_pz, 1.0)


# ------------------------------------------------------------------ S3-047 / S3-048 EQ26 footing
def _foundation(service_kn, sbc_soil, floors, bay):
    loads = {"derived": {"column_load_raw": service_kn * 1.5, "column_load": service_kn * 1.5}}
    e = {**E.DEFAULT_ENGINEERING, "soil_type": sbc_soil, "grid_bay_x_m": bay, "grid_bay_y_m": bay}
    base = {"areas": {"towers": [{"height_m": floors * 3.0, "floors": floors, "floor_height": 3.0}],
                      "ground_footprint_sqm": 0, "builtup_area_sqm": 0, "super_builtup_area_sqm": 0,
                      "total_units": 0, "plot_area_sqm": 0}}
    return E.m3_foundation({}, base, e, loads)


def test_eq26_footing_size_and_type(monkeypatch):
    """Sec. 1.12, p. 48: DL + LL 2,899 kN + 15% self-weight on SBC 200 kN/m2; 4.2 m square
    adopted (sized also for biaxial moments). App: +10% -> 4.0 m, isolated."""
    monkeypatch.setitem(C.SOILS, "eq26", {"sbc": 200, "phi": 30, "gamma": 18.0, "label": "EQ26 soil"})
    out = _foundation(2899.0, "eq26", 6, 7.5)
    o = {x["label"]: x["value"] for x in out["outputs"]}
    assert o["Isolated footing size"] == "4.0 × 4.0"
    assert out["recommendation"]["value"] == "Isolated / pad footings"
    assert T.footing_size(2899.0, 200.0, 15.0)[2] == 4.1   # with the book's own 15%


def test_footing_side_rounds_up_to_50mm():
    for load in range(100, 6000, 97):
        _, area, side = T.footing_size(load, 180.0)
        assert side * side >= area - 1e-9
        assert round(side / 0.05, 6) == round(side / 0.05)


# ------------------------------------------------------------------ S3-055..057 IS 10262 Annex A
def test_is10262_annex_a():
    """M40, 20 mm, severe, 100 mm slump, superplasticizer (29% water cut), w/c 0.40 chosen
    from experience: water 140 l, cement 350 kg (A-4 to A-6, p. 5)."""
    m = T.mix_proportions(40, "severe", 20, slump_mm=100, water_reduction_pct=29, wc_chosen=0.40)
    assert m["wc_ratio"] == 0.40
    assert m["water_l"] == pytest.approx(140.0, abs=0.5)
    assert m["cement_kg"] == pytest.approx(350.0, abs=1.0)


def test_chosen_wc_is_capped_at_durability_limit():
    assert T.mix_proportions(30, "severe", 20, wc_chosen=0.60)["wc_ratio"] == 0.45


def test_mix_defaults_are_unchanged():
    m = T.mix_proportions(25, "moderate", 20)
    assert (m["wc_ratio"], m["water_l"], m["cement_kg"]) == (0.5, 186.0, 372.0)


def test_mix_and_footing_inputs_are_bounded():
    assert T.mix_proportions(25, "moderate", 20, slump_mm=-50, water_reduction_pct=95)["water_l"] == pytest.approx(186 * 0.6, abs=0.1)
    assert T.footing_size(1000.0, 200.0, -20)[0] == 1000.0


# ------------------------------------------------------------------ S3-061..063 IS 1172
def test_water_default_is_is1172_rate_for_a_city_above_one_lakh():
    """IS 1172:1993 Cl. 4.1 / 4.1.1: 150-200 lpcd with full flushing above 1 lakh people,
    45 of it for flushing; 135 is for LIG / EWS only."""
    from defaults import default_project
    assert sum(C.WATER_LPCD.values()) == 150
    assert C.WATER_LPCD["flushing"] == 45
    assert default_project("W", "QA", "Bengaluru", "W-1", "owner")["utility_config"]["lpcd"] == 150


# ------------------------------------------------------------------ S3-067 rational method
def test_rational_method_ignou_example_2_1():
    """IGNOU 'Wastewater Collection and Characteristics', Example 2.1: C 0.4, i 76 mm/h,
    A 2.1 ha -> Q = 638.40 m3/h = 177.33 l/s. Site C set to 0.4 by roof share on a lawn site."""
    plot = 21000.0
    roof = plot * (0.4 - C.RUNOFF_C["lawn"]) / (C.RUNOFF_C["rcc_roof"] - C.RUNOFF_C["lawn"])
    base = {"areas": {"towers": [{"height_m": 12, "floors": 4, "floor_height": 3.0}],
                      "ground_footprint_sqm": roof, "builtup_area_sqm": 0, "super_builtup_area_sqm": 0,
                      "total_units": 0, "plot_area_sqm": plot}}
    e = {**E.DEFAULT_ENGINEERING, "site_area_type": "lawn", "roof_area_sqm": roof, "rain_intensity_override": 76}
    o = {x["label"]: x["value"] for x in E.m6_storm_rwh({}, base, e, C.city_reference("Bengaluru", "Karnataka"))["outputs"]}
    assert o["Weighted runoff coefficient C"] == pytest.approx(0.4, abs=1e-3)
    assert within(o["Peak storm runoff Q"], 0.17733, 0.5)


# ------------------------------------------------------------------ S3-068 rainfall
def test_bengaluru_annual_rainfall_is_the_imd_1991_2020_normal():
    """IMD climatological table, Bengaluru City, 1991-2020: annual mean rainfall 1,077.6 mm."""
    assert C.city_reference("Bengaluru", "Karnataka")["annual_rainfall_mm"] == 1077.6
