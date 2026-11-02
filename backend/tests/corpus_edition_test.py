"""A checked-facts file read from another edition keeps that edition (Phase II, 3 Nov 2026)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import codesearch


def test_a_file_from_another_edition_is_cited_with_its_own_year():
    # The library holds IS 13920:2016; the team's book is the 1993 edition.
    cid, code = codesearch._resolve_code("is13920_1993", "IS 13920:1993 — Ductile detailing (checked facts)\n")
    assert (cid, code) == (None, "IS 13920:1993")


def test_the_library_edition_still_maps_to_its_id():
    cid, code = codesearch._resolve_code("is456", "IS 456:2000 — Plain and reinforced concrete (checked facts)\n")
    assert (cid, code) == ("is456", "IS 456:2000")


def test_a_file_without_a_year_keeps_the_library_label():
    cid, code = codesearch._resolve_code("nbc3", "NBC 2016 Part 3 — Development control rules\n")
    assert cid == "nbc3"


def test_the_word_is_before_a_number_is_not_a_code():
    import citations
    found = citations.verify_with_extracts("For moderate exposure the cover is 30 mm (IS 456:2000 Table 16).", [])
    cited = found["resolved"] + found["code_only"] + found["unverified"]
    assert not any(c.lower().startswith("is 30") for c in cited)
    assert any("456" in c for c in cited)
