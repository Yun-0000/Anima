from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.rate_limit import limit


def test_each_ip_gets_its_own_allowance():
    app = FastAPI()

    @app.get("/ping", dependencies=[Depends(limit("test-ping", 2, 60))])
    def ping():
        return "pong"

    client = TestClient(app)
    first = {"x-forwarded-for": "1.1.1.1"}
    assert [client.get("/ping", headers=first).status_code for _ in range(3)] == [200, 200, 429]
    # Someone else is not affected.
    assert client.get("/ping", headers={"x-forwarded-for": "2.2.2.2, 10.0.0.1"}).status_code == 200
