"""Phase II Stage 5: compliance rules carry their clause (S5-001) and the DXF export
carries the same numbers as the app for towers typed on the Planning tab (S5-011 to 019)."""
import sys, os, io
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ezdxf
import bim
import engine
import iscodes
from defaults import default_project


def _project():
    p = default_project("X", "C", "Bengaluru", "S", "o")
    p["plot"] = {"length": 190.519, "width": 100.0}
    p["towers"] = [{"id": n, "name": n, "floors": 14, "floor_height": 3.2, "footprint_area": 738.64,
                    "lifts": [{"id": "l", "count": 2, "capacity": 8, "location": "core"}],
                    "staircases": [{"id": "s", "count": 2, "width": 1.5, "type": "dog-legged", "location": "core"}],
                    "units": [{"id": n + "1", "type": "custom", "count": 4, "carpet_area": 140.77, "balcony_area": 5}]}
                   for n in ("A", "B", "C")]
    p.pop("site_layout", None)
    return p


def test_every_rule_names_its_clause_or_says_it_is_unverified():
    res = engine.analyse(_project())["compliance"]["results"]
    for r in res:
        assert r["reference"]
        if r["verified"]:
            assert r["edition"] and r["reference"].startswith(
                iscodes.CLAUSES[engine.RULE_BASIS[r["id"]]]["code"])
        else:
            assert "confirmed" in r["reference"]
    stair = next(r for r in res if r["id"] == "stair_width")
    assert stair["threshold"] == iscodes.FIRE["stair_min_width_m"] == 1.25


def test_dxf_of_typed_towers_has_real_footprints_and_title_numbers():
    p = _project()
    a = engine.analyse(p)["areas"]
    msp = ezdxf.read(io.StringIO(bim.export_siteplan_dxf(p).decode())).modelspace()
    polys = [list(e.get_points("xy")) for e in msp if e.dxftype() == "LWPOLYLINE" and e.dxf.layer == "A-TOWER-FOOT"]
    texts = [e.dxf.text for e in msp if e.dxftype() == "TEXT"]
    assert len(polys) == 3
    spans = []
    for pts in polys:
        area = abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2
        assert abs(area - 738.64) < 1.0
        spans.append((min(x for x, _ in pts), max(x for x, _ in pts)))
    spans.sort()
    assert all(spans[i][0] >= spans[i - 1][1] for i in range(1, len(spans)))  # side by side
    assert all("738.64 m2" in t for t in texts if t[:3] in ("A  ", "B  ", "C  "))
    title = next(t for t in texts if "|" in t)
    assert "?" not in title and f"units {a['total_units']}" in title
