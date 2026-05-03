import openai
import os
import json
from typing import Optional, Dict
from ..prompts.character_prompt import CHARACTER_SYSTEM_PROMPT


class LLMService:
    """LLM service using an accurate, non-frontier OpenAI chat default."""

    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.client = openai.OpenAI(api_key=self.openai_api_key)
        default_model = "gpt-4o"
        self.model = os.getenv("OPENAI_CHAT_MODEL", default_model)
        self.fallback_model = os.getenv("OPENAI_FALLBACK_MODEL", default_model)
        self.temperature = 0.7
        self.max_tokens = 300

    def _build_attempts(self, model: str, fallback_model: str | None) -> list[tuple[str, int]]:
        attempts: list[tuple[str, int]] = [(model, self.max_tokens), (model, self.max_tokens * 2)]
        if self.model.startswith("gpt-5") and self.fallback_model and self.fallback_model != self.model:
            attempts.append((fallback_model, self.max_tokens))
        return attempts

    def _parse_response(self, response, user_message: str) -> Optional[Dict]:
        choices = getattr(response, "choices", None) or []
        if not choices:
            print("[LLM] Error: empty choices")
            return None

        choice = choices[0]
        message = getattr(choice, "message", None)
        content = getattr(message, "content", None)
        if not content:
            print("[LLM] Empty content from model")
            print(f"[LLM] Finish reason: {getattr(choice, 'finish_reason', None)}")
            print(f"[LLM] Message: {message}")
            return None

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            print(f"[LLM] JSON decode error: {exc}")
            print(f"[LLM] Raw content: {content!r}")
            print(f"[LLM] Finish reason: {getattr(choice, 'finish_reason', None)}")
            print(f"[LLM] Message: {message}")
            return None

        print(f"[LLM] Input: {user_message}")
        print(f"[LLM] Output: {parsed}")
        return parsed

    def _request_with_client(
        self,
        client: openai.OpenAI,
        attempts: list[tuple[str, int]],
        user_message: str,
        system_prompt: str,
    ) -> tuple[Optional[Dict], Exception | None]:
        last_error: Exception | None = None
        for model_name, token_limit in attempts:
            request_kwargs = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "response_format": {"type": "json_object"},
            }
            if not model_name.startswith("gpt-5"):
                request_kwargs["temperature"] = self.temperature
            if model_name.startswith("gpt-5"):
                request_kwargs["max_completion_tokens"] = token_limit
            else:
                request_kwargs["max_tokens"] = token_limit

            try:
                response = client.chat.completions.create(**request_kwargs)
            except Exception as exc:
                last_error = exc
                print(f"[LLM] Error: {exc}")
                continue

            parsed = self._parse_response(response, user_message)
            if parsed is not None:
                return parsed, last_error

            last_error = ValueError("invalid or empty model response")

        return None, last_error

    async def generate_response(self, user_message: str, system_prompt: str = CHARACTER_SYSTEM_PROMPT) -> Optional[Dict]:
        """
        Generate conversational response with emotion

        Args:
            user_message: User's transcribed text

        Returns:
            Dict with 'text' and 'emotion' keys, or None if failed
        """
        attempts = self._build_attempts(self.model, self.fallback_model)
        result, last_error = self._request_with_client(self.client, attempts, user_message, system_prompt)
        if result is not None:
            return result

        if last_error is not None:
            print(f"[LLM] Error: {last_error}")
        return None
