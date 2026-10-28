import json
import os
from typing import Optional

import openai


class LLMService:
    def __init__(self):
        # The SDK retries one transient failure on its own.
        self.client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"), timeout=20, max_retries=1)
        self.model = os.getenv("OPENAI_CHAT_MODEL", "gpt-6-luna")
        # The reply is spoken right away, so the model answers without deliberating; "low" or more thinks first.
        self.reasoning = os.getenv("OPENAI_CHAT_REASONING", "none")

    async def reply(self, message: str, system_prompt: str, history: list[dict]) -> Optional[str]:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": system_prompt}, *history, {"role": "user", "content": message}],
                response_format={"type": "json_object"},
                # Reasoning tokens count toward this limit, so it leaves room beyond the 1-3 sentence reply.
                max_completion_tokens=300 if self.reasoning == "none" else 1200,
                reasoning_effort=self.reasoning,
                service_tier="priority",
            )
            text = str(json.loads(response.choices[0].message.content or "{}").get("text", "")).strip()
        except Exception as exc:
            print(f"[LLM] Reply failed: {type(exc).__name__}: {exc}")
            return None
        return text or None
