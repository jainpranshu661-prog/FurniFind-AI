import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from .schemas import Product

STOP_WORDS = {
    "a", "an", "and", "are", "at", "about", "can", "does", "for", "from", "have",
    "in", "is", "it", "me", "my", "of", "on", "please", "some", "something", "that",
    "the", "this", "to", "want", "what", "with", "you", "looking", "find", "show",
    "need", "furniture", "tell", "made", "product", "piece", "details", "information",
}
WORD_RE = re.compile(r"[a-z0-9]+")
PRICE_RE = r"(?:₹\s*)?(\d[\d,]*(?:\.\d+)?)(?![\d,]|\s*(?:mm|cm|m|in(?:ches?)?)\b)"
DIMENSION_RE = re.compile(r"\b(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in(?:ches?)?)\b", re.IGNORECASE)
DIMENSION_BOUND_RE = re.compile(
    r"\b(under|below|less\s+than|at\s+most|up\s+to|over|above|more\s+than|at\s+least)\s*"
    r"(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in(?:ches?)?)\b",
    re.IGNORECASE,
)
MAX_PRICE_RE = re.compile(
    rf"\b(?:under|below|less\s+than|up\s+to|upto|within|at\s+most|max(?:imum)?(?:\s+budget)?(?:\s+of)?|budget(?:\s+of)?)\s*{PRICE_RE}",
    re.IGNORECASE,
)
MIN_PRICE_RE = re.compile(
    rf"\b(?:over|above|more\s+than|at\s+least|min(?:imum)?(?:\s+budget)?(?:\s+of)?)\s*{PRICE_RE}",
    re.IGNORECASE,
)
PRICE_RANGE_RE = re.compile(
    rf"\b(?:between|from)\s*{PRICE_RE}\s*(?:and|to|-)\s*{PRICE_RE}",
    re.IGNORECASE,
)

ITEM_TYPES: dict[str, tuple[str, ...]] = {
    "bed": ("bed", "beds"),
    "bench": ("bench", "benches"),
    "chair": ("chair", "chairs"),
    "desk": ("desk", "desks"),
    "lamp": ("lamp", "lamps", "light", "lights"),
    "sofa": ("sofa", "sofas", "couch", "couches"),
    "table": ("table", "tables"),
}
MATERIAL_GROUPS: dict[str, tuple[str, ...]] = {
    "wood": ("wood", "wooden", "oak", "walnut", "ash", "teak", "timber"),
    "metal": ("metal", "steel", "aluminium", "aluminum", "brass", "iron"),
    "leather": ("leather",),
    "linen": ("linen",),
    "cane": ("cane",),
    "rattan": ("rattan",),
    "glass": ("glass",),
    "paper": ("paper",),
}
COLOR_GROUPS: dict[str, tuple[str, ...]] = {
    "black": ("black", "charcoal"),
    "blue": ("blue", "navy"),
    "brown": ("brown", "walnut", "honey"),
    "green": ("green", "moss"),
    "grey": ("grey", "gray", "charcoal"),
    "ivory": ("ivory", "cream"),
    "natural": ("natural", "oatmeal", "beige"),
    "white": ("white", "soft white"),
}
STYLE_GROUPS: dict[str, tuple[str, ...]] = {
    "contemporary": ("contemporary", "modern"),
    "industrial": ("industrial",),
    "minimal": ("minimal", "minimalist"),
    "rustic": ("rustic",),
    "scandinavian": ("scandinavian", "nordic"),
    "traditional": ("traditional", "classic"),
}
TERM_SYNONYMS: dict[str, tuple[str, ...]] = {
    "apartment": ("apartment", "compact", "small"),
    "compact": ("compact", "small"),
    "cozy": ("cozy", "warm", "soft"),
    "light": ("light", "lamp"),
    "natural": ("natural", "oak", "wood", "cane"),
    "small": ("small", "compact"),
    "warm": ("warm", "honey", "ivory", "linen"),
    "wood": MATERIAL_GROUPS["wood"],
    "wooden": MATERIAL_GROUPS["wood"],
}
ROOM_TERMS: dict[str, tuple[str, ...]] = {
    "bedroom": ("bedroom", "bed room"),
    "dining": ("dining", "dining room"),
    "lighting": ("lighting",),
    "living room": ("living room", "living"),
    "office": ("office", "workspace", "work from home"),
}
SIZE_TERMS = {"compact", "small", "narrow", "slim", "large", "wide", "spacious"}


