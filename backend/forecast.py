import logging

import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX
import warnings

logger = logging.getLogger(__name__)

# Különböző előrejelzési módszerek küszöbértékei
SEASONAL_NAIVE_MIN_MONTHS = 12
SARIMA_MIN_MONTHS = 24


def build_forecast_dataset(records):
    df = pd.DataFrame(records)
    if df.empty:
        return df

    # Normalize dates before monthly aggregation.
    df['date'] = pd.to_datetime(df['date'])
    return df


def build_monthly_series(df, category, forecast_start):
    cat_df = df[df['category'] == category].sort_values('date')
    if cat_df.empty:
        return pd.Series(dtype=float), pd.DataFrame(columns=['date', 'amount'])

    cat_df = cat_df.copy()
    cat_df['year_month'] = cat_df['date'].dt.to_period('M')
    monthly_df = cat_df.groupby('year_month', as_index=False).agg({'amount': 'sum'})

    if monthly_df.empty:
        return pd.Series(dtype=float), pd.DataFrame(columns=['date', 'amount'])

    # Havi összesítés, majd teljes hónaplista a hiányzó hónapok miatt
    monthly_df['date'] = monthly_df['year_month'].dt.to_timestamp()
    monthly_df = monthly_df[['date', 'amount']].set_index('date').sort_index()

    full_range = pd.date_range(start=monthly_df.index.min(), end=monthly_df.index.max(), freq='MS')
    monthly_df = monthly_df.reindex(full_range)
    monthly_df['amount'] = monthly_df['amount'].ffill().bfill()
    monthly_df = monthly_df.dropna()

    observed_monthly = monthly_df['amount'].astype(float)
    regular_monthly = monthly_df.reset_index().rename(columns={'index': 'date'}).copy()
    regular_monthly['date'] = pd.to_datetime(regular_monthly['date'])
    regular_monthly['category'] = category

    return observed_monthly, regular_monthly


def average_monthly_prediction(observed_monthly, forecast_start, months=12, category=None):
    if len(observed_monthly) == 0:
        return pd.DataFrame(columns=['date', 'predicted', 'category'])

    # Kevés adatnál az átlag a stabil alap
    avg = float(observed_monthly.mean())
    dates = pd.date_range(start=forecast_start, periods=months, freq='MS')
    result = pd.DataFrame({'date': dates, 'predicted': avg})
    if category is not None:
        result['category'] = category
    return result


def seasonal_naive_prediction(observed_monthly, forecast_start, months=12, category=None):
    if len(observed_monthly) < SEASONAL_NAIVE_MIN_MONTHS:
        return average_monthly_prediction(observed_monthly, forecast_start, months, category)

    # Repeat the latest observation for the same calendar month.
    latest_year = observed_monthly.tail(12)
    by_calendar_month = {
        timestamp.month: max(float(value), 0.0)
        for timestamp, value in latest_year.items()
    }
    dates = pd.date_range(start=forecast_start, periods=months, freq='MS')

    predicted = []
    for stamp in dates:
        predicted.append(by_calendar_month[stamp.month])

    result = pd.DataFrame({'date': dates, 'predicted': predicted})
    if category is not None:
        result['category'] = category
    return result


def train_category_model(df, category):
    cat_df = df[df['category'] == category].sort_values('date')

    if cat_df.empty:
        return None

    cat_df['year_month'] = cat_df['date'].dt.to_period('M')
    monthly_df = cat_df.groupby('year_month').agg({
        'amount': 'sum'
    }).reset_index()

    # Legalább 24 hónap kell a SARIMA stabil futásához
    if len(monthly_df) < SARIMA_MIN_MONTHS:
        return None

    monthly_df['date'] = monthly_df['year_month'].dt.to_timestamp()
    monthly_df = monthly_df.set_index('date')

    # Hiányzó hónapok kitöltése a folyamatos idősorhoz
    date_range = pd.date_range(start=monthly_df.index.min(), end=monthly_df.index.max(), freq='MS')
    monthly_df = monthly_df.reindex(date_range)
    monthly_df['amount'] = monthly_df['amount'].ffill().bfill()
    monthly_df = monthly_df.dropna()

    ts = monthly_df['amount'].astype(float)

    try:
        model = SARIMAX(ts, order=(1, 1, 1), seasonal_order=(1, 1, 1, 12),
                       enforce_stationarity=False, enforce_invertibility=False)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            fitted = model.fit(disp=False, maxiter=200)
        return fitted
    except Exception:
        logger.exception("SARIMA model fitting failed")
        return None


def predict_monthly(model, start_date, months=12, category=None):
    dates = pd.date_range(start=start_date, periods=months, freq='MS')

    try:
        # A modell előrejelzése a megadott hónapszámra
        preds = model.forecast(steps=months)
        df = pd.DataFrame({'date': dates, 'predicted': np.maximum(preds.values, 0)})
        if category is not None:
            df['category'] = category
        return df
    except Exception:
        logger.exception("Forecast generation failed")
        return None


def fallback_prediction(df, category, start_date, months=12):
    cat_df = df[df['category'] == category]
    if cat_df.empty:
        return None

    # Vészhelyzetben az átlagos havi érték marad a biztonságos alap
    avg = float(cat_df['amount'].mean())
    dates = pd.date_range(start=start_date, periods=months, freq='MS')
    result = []
    for d in dates:
        result.append({'date': d, 'predicted': avg, 'category': category})
    return pd.DataFrame(result)


def forecast_user_monthly(
    history_records,
    target_category,
    start_date,
    months=12,
):
    """Select a forecasting method using the number of actual monthly totals.

    Fewer than 12 months: mean of observed monthly totals.
    12-23 months: seasonal naive forecast.
    At least 24 months: fixed SARIMA, without backtesting.
    """
    if months <= 0:
        return pd.DataFrame(columns=['date', 'predicted', 'category'])

    # Kezdő dátum hónaphoz igazítása.
    forecast_start = pd.Timestamp(start_date).to_period('M').to_timestamp()
    df = build_forecast_dataset(history_records)
    if df.empty:
        return None

    observed_monthly, regular_monthly = build_monthly_series(
        df,
        target_category,
        forecast_start,
    )
    actual_month_count = len(observed_monthly)

    # Nincs elegendő megfigyelés a modellhez
    if actual_month_count == 0:
        return None

    if actual_month_count < SEASONAL_NAIVE_MIN_MONTHS:
        return average_monthly_prediction(
            observed_monthly,
            forecast_start,
            months,
            target_category,
        )

    # 12–23 hónapnál a szezonális naív módszer a jobb választás
    if actual_month_count < SARIMA_MIN_MONTHS:
        return seasonal_naive_prediction(
            observed_monthly,
            forecast_start,
            months,
            target_category,
        )

    model = train_category_model(regular_monthly, target_category)
    if model is not None:
        forecast_result = predict_monthly(
            model,
            forecast_start,
            months,
            target_category,
        )
        if forecast_result is not None:
            return forecast_result

    return seasonal_naive_prediction(
        observed_monthly,
        forecast_start,
        months,
        target_category,
    )
