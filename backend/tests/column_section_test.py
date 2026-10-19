"""Column sizes must carry the load they were sized for (IS 456 Cl. 39.3)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import takeoff


def test_column_section_never_smaller_than_required_area():
    """Rounding the depth to the NEAREST 25 mm left about half of all sections a little
    under the required area; every size must be at least the area its load needs."""
    for load in range(200, 12001, 37):
        req = takeoff.column_required_area(load, 25.0, 415.0, 1.0)
        b, d = takeoff.column_section(req)
        assert b * d >= req - 1e-6, (load, b, d, req)
