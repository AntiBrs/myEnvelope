from backend.invoice_parser import match_keyword, normalize, parse_price


def test_normalize_removes_accents_and_punctuation():
    assert normalize("Kávé, TEJ!") == "kave tej"


def test_parse_price_supports_european_number_format():
    assert parse_price("1.234,56 RON") == 1234.56


def test_keyword_match_prefers_highest_priority_on_tie():
    keywords = [
        {"keyword": "market", "priority": 40, "category": "Other", "subcategory": "Other"},
        {"keyword": "market", "priority": 90, "category": "Food", "subcategory": "Groceries"},
    ]

    result = match_keyword("Local Market", keywords)

    assert result["category"] == "Food"
    assert result["subcategory"] == "Groceries"
