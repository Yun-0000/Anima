from fastapi import APIRouter, HTTPException, Query

from ..characters import DEFAULT_CHARACTER_ID
from ..models.schemas import ConversationResponse, TextConversationRequest
from ..services.conversation_service import ConversationService

router = APIRouter(prefix="/api", tags=["conversation"])

conversation_service: ConversationService | None = None


@router.post("/text-conversation", response_model=ConversationResponse)
async def process_text_conversation(
    payload: TextConversationRequest,
    character_id: str = Query(DEFAULT_CHARACTER_ID),
):
    """Process a typed message. This mode remains usable without voice API keys."""
    try:
        global conversation_service
        if conversation_service is None:
            conversation_service = ConversationService()

        response = await conversation_service.process_text(payload.message, character_id=character_id)
        if not response:
            raise HTTPException(
                status_code=500,
                detail="Failed to process text",
            )

        return response

    except HTTPException:
        raise
    except Exception as exc:
        print(f"[API] Error: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(exc)}",
        )
