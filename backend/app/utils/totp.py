"""RFC 6238 Time-based One-Time Password (TOTP) Implementation.

Zero-dependency standard implementation using hashlib, hmac, base64, struct, time.
Provides base32 secret generation, otpauth URI creation, code generation, and verification
with configurable clock drift tolerance window.
"""

import base64
import hmac
import hashlib
import struct
import time
import secrets
from typing import Optional


def generate_totp_secret() -> str:
    """Generate a high-entropy 20-byte random secret encoded as standard Base32 (32 chars)."""
    random_bytes = secrets.token_bytes(20)
    return base64.b32encode(random_bytes).decode("ascii").rstrip("=")


def get_totp_uri(secret: str, email: str, issuer: str = "HealthPredict") -> str:
    """Return the standard otpauth URI for authenticator app QR code generation."""
    # Ensure standard Base32 padding if missing
    padded_secret = secret + "=" * ((8 - len(secret) % 8) % 8)
    # Sanitize label and issuer
    label = f"{issuer}:{email}"
    return f"otpauth://totp/{label}?secret={padded_secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30"


def generate_totp_code(secret: str, for_time: Optional[float] = None) -> str:
    """Generate the 6-digit TOTP code for the specified timestamp (defaults to current time)."""
    if not secret:
        return ""
    if for_time is None:
        for_time = time.time()

    time_step = int(for_time // 30)
    counter_bytes = struct.pack(">Q", time_step)

    try:
        # Pad secret to standard base32 length
        padded_secret = secret + "=" * ((8 - len(secret) % 8) % 8)
        key = base64.b32decode(padded_secret.upper(), casefold=True)
    except Exception:
        return ""

    hmac_digest = hmac.new(key, counter_bytes, hashlib.sha1).digest()

    offset = hmac_digest[-1] & 0x0F
    code_int = struct.unpack(">I", hmac_digest[offset : offset + 4])[0] & 0x7FFFFFFF
    code = code_int % 1000000

    return f"{code:06d}"


def verify_totp_code(secret: str, code: str, valid_window: int = 1) -> bool:
    """Verify a 6-digit TOTP code against the secret, allowing +/- valid_window time steps (30s each)."""
    if not secret or not code:
        return False

    code = code.strip()
    if len(code) != 6 or not code.isdigit():
        return False

    now = time.time()
    try:
        for offset in range(-valid_window, valid_window + 1):
            test_time = now + (offset * 30)
            expected_code = generate_totp_code(secret, test_time)
            if expected_code and hmac.compare_digest(code, expected_code):
                return True
    except Exception:
        return False

    return False
