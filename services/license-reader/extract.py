"""
Reads a contractor license (PDF or photo) with the local Ollama models and
returns the key fields as JSON.

How it works, in plain English:
  1. If the file is a PDF that contains real text (most state-issued PDFs do),
     we pull the text out directly and ask the text model to pick out the fields.
     This is fast, even on a laptop CPU.
  2. If the file is a photo, or a scanned PDF with no text in it, we turn the
     page(s) into images and ask the vision model to read them. This is slower
     (a minute or more on a CPU), which is why the main API runs it in the
     background.
  3. Either way, Ollama is told to answer in a fixed JSON shape (LICENSE_SCHEMA),
     and we clean the answer up: bad dates become null, and confidence is
     lowered when important fields are missing.

Nothing here talks to the internet; everything stays on this machine.
"""
from __future__ import annotations

import base64
import json
import os
import re
from datetime import date

import fitz  # PyMuPDF: reads PDF text and turns PDF pages into images
import httpx

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
TEXT_MODEL = os.environ.get("TEXT_MODEL", "llama3.1:8b")
VISION_MODEL = os.environ.get("VISION_MODEL", "qwen2.5vl:7b")

# A PDF needs at least this many letters/digits of text to be read as text;
# anything less is treated as a scan and read as an image instead.
MIN_TEXT_CHARS = 80
# Only the first pages matter for a license; more pages just slow things down.
MAX_PAGES = 2
# How long to wait for one model answer (CPU-only vision can be slow).
MODEL_TIMEOUT_SECONDS = 420
# Longest image side sent to the vision model. Reading time grows with image
# size, and a license is still legible at this size; phone photos are often
# 3000-4000 pixels, which would take many minutes on this laptop's CPU.
MAX_IMAGE_SIDE = 1280

# The exact JSON shape we want back. Ollama enforces it, so the reply always
# parses. A field the document doesn't show must come back as null.
NULLABLE_STRING = {"type": ["string", "null"]}
LICENSE_SCHEMA = {
    "type": "object",
    "properties": {
        "licenseNumber": NULLABLE_STRING,
        "licenseType": NULLABLE_STRING,
        "issuingState": NULLABLE_STRING,
        "holderName": NULLABLE_STRING,
        "businessName": NULLABLE_STRING,
        "issueDate": NULLABLE_STRING,
        "expirationDate": NULLABLE_STRING,
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
    "required": [
        "licenseNumber", "licenseType", "issuingState", "holderName",
        "businessName", "issueDate", "expirationDate", "confidence",
    ],
}

INSTRUCTIONS = """You read U.S. contractor licenses and certificates.
Extract these fields exactly as printed on the document:
- licenseNumber: the license / certificate number
- licenseType: the trade or classification (for example HVAC, Electrical, Plumbing, Roofing, General Contractor)
- issuingState: the two-letter U.S. state code of the state or agency that issued it (for example TX)
- holderName: the person the license is issued to
- businessName: the company or business name, if one is shown
- issueDate: the issue / effective date, formatted YYYY-MM-DD
- expirationDate: the expiration date, formatted YYYY-MM-DD
- confidence: "high" if every field you returned is clearly printed and legible,
  "medium" if some text was hard to read, "low" if the image is unclear or this
  may not be a license at all.
Use null for any field that is not shown on the document. Never guess or invent a value.
Answer with JSON only."""

STATE_CODES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
    "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
    "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
    "WV", "WI", "WY",
}


class ReadError(Exception):
    """Raised when the file can't be read at all (corrupt, wrong type, model down)."""


def _pdf_text_and_images(data: bytes) -> tuple[str, list[bytes]]:
    """Returns the PDF's text, plus PNG images of its first pages (used when there's little text)."""
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:  # corrupt or not really a PDF
        raise ReadError("The PDF could not be opened.") from exc
    pages = [doc[i] for i in range(min(len(doc), MAX_PAGES))]
    text = "\n".join(p.get_text() for p in pages)
    if len(re.sub(r"\W", "", text)) >= MIN_TEXT_CHARS:
        return text, []
    # 150 dpi keeps small print readable; _shrink keeps it under MAX_IMAGE_SIDE.
    return "", [_shrink(p.get_pixmap(dpi=150).tobytes("png")) for p in pages]


