import re
from datetime import datetime, timedelta
from typing import List, Optional

def normalize_schedule(timing: str) -> List[str]:
    t = timing.lower()

    if any(x in t for x in ["three times", "thrice", "tds", "t.i.d", "tid"]):
        return ["morning", "afternoon", "night"]
    elif any(x in t for x in ["twice", "bd", "b.i.d", "bid", "two times"]):
        return ["morning", "night"]
    elif any(x in t for x in ["night", "bedtime", "hs", "nocte"]):
        return ["night"]
    elif any(x in t for x in ["morning", "od", "once", "daily", "qd"]):
        return ["morning"]
    elif any(x in t for x in ["afternoon", "noon", "midday"]):
        return ["afternoon"]

    return []

def calculate_expiry(duration: str) -> Optional[datetime]:
    d = duration.lower()
    nums = [int(n) for n in re.findall(r"\d+", d)]
    if not nums:
        return None

    val = nums[0]
    if "month" in d:
        days = val * 30
    elif "week" in d:
        days = val * 7
    else:
        days = val

    return datetime.utcnow() + timedelta(days=days)
