from fastapi import APIRouter, Depends

from ..models.schemas import DirectRequest, DirectResponse
from ..rate_limit import limit
from ..services.director_service import DirectorService

router = APIRouter(prefix="/api", tags=["direct"])
director: DirectorService | None = None


@router.post("/direct", response_model=DirectResponse, dependencies=[Depends(limit("direct", 400, 600))])
async def direct_line(payload: DirectRequest):
    """Gesture and expression for each line of the character or the user, given the conversation before it."""
    global director
    if director is None:
        director = DirectorService()
    return await director.direct(payload.character_id, payload.speaker, payload.lines, payload.context)
