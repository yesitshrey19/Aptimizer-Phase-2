"""Blank accessible bays mean 'the required number', not a failing placeholder (Stage 5)."""
import engine
from defaults import default_project


def _big_site(accessible=None):
    p = default_project("Accessible", "C", "Bengaluru", "S", "o")
    t = p["towers"][0]
    t["floors"] = 14
    t["units"] = [{"id": "u", "type": "custom", "count": 8, "carpet_area": 140.0, "balcony_area": 5}]
    p.pop("site_layout", None)
    p["parking"]["accessible_provided"] = accessible
    return p


def _rule(an, rule_id):
    return next(r for r in an["compliance"]["results"] if r["id"] == rule_id)


def test_new_project_does_not_seed_a_bay_count():
    assert default_project("x", "c", "Bengaluru", "s", "o")["parking"]["accessible_provided"] is None


def test_blank_uses_required_and_passes():
    an = engine.analyse(_big_site())
    pk = an["parking"]
    assert pk["required_slots"] > 100
    assert pk["accessible_entered"] is False
    assert pk["accessible_provided"] == pk["accessible_required"]
    assert _rule(an, "accessible_parking")["status"] == "pass"


def test_entered_number_is_still_checked():
    an = engine.analyse(_big_site(accessible=1))
    assert an["parking"]["accessible_entered"] is True
    assert _rule(an, "accessible_parking")["status"] == "fail"
