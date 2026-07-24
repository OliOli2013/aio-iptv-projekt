#!/usr/bin/env python3
"""Daily link checker for the static AIO-IPTV.pl status dashboard."""
from __future__ import annotations
import datetime as dt
import json
import pathlib
import socket
import ssl
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
TARGETS = ROOT / "data" / "status-targets.json"
OUTPUT = ROOT / "data" / "status.json"
USER_AGENT = "AIO-IPTV-Status/1.0 (+https://olioli2013.github.io/aio-iptv-projekt/)"


def check(target: dict) -> dict:
    url = target["url"]
    checked_at = dt.datetime.now(dt.timezone.utc).isoformat()
    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    status_code = None
    final_url = url
    message = ""
    try:
        request = urllib.request.Request(url, headers=headers, method="HEAD")
        try:
            response = urllib.request.urlopen(request, timeout=20, context=ssl.create_default_context())
        except urllib.error.HTTPError as exc:
            if exc.code not in (400, 403, 405):
                raise
            headers["Range"] = "bytes=0-1023"
            request = urllib.request.Request(url, headers=headers, method="GET")
            response = urllib.request.urlopen(request, timeout=25, context=ssl.create_default_context())
        with response:
            status_code = int(response.getcode() or 0)
            final_url = response.geturl()
            content_type = response.headers.get("Content-Type", "").split(";", 1)[0]
            length = response.headers.get("Content-Length", "")
        if 200 <= status_code < 400:
            status = "online"
            message = f"Usługa odpowiada prawidłowo{f' • {content_type}' if content_type else ''}{f' • {length} B' if length else ''}."
        elif status_code in (401, 403, 405, 429):
            status = "warning"
            message = "Serwer odpowiada, ale ogranicza automatyczny test. Link wymaga sprawdzenia w przeglądarce."
        else:
            status = "offline"
            message = f"Nieprawidłowa odpowiedź HTTP {status_code}."
    except urllib.error.HTTPError as exc:
        status_code = exc.code
        if exc.code in (401, 403, 405, 429):
            status = "warning"
            message = f"Serwer działa, ale blokuje test automatyczny (HTTP {exc.code})."
        else:
            status = "offline"
            message = f"Błąd HTTP {exc.code}: {exc.reason}."
    except (urllib.error.URLError, TimeoutError, socket.timeout, ssl.SSLError) as exc:
        status = "offline"
        reason = getattr(exc, "reason", exc)
        message = f"Brak odpowiedzi: {reason}."
    except Exception as exc:  # safety net for workflow
        status = "unknown"
        message = f"Nie udało się zakończyć testu: {type(exc).__name__}."

    return {
        **target,
        "url": final_url,
        "status": status,
        "httpStatus": status_code,
        "checkedAt": checked_at,
        "message": message,
    }


def main() -> None:
    targets = json.loads(TARGETS.read_text(encoding="utf-8"))
    items = [check(target) for target in targets]
    payload = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "items": items,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    online = sum(item["status"] == "online" for item in items)
    warning = sum(item["status"] == "warning" for item in items)
    offline = sum(item["status"] == "offline" for item in items)
    print(f"Status complete: online={online}, warning={warning}, offline={offline}")


if __name__ == "__main__":
    main()
