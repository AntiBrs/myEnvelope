from datetime import date

import pandas as pd

from backend.forecast import (
    average_monthly_prediction,
    forecast_user_monthly,
    seasonal_naive_prediction,
)


def history(months, start="2024-01-01", category="Food"):
    dates = pd.date_range(start=start, periods=months, freq="MS")
    return [
        {"date": stamp.date(), "amount": float(index + 1), "category": category}
        for index, stamp in enumerate(dates)
    ]


def test_short_history_uses_monthly_average():
    result = forecast_user_monthly(
        history(3), "Food", date(2024, 4, 1), months=2
    )

    assert result["predicted"].tolist() == [2.0, 2.0]


def test_twelve_month_history_repeats_seasonal_pattern():
    result = forecast_user_monthly(
        history(12), "Food", date(2025, 1, 1), months=3
    )

    assert result["predicted"].tolist() == [1.0, 2.0, 3.0]


def test_average_forecast_keeps_category_and_dates():
    observed = pd.Series([100.0, 200.0, 300.0])
    result = average_monthly_prediction(
        observed, pd.Timestamp("2026-01-01"), months=2, category="Housing"
    )

    assert result["category"].tolist() == ["Housing", "Housing"]
    assert result["predicted"].tolist() == [200.0, 200.0]


def test_seasonal_naive_never_returns_negative_amounts():
    observed = pd.Series(
        [-50.0] + [25.0] * 11,
        index=pd.date_range("2025-01-01", periods=12, freq="MS"),
    )
    result = seasonal_naive_prediction(
        observed, pd.Timestamp("2026-01-01"), months=1, category="Other"
    )

    assert result.iloc[0]["predicted"] == 0.0
