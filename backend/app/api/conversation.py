from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..characters import DEFAULT_CHARACTER_ID
from ..models.schemas import ConversationResponse, TextConversationRequest
from ..rate_limit import limit
from ..services.conversation_service import ConversationService

router = APIRouter(prefix="/api", tags=["conversation"])

conversation_service: ConversationService | None = None


def service() -> ConversationService:
    global conversation_service
    if conversation_service is None:
        conversation_service = ConversationService()
    return conversation_service


@router.get("/speech/{token}", dependencies=[Depends(limit("speech", 60, 600))])
async def speech(token: str):
    """Streams the spoken version of a reply, in the character's voice."""
    tts = service().tts
    entry = tts.open(token) if tts else None
    if entry is None:
        raise HTTPException(status_code=404, detail="Unknown speech")
    return StreamingResponse(tts.stream(*entry), media_type="audio/mpeg")


@router.post("/text-conversation", response_model=ConversationResponse, dependencies=[Depends(limit("chat", 40, 600))])
async def process_text_conversation(
    payload: TextConversationRequest,
    character_id: str = Query(DEFAULT_CHARACTER_ID),
):
    """A typed message and the character's reply."""
    response = await service().process_text(payload.message, character_id=character_id, history=payload.history)
    if response is None:
        raise HTTPException(status_code=502, detail="The character could not answer right now.")
    return response
