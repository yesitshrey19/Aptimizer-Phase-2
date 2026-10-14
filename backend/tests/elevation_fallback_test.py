"""Elevation on the hosted server: a 429 from Open-Meteo must not cost seconds of back-off."""
import os
import sys
import threading
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import gis  # noqa: E402

PTS = [[12.9 + i * 1e-4, 77.6] for i in range(39)]


class _Resp:
    def __init__(self, code, payload=None):
        self.status_code = code
        self._p = payload or {}

    def json(self):
        return self._p


def _fake_get(calls):
    def get(url, params=None, timeout=None):
        calls.append(url)
        if "open-meteo" in url:
            return _Resp(429)
        n = len(params["locations"].split("|"))
        return _Resp(200, {"results": [{"elevation": 900.0}] * n})
    return get


def test_open_meteo_429_falls_through_fast_and_is_skipped_next_time(tmp_path, monkeypatch):
    monkeypatch.setattr(gis, "_CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(gis, "_open_meteo_blocked_until", 0.0)
    calls = []
    monkeypatch.setattr(gis._http, "get", _fake_get(calls))
    t = time.time()
    values, status = gis.fetch_elevation(PTS)
    assert time.time() - t < 1.0                      # was 4.5 s of back-off before SRTM
    assert status["endpoint"].startswith("opentopodata") and values[0] == 900.0
    assert sum("open-meteo" in u for u in calls) == 1  # no retries on a 429
    calls.clear()
    gis.fetch_elevation([[13.0 + i * 1e-4, 77.7] for i in range(39)])
    assert not any("open-meteo" in u for u in calls)  # skipped during the cool-down


def test_analysis_joins_a_running_prefetch_instead_of_fetching_twice():
    runs = []

    def slow(x):
        runs.append(x)
        time.sleep(0.3)
        return x * 2

    out = []
    th = threading.Thread(target=lambda: out.append(gis._once("k-test", slow, 21)))
    th.start()
    time.sleep(0.05)
    assert gis._once("k-test", slow, 21) == 42
    th.join()
    assert out == [42] and runs == [21]