@dataclass(frozen=True)
class SearchPreferences:
    min_price: float | None = None
    max_price: float | None = None
    item_type: str | None = None
    material: str | None = None
    color: str | None = None
    rooms: tuple[str, ...] = ()
    styles: tuple[str, ...] = ()
    sizes: tuple[str, ...] = ()
    dimensions_cm: tuple[float, ...] = ()
    min_dimension_cm: float | None = None
    max_dimension_cm: float | None = None
    min_dimension_inclusive: bool = True
    max_dimension_inclusive: bool = True

    @property
    def has_hard_constraints(self) -> bool:
        return any((
            self.min_price is not None,
            self.max_price is not None,
            self.item_type,
            self.material,
            self.color,
            self.min_dimension_cm is not None,
            self.max_dimension_cm is not None,
        ))


def tokens(text: str) -> set[str]:
    return {word for word in WORD_RE.findall(text.lower()) if word not in STOP_WORDS and len(word) > 1}


def _phrase_matches(query: str, phrase: str) -> bool:
    return re.search(rf"\b{re.escape(phrase)}\b", query, re.IGNORECASE) is not None


def _first_group(query: str, groups: Mapping[str, tuple[str, ...]]) -> str | None:
    for key, aliases in groups.items():
        if any(_phrase_matches(query, alias) for alias in aliases):
            return key
    return None


def extract_preferences(query: str) -> SearchPreferences:
    normalized = query.lower()
    minimum = maximum = None
    price_range = PRICE_RANGE_RE.search(normalized)
    if price_range:
        minimum = float(price_range.group(1).replace(",", ""))
        maximum = float(price_range.group(2).replace(",", ""))
    else:
        max_match = MAX_PRICE_RE.search(normalized)
        min_match = MIN_PRICE_RE.search(normalized)
        if max_match:
            maximum = float(max_match.group(1).replace(",", ""))
        if min_match:
            minimum = float(min_match.group(1).replace(",", ""))

    item_type = _first_group(normalized, ITEM_TYPES)
    material = _first_group(normalized, MATERIAL_GROUPS)
    color = _first_group(normalized, COLOR_GROUPS)
    rooms = tuple(room for room, aliases in ROOM_TERMS.items() if any(_phrase_matches(normalized, alias) for alias in aliases))
    styles = tuple(style for style, aliases in STYLE_GROUPS.items() if any(_phrase_matches(normalized, alias) for alias in aliases))
    sizes = tuple(sorted(SIZE_TERMS.intersection(tokens(normalized))))
    dimension_bounds = list(DIMENSION_BOUND_RE.finditer(normalized))
    dimensions_cm = tuple(
        _to_centimeters(float(match.group(1).replace(",", ".")), match.group(2))
        for match in DIMENSION_RE.finditer(normalized)
        if not any(bound.start() <= match.start() and match.end() <= bound.end() for bound in dimension_bounds)
    )
    min_dimension_cm = max_dimension_cm = None
    min_dimension_inclusive = max_dimension_inclusive = True
    for bound in dimension_bounds:
        operator = re.sub(r"\s+", " ", bound.group(1).lower())
        value = _to_centimeters(float(bound.group(2).replace(",", ".")), bound.group(3))
        if operator in {"under", "below", "less than"}:
            max_dimension_cm = value
            max_dimension_inclusive = False
        elif operator in {"at most", "up to"}:
            max_dimension_cm = value
            max_dimension_inclusive = True
        elif operator in {"over", "above", "more than"}:
            min_dimension_cm = value
            min_dimension_inclusive = False
        else:
            min_dimension_cm = value
            min_dimension_inclusive = True

    return SearchPreferences(
        min_price=minimum,
        max_price=maximum,
        item_type=item_type,
        material=material,
        color=color,
        rooms=rooms,
        styles=styles,
        sizes=sizes,
        dimensions_cm=dimensions_cm,
        min_dimension_cm=min_dimension_cm,
        max_dimension_cm=max_dimension_cm,
        min_dimension_inclusive=min_dimension_inclusive,
        max_dimension_inclusive=max_dimension_inclusive,
    )


