from __future__ import annotations
from urllib.parse import urlparse
from .supabase import db1, db2, db3, db4
from .config import settings

_WIDGET_DEFAULTS = {
    "style": "metal-balls",
    "primary": "#FF0000",
    "secondary": "#FF0000",
    "center": "#FBFBFB",
    "glow": "#FF0000",
    "size": 64, "position": "bottom-right", "ballCount": 32, "radius": 37,
    "ballSize": 3, "centerSize": 31, "tilt": 49, "variation": 0.14, "shine": True, "speed": 1,
    "stateAnimations": {}, "labels": {}, "welcome": "Hello! How can I help you today?",
    "placeholder": "Type your message…", "sound": False,
    "chat": {"title": "AI Assistant", "subtitle": "Usually replies instantly", "autoOpen": False},
    "mobile": {"hidden": False, "size": 56}, "desktop": {"size": 64},
    "fallback": {"enabled": True, "type": "static"}, "advanced": {"debug": False},
    "retrievalTopK": 8, "behavior": "",
}
_WIDGET_STATES = ("idle","listening","thinking","speaking","message","success","handoff","error","offline")
_STATE_DEFAULTS = {
    "idle": {"enabled": True, "speed": 1, "energy": .25},
    "listening": {"enabled": True, "speed": 1.1, "energy": .6},
    "thinking": {"enabled": True, "speed": 1.3, "energy": .85},
    "speaking": {"enabled": True, "speed": 1.25, "energy": 1},
    "message": {"enabled": True, "speed": 1.1, "energy": .7},
    "success": {"enabled": True, "speed": .9, "energy": .5},
    "handoff": {"enabled": True, "speed": 1, "energy": .5},
    "error": {"enabled": True, "speed": 1, "energy": .9},
    "offline": {"enabled": False, "speed": 0, "energy": 0},
}

def _clamp_number(value, default, minimum, maximum):
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, n))

def canonical_widget_config(value: object) -> dict:
    raw = value if isinstance(value, dict) else {}
    def first(*keys):
        for key in keys:
            if key in raw and raw[key] is not None:
                return raw[key]
        return None
    config = dict(_WIDGET_DEFAULTS)
    def color_value(value, default):
        candidate = value if isinstance(value, str) else ""
        return candidate if __import__('re').fullmatch(r"#[0-9a-fA-F]{6}", candidate) else default
    config["primary"] = color_value(first("primary", "orb_color_primary"), config["primary"])
    config["secondary"] = color_value(first("secondary", "orb_color_secondary"), config["secondary"])
    config["glow"] = color_value(first("glow", "orb_color_accent", "accent"), config["glow"])
    config["center"] = color_value(first("center", "centerColor"), config["center"])
    config["size"] = int(round(_clamp_number(raw.get("size"), 64, 44, 132)))
    config["position"] = raw.get("position") if raw.get("position") in {"bottom-right", "bottom-left"} else "bottom-right"
    config["ballCount"] = int(round(_clamp_number(raw.get("ballCount"), 32, 8, 128)))
    radius = _clamp_number(raw.get("radius"), 37, 8, 60)
    if 0 < radius <= .6: radius *= 50
    config["radius"] = _clamp_number(radius, 37, 8, 60)
    ball_size = _clamp_number(raw.get("ballSize"), 3, 1, 12)
    if 0 < ball_size <= .35: ball_size *= 25
    config["ballSize"] = _clamp_number(ball_size, 3, 1, 12)
    center_size = _clamp_number(raw.get("centerSize"), 31, 3, 70)
    if 0 <= center_size <= .5: center_size *= 172
    config["centerSize"] = _clamp_number(center_size, 31, 3, 70)
    tilt = _clamp_number(raw.get("tilt"), 49, 0, 180)
    if 0 <= tilt <= 1: tilt *= 140
    config["tilt"] = _clamp_number(tilt, 49, 0, 180)
    config["variation"] = _clamp_number(raw.get("variation"), .14, 0, 1)
    config["shine"] = raw.get("shine") is not False
    config["speed"] = _clamp_number(first("speed", "animation_speed"), 1, .1, 4)
    states = raw.get("stateAnimations") if isinstance(raw.get("stateAnimations"), dict) else raw.get("states") if isinstance(raw.get("states"), dict) else {}
    config["stateAnimations"] = {}
    for state in _WIDGET_STATES:
        source = states.get(state) if isinstance(states, dict) and isinstance(states.get(state), dict) else {}
        fallback = _STATE_DEFAULTS[state]
        item = {"enabled": bool(source.get("enabled", fallback["enabled"])), "speed": _clamp_number(source.get("speed"), fallback["speed"], 0, 5), "energy": _clamp_number(source.get("energy"), fallback["energy"], 0, 3)}
        if isinstance(source.get("color"), str): item["color"] = source["color"]
        config["stateAnimations"][state] = item
    labels = raw.get("labels") if isinstance(raw.get("labels"), dict) else {}
    default_labels = {"idle":"Online","listening":"Listening…","thinking":"Thinking…","speaking":"Replying…","message":"New message","success":"Done","handoff":"Connecting you to a person","error":"Something went wrong","offline":"Offline"}
    config["labels"] = {state: str(labels.get(state) or default_labels[state])[:120] for state in _WIDGET_STATES}
    config["welcome"] = str(first("welcome", "text", "greeting_text") or _WIDGET_DEFAULTS["welcome"])[:400]
    config["placeholder"] = str(raw.get("placeholder") or _WIDGET_DEFAULTS["placeholder"])[:120]
    config["sound"] = raw.get("sound") is True
    chat_raw = raw.get("chat") if isinstance(raw.get("chat"), dict) else {}
    config["chat"] = {"title": str(chat_raw.get("title") or raw.get("title") or "AI Assistant")[:60], "subtitle": str(chat_raw.get("subtitle") or raw.get("subtitle") or "Usually replies instantly")[:80], "autoOpen": bool(chat_raw.get("autoOpen", raw.get("autoOpen", False)))}
    mobile_raw = raw.get("mobile") if isinstance(raw.get("mobile"), dict) else {}
    config["mobile"] = {"hidden": bool(mobile_raw.get("hidden", raw.get("mobileHidden", False))), "size": int(round(_clamp_number(mobile_raw.get("size", raw.get("mobileSize")), 56, 40, 100)))}
    desktop_raw = raw.get("desktop") if isinstance(raw.get("desktop"), dict) else {}
    config["desktop"] = {"size": int(round(_clamp_number(desktop_raw.get("size", raw.get("size")), 64, 44, 132)))}
    fallback = raw.get("fallback") if isinstance(raw.get("fallback"), dict) else {}
    config["fallback"] = {"enabled": fallback.get("enabled", True) is not False, "type": "static"}
    advanced = raw.get("advanced") if isinstance(raw.get("advanced"), dict) else {}
    config["advanced"] = {"debug": bool(advanced.get("debug", False))}
    config["retrievalTopK"] = int(round(_clamp_number(raw.get("retrievalTopK"), 8, 1, 20)))
    behavior = first("behavior", "owner_instructions")
    config["behavior"] = str(behavior)[:4000] if isinstance(behavior, str) else ""
    return config


