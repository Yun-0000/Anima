import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def limit(name: str, count: int, seconds: int):
    """A route dependency allowing `count` requests per `seconds` from one IP address, so a public deployment
    cannot be used to spend the owner's keys. Counts are kept in memory, per server instance."""

    def check(request: Request):
        forwarded = request.headers.get("x-forwarded-for", "")
        ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")
        hits, now = _hits[(name, ip)], time.monotonic()
        while hits and now - hits[0] > seconds:
            hits.popleft()
        if len(hits) >= count:
            raise HTTPException(status_code=429, detail="Too many requests. Please wait a moment.")
        hits.append(now)

    return check
