"""Makes a VAPID key pair for web push. Run once, then put the two lines into .env and Vercel.

    pip install py-vapid   (already installed with pywebpush)
    python scripts/make_vapid_keys.py

Keep VAPID_PRIVATE_KEY secret. If you change the keys later, every phone has to allow
notifications again, so make them once and keep them.
"""
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


key = ec.generate_private_key(ec.SECP256R1())
private = key.private_numbers().private_value.to_bytes(32, "big")
public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
print(f"VAPID_PUBLIC_KEY={b64(public)}")
print(f"VAPID_PRIVATE_KEY={b64(private)}")
