"""
Reads a vendor document (PDF or photo) with the local Ollama models and
returns its key fields as JSON. Three kinds of document are understood:

  license       a contractor license / trade certificate
  registration  a state business registration (certificate of existence,
                certificate of good standing, articles, etc.)
  coi           a certificate of insurance (usually an ACORD 25 form)

How it works, in plain English:
  1. If the file is a PDF that contains real text (most state-issued PDFs do),
     we pull the text out directly and ask the text model to pick out the fields.
     This is fast, even on a laptop CPU.
  2. If the file is a photo, or a scanned PDF with no text in it, we turn the
     page(s) into images and ask the vision model to read them. This is slower
     (a minute or more on a CPU), which is why the main API runs it in the
     background.
  3. Either way, Ollama is told to answer in a fixed JSON shape (the kind's
     schema), and we clean the answer up: bad dates become null, and
     confidence is lowered when important fields are missing.

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
# Only the first pages matter; more pages just slow things down.
MAX_PAGES = 2
# How long to wait for one model answer (CPU-only vision can be slow).
MODEL_TIMEOUT_SECONDS = 420
# Longest image side sent to the vision model. Reading time grows with image
# size, and a document is still legible at this size; phone photos are often
# 3000-4000 pixels, which would take many minutes on this laptop's CPU.
MAX_IMAGE_SIDE = 1280

STATE_CODES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
    "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
    "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
    "WV", "WI", "WY",
}

# --- The JSON shape wanted back for each kind. Ollama enforces it, so the
# reply always parses. A field the document doesn't show must come back null.
NULLABLE_STRING = {"type": ["string", "null"]}
CONFIDENCE = {"type": "string", "enum": ["high", "medium", "low"]}


def _schema(props: dict) -> dict:
    props = {**props, "confidence": CONFIDENCE}
    return {"type": "object", "properties": props, "required": list(props)}


LICENSE_SCHEMA = _schema({
    "licenseNumber": NULLABLE_STRING,
    "licenseType": NULLABLE_STRING,
    "issuingState": NULLABLE_STRING,
    "holderName": NULLABLE_STRING,
    "businessName": NULLABLE_STRING,
    "issueDate": NULLABLE_STRING,
    "expirationDate": NULLABLE_STRING,
})

REGISTRATION_SCHEMA = _schema({
    "businessName": NULLABLE_STRING,
    "entityNumber": NULLABLE_STRING,
    "state": NULLABLE_STRING,
    "status": {"type": ["string", "null"], "enum": ["active", "inactive", "dissolved", "revoked", None]},
    "formationDate": NULLABLE_STRING,
    "documentDate": NULLABLE_STRING,
})

COI_SCHEMA = _schema({
    "insuredName": NULLABLE_STRING,
    "insurerName": NULLABLE_STRING,
    "policyNumber": NULLABLE_STRING,
    "effectiveDate": NULLABLE_STRING,
    "expirationDate": NULLABLE_STRING,
    "generalLiabilityPerOccurrence": {"type": ["number", "null"]},
    "certificateHolder": NULLABLE_STRING,
    "additionalInsured": {"type": ["boolean", "null"]},
    "additionalInsuredName": NULLABLE_STRING,
})

CONFIDENCE_RULE = """- confidence: "high" if every field you returned is clearly printed and legible,
  "medium" if some text was hard to read, "low" if the image is unclear or this
  may not be the right kind of document at all.
Use null for any field that is not shown on the document. Never guess or invent a value.
Answer with JSON only."""

LICENSE_INSTRUCTIONS = """You read U.S. contractor licenses and certificates.
Extract these fields exactly as printed on the document:
- licenseNumber: the license / certificate number
- licenseType: the trade or classification (for example HVAC, Electrical, Plumbing, Roofing, General Contractor)
- issuingState: the two-letter U.S. state code of the state or agency that issued it (for example TX)
- holderName: the person the license is issued to
- businessName: the company or business name, if one is shown
- issueDate: the issue / effective date, formatted YYYY-MM-DD
- expirationDate: the expiration date, formatted YYYY-MM-DD
""" + CONFIDENCE_RULE

REGISTRATION_INSTRUCTIONS = """You read U.S. state business registration documents
(certificate of existence, certificate of good standing, certificate of authority,
articles of organization or incorporation, or a Secretary of State record).
Extract these fields exactly as printed on the document:
- businessName: the registered legal name of the business
- entityNumber: the state's entity, control, filing or registration number
- state: the two-letter U.S. state code of the state where it is registered (for example TN)
- status: "active" if the document says active, in existence, in good standing or
  authorized to transact business; "inactive" if inactive or not in good standing;
  "dissolved" if dissolved, withdrawn or terminated; "revoked" if revoked or
  administratively dissolved; null if no status is shown
- formationDate: the formation / incorporation / registration date, formatted YYYY-MM-DD
- documentDate: the date this document was issued or printed, formatted YYYY-MM-DD
""" + CONFIDENCE_RULE

COI_INSTRUCTIONS = """You read U.S. certificates of liability insurance (usually the ACORD 25 form).
Extract these fields exactly as printed on the document:
- insuredName: the INSURED business name
- insurerName: the insurance company for the general liability policy
- policyNumber: the general liability policy number
- effectiveDate: the general liability policy effective date, formatted YYYY-MM-DD
- expirationDate: the general liability policy expiration date, formatted YYYY-MM-DD
- generalLiabilityPerOccurrence: the general liability EACH OCCURRENCE limit as a
  plain number of dollars (for example 1000000), or null
- certificateHolder: the name in the CERTIFICATE HOLDER box
- additionalInsured: true if the ADDL INSD column is marked (Y or X) for general
  liability, or the description says the certificate holder (or a named party) is an
  additional insured; false if neither is shown
