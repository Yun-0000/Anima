from fastapi import APIRouter, HTTPException, Query, Request, Response

from ..characters import DEFAULT_CHARACTER_ID
from ..services.realtime_service import RealtimeService


router = APIRouter(prefix="/api", tags=["realtime"])
realtime_service = RealtimeService()


@router.get("/interaction-config")
def get_interaction_config():
    return realtime_service.interaction_config()


@router.post("/realtime/openai/call")
async def create_openai_realtime_call(
    request: Request,
    character_id: str = Query(DEFAULT_CHARACTER_ID),
):
    if not realtime_service.has_openai_key():
        raise HTTPException(status_code=403, detail="Set OPENAI_API_KEY to enable OpenAI voice mode.")

    sdp = (await request.body()).decode("utf-8")
    try:
        answer_sdp = await realtime_service.create_openai_call(sdp, character_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return Response(content=answer_sdp, media_type="application/sdp")