def _shrink(image: bytes) -> bytes:
    """Halves the image until its longest side is at most MAX_IMAGE_SIDE; returns PNG bytes."""
    try:
        pix = fitz.Pixmap(image)
    except Exception as exc:
        raise ReadError("The image could not be opened.") from exc
    if pix.alpha:
        pix = fitz.Pixmap(pix, 0)  # drop transparency
    while max(pix.width, pix.height) > MAX_IMAGE_SIDE:
        pix.shrink(1)  # halves width and height
    return pix.tobytes("png")


def _ask_ollama(model: str, prompt: str, images: list[bytes] | None = None) -> dict:
    """Sends one request to Ollama and returns the parsed JSON answer."""
    message = {"role": "user", "content": prompt}
    if images:
        message["images"] = [base64.b64encode(img).decode("ascii") for img in images]
    try:
        res = httpx.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": model,
                "messages": [message],
                "format": LICENSE_SCHEMA,
                "stream": False,
                "options": {"temperature": 0},  # same answer every time, no creativity
            },
            timeout=MODEL_TIMEOUT_SECONDS,
        )
        res.raise_for_status()
        return json.loads(res.json()["message"]["content"])
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise ReadError(f"The AI engine could not read the license ({type(exc).__name__}).") from exc


def _clean_date(value) -> str | None:
    """Keeps a date only if it's a real YYYY-MM-DD date; anything else becomes null."""
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        return None


def _clean_text(value) -> str | None:
    if not isinstance(value, str):
        return None
    value = " ".join(value.split())
    return value or None


def clean(raw: dict) -> dict:
    """Normalises the model's answer and lowers confidence when key fields are missing."""
    out = {
        "licenseNumber": _clean_text(raw.get("licenseNumber")),
        "licenseType": _clean_text(raw.get("licenseType")),
        "issuingState": None,
        "holderName": _clean_text(raw.get("holderName")),
        "businessName": _clean_text(raw.get("businessName")),
        "issueDate": _clean_date(raw.get("issueDate")),
        "expirationDate": _clean_date(raw.get("expirationDate")),
        "confidence": raw.get("confidence") if raw.get("confidence") in ("high", "medium", "low") else "low",
    }
    state = _clean_text(raw.get("issuingState"))
    if state and state.upper() in STATE_CODES:
        out["issuingState"] = state.upper()

    # The model can be over-confident. If the number or expiry is missing,
    # confidence can't be high; if both are missing, it's low.
    missing = sum(out[k] is None for k in ("licenseNumber", "expirationDate"))
    if missing == 2:
        out["confidence"] = "low"
    elif missing == 1 and out["confidence"] == "high":
        out["confidence"] = "medium"
    return out


def read_license(data: bytes, content_type: str, trade_hint: str | None = None) -> dict:
    """Main entry point: file bytes in, cleaned license fields out (plus which path was used)."""
    prompt = INSTRUCTIONS
    if trade_hint:
        prompt += f"\nThe contractor says this is their {trade_hint} license."

    if content_type == "application/pdf":
        text, images = _pdf_text_and_images(data)
        if text:
            raw = _ask_ollama(TEXT_MODEL, f"{prompt}\n\nDocument text:\n{text[:12000]}")
            return {**clean(raw), "method": "pdf-text", "model": TEXT_MODEL}
        raw = _ask_ollama(VISION_MODEL, prompt, images)
        return {**clean(raw), "method": "pdf-image", "model": VISION_MODEL}

    if content_type in ("image/jpeg", "image/png", "image/webp"):
        raw = _ask_ollama(VISION_MODEL, prompt, [_shrink(data)])
        return {**clean(raw), "method": "photo", "model": VISION_MODEL}

    raise ReadError("Only PDF, JPEG, PNG or WebP files can be read.")
