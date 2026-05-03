from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import health_check
from app.main import app


def test_health_check_returns_ok():
    assert health_check() == {"status": "ok"}


def test_app_does_not_mount_generated_audio_static_route():
    assert not any(route.path == "/audio" for route in app.routes)
