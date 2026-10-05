"""Semantic classifier for Live2D PSD layers.

Mirrors the classification rules in psd2live's LayerClassifier.kt:
- Normalizes layer names (NFKC, lowercase, stripping copy/variant suffixes).
- Identifies side (left/right) from prefixes, suffixes, or bracketed notations.
- Matches against standard 31 See-Through / PSD2Live semantic tags.
"""
import re
import unicodedata

SEMANTIC_TAGS = {
    "BACK_HAIR",
    "FRONT_HAIR",
    "HEADWEAR",
    "FACE",
    "FACE_DETAIL",
    "IRIDES",
    "EYEBROW",
    "EYEWHITE",
    "EYELASH",
    "EYE_CLOSE",
    "EYEWEAR",
    "EARS",
    "EARWEAR",
    "NOSE",
    "MOUTH",
    "MOUTH_OPEN",
    "MOUTH_CLOSE",
    "TOOTH_T",
    "TOOTH_B",
    "TONGUE",
    "NECK",
    "NECKWEAR",
    "TOPWEAR",
    "HANDWEAR",
    "BOTTOMWEAR",
    "LEGWEAR",
    "FOOTWEAR",
    "TAIL",
    "WINGS",
    "OBJECTS",
    "UNKNOWN",
}

ALIASES = {}


def _reg(tag, *names):
    for n in names:
        ALIASES[n.lower()] = tag


_reg("BACK_HAIR", "back hair", "backhair", "hair back", "hair_back", "后发", "后髪", "后脑勺", "後ろ髪", "後髪", "うしろがみ", "后头", "後頭部", "马尾", "馬尾", "ポニーテール", "ポニテ", "双马尾", "雙馬尾", "ツインテール", "ツインテ", "背发", "背髪")
_reg("FRONT_HAIR", "front hair", "fronthair", "hair front", "hair_front", "hair", "bangs", "前发", "前髪", "刘海", "瀏海", "まえがみ", "侧发", "側髪", "横髪", "鬓角", "もみあげ", "サイドヘア", "サイド", "呆毛", "アホ毛", "ahoge")
_reg("HEADWEAR", "headwear", "hat", "cap", "帽子", "头饰", "頭飾", "发饰", "髪飾り", "カチューシャ", "リボン", "发带", "蝴蝶结")
_reg("FACE", "face", "head", "脸", "臉", "脸部", "面部", "顔", "かお", "輪郭", "脸轮廓", "脸部轮廓", "脸蛋", "头部", "头", "頭", "あたま")
_reg("FACE_DETAIL", "facedetail", "face detail", "face_detail", "脸部细节", "面部细节", "腮红", "紅暈", "红晕", "ほほ", "頬", "チーク", "blush", "脸颊", "泪痕")
_reg("IRIDES", "irides", "iris", "pupil", "pupils", "eyes", "eye", "瞳孔", "虹膜", "眼珠", "眼睛", "目", "眼", "瞳", "ひとみ", "眼球", "眼黑", "目玉", "め", "ハイライト", "高光", "眼睛高光", "眼部高光", "瞳高光")
_reg("EYEBROW", "eyebrow", "eyebrows", "brow", "brows", "眉毛", "眉", "まゆ毛", "まゆげ", "まゆ")
_reg("EYEWHITE", "eyewhite", "eye white", "eye_white", "eyewhites", "眼白", "白眼", "白目", "目白", "巩膜")
_reg("EYELASH", "eyelash", "eyelashes", "lash", "lashes", "eye open", "eye_open", "睫毛", "まつ毛", "まつげ", "上睫毛", "下睫毛", "上まつ毛", "下まつ毛", "上まつげ", "下まつげ", "アイライン", "眼线", "上眼线", "下眼线", "二重")
_reg("EYE_CLOSE", "eye close", "eye_close", "eye c", "eye_c", "eyelash c", "eyelash_c", "closed eye", "closed_eye", "闭眼", "閉眼", "目閉じ", "閉じ目", "笑眼", "眯眼", "笑顔", "笑い目", "eye smile", "eye_smile")
_reg("EYEWEAR", "eyewear", "glasses", "眼镜", "眼鏡", "めがね")
_reg("EARS", "ears", "ear", "耳朵", "耳", "みみ")
_reg("EARWEAR", "earwear", "earring", "earrings", "耳环", "耳環", "耳饰", "耳飾", "イヤリング", "ピアス")
_reg("NOSE", "nose", "鼻子", "鼻", "はな")
_reg("MOUTH", "mouth", "口", "嘴", "嘴巴", "口内", "口腔", "嘴部", "くち")
_reg("MOUTH_OPEN", "mouth open", "mouth_open", "mouth o", "mouth_o", "open mouth", "open_mouth", "张嘴", "張嘴", "开口", "開口", "口開き", "开嘴", "開嘴", "开嘴巴")
_reg("MOUTH_CLOSE", "mouth close", "mouth_close", "mouth c", "mouth_c", "close mouth", "close_mouth", "闭嘴", "閉嘴", "闭口", "閉口", "口閉じ")
_reg("TOOTH_T", "tooth-t", "tooth_t", "tooth t", "upper tooth", "upper teeth", "上牙", "上歯", "上齿")
_reg("TOOTH_B", "tooth-b", "tooth_b", "tooth b", "lower tooth", "lower teeth", "下牙", "下歯", "下齿")
_reg("TONGUE", "tongue", "舌头", "舌頭", "舌", "ベロ")
_reg("NECK", "neck", "脖子", "颈部", "頸部", "首", "くび")
_reg("NECKWEAR", "neckwear", "collar", "scarf", "领饰", "領飾", "围巾", "マフラー")
_reg("TOPWEAR", "topwear", "clothes", "cloth", "shirt", "jacket", "上衣", "衣服", "服装", "服裝", "服", "身体", "体", "からだ", "胴体", "胴", "躯干", "上身")
_reg("HANDWEAR", "handwear", "hand", "hands", "arm", "arms", "手臂", "手", "腕", "うで", "手腕", "袖", "袖子")
_reg("BOTTOMWEAR", "bottomwear", "pants", "skirt", "下装", "下裝", "裤子", "褲子", "裙子", "スカート", "ズボン", "ボトムス", "下身")
_reg("LEGWEAR", "legwear", "leg", "legs", "腿", "大腿", "小腿")
_reg("FOOTWEAR", "footwear", "foot", "feet", "shoe", "shoes", "脚", "腳", "鞋", "鞋子", "靴", "くつ", "靴下", "袜子")
_reg("TAIL", "tail", "尾巴", "尾", "しっぽ")
_reg("WINGS", "wings", "wing", "翅膀", "翼", "つばさ", "羽")
_reg("OBJECTS", "objects", "object", "prop", "props", "道具", "物件")

