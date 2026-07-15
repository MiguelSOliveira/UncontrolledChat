"""MCP server for managing encrypted chat personas in a Key Space."""

import json
import os
from dataclasses import dataclass
from typing import Any
from urllib import error, parse, request

from mcp.server.fastmcp import FastMCP

from .room_crypto import RoomCrypto

DEFAULT_API_BASE_URL = "http://127.0.0.1:8000"
PERSONA_NAME_MIN_LEN = 2
PERSONA_NAME_MAX_LEN = 24

mcp = FastMCP(name="uncontrolledchat-persona-server")


class PersonaMcpError(RuntimeError):
    """Raised when backend API calls or persona payload handling fail."""


@dataclass(frozen=True)
class PersonaRecord:
    """Decrypted persona representation returned from backend records."""

    id: str
    name: str
    description: str
    invoked_by: str
    created_at: str

    def to_dict(self) -> dict[str, str]:
        """Serialize to snake_case for MCP tool responses."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "invoked_by": self.invoked_by,
            "created_at": self.created_at,
        }


def _api_base_url(api_base_url: str | None) -> str:
    value = (api_base_url or os.getenv("UNCONTROLLED_CHAT_API_URL") or DEFAULT_API_BASE_URL).strip()
    if not value:
        raise PersonaMcpError("API base URL cannot be empty.")
    return value.rstrip("/")


def _request_json(
    method: str,
    url: str,
    payload: dict[str, Any] | None = None,
) -> Any:
    data = None
    headers: dict[str, str] = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(url=url, method=method, data=data, headers=headers)
    try:
        with request.urlopen(req, timeout=15) as response:  # noqa: S310
            body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.reason
        try:
            err_payload = json.loads(exc.read().decode("utf-8"))
            if isinstance(err_payload, dict) and isinstance(err_payload.get("detail"), str):
                detail = err_payload["detail"]
        except (ValueError, UnicodeDecodeError):
            pass
        raise PersonaMcpError(f"Backend request failed: {detail}") from exc
    except error.URLError as exc:
        raise PersonaMcpError(f"Cannot reach backend API: {exc.reason}") from exc

    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise PersonaMcpError("Backend returned invalid JSON.") from exc


def _validate_persona_name(name: str) -> str:
    normalized = name.strip()
    if len(normalized) < PERSONA_NAME_MIN_LEN or len(normalized) > PERSONA_NAME_MAX_LEN:
        raise PersonaMcpError("Persona name must be between 2 and 24 characters.")
    return normalized


def _build_persona_ciphertext(
    room_crypto: RoomCrypto,
    name: str,
    description: str,
    invoked_by: str,
) -> tuple[str, str]:
    payload = {
        "name": _validate_persona_name(name),
        "description": description.strip(),
        "invokedBy": invoked_by.strip(),
    }
    if not payload["description"]:
        raise PersonaMcpError("Persona description cannot be empty.")
    if not payload["invokedBy"]:
        raise PersonaMcpError("invoked_by cannot be empty.")
    return room_crypto.persona_name_token(payload["name"]), room_crypto.encrypt(
        json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    )


def _fetch_persona_rows(api_url: str, key_space_id: str) -> list[dict[str, str]]:
    encoded_key_space = parse.urlencode({"key_space_id": key_space_id})
    result = _request_json(
        "GET",
        f"{api_url}/api/personas?{encoded_key_space}",
    )
    if not isinstance(result, list):
        raise PersonaMcpError("Persona list response is invalid.")
    validated_rows: list[dict[str, str]] = []
    for item in result:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id")
        ciphertext = item.get("ciphertext")
        created_at = item.get("created_at")
        if not isinstance(item_id, str) or not isinstance(ciphertext, str) or not isinstance(
            created_at, str
        ):
            continue
        validated_rows.append(
            {
                "id": item_id,
                "ciphertext": ciphertext,
                "created_at": created_at,
            }
        )
    return validated_rows


def _decrypt_persona_rows(room_crypto: RoomCrypto, rows: list[dict[str, str]]) -> list[PersonaRecord]:
    personas: list[PersonaRecord] = []
    for row in rows:
        try:
            decrypted = json.loads(room_crypto.decrypt(row["ciphertext"]))
        except (ValueError, json.JSONDecodeError):
            continue
        if not isinstance(decrypted, dict):
            continue
        name = decrypted.get("name")
        description = decrypted.get("description")
        invoked_by = decrypted.get("invokedBy")
        if (
            not isinstance(name, str)
            or not isinstance(description, str)
            or not isinstance(invoked_by, str)
        ):
            continue
        personas.append(
            PersonaRecord(
                id=row["id"],
                name=name,
                description=description,
                invoked_by=invoked_by,
                created_at=row["created_at"],
            )
        )
    return personas


@mcp.tool()
def list_personas(
    passphrase: str,
    api_base_url: str | None = None,
) -> list[dict[str, str]]:
    """List decrypted personas for the room identified by passphrase."""
    room_crypto = RoomCrypto.from_passphrase(passphrase.strip())
    rows = _fetch_persona_rows(_api_base_url(api_base_url), room_crypto.key_space_id)
    return [persona.to_dict() for persona in _decrypt_persona_rows(room_crypto, rows)]


@mcp.tool()
def create_persona(
    passphrase: str,
    name: str,
    description: str,
    invoked_by: str = "Agent",
    api_base_url: str | None = None,
) -> dict[str, str]:
    """Create an encrypted persona in a room and return its visible metadata."""
    return _create_persona(
        passphrase=passphrase,
        name=name,
        description=description,
        invoked_by=invoked_by,
        api_base_url=api_base_url,
    )


def _create_persona(
    passphrase: str,
    name: str,
    description: str,
    invoked_by: str = "Agent",
    api_base_url: str | None = None,
) -> dict[str, str]:
    """Create an encrypted persona in a room and return its visible metadata."""
    room_crypto = RoomCrypto.from_passphrase(passphrase.strip())
    key_space_id = room_crypto.key_space_id
    name_token, ciphertext = _build_persona_ciphertext(
        room_crypto=room_crypto,
        name=name,
        description=description,
        invoked_by=invoked_by,
    )
    created = _request_json(
        "POST",
        f"{_api_base_url(api_base_url)}/api/personas",
        payload={
            "key_space_id": key_space_id,
            "name_token": name_token,
            "ciphertext": ciphertext,
        },
    )
    if not isinstance(created, dict):
        raise PersonaMcpError("Create persona response is invalid.")
    persona_id = created.get("id")
    created_at = created.get("created_at")
    if not isinstance(persona_id, str) or not isinstance(created_at, str):
        raise PersonaMcpError("Create persona response is missing required fields.")
    return {
        "id": persona_id,
        "name": _validate_persona_name(name),
        "description": description.strip(),
        "invoked_by": invoked_by.strip(),
        "key_space_id": key_space_id,
        "created_at": created_at,
    }


@mcp.tool()
def create_persona_from_description(
    passphrase: str,
    description: str,
    invoked_by: str = "Agent",
    api_base_url: str | None = None,
) -> dict[str, str]:
    """Generate a persona name with backend Copilot and create the persona."""
    return _create_persona_from_description(
        passphrase=passphrase,
        description=description,
        invoked_by=invoked_by,
        api_base_url=api_base_url,
    )


def _create_persona_from_description(
    passphrase: str,
    description: str,
    invoked_by: str = "Agent",
    api_base_url: str | None = None,
) -> dict[str, str]:
    """Generate a persona name with backend Copilot and create the persona."""
    room_crypto = RoomCrypto.from_passphrase(passphrase.strip())
    api_url = _api_base_url(api_base_url)
    existing_rows = _fetch_persona_rows(api_url, room_crypto.key_space_id)
    existing_names = [persona.name for persona in _decrypt_persona_rows(room_crypto, existing_rows)]
    generated = _request_json(
        "POST",
        f"{api_url}/api/personas/generate",
        payload={
            "description": description.strip(),
            "existing_names": existing_names,
        },
    )
    if not isinstance(generated, dict):
        raise PersonaMcpError("Persona generation response is invalid.")
    generated_name = generated.get("name")
    if not isinstance(generated_name, str):
        raise PersonaMcpError("Persona generation response is invalid.")
    return _create_persona(
        passphrase=passphrase,
        name=generated_name,
        description=description,
        invoked_by=invoked_by,
        api_base_url=api_url,
    )


def main() -> None:
    """Run the MCP server over stdio."""
    mcp.run()


if __name__ == "__main__":
    main()