- additionalInsuredName: the party named as additional insured. If the document only
  says "certificate holder", use the certificate holder's name.
""" + CONFIDENCE_RULE


class ReadError(Exception):
    """Raised when the file can't be read at all (corrupt, wrong type, model down)."""


# --- Turning the file into text or images ----------------------------------

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


def _ask_ollama(model: str, prompt: str, schema: dict, images: list[bytes] | None = None) -> dict:
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
                "format": schema,
                "stream": False,
                "options": {"temperature": 0},  # same answer every time, no creativity
            },
            timeout=MODEL_TIMEOUT_SECONDS,
        )
        res.raise_for_status()
        return json.loads(res.json()["message"]["content"])
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise ReadError(f"The AI engine could not read the document ({type(exc).__name__}).") from exc


# --- Cleaning the answer ---------------------------------------------------

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


def _clean_state(value) -> str | None:
    state = _clean_text(value)
    return state.upper() if state and state.upper() in STATE_CODES else None


def _confidence(raw: dict) -> str:
    return raw.get("confidence") if raw.get("confidence") in ("high", "medium", "low") else "low"


def _lower_confidence(out: dict, key_fields: tuple[str, ...]) -> dict:
    """The model can be over-confident: one key field missing caps it at medium,
    all of them missing makes it low."""
    missing = sum(out[k] is None for k in key_fields)
    if missing == len(key_fields):
        out["confidence"] = "low"
    elif missing and out["confidence"] == "high":
        out["confidence"] = "medium"
    return out


def clean(raw: dict) -> dict:
    """License: normalises the model's answer."""
    out = {
        "licenseNumber": _clean_text(raw.get("licenseNumber")),
        "licenseType": _clean_text(raw.get("licenseType")),
        "issuingState": _clean_state(raw.get("issuingState")),
        "holderName": _clean_text(raw.get("holderName")),
        "businessName": _clean_text(raw.get("businessName")),
        "issueDate": _clean_date(raw.get("issueDate")),
        "expirationDate": _clean_date(raw.get("expirationDate")),
        "confidence": _confidence(raw),
    }
    return _lower_confidence(out, ("licenseNumber", "expirationDate"))


def clean_registration(raw: dict) -> dict:
    status = raw.get("status")
    out = {
        "businessName": _clean_text(raw.get("businessName")),
        "entityNumber": _clean_text(raw.get("entityNumber")),
        "state": _clean_state(raw.get("state")),
        "status": status if status in ("active", "inactive", "dissolved", "revoked") else None,
        "formationDate": _clean_date(raw.get("formationDate")),
        "documentDate": _clean_date(raw.get("documentDate")),
        "confidence": _confidence(raw),
    }
    return _lower_confidence(out, ("businessName", "state"))


def clean_coi(raw: dict) -> dict:
    limit = raw.get("generalLiabilityPerOccurrence")
    ai = raw.get("additionalInsured")
    out = {
        "insuredName": _clean_text(raw.get("insuredName")),
        "insurerName": _clean_text(raw.get("insurerName")),
        "policyNumber": _clean_text(raw.get("policyNumber")),
        "effectiveDate": _clean_date(raw.get("effectiveDate")),
        "expirationDate": _clean_date(raw.get("expirationDate")),
        "generalLiabilityPerOccurrence": float(limit) if isinstance(limit, (int, float)) and limit > 0 else None,
        "certificateHolder": _clean_text(raw.get("certificateHolder")),
        "additionalInsured": ai if isinstance(ai, bool) else None,
        "additionalInsuredName": _clean_text(raw.get("additionalInsuredName")),
        "confidence": _confidence(raw),
    }
    return _lower_confidence(out, ("insuredName", "expirationDate"))


# Everything that differs between the three kinds, in one place.
KINDS = {
    "license": (LICENSE_SCHEMA, LICENSE_INSTRUCTIONS, clean),
    "registration": (REGISTRATION_SCHEMA, REGISTRATION_INSTRUCTIONS, clean_registration),
    "coi": (COI_SCHEMA, COI_INSTRUCTIONS, clean_coi),
}


def read_document(data: bytes, content_type: str, kind: str = "license", hint: str | None = None) -> dict:
    """Main entry point: file bytes in, cleaned fields out (plus which path was used)."""
    if kind not in KINDS:
        raise ReadError(f"Unknown document kind: {kind}.")
    schema, prompt, cleaner = KINDS[kind]
    if hint and kind == "license":
        prompt += f"\nThe contractor says this is their {hint} license."
    elif hint and kind == "registration":
        prompt += f"\nThe vendor says this is their registration for the state {hint}."

    if content_type == "application/pdf":
        text, images = _pdf_text_and_images(data)
        if text:
            raw = _ask_ollama(TEXT_MODEL, f"{prompt}\n\nDocument text:\n{text[:12000]}", schema)
            return {**cleaner(raw), "method": "pdf-text", "model": TEXT_MODEL}
        raw = _ask_ollama(VISION_MODEL, prompt, schema, images)
        return {**cleaner(raw), "method": "pdf-image", "model": VISION_MODEL}

    if content_type in ("image/jpeg", "image/png", "image/webp"):
        raw = _ask_ollama(VISION_MODEL, prompt, schema, [_shrink(data)])
        return {**cleaner(raw), "method": "photo", "model": VISION_MODEL}

    raise ReadError("Only PDF, JPEG, PNG or WebP files can be read.")


def read_license(data: bytes, content_type: str, trade_hint: str | None = None) -> dict:
    """Kept for anything that still calls the original license-only entry point."""
    return read_document(data, content_type, "license", trade_hint)
