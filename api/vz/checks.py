"""Automatic checks. Nothing is blocked here: we only attach reasons so the admin
looks at flagged items instead of every profile or post."""
import re

_DIGITS = re.compile(r"\d")
_CONTACT = re.compile(r"(https?://|www\.|@|\.com\b|whats\s*app)", re.I)


def clean_name(name: str) -> str:
    return re.sub(r"\s+", " ", name or "").strip()


def name_error(name: str) -> str | None:
    """Hard errors shown to the user (kept few and simple)."""
    n = clean_name(name)
    if len(n) < 2:
        return "name_short"
    if len(n) > 60:
        return "name_long"
    if len(_DIGITS.findall(n)) >= 5:
        return "name_has_number"   # usually a phone number typed into the name
    return None


def profile_flags(name: str, business_name: str | None, driver: dict | None) -> list[str]:
    flags: list[str] = []
    for value in (name, business_name or ""):
        if _CONTACT.search(value) or _DIGITS.search(value):
            flags.append("contact_in_name")
            break
    if driver:
        savings = driver.get("savings_wanted")
        if savings is not None and (savings < 3000 or savings > 150000):
            flags.append("savings_unusual")
        exp = driver.get("experience_years")
        if exp is not None and exp > 45:
            flags.append("experience_unusual")
    return flags


def fleet_flags(fleet: list[dict]) -> list[str]:
    total = sum(g.get("vehicle_count", 0) for g in fleet)
    return ["fleet_very_large"] if total > 500 else []
