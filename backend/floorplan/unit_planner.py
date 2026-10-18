"""Realistic apartment planner: the Indian slab-block flat, sized from a room brief.

The previous planners filled a unit envelope by stretching rooms: the Vastu packer cut it
into full-depth columns, so a large flat came out as 3 m x 17 m "bedrooms" and a 50 m²
pooja room. This planner works the other way round. Every room has a target size from the
brief for its BHK tier, scaled to the flat's carpet area within limits, and the flat's
envelope is whatever those rooms add up to. Nothing is stretched to fill space.

The arrangement is the one Indian residential slabs actually use (canonical frame: facade
at y = 0, the corridor/entrance wall at y = H, x running along the facade):

    facade  |UTIL |        | balcony |balcony |balcony |          |   habitable rooms on air
    row R1  |-----|KITCHEN | LIVING  |MASTER  |BED 2   |(SERVANT) |   (balconies cut from
            |STORE|        |         |        |        |          |    the front)
    row R2  |BREAKFAST     |DIN |POO |LOB|ENS |LOB|BTH |LOB|S.BTH |   dining, pooja, lobbies,
    row R3  |FOYER |          PASSAGE          |POWDER|SHAFT      |   wet core; entrance and
              ^ main door on the corridor wall                         circulation

Each choice answers a rule of the planning guide rather than a habit:
  * Every habitable room -- kitchen and servant room included -- sits on the facade.
  * The utility is a dry balcony on the facade beside the kitchen it serves.
  * The pooja room takes its door off the living room and shares no wall with a bathroom
    (the bedroom lobbies, not the baths, face it).
  * Bedrooms open onto their own lobby off the private passage, never the living room;
    en-suites are entered only from their bedroom; common baths open onto the passage.
  * Wet services (baths, powder room, shaft) stack at the bedroom end, away from the
    kitchen-end corner that becomes NE when the flat faces south -- the guide forbids wet
    and service rooms there.
  * The rows tile the envelope exactly, so there is no unbuilt plan.
"""
from __future__ import annotations

import math
from functools import lru_cache
from typing import Any, Dict, List, Sequence, Tuple

import vastu

# ---------------------------------------------------------------- the room brief (k = 1)
KITCHEN_W = {1: 2.5, 2: 2.6, 3: 2.8, 4: 3.0, 5: 3.2}
LIVING_W = {1: 3.9, 2: 4.6, 3: 5.4, 4: 6.0, 5: 6.6}
MASTER_W = {1: 3.6, 2: 3.8, 3: 4.0, 4: 4.2, 5: 4.5}
BED_W = {1: 3.3, 2: 3.4, 3: 3.4, 4: 3.5, 5: 3.6}
FAMILY_W = 4.4
OFFICE_W = 3.3
SERVANT_COL_W = 2.7
FACADE_ROW = {1: 5.0, 2: 5.4, 3: 5.7, 4: 6.0, 5: 6.3}     # R1 depth incl. balconies
SERVICE_ROW = {1: 2.4, 2: 2.4, 3: 2.6, 4: 2.7, 5: 2.8}    # R2: lobbies, baths, dining, pooja
ENTRY_ROW = {1: 1.5, 2: 1.5, 3: 1.6, 4: 1.6, 5: 1.7}      # R3: foyer, passage, wet stack

LIVING_BALCONY = 1.8        # guide: N/E living balcony 1.8-2.4 m
MASTER_BALCONY = 1.2        # guide: exactly 1.2 m
SECONDARY_BALCONY = 1.2     # guide: 1.2-1.5 m
UTILITY_W = 1.35            # guide: 1.2-1.5 m
UTILITY_MIN_D = 2.4
SHAFT_W = 0.9
STORE_SHAFT_D = 1.0         # a shaft cut from the back of the kitchen store (uw x 1.0 m)
POWDER_W = 1.8
POOJA_W = {1: 1.1, 2: 1.4, 3: 1.5, 4: 1.6, 5: 1.8}
BATH_SLOT_W = 2.1           # en-suite / common bath width behind a bedroom
DOOR_W = 0.9                # clear width a door onto the passage needs
BATH_DOOR_W = 0.75
MIN_LOBBY_W = 1.05          # a bedroom door needs a lobby at least a door-and-frame wide
SERVANT_LOBBY_W = 1.2
# With a passage row, the column that ends the flat loses SHAFT_W of passage to the shaft;
# a bedroom there needs its lobby plus a bath door's width of passage left over.
END_BED_W = MIN_LOBBY_W + BATH_DOOR_W + SHAFT_W
MAX_STORE_RATIO = 3.1       # a store deeper than this x its width reads as a strip

SCALE_LIMITS = (0.5, 1.6)   # brief scale range; the floors below stop rooms going under code