def searchable_text(product: Product) -> str:
    return " ".join([
        product.name,
        product.category,
        product.description,
        product.material,
        product.color,
        product.dimensions or "",
        *product.tags,
    ]).lower()


def _expanded_terms(query: str) -> set[str]:
    result: set[str] = set()
    for term in tokens(query):
        result.update(TERM_SYNONYMS.get(term, (term,)))
    return result


def matching_terms(query: str, product: Product) -> list[str]:
    query_terms = _expanded_terms(query)
    fields = [product.category, product.material, product.color, product.dimensions or "", *product.tags, product.name]
    return sorted({term for field in fields for term in tokens(field) if term in query_terms})


def _matches_group(value: str, group: str, groups: Mapping[str, tuple[str, ...]]) -> bool:
    value_terms = tokens(value)
    return any(tokens(alias).issubset(value_terms) for alias in groups[group])


def _matches_item_type(product: Product, item_type: str) -> bool:
    name_terms = tokens(product.name)
    return any(tokens(alias).issubset(name_terms) for alias in ITEM_TYPES[item_type])


def _to_centimeters(value: float, unit: str) -> float:
    normalized_unit = unit.lower()
    if normalized_unit == "mm":
        return value / 10
    if normalized_unit == "m":
        return value * 100
    if normalized_unit.startswith("in"):
        return value * 2.54
    return value


def _dimension_values_cm(value: str) -> list[float]:
    units = list(DIMENSION_RE.finditer(value))
    if not units:
        return []
    unit = units[-1].group(2)
    values = re.findall(r"\d+(?:[.,]\d+)?", value)
    return [_to_centimeters(float(number.replace(",", ".")), unit) for number in values]


def _preference_score(product: Product, preferences: SearchPreferences) -> int:
    score = 0
    if preferences.rooms:
        room_text = " ".join([product.category, product.description, *product.tags])
        score += 3 * sum(_matches_group(room_text, room, ROOM_TERMS) for room in preferences.rooms)
    if preferences.styles:
        text = searchable_text(product)
        score += 3 * sum(_matches_group(text, style, STYLE_GROUPS) for style in preferences.styles)
    for size in preferences.sizes:
        if size in tokens(" ".join([product.description, product.dimensions or "", *product.tags])):
            score += 3
    if preferences.dimensions_cm:
        actual_dimensions = _dimension_values_cm(product.dimensions or "")
        score += 4 * sum(
            any(abs(expected - actual) < 0.51 for actual in actual_dimensions)
            for expected in preferences.dimensions_cm
        )
    if preferences.min_dimension_cm is not None or preferences.max_dimension_cm is not None:
        actual_dimensions = _dimension_values_cm(product.dimensions or "")
        if actual_dimensions:
            largest_dimension = max(actual_dimensions)
            if preferences.max_dimension_cm is not None and (
                largest_dimension <= preferences.max_dimension_cm
                if preferences.max_dimension_inclusive
                else largest_dimension < preferences.max_dimension_cm
            ):
                score += 4
            if preferences.min_dimension_cm is not None and (
                largest_dimension >= preferences.min_dimension_cm
                if preferences.min_dimension_inclusive
                else largest_dimension > preferences.min_dimension_cm
            ):
                score += 4
    return score


