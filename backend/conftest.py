"""Tests run without sessions and rate limits unless a test switches them on (see test_security.py)."""
import os

os.environ.setdefault("SENIM_AUTH", "off")
os.environ.setdefault("SAFEPAUSE_LLM", "off")
