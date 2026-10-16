from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import health_check


def test_health_check_returns_ok():
    assert health_check() == {"status": "ok"}
