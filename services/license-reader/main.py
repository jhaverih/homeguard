"""
License reader web service: runs on the laptop next to Ollama (EBO001).

The HomeGuard API on the QNAP sends it a license file; it answers with the
fields it read (see extract.py). It only accepts requests that carry the shared
password in the X-Reader-Token header, so nothing else on the network can use it.

Start it with:  uvicorn main:app --host 0.0.0.0 --port 8090
(setup.ps1 registers a Windows scheduled task that does this at startup).
"""
from __future__ import annotations

import hmac
import os

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from extract import ReadError, read_license

READER_TOKEN = os.environ.get("READER_TOKEN", "")
MAX_BYTES = 10 * 1024 * 1024  # 10 MB, the same limit as the app and API

app = FastAPI(title="HomeGuard License Reader")


def _check_token(token: str | None) -> None:
    """Refuses the request unless it carries the shared password."""
    if not READER_TOKEN:
        raise HTTPException(503, "READER_TOKEN is not set on the reader service.")
    if not token or not hmac.compare_digest(token, READER_TOKEN):
        raise HTTPException(401, "Invalid reader token.")


@app.get("/health")
def health() -> dict:
    """Lets the API (or you, in a browser) check the service is up."""
    return {"ok": True}


@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    trade: str | None = Form(None),
    x_reader_token: str | None = Header(None),
) -> dict:
    """Reads one license file and returns its fields as JSON."""
    _check_token(x_reader_token)
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "The file is larger than 10 MB.")
    content_type = (file.content_type or "").lower()
    if content_type == "image/jpg":
        content_type = "image/jpeg"
    try:
        # Model calls block for a while; run them off the web server's main loop.
        return await run_in_threadpool(read_license, data, content_type, trade)
    except ReadError as exc:
        raise HTTPException(422, str(exc)) from exc