SIDE_SUFFIX = re.compile(
    r"(?:[\s_-]*[（\(\[【](l|r|left|right|左|右)[）\)\]】]|[\s_-]+(l|r|left|right|左|右)|(?<=[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\d])(左|右)|(?<=[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff])(l|r))$",
    re.IGNORECASE,
)
SIDE_PREFIX = re.compile(
    r"^(?:(左|右)[-_.\s]*|(l|r|left|right)[-_.\s]+|[（\(\[【](l|r|left|right|左|右)[）\)\]】][\s_-]*)",
    re.IGNORECASE,
)
VARIANT_SUFFIX = re.compile(r"(?:[-_.\s]+|(?<=[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ffa-zA-Z]))(\d+)$")
COPY_SUFFIX = re.compile(r"\s*(?:copy|のコピー|的副本|副本)\s*\d*$", re.IGNORECASE)


def _side_of(raw: str) -> str:
    r = raw.lower()
    if r in ("l", "left", "左"):
        return "left"
    if r in ("r", "right", "右"):
        return "right"
    return "none"


def classify_layer(name: str):
    """Classifies a layer name into (tag, side, confidence)."""
    normalized = unicodedata.normalize("NFKC", name).strip().lower()
    normalized = COPY_SUFFIX.sub("", normalized).strip()

    side = "none"
    prefix_m = SIDE_PREFIX.search(normalized)
    if prefix_m:
        raw_side = next((g for g in prefix_m.groups() if g), None)
        if raw_side:
            side = _side_of(raw_side)
            normalized = normalized[prefix_m.end():].strip()

    while True:
        changed = False
        if side == "none":
            suffix_m = SIDE_SUFFIX.search(normalized)
            if suffix_m:
                raw_side = next((g for g in suffix_m.groups() if g), None)
                if raw_side:
                    side = _side_of(raw_side)
                    normalized = normalized[:suffix_m.start()].strip()
                    changed = True

        variant_m = VARIANT_SUFFIX.search(normalized)
        if variant_m and any(c.isalpha() for c in normalized):
            normalized = normalized[:variant_m.start()].strip()
            changed = True

        if not changed:
            break

    # Direct match
    if normalized in ALIASES:
        return ALIASES[normalized], side, 1.0

    # Prefix match
    for alias, tag in sorted(ALIASES.items(), key=lambda x: len(x[0]), reverse=True):
        suffix = normalized[len(alias):] if normalized.startswith(alias) else None
        if (any(normalized.startswith(alias + sep) for sep in (" ", "-", "_"))
                or (len(alias) >= 2 and suffix is not None
                    and (all(c.isdigit() for c in suffix) or all(ord(c) > 127 for c in normalized)))):
            return tag, side, 0.85

    return "UNKNOWN", side, 0.0