# Floors a room may shrink to: NBC 2016 Part 3 (Cl. 12.2.2 habitable 9.5 / 7.5 m2 and 2.4 m,
# Cl. 12.4.2 bath + WC 2.8 m2 and 1.2 m) and the livability limits below (kitchen 2.2 m,
# dining 2.4 m deep).
MIN_HAB_W = 2.4
MIN_KITCHEN_W = 2.2
MIN_LIVING_AREA = 9.5
MIN_BED_AREA = 7.5
MIN_BATH_AREA = 2.8
MIN_BATH_W = 1.2
MIN_LIVING_D = 3.0          # living room depth behind its balcony
MIN_DINING_W = 2.4
MIN_SERVICE_D = 2.4         # R2 holds the dining, which livability wants 2.4 m deep
MIN_TWO_ROW_D = 2.0         # R2 without a dining room: lobbies and 1.4 x 2.0 m baths
MIN_ENTRY_D = 1.0           # R3: foyer and a 1.0 m private passage

# Ways to save space once every room is at its floor, tried in order: 0 the full brief;
# 1 no pooja niche; 2 (1-2 BHK only) the breakfast area becomes the entrance foyer and the
# separate passage row goes, bedroom lobbies opening off the foyer and dining instead.
FULL, NO_POOJA, TWO_ROW = 0, 1, 2
LEVEL_NOTES = {
    NO_POOJA: "No pooja niche: the carpet area is too small for one.",
    TWO_ROW: "No pooja niche, breakfast area or separate passage, and living and dining are one "
             "room: the main door opens into the foyer, bedroom lobbies open off the foyer and living.",
}
NOT_CARPET = {"balcony", "terrace", "utility", "shaft"}   # RERA carpet excludes these


def _tier(unit_type: str, carpet: float) -> Tuple[int, bool, Dict[str, Any]]:
    prog = vastu.unit_programme(unit_type, carpet)
    beds = max(1, min(int(prog["beds"]), 5))
    return beds, bool(prog["is_penthouse"]), prog


def _ceil2(v: float) -> float:
    return math.ceil(v * 100 - 1e-6) / 100


def _layout_widths(beds: int, penthouse: bool, f: float, level: int = FULL,
                   d1: float = 5.4, d2: float = 2.4) -> Dict[str, Any]:
    big = beds >= 5 or penthouse
    tier = min(beds, 5)
    servant = bool(vastu.SCALING_PROTOCOL[tier].get("servant"))
    pooja = POOJA_W[tier] if level == FULL else 0.0
    # Every bedroom column also carries a lobby and a bath (or wardrobe) behind the room.
    bath_w = max(MIN_BATH_W, _ceil2(MIN_BATH_AREA / d2))

    def bed_w(base: float, balcony: float) -> float:
        return max(round(base * f, 2), MIN_HAB_W, _ceil2(MIN_BED_AREA / (d1 - balcony)),
                   round(MIN_LOBBY_W + bath_w, 2))
    bed_widths = [bed_w(MASTER_W[tier], MASTER_BALCONY) if i == 0 else bed_w(BED_W[tier], SECONDARY_BALCONY)
                  for i in range(beds)]
    return {
        "utility": UTILITY_W,
        "kitchen": max(round(KITCHEN_W[tier] * f, 2), MIN_KITCHEN_W),
        # Wide enough for the pooja room (if any) and a dining area behind it, and for the
        # NBC 9.5 m2 room in front.
        "living": max(round(LIVING_W[tier] * f, 2), pooja + (2.6 if pooja else MIN_DINING_W),
                      _ceil2(MIN_LIVING_AREA / (d1 - LIVING_BALCONY)), MIN_HAB_W),
        # The lounge runs through R1 and R2, so it must stay room-shaped (ratio <= 2.3); the
        # office keeps a 1.0 m store beside its powder room, which may not touch the lounge.
        "family": max(round(FAMILY_W * f, 2), MIN_HAB_W, _ceil2((d1 + d2 - LIVING_BALCONY) / 2.3)) if big else 0.0,
        "office": max(round(OFFICE_W * f, 2), MIN_HAB_W, POWDER_W + 1.0) if big else 0.0,
        "beds": bed_widths,
        "servant": SERVANT_COL_W if servant else 0.0,
        # Width held back for whichever bedroom ends the flat (see END_BED_W); plan_unit
        # gives it to that bedroom and any remainder to the living room.
        "end_extra": 0.0 if level == TWO_ROW else round(max(0.0, END_BED_W - min(bed_widths)), 2),
    }


