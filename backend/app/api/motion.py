from fastapi import APIRouter, Query

from ..characters import DEFAULT_CHARACTER_ID
from ..models.schemas import MotionPlanRequest, MotionPlanResponse
from ..services.motion_service import MotionService

router = APIRouter(prefix="/api", tags=["motion"])

motion_service: MotionService | None = None


@router.post("/motion-plan", response_model=MotionPlanResponse)
async def plan_motion(
    payload: MotionPlanRequest,
    character_id: str = Query(DEFAULT_CHARACTER_ID),
):
    """Plan avatar expression and motion from voice transcripts."""
    global motion_service
    if motion_service is None:
        motion_service = MotionService()

    result = await motion_service.plan_motion(
        payload.user_text,
        payload.assistant_text,
        character_id=character_id,
    )
    if result is None:
        return MotionPlanResponse(emotion="neutral", action="idle")
    return result
