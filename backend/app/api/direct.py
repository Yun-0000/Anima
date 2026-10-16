from fastapi import APIRouter

from ..models.schemas import DirectRequest, DirectResponse
from ..services.director_service import DirectorService

router = APIRouter(prefix="/api", tags=["direct"])
director: DirectorService | None = None


@router.post("/direct", response_model=DirectResponse)
async def direct_line(payload: DirectRequest):
    """Gesture and expression for one line of the conversation, said by the character or by the user."""
    global director
    if director is None:
        director = DirectorService()
    return await director.direct(payload.character_id, payload.speaker, payload.line, payload.previous)