def _natural_size(beds: int, penthouse: bool, f: float, level: int = FULL) -> Tuple[float, float, Dict[str, Any]]:
    tier = min(beds, 5)
    d1 = max(round(FACADE_ROW[tier] * min(f, 1.2), 2), LIVING_BALCONY + MIN_LIVING_D)
    d2 = max(round(SERVICE_ROW[tier] * min(f, 1.0), 2), MIN_TWO_ROW_D if level == TWO_ROW else MIN_SERVICE_D)
    d3 = 0.0 if level == TWO_ROW else max(round(ENTRY_ROW[tier] * min(f, 1.0), 2), MIN_ENTRY_D)
    cols = _layout_widths(beds, penthouse, f, level, d1, d2)
    # A two-row 2 BHK keeps its shaft at the far end of the wing (see plan_unit).
    shaft = SHAFT_W if level == TWO_ROW and beds == 2 else 0.0
    width = (cols["utility"] + cols["kitchen"] + cols["living"] + cols["family"] + cols["office"]
             + sum(cols["beds"]) + cols["servant"] + cols["end_extra"] + shaft)
    return round(width, 2), round(d1 + d2 + d3, 2), {**cols, "d1": d1, "d2": d2, "d3": d3, "level": level}


def plan_carpet(rooms: Sequence[Dict[str, Any]]) -> float:
    """RERA carpet area of a planned flat: every room except balconies, terraces, the dry
    balcony and the shaft."""
    return round(sum(r["w"] * r["h"] for r in rooms if r["type"] not in NOT_CARPET), 2)


def _carpet_at(unit_type: str, carpet: float, f: float, level: int, front: bool = False) -> float:
    beds, penthouse, _ = _tier(unit_type, carpet)
    w, h, _ = _natural_size(beds, penthouse, f, level)
    rooms, _ = plan_unit({"x": 0.0, "y": 0.0, "w": w, "h": h}, unit_type, carpet, "S", "probe", 0, ["N"],
                         _sizing=(f, level, None), pooja_front="hi" if front else None)
    return plan_carpet(rooms)


@lru_cache(maxsize=4096)
def sizing(unit_type: str, carpet: float, front: bool = False) -> Tuple[float, int, Any]:
    """(scale, level, warning) that makes the plan's carpet area match `carpet`.

    `front` sizes the variant with the pooja at the facade (see plan_unit), which turns
    balcony into carpet, for flats whose facade faces north.

    The brief scales down until rooms reach their code floors, then the levels above save
    space in order; past the last one the smallest plan is drawn and `warning` says so."""
    beds, penthouse, prog = _tier(unit_type, carpet)
    target = max(float(carpet or 0), 15.0)
    levels = [FULL, NO_POOJA]
    if beds <= 2 and not (beds >= 5 or penthouse) and not prog.get("servant"):
        levels.append(TWO_ROW)
    lo_f, hi_f = SCALE_LIMITS
    label = f"{beds} BHK{' penthouse' if penthouse else ''}"
    for level in levels:
        smallest = _carpet_at(unit_type, carpet, lo_f, level, front)
        if target < smallest * 0.98 and level != levels[-1]:
            continue
        if target < smallest * 0.98:
            return lo_f, level, (f"{target:.0f} m² carpet is below the smallest {label} plan with every room "
                                 f"at its NBC 2016 minimum ({smallest:.0f} m²); drawn at {smallest:.0f} m².")
        largest = _carpet_at(unit_type, carpet, hi_f, level, front)
        if target > largest * 1.02:
            return hi_f, level, (f"{target:.0f} m² carpet is above the largest {label} plan the brief "
                                 f"scales to ({largest:.0f} m²); drawn at {largest:.0f} m².")
        a, b = lo_f, hi_f              # carpet rises with the scale: smallest f that reaches target
        for _ in range(28):
            m = (a + b) / 2
            if _carpet_at(unit_type, carpet, m, level, front) >= target:
                b = m
            else:
                a = m
        lower, upper = _carpet_at(unit_type, carpet, a, level, front), _carpet_at(unit_type, carpet, b, level, front)
        return (a if abs(lower - target) < abs(upper - target) else b), level, None
    return lo_f, levels[-1], None


def scale_for(unit_type: str, carpet: float) -> float:
    return sizing(unit_type, carpet)[0]


def envelope(unit_type: str, carpet: float, front: bool = False) -> Tuple[float, float]:
    """(width along the corridor, depth) of the flat this brief produces."""
    beds, penthouse, _ = _tier(unit_type, carpet)
    f, level, _ = sizing(unit_type, float(carpet or 0), front)
    w, h, _ = _natural_size(beds, penthouse, f, level)
    return w, h


def _rect(x: float, y: float, w: float, h: float) -> Dict[str, float]:
    return {"x": round(x, 3), "y": round(y, 3), "w": round(w, 3), "h": round(h, 3)}


