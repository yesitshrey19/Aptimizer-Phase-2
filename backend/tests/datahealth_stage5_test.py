"""Data-health flags for deliberately bad inputs (Phase II Stage 5, S5-007 to 010)."""
import sys, os, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import datahealth as DH
from defaults import default_project


def failed(p):
    return {c["label"] for g in DH.report(p)["groups"] for c in g["checks"] if not c.get("ok", True)}


def test_missing_road_width_is_flagged():
    p = default_project("D", "C", "Bengaluru", "S", "o")
    assert "Road widths entered" not in failed(p)
    p["plot"]["road_edges"] = [{"edge_index": 0, "width": None}]
    assert "Road widths entered" in failed(p)