def _match_reason(product: Product, preferences: SearchPreferences, matched: list[str]) -> str:
    details: list[str] = []
    if preferences.item_type:
        details.append(f"product type: {product.name}")
    if preferences.material:
        details.append(f"{preferences.material} material: {product.material}")
    if preferences.color:
        details.append(f"{preferences.color} color: {product.color}")
    if preferences.min_price is not None or preferences.max_price is not None:
        bounds = []
        if preferences.min_price is not None:
            bounds.append(f"at least ₹{preferences.min_price:,.0f}")
        if preferences.max_price is not None:
            bounds.append(f"up to ₹{preferences.max_price:,.0f}")
        details.append(f"within budget ({' and '.join(bounds)})")
    if preferences.dimensions_cm:
        actual_dimensions = _dimension_values_cm(product.dimensions or "")
        if any(
            abs(expected - actual) < 0.51
            for expected in preferences.dimensions_cm
            for actual in actual_dimensions
        ):
            details.append(f"dimensions: {product.dimensions}")
    if product.dimensions:
        actual_dimensions = _dimension_values_cm(product.dimensions)
        if actual_dimensions:
            largest_dimension = max(actual_dimensions)
            maximum_matches = preferences.max_dimension_cm is None or (
                largest_dimension <= preferences.max_dimension_cm
                if preferences.max_dimension_inclusive
                else largest_dimension < preferences.max_dimension_cm
            )
            minimum_matches = preferences.min_dimension_cm is None or (
                largest_dimension >= preferences.min_dimension_cm
                if preferences.min_dimension_inclusive
                else largest_dimension > preferences.min_dimension_cm
            )
            if (preferences.min_dimension_cm is not None or preferences.max_dimension_cm is not None) and maximum_matches and minimum_matches:
                details.append(f"dimensions fit: {product.dimensions}")
    if matched:
        details.append(f"catalog details: {', '.join(matched[:3])}")
    elif preferences.rooms or preferences.styles or preferences.sizes:
        detail_text = searchable_text(product)
        preferences_found = [
            value
            for value in (*preferences.rooms, *preferences.styles, *preferences.sizes)
            if any(term in detail_text for term in tokens(value))
        ]
        if preferences_found:
            details.append(f"catalog details: {', '.join(preferences_found[:3])}")
    if not details:
        return "Recommended from the matching catalog details."
    return "Matches " + "; ".join(details) + "."


def rank_products(
    products: Iterable[Product],
    query: str,
    semantic_scores: Mapping[str, float] | None = None,
) -> list[tuple[Product, str | None]]:
    preferences = extract_preferences(query)
    query_terms = tokens(query)
    if not query_terms and not preferences.has_hard_constraints:
        return [(product, None) for product in products]

    ranked: list[tuple[float, Product, list[str]]] = []
    for product in products:
        if preferences.min_price is not None and product.price < preferences.min_price:
            continue
        if preferences.max_price is not None and product.price > preferences.max_price:
            continue
        if preferences.item_type and not _matches_item_type(product, preferences.item_type):
            continue
        if preferences.material and not _matches_group(product.material, preferences.material, MATERIAL_GROUPS):
            continue
        if preferences.color and not _matches_group(product.color, preferences.color, COLOR_GROUPS):
            continue
        if preferences.min_dimension_cm is not None or preferences.max_dimension_cm is not None:
            actual_dimensions = _dimension_values_cm(product.dimensions or "")
            if not actual_dimensions:
                continue
            largest_dimension = max(actual_dimensions)
            if preferences.max_dimension_cm is not None and not (
                largest_dimension <= preferences.max_dimension_cm
                if preferences.max_dimension_inclusive
                else largest_dimension < preferences.max_dimension_cm
            ):
                continue
            if preferences.min_dimension_cm is not None and not (
                largest_dimension >= preferences.min_dimension_cm
                if preferences.min_dimension_inclusive
                else largest_dimension > preferences.min_dimension_cm
            ):
                continue

        content = searchable_text(product)
        terms = matching_terms(query, product)
        lexical_score = sum(
            (4 if term in tokens(product.name) else 3 if term in tokens(product.material) else 2)
            for term in terms
        )
        lexical_score += sum(1 for term in query_terms if term in content)
        score = lexical_score + _preference_score(product, preferences)
        similarity = (semantic_scores or {}).get(product.id, 0.0)
        if score or similarity >= 0.28 or preferences.has_hard_constraints:
            ranked.append((score + similarity * 4, product, terms))

    ranked.sort(key=lambda row: (-row[0], row[1].name))
    return [
        (product, _match_reason(product, preferences, terms))
        for _, product, terms in ranked
    ]


def filter_products(
    products: Iterable[Product],
    *,
    category: str | None = None,
    material: str | None = None,
    color: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
) -> list[Product]:
    filtered = list(products)
    if category:
        filtered = [item for item in filtered if item.category.lower() == category.lower()]
    if material:
        filtered = [item for item in filtered if material.lower() in item.material.lower()]
    if color:
        filtered = [item for item in filtered if color.lower() in item.color.lower()]
    if min_price is not None:
        filtered = [item for item in filtered if item.price >= min_price]
    if max_price is not None:
        filtered = [item for item in filtered if item.price <= max_price]
    return filtered