def _place(rect: Dict[str, float], plan_w: float, plan_h: float, entry_edge: str, mirror: bool) -> Dict[str, float]:
    x, y, w, h = rect["x"], rect["y"], rect["w"], rect["h"]
    if mirror:
        x = plan_w - x - w
    if entry_edge == "S":          # facade north, door south: canonical
        return _rect(x, y, w, h)
    if entry_edge == "N":          # facade south: flip front to back
        return _rect(x, plan_h - y - h, w, h)
    if entry_edge == "E":          # facade west, door east
        return _rect(y, plan_w - x - w, h, w)
    return _rect(plan_h - y - h, x, h, w)   # entry W: facade east


def plan_unit(box: Dict[str, float], unit_type: str, carpet: float, entry_edge: str,
              uid: str, unit_index: int, exterior_edges: Sequence[str],
              mirror: bool = False, master_last: bool = False, split: int = 0,
              servant_first: bool = False, _sizing=None,
              pooja_front: Any = None, kitchen_first: bool = False) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Plan one flat inside `box` (normally sized by `envelope`). Returns (rooms, notes).

    `mirror` flips the plan end for end; `master_last` puts the master bedroom at the far
    end of its wing; `split` puts that many bedrooms before the public core; `servant_first`
    moves the servant column to the other end. `variants()` enumerates the combinations and
    the caller keeps whichever best meets the guide's zones for this orientation.
    """
    beds, penthouse, prog = _tier(unit_type, carpet)
    tier = min(beds, 5)
    big = beds >= 5 or penthouse
    servant = bool(prog.get("servant"))
    f, level, warning = _sizing or sizing(unit_type, float(carpet or 0))
    two_row = level == TWO_ROW
    if two_row and beds == 2:
        split = 1   # one bedroom each side of the core, so both lobbies reach the foyer/dining
    nat_w, nat_h, cols = _natural_size(beds, penthouse, f, level)

    canonical = entry_edge in ("S", "N")
    plan_w, plan_h = (float(box["w"]), float(box["h"])) if canonical else (float(box["h"]), float(box["w"]))
    x0, y0 = float(box["x"]), float(box["y"])
    if plan_w + 0.05 < nat_w or plan_h + 0.05 < nat_h * 0.98:
        return [], [f"Envelope {plan_w:.1f} x {plan_h:.1f} m is smaller than the {nat_w:.1f} x {nat_h:.1f} m "
                    "the room brief needs."]

    # Any extra envelope (a caller that sized the box differently) goes to the living room
    # and the facade row, never to a strip of leftover space.
    cols["living"] = round(cols["living"] + (plan_w - nat_w), 3)
    d1 = round(cols["d1"] + (plan_h - nat_h), 3)
    d2, d3 = cols["d2"], cols["d3"]
    y2, y3 = d1, d1 + d2

    rooms: List[Dict[str, Any]] = []

    def emit(key: str, name: str, rtype: str, x: float, y: float, w: float, h: float, **extra: Any):
        if w < 0.3 or h < 0.3:
            return None
        placed = _place(_rect(x, y, w, h), plan_w, plan_h, entry_edge, mirror)
        placed["x"] = round(placed["x"] + x0, 2)
        placed["y"] = round(placed["y"] + y0, 2)
        placed["w"] = round(placed["w"], 2)
        placed["h"] = round(placed["h"], 2)
        room = {"id": f"{uid}-{key}", "name": name, "type": rtype, "unit_id": uid,
                "unit_type": unit_type, "unit_index": unit_index, **placed, **extra}
        rooms.append(room)
        return room

    terrace = "Terrace" if penthouse else "Balcony"
    uw, kw, lw = cols["utility"], cols["kitchen"], cols["living"]


    # ------------------------------------------------------------ column sequence
    # Left to right along the facade. The public core is [utility | kitchen | living |
    # lounge | office]; bedrooms go after it, or `split` of them before it so the core sits
    # in the middle of a wide flat (the guide keeps bedrooms out of the central zone); the
    # servant column goes at either end.
    order = list(range(len(cols["beds"])))
    if master_last:
        order = order[1:] + order[:1]
    # Every bedroom may go before the core, a 1 BHK's only one included. A two-row 1 BHK
    # that does so needs the foyer cell's end for the bedroom lobby, so its shaft moves into
    # the bedroom's service strip, between the bath and the lobby.
    split = max(0, min(int(split), len(order)))
    bed_shaft = two_row and beds == 1 and split == 1
    # If that bedroom is too narrow to carry the shaft beside its bath, the shaft takes the
    # back of the kitchen store instead, still on the kitchen's wet wall.
    shaft_in_store = False
    if bed_shaft:
        bw0 = cols["beds"][order[0]]
        slot0 = min(BATH_SLOT_W, bw0 - MIN_LOBBY_W)
        narrow = slot0 - SHAFT_W
        shaft_in_store = narrow < MIN_BATH_W or narrow * cols["d2"] < MIN_BATH_AREA - 1e-6
    seq: List[Tuple[str, Any]] = []
    if servant and servant_first:
        seq.append(("servant", None))
    seq += [("bed", i) for i in order[:split]]
    seq += [("utility", None), ("kitchen", None), ("living", None)]
    if cols["family"]:
        seq.append(("family", None))
    if cols["office"]:
        seq.append(("office", None))
    seq += [("bed", i) for i in order[split:]]
    if servant and not servant_first:
        seq.append(("servant", None))

    extra = cols["end_extra"]
    if extra:
        cols["beds"] = list(cols["beds"])
        if seq[-1][0] == "bed":
            last = seq[-1][1]
            need = round(max(0.0, END_BED_W - cols["beds"][last]), 3)
            cols["beds"][last] = round(cols["beds"][last] + need, 3)
            extra = round(extra - need, 3)
        lw = cols["living"] = round(cols["living"] + extra, 3)
    end_shaft = two_row and beds == 2
    if end_shaft:
        # The bedroom after the core ends the flat; its column carries the shaft behind it,
        # since the foyer cell must stay free for the other bedroom's lobby.
        cols["beds"] = list(cols["beds"])
        cols["beds"][order[split]] = round(cols["beds"][order[split]] + SHAFT_W, 3)
    width_of = {"utility": uw, "kitchen": kw, "living": lw, "family": cols["family"],
                "office": cols["office"], "servant": cols["servant"]}
    xs: Dict[Tuple[str, Any], float] = {}
    x = 0.0
    for col in seq:
        xs[col] = x
        x += cols["beds"][col[1]] if col[0] == "bed" else width_of[col[0]]
    plan_end = x
    x_util, x_living = xs[("utility", None)], xs[("living", None)]
    x_office = xs.get(("office", None))
    x_servant = xs.get(("servant", None))

    # ------------------------------------------------------------ R1: the facade row
    # Utility: a dry balcony on the facade beside the kitchen; the store or pantry behind it.
    ud = round(max(UTILITY_MIN_D, d1 - MAX_STORE_RATIO * uw), 3)
    # `kitchen_first` swaps the kitchen and its utility column, so the kitchen sits on the
    # far side from the living room; it moves the kitchen a column along the facade.
    ux, kx = (x_util + kw, x_util) if kitchen_first else (x_util, x_util + uw)
    emit("utility", "Utility / Dry Balcony", "utility", ux, 0, uw, ud, door_to="kitchen", has_window=True)
    store_d = d1 - ud
    if shaft_in_store:
        store_d = round(d1 - ud - STORE_SHAFT_D, 3)
        if store_d < 0.6:
            return [], ["The kitchen store is too shallow to give up its back to the shaft."]
        emit("shaft", "MEP Shaft", "shaft", ux, ud + store_d, uw, STORE_SHAFT_D, has_window=False)
    if big:
        emit("pantry", "Pantry & Dry Store", "pantry", ux, ud, uw, store_d, door_to="kitchen")
    else:
        emit("store", "Kitchen Store", "storage", ux, ud, uw, store_d, door_to="kitchen")
    emit("kitchen", "Kitchen", "kitchen", kx, 0, kw, d1, has_window=True,
         door_to="foyer" if two_row else "breakfast",
         hob_faces="East")
    # A flat whose facade faces north can take the pooja at the front, beside the living
    # balcony (the manual's North fallback), instead of in the service row behind the living
    # room, which for such a flat is its southern half (a sector the manual forbids).
    front_pw = POOJA_W[tier] if (pooja_front and level == FULL) else 0.0
    if front_pw and lw - front_pw < MIN_HAB_W:
        return [], ["The living room is too narrow to give up its facade to the pooja."]
    bx = x_living + (front_pw if pooja_front == "lo" else 0.0)
    emit("lbalcony", f"Living {terrace}", "terrace" if penthouse else "balcony", bx, 0, lw - front_pw, LIVING_BALCONY,
         has_window=True, projects_from=f"{uid}-living")
    if front_pw:
        emit("pooja", "Pooja Niche" if tier == 1 else "Pooja Room", "pooja",
             x_living if pooja_front == "lo" else x_living + lw - front_pw, 0, front_pw, LIVING_BALCONY,
             door_to="living", faces="East")
    omitted = [] if level == FULL else ["pooja"] + (["breakfast", "passage"] if two_row else [])
    if two_row:
        # Living and dining are one room through both rows; the foyer and lobbies open onto it.
        emit("living", "Living & Dining", "living", x_living, LIVING_BALCONY, lw, d1 + d2 - LIVING_BALCONY,
             has_window=True, door_to="foyer", omitted_for_space=omitted)
    else:
        emit("living", "Living Room", "living", x_living, LIVING_BALCONY, lw, d1 - LIVING_BALCONY,
             has_window=True, door_to="dining", **({"omitted_for_space": omitted} if omitted else {}))
    if cols["family"]:
        fx, fw = xs[("family", None)], cols["family"]
        emit("fbalcony", f"Family Lounge {terrace}", "terrace" if penthouse else "balcony", fx, 0, fw,
             LIVING_BALCONY, has_window=True, projects_from=f"{uid}-family")
        # The lounge takes its column through the service row too, so dining stays a
        # room-shaped space behind the living room instead of a long strip.
        # Open to the living room beside it; the pooja room, not the dining, is its other neighbour.
        emit("family", "Family Lounge", "living", fx, LIVING_BALCONY, fw, d1 + d2 - LIVING_BALCONY,
             has_window=True, door_to="living")
    if x_office is not None:
        ow = cols["office"]
        emit("obalcony", "Office Balcony", "balcony", x_office, 0, ow, SECONDARY_BALCONY,
             has_window=True, projects_from=f"{uid}-office")
        # Its store and powder room fill the service row below it, so the door opens off the
        # lounge (or living room) beside it, the one neighbour it shares a full wall with.
        emit("office", "Home Office", "office", x_office, SECONDARY_BALCONY, ow, d1 - SECONDARY_BALCONY,
             has_window=True, door_to="family" if cols["family"] else "living")
    bed_xs = []
    for i in order:
        bx, bw = xs[("bed", i)], cols["beds"][i]
        key = "mbed" if i == 0 else f"bed{i + 1}"
        name = "Master Bedroom" if i == 0 else f"Bedroom {i + 1}"
        depth = MASTER_BALCONY if i == 0 else SECONDARY_BALCONY
        emit(f"{key}balcony", f"{name} {terrace}", "balcony", bx, 0, bw, depth,
             has_window=True, projects_from=f"{uid}-{key}")
        # The door's role is the private passage; physically it opens into the bedroom's
        # own lobby, which is part of that passage (`door_via`, used by the renderer).
        emit(key, name, "bedroom", bx, depth, bw, d1 - depth, has_window=True, door_to="passage",
             door_via=f"{key}lobby", **({"headboard": "South or West wall"} if i == 0 else {}))
        bed_xs.append((i, key, name, bx, bw))
    bed_xs.sort()
    if x_servant is not None:
        # Staff room with its own window, at one end of the flat.
        emit("servant", "Servant Room", "servant", x_servant, 0, cols["servant"], d1, has_window=True,
             door_to="passage", door_via="servantlobby")

    # ------------------------------------------------------------ R2: the service row
    if two_row:
        # The breakfast area's place: the entrance foyer, the main door on the corridor wall.
        # A 1 BHK puts the shaft at its outer end beside the kitchen; a 2 BHK needs that end
        # for the first bedroom's lobby and keeps the shaft at the far end of the wing.
        fx0 = 0.0 if (end_shaft or bed_shaft) else SHAFT_W
        if not (end_shaft or bed_shaft):
            emit("shaft", "MEP Shaft", "shaft", x_util, y2, SHAFT_W, d2, has_window=False)
        emit("foyer", "Entrance Foyer", "entrance", x_util + fx0, y2, uw + kw - fx0, d2,
             door_to="living", main_entrance=True, entry_edge=entry_edge)
    else:
        emit("breakfast", "Breakfast & Crockery", "dining", x_util, y2, uw + kw, d2, door_to="kitchen")
    pw = POOJA_W[tier] if level == FULL else 0.0
    excess = (lw - pw) - 2.2 * d2
    if pw and 0 < excess <= 1.2:
        pw = round(pw + excess, 3)       # a little too long for dining: the pooja room takes it
    dining_w = lw - pw
    max_dining = round(2.2 * d2, 3)          # beyond this a dining room reads as a corridor
    if two_row:
        pass
    elif dining_w > max_dining + 1.2:
        emit("dining", "Dining", "dining", x_living, y2, max_dining, d2, has_window=False, door_to="living")
        emit("crockery", "Crockery & Bar", "storage", x_living + max_dining, y2, dining_w - max_dining, d2,
             door_to="dining")
    else:
        emit("dining", "Dining", "dining", x_living, y2, dining_w, d2, has_window=False, door_to="living")
    # Pooja at the far end of the living room from the kitchen: its other neighbour is a
    # lounge or a lobby, never a bath.
    if pw and front_pw:
        # The pooja went to the facade; its service-row cell stays a cabinet, so the dining
        # room keeps the proportions it has in the standard layout.
        emit("sideboard", "Crockery & Bar", "storage", x_living + lw - pw, y2, pw, d2, door_to="dining")
    elif pw:
        emit("pooja", "Pooja Niche" if tier == 1 else "Pooja Room", "pooja", x_living + lw - pw, y2, pw, d2,
             door_to="living", faces="East")
    if x_office is not None:
        # Store on the lounge side, powder room on the bedroom side: a powder room may not
        # share a wall with a living space.
        pr_w = min(POWDER_W, cols["office"])
        st_w = cols["office"] - pr_w
        if st_w >= 0.8:
            emit("officestore", "Office Store", "storage", x_office, y2, st_w, d2, door_to="office")
        else:
            pr_w, st_w = cols["office"], 0.0
        emit("powder", "Powder Room", "bathroom", x_office + st_w, y2, pr_w, d2, door_to="passage", has_window=False)

    passage_doors = []      # canonical x where each service-row door onto the passage starts
    ensuites = int(prog.get("ensuites") or 1)
    common = int(prog.get("common_baths") or 0)
    for i, key, name, bx, bw in bed_xs:
        if end_shaft and bx > x_util:
            bw = round(bw - SHAFT_W, 3)
            emit("shaft", "MEP Shaft", "shaft", bx + bw, y2, SHAFT_W, d2, has_window=False)
        slot = round(min(BATH_SLOT_W, bw - MIN_LOBBY_W), 3)
        lobby_w = round(bw - slot, 3)
        closet_w = 0.0
        if i == 0 and big and lobby_w - MIN_LOBBY_W >= 1.4:
            closet_w = round(lobby_w - MIN_LOBBY_W, 3)
            lobby_w = round(lobby_w - closet_w, 3)
        # Lobby first: it is what the room on this column's left (the pooja room, a lounge)
        # touches, so no bath ever shares a wall with the pooja room. Without the passage
        # row, a bedroom before the core turns its lobby to the core side instead.
        pre_core = two_row and bx < x_util
        if pre_core and bed_shaft and not shaft_in_store:
            slot = round(bw - lobby_w - SHAFT_W, 3)
            if slot < MIN_BATH_W or slot * d2 < MIN_BATH_AREA - 1e-6:
                return [], ["The bedroom is too narrow to carry the shaft beside its bath."]
            emit("shaft", "MEP Shaft", "shaft", bx + slot, y2, SHAFT_W, d2, has_window=False)
        lobby_x = bx + bw - lobby_w if pre_core else bx
        emit(f"{key}lobby", f"{name} Lobby", "passage", lobby_x, y2, lobby_w, d2,
             door_to=("foyer" if pre_core else "living") if two_row else "passage")
        passage_doors.append(bx)
        cx = bx if pre_core else bx + lobby_w
        if closet_w:
            emit("mcloset", "Walk-in Closet", "closet", cx, y2, closet_w, d2, door_child_of=key)
            cx += closet_w
        if i < ensuites:
            emit(f"{key}bath", f"{name} Ensuite", "bathroom", cx, y2, slot, d2,
                 door_to=key, door_child_of=key, has_window=False)
        elif common > 0:
            common -= 1
            emit(f"{key}cbath", "Common Bathroom", "bathroom", cx, y2, slot, d2,
                 door_to=f"{key}lobby" if two_row else "passage", has_window=False)
            passage_doors.append(cx)
        else:
            emit(f"{key}wardrobe", f"{name} Wardrobe", "closet", cx, y2, slot, d2, door_child_of=key)
    if x_servant is not None:
        emit("servantlobby", "Service Lobby", "passage", x_servant, y2, SERVANT_LOBBY_W, d2, door_to="passage")
        passage_doors.append(x_servant)
        emit("servantbath", "Servant Bath", "servant", x_servant + SERVANT_LOBBY_W, y2,
             cols["servant"] - SERVANT_LOBBY_W, d2, door_child_of="servant")

    # ------------------------------------------------------------ R3: the entry row
    # Foyer under the kitchen block; private passages run from it to both ends; the wet
    # stack (powder room, shaft) closes the end away from the core.
    if not two_row:
        foyer_x = x_util
        foyer_w = round(min(3.0, max(2.0, uw + kw)), 3)
        emit("foyer", "Entrance Foyer", "entrance", foyer_x, y3, foyer_w, d3, door_to="breakfast",
             main_entrance=True, entry_edge=entry_edge)
        if foyer_x > 0.05:
            emit("passage2", "Private Passage", "passage", 0, y3, foyer_x, d3, door_to="foyer")
        has_powder_tail = beds >= 4 and x_office is None
        tail = SHAFT_W + (POWDER_W if has_powder_tail else 0.0)
        if has_powder_tail and passage_doors and plan_end - tail < max(passage_doors) + DOOR_W:
            # The powder room would sit under the end column's lobby or bath and wall its door
            # off from the passage; the wet stack keeps just the shaft.
            has_powder_tail, tail = False, SHAFT_W
        emit("passage", "Private Passage", "passage", foyer_x + foyer_w, y3, plan_end - tail - foyer_x - foyer_w, d3,
             door_to="foyer")
        x = plan_end - tail
        if has_powder_tail:
            # Guest powder room on the wet stack, off the passage.
            emit("powder", "Powder Room", "bathroom", x, y3, POWDER_W, d3, door_to="passage", has_window=False)
            x += POWDER_W
        emit("shaft", "MEP Shaft", "shaft", x, y3, SHAFT_W, d3, has_window=False)

    notes = [
        "Rooms sized from the brief for this BHK tier and scaled to the carpet area "
        f"(x{f:.2f}, {plan_carpet(rooms):.1f} m² carpet drawn); no room goes below its NBC 2016 minimum.",
        "Main door -> foyer -> living & dining; bedrooms open onto lobbies off the foyer and living."
        if two_row else
        "Main door -> foyer -> breakfast and dining -> living; bedrooms open onto lobbies off the private passage.",
        "Every habitable room, kitchen included, sits on the facade; the wet stack is at the bedroom end."
        if not two_row else "Every habitable room, kitchen included, sits on the facade; the shaft is beside the kitchen.",
    ]
    if level in LEVEL_NOTES:
        notes.append(LEVEL_NOTES[level])
    if warning:
        notes.append("Warning: " + warning)
    return rooms, notes


def variants(unit_type: str, carpet: float, front: bool = False) -> List[Tuple[str, Any]]:
    """Every arrangement worth trying for this brief, as (label, planner) pairs with the
    planner signature the floor-plate generator calls. `front` (a facade facing north)
    adds the pooja-at-the-facade arrangements; every variant is sized the same way, so all
    of them fit the one envelope the row was given."""
    beds, penthouse, prog = _tier(unit_type, carpet)
    size = sizing(unit_type, float(carpet or 0), front)
    servant = bool(prog.get("servant"))
    splits = range(0, min(beds - 1, 2) + 1) if beds >= 3 else (0, 1)
    out = []
    for mirror in (False, True):
        for master_last in ((False, True) if beds > 1 else (False,)):
            for split in splits:
                for servant_first in ((False, True) if servant else (False,)):
                    for side in ((None, "hi", "lo") if front else (None,)):
                        for kfirst in (False, True):
                            label = "realistic planner" + "".join(
                                tag for on, tag in ((mirror, " / mirrored"), (master_last, " / master last"),
                                                    (split, f" / {split} bed(s) before core"),
                                                    (servant_first, " / servant first"),
                                                    (side, " / pooja at the facade"),
                                                    (kfirst, " / kitchen outboard")) if on)

                            def planner(box, ut, c, entry, uid, idx, ext, _m=mirror, _ml=master_last,
                                        _s=split, _sf=servant_first, _side=side, _kf=kfirst):
                                return plan_unit(box, ut, c, entry, uid, idx, ext, mirror=_m, master_last=_ml,
                                                 split=_s, servant_first=_sf, _sizing=size, pooja_front=_side,
                                                 kitchen_first=_kf)
                            out.append((label, planner))
    return out


def plan_unit_mirrored(box, unit_type, carpet, entry_edge, uid, unit_index, exterior_edges):
    return plan_unit(box, unit_type, carpet, entry_edge, uid, unit_index, exterior_edges, mirror=True)


# ---------------------------------------------------------------- livability score
HABITABLE = {"bedroom", "living", "kitchen", "dining", "office", "family", "study"}


def livability_defects(rooms: Sequence[Dict[str, Any]]) -> List[str]:
    """Rooms no-one could furnish: corridor-shaped or too narrow. Ranked ahead of the
    soft Vastu placements when choosing between planners."""
    out = []
    for r in rooms:
        w, h = float(r.get("w") or 0), float(r.get("h") or 0)
        if w <= 0 or h <= 0:
            continue
        short, long_ = min(w, h), max(w, h)
        rtype = str(r.get("type"))
        if rtype in HABITABLE:
            min_short = 2.2 if rtype == "kitchen" else 2.4
            if short < min_short:
                out.append(f"{r.get('id')}: {short:.2f} m wide is too narrow for a {rtype}")
            if long_ / short > 2.3:
                out.append(f"{r.get('id')}: {long_:.1f} x {short:.1f} m is corridor-shaped")
        elif rtype in ("bathroom", "pooja", "servant", "storage", "pantry", "closet") and long_ / short > 3.2:
            out.append(f"{r.get('id')}: {long_:.1f} x {short:.1f} m is a strip, not a room")
    return out
