"""Pull the model's number out of its answer."""
import re

_DEV = str.maketrans("०१२३४५६७८९", "0123456789")
_FW = str.maketrans("０１２３４５６７８９．，", "0123456789.,")
_LINE = re.compile(r"NUMBER\s*[:：]\s*(.+)", re.I)
_NUM = re.compile(r"-?\d[\d,]*(?:\.\d+)?")


def _to_float(s):
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def parse_number(text):
    """Number from the last 'NUMBER:' line. A range like '200-300' gives its midpoint. None if absent."""
    if not text:
        return None
    t = text.translate(_DEV).translate(_FW)
    lines = _LINE.findall(t)
    if not lines:
        return None
    nums = [_to_float(n) for n in _NUM.findall(lines[-1].replace("–", "-").replace("~", "-"))]
    nums = [abs(n) if i else n for i, n in enumerate(nums) if n is not None]
    if not nums:
        return None
    if len(nums) >= 2 and re.search(r"\d\s*(?:-|to|至|से)\s*\d", lines[-1]):
        return (nums[0] + nums[1]) / 2
    return nums[0]


def strip_number_line(text):
    """The answer body without the trailing NUMBER line."""
    return re.sub(r"\n?\s*NUMBER\s*[:：].*$", "", text or "", flags=re.I | re.S).strip()
