# License reader (runs on the AI laptop, EBO001)

Reads a contractor's license (PDF or photo) and returns the license number, type,
state, holder and business names, issue and expiry dates, and a confidence level.
It uses the free local models in Ollama, so nothing is sent to an outside service
and there is no per-use cost.

The HomeGuard API on the QNAP calls it at `LICENSE_READER_URL`
(`http://192.168.86.35:8090`) with the shared password `READER_TOKEN`.

## How it reads a license
- **PDF with text** (most state-issued PDFs): the text is pulled out and read by
  `llama3.1:8b`. This takes a few seconds.
- **Photo or scanned PDF:** the image is read by `qwen2.5vl:7b`. On this CPU-only
  laptop that can take 1–3 minutes, so the API runs it in the background.

## Install or update
1. Copy this folder to the laptop as `C:\HomeGuard\license-reader`.
2. Copy `.env.example` to `.env` and set `READER_TOKEN` to the same value as the
   GitHub secret `QNAP_READER_TOKEN`.
3. In an administrator PowerShell in that folder, run:
   `powershell -ExecutionPolicy Bypass -File setup.ps1`

## Update after a code change
Copy the changed files to `C:\HomeGuard\license-reader`, then run
`powershell -ExecutionPolicy Bypass -File restart.ps1`.

## Speed on this laptop (CPU only, measured 2026-11-12)
- Text PDF: about 20–50 seconds.
- Photo or scanned PDF: about 3–4 minutes. Photos are shrunk to 1280 px first.

## Sample licenses for testing
`.venv\Scripts\python.exe make_samples.py` writes fictional sample licenses to
`samples\` (valid, expired, another person's name, and a phone-size photo).

## Check it
- Health: `http://192.168.86.35:8090/health` should return `{"ok":true}`.
- Read a file:
  `curl -H "X-Reader-Token: <token>" -F "file=@license.pdf;type=application/pdf" -F trade=HVAC http://192.168.86.35:8090/extract`
- Log file: `reader.log` in this folder.
