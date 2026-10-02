"""Vercel entry point. Vercel serves the ASGI `app` object from this file."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from vz.main import app  # noqa: E402,F401
