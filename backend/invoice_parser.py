import csv
import os
import re
import unicodedata

from collections import defaultdict
from datetime import datetime
from pathlib import Path

from rapidfuzz import fuzz


# ----------------------------------------------------------
# Szöveg normalizálása
# ----------------------------------------------------------

def normalize(text: str) -> str:
    if not text:
        return ""

    text = text.lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    text = re.sub(r"\s+", " ", text)

    return text.strip()


# ----------------------------------------------------------
# CSV betöltése
# ----------------------------------------------------------

def load_keywords(csv_name):
    csv_path = Path(__file__).resolve().with_name(csv_name)

    if not csv_path.exists():
        return []

    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    result = []
    for row in rows:
        result.append({
            "keyword": normalize(row.get("keyword", "")),
            "priority": int(row.get("priority", 50)),
            "category": row.get("category", "Other"),
            "subcategory": row.get("subcategory", "Other")
        })

    return result


CATEGORY_KEYWORDS = load_keywords("category_keywords.csv")
VENDOR_KEYWORDS = load_keywords("vendor_keywords.csv")


# ----------------------------------------------------------
# Fuzzy egyezés
# ----------------------------------------------------------

def match_keyword(text, keywords, threshold=80):
    text = normalize(text)

    best = None
    best_score = 0
    best_priority = 0

    for row in keywords:
        score = fuzz.partial_ratio(row["keyword"], text)

        if score < threshold:
            continue

        priority = row["priority"]

        if score > best_score or (score == best_score and priority > best_priority):
            best = row
            best_score = score
            best_priority = priority

    if not best:
        return None

    return {
        "category": best["category"],
        "subcategory": best["subcategory"],
        "score": best_score
    }


# ----------------------------------------------------------
# Document AI konfiguráció
# ----------------------------------------------------------

def load_documentai_config():
    config = {
        "project_id": os.getenv("DOCUMENTAI_PROJECT_ID", ""),
        "location": os.getenv("DOCUMENTAI_LOCATION", "eu"),
        "processor_id": os.getenv("DOCUMENTAI_PROCESSOR_ID", ""),
        "processor_endpoint": os.getenv("DOCUMENTAI_ENDPOINT", ""),
    }

    missing = [
        name
        for name, value in {
            "DOCUMENTAI_PROJECT_ID": config["project_id"],
            "DOCUMENTAI_PROCESSOR_ID": config["processor_id"],
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(
            "Missing Document AI configuration: " + ", ".join(missing)
        )

    return config


# ----------------------------------------------------------
# Document AI importálása
# ----------------------------------------------------------

def _import_documentai():
    from google.cloud import documentai_v1
    return documentai_v1


def _default_endpoint(location):
    location = location.lower()

    if location.startswith("eu"):
        return "eu-documentai.googleapis.com"

    return "us-documentai.googleapis.com"


def parse_documentai_invoice(
    invoice_bytes,
    mime_type="application/pdf",
    project_id=None,
    location=None,
    processor_id=None,
    processor_endpoint=None
):
    documentai = _import_documentai()
    config = load_documentai_config()

    project_id = project_id or config["project_id"]
    location = location or config["location"]
    processor_id = processor_id or config["processor_id"]
    processor_endpoint = processor_endpoint or config["processor_endpoint"] or _default_endpoint(location)

    client = documentai.DocumentProcessorServiceClient(
        client_options={"api_endpoint": processor_endpoint}
    )

    processor_name = (
        f"projects/{project_id}"
        f"/locations/{location}"
        f"/processors/{processor_id}"
    )

    raw_document = documentai.RawDocument(
        content=invoice_bytes,
        mime_type=mime_type
    )

    request = documentai.ProcessRequest(
        name=processor_name,
        raw_document=raw_document
    )

    result = client.process_document(request=request)
    return result.document


# ----------------------------------------------------------
# Ár feldolgozása
# ----------------------------------------------------------

def parse_price(value):
    if value is None:
        return None

    value = str(value)
    value = re.sub(r"[^\d.,-]", "", value)

    # Román/EU formátum:
    # 1.234,56
    if "," in value and "." in value:
        if value.rfind(",") > value.rfind("."):
            value = value.replace(".", "")
            value = value.replace(",", ".")
        else:
            value = value.replace(",", "")
    elif "," in value:
        value = value.replace(",", ".")

    try:
        return float(value)
    except ValueError:
        return None


# ----------------------------------------------------------
# Kategória pontozása
# ----------------------------------------------------------

def score_items(items):
    scores = defaultdict(float)
    matched_items = []

    for item in items:
        result = match_keyword(item, CATEGORY_KEYWORDS, threshold=80)

        if result is None:
            continue

        key = (result["category"], result["subcategory"])
        weighted_score = result["score"] + 20
        scores[key] += weighted_score

        matched_items.append({
            "item": item,
            "category": result["category"],
            "subcategory": result["subcategory"],
            "score": weighted_score
        })

    return scores, matched_items


# ----------------------------------------------------------
# Szállító fallback
# ----------------------------------------------------------

def vendor_category(vendor):
    if not vendor:
        return None

    return match_keyword(vendor, VENDOR_KEYWORDS, threshold=75)


def extract_document_entities(document):
    """Return de-duplicated Document AI entities without logging receipt data."""
    entities = defaultdict(list)
    seen = set()

    if not hasattr(document, "entities"):
        return entities

    for entity in document.entities:
        entity_type = normalize(entity.type_)
        value = entity.mention_text.strip()

        if not value:
            continue

        key = (entity_type, normalize(value))
        if key in seen:
            continue

        seen.add(key)
        entities[entity_type].append(value)

    return entities


def choose_category(vendor, items):
    scores, matched_items = score_items(items)

    if scores:
        winner = max(scores.items(), key=lambda item: item[1])[0]
        return {
            "category": winner[0],
            "subcategory": winner[1],
            "matched_items": matched_items,
        }

    vendor_match = vendor_category(vendor)
    if vendor_match:
        return {
            "category": vendor_match["category"],
            "subcategory": vendor_match["subcategory"],
            "matched_items": [],
        }

    return {
        "category": "Other",
        "subcategory": "Other",
        "matched_items": [],
    }


# ----------------------------------------------------------
# Kiadási rekordok összeállítása
# ----------------------------------------------------------

def extract_expense_records_from_document(document):
    entities = extract_document_entities(document)

    vendor = ""
    if entities.get("vendor"):
        vendor = entities["vendor"][0]

    items = entities.get("item", [])

    total = None
    if entities.get("price"):
        for price in entities["price"]:
            value = parse_price(price)
            if value is not None:
                if total is None or value > total:
                    total = value

    if total is None:
        total = 0.0

    category = choose_category(vendor, items)
    today = datetime.utcnow().date().isoformat()

    record = {
        "date": today,
        "vendor": vendor,
        "amount": total,
        "category": category["category"],
        "subcategory": category["subcategory"],
        "description": vendor if vendor else "Invoice"
    }

    return [record]


# ----------------------------------------------------------
# Nyilvános API
# ----------------------------------------------------------

def parse_invoice_to_expense_records(
    invoice_bytes,
    mime_type="application/pdf",
    project_id=None,
    location=None,
    processor_id=None,
    processor_endpoint=None
):
    document = parse_documentai_invoice(
        invoice_bytes=invoice_bytes,
        mime_type=mime_type,
        project_id=project_id,
        location=location,
        processor_id=processor_id,
        processor_endpoint=processor_endpoint
    )

    records = extract_expense_records_from_document(document)

    return records
