from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..characters import DEFAULT_CHARACTER_ID
from ..models.schemas import ConversationResponse, TextConversationRequest
from ..services.conversation_service import ConversationService

router = APIRouter(prefix="/api", tags=["conversation"])

conversation_service: ConversationService | None = None


@router.get("/speech/{speech_id}")
async def speech(speech_id: str):
    """Streams the spoken version of a reply, in the character's voice."""
    tts = conversation_service.tts if conversation_service else None
    entry = tts.pending.get(speech_id) if tts else None
    if entry is None:
        raise HTTPException(status_code=404, detail="Unknown speech")
    return StreamingResponse(tts.stream(*entry), media_type="audio/mpeg")


@router.post("/text-conversation", response_model=ConversationResponse)
async def process_text_conversation(
    payload: TextConversationRequest,
    character_id: str = Query(DEFAULT_CHARACTER_ID),
):
    """A typed message and the character's reply."""
    global conversation_service
    if conversation_service is None:
        conversation_service = ConversationService()
    response = await conversation_service.process_text(payload.message, character_id=character_id, history=payload.history)
    if response is None:
        raise HTTPException(status_code=502, detail="The character could not answer right now.")
    return response
