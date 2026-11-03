import os
import sys
from typing import Optional

import openai


class LLMService:
    def __init__(self):
        # DeepSeek speaks the OpenAI protocol. The SDK retries one transient failure on its own.
        self.client = openai.AsyncOpenAI(api_key=os.getenv("DEEPSEEK_API_KEY"), base_url="https://api.deepseek.com", timeout=20, max_retries=1)
        self.model = os.getenv("DEEPSEEK_CHAT_MODEL", "deepseek-flash")
        # A little thought keeps the character in character, for about half a second: none, low, high or max.
        self.reasoning = os.getenv("DEEPSEEK_CHAT_REASONING", "low")

    async def reply(self, message: str, system_prompt: str, history: list[dict]) -> Optional[str]:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": system_prompt}, *history, {"role": "user", "content": message}],
                # DeepSeek ignores max_completion_tokens. Reasoning counts toward this limit, so it leaves room beyond the reply.
                max_tokens=1200,
                reasoning_effort=self.reasoning,
            )
            text = (response.choices[0].message.content or "").strip()
        except Exception as exc:
            print(f"[LLM] Reply failed: {type(exc).__name__}: {exc}", file=sys.stderr)
            return None
        return text or None