def host(value: str) -> str:
    raw = value.strip()
    if '://' not in raw:
        raw = 'https://' + raw
    h = urlparse(raw).hostname or ''
    return h.removeprefix('www.').lower()

async def resolve_widget(token: str) -> dict | None:
    rows = await db2.rpc('resolve_widget_installation', {'p_token': token})
    return rows[0] if isinstance(rows, list) and rows else None

async def owner_allowed(client_id: str) -> bool:
    org = await db1.table('organizations', select='created_by_user_id', filters=[('id', f'eq.{client_id}')], single=True)
    owner_user_id = (org or {}).get('created_by_user_id')
    if not owner_user_id:
        return False
    row = await db1.table('account_restrictions', select='status,muted', filters=[('user_id', f'eq.{owner_user_id}')], single=True)
    return (row or {}).get('status', 'active') not in {'banned', 'suspended', 'deactivated'}

async def eligibility(automation_id: str) -> dict:
    local = await db2.rpc('automation_local_runtime_state', {'p_automation_id': automation_id})
    row = local if isinstance(local, dict) else {'state': 'missing'}
    if row.get('state') != 'active':
        return row
    automation = await db2.table('client_automations', select='id,client_id,requires_reinstallation', filters=[('id', f'eq.{automation_id}')], single=True)
    if not automation:
        return {'state': 'missing'}
    if not await owner_allowed(str(automation['client_id'])):
        return {'state': 'owner_restricted'}
    return row

def configured_widget_hosts() -> list[str]:
    raw = settings.allowed_widget_hosts
    return [host(x) for x in raw.replace('\n', ',').split(',') if host(x)]

def host_matches(candidate: str, allowed: str) -> bool:
    if not candidate or not allowed:
        return False
    if allowed.startswith('*.'):
        allowed = allowed[2:]
        return candidate.endswith('.' + allowed)
    return candidate == allowed or candidate.endswith('.' + allowed)

async def check_origin(inst: dict, origin: str | None) -> bool:
    if not origin:
        return False
    h = host(origin)
    if not h:
        return False
    candidates = [inst.get('domain_url') or '', *(inst.get('allowed_domains') or [])]
    if any(host_matches(h, host(x)) for x in candidates if x):
        return True
    return any(host_matches(h, allowed) for allowed in configured_widget_hosts())
