from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from app.api import conversation, direct, voice
import os

load_dotenv()

app = FastAPI(title="Anima Backend API")

origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:4173,http://127.0.0.1:4173,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(conversation.router)
app.include_router(voice.router)
app.include_router(direct.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}

