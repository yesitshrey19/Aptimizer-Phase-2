"""Ground coverage and open space follow BDA RMP 2015 (read 29 Oct 2026)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest

import engine, iscodes
from defaults import default_project


@pytest.mark.parametrize("plot,cov", [(300, 75.0), (360, 75.0), (800, 65.0), (1500, 60.0),
                                      (3000, 55.0), (15000, 50.0), (20000, 50.0)])
def test_table10_coverage_by_plot_size(plot, cov):
    assert iscodes.rmp_coverage_pct(plot) == cov


@pytest.mark.parametrize("road,cov", [(9, 60.0), (12, 60.0), (15, 55.0), (20, 55.0), (28, 50.0), (40, 50.0)])
def test_table20_coverage_by_road_above_20000(road, cov):
    assert iscodes.rmp_coverage_pct(25000, road) == cov


def test_open_space_only_for_development_plans_over_20000():
    assert iscodes.rmp_open_space_pct(19000) == 0.0
    assert iscodes.rmp_open_space_pct(25000) == 10.0


def _rule(res, rid):
    return next(r for r in res["results"] if r["id"] == rid)


def test_compliance_uses_the_plot_based_limits_and_cites_rmp():
    p = default_project("T", "C", "Bengaluru", "S", "o")
    a = engine.analyse(p)
    plot = a["areas"]["plot_area_sqm"]
    gc = _rule(a["compliance"], "ground_coverage")
    assert gc["threshold"] == iscodes.rmp_coverage_pct(plot, 12.0)
    assert "RMP 2015" in gc["reference"] and gc["verified"]
    os_ = _rule(a["compliance"], "open_space")
    assert os_["threshold"] == iscodes.rmp_open_space_pct(plot)


def test_a_typed_threshold_is_kept():
    p = default_project("T", "C", "Bengaluru", "S", "o")
    for r in p["compliance_rules"]:
        if r["id"] == "ground_coverage":
            r["threshold"], r["auto"] = 33.0, False
    gc = _rule(engine.analyse(p)["compliance"], "ground_coverage")
    assert gc["threshold"] == 33.0


def test_projects_saved_with_the_old_defaults_follow_rmp():
    p = default_project("T", "C", "Bengaluru", "S", "o")
    for r in p["compliance_rules"]:
        r.pop("auto", None)          # a project saved before this change
    a = engine.analyse(p)
    assert _rule(a["compliance"], "ground_coverage")["threshold"] != 40.0
    assert _rule(a["compliance"], "open_space")["threshold"] != 30.0
