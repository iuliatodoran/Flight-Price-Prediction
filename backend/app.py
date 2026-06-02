from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import json
import numpy as np
import pandas as pd

NN_MODEL = joblib.load('nn_pipeline.pkl')
POLY_MODEL = joblib.load('poly_pipeline.pkl')

with open('feature_columns.json', 'r') as f:
    FEATURE_COLUMNS = json.load(f)

# Statistici din dataset pentru indicatorul de pret
df_stats = pd.read_csv('Clean_Dataset.csv')
if 'Unnamed: 0' in df_stats.columns:
    df_stats = df_stats.drop('Unnamed: 0', axis=1)

PRICE_STATS = {
    "min": float(df_stats['price'].min()),
    "max": float(df_stats['price'].max()),
    "mean": float(df_stats['price'].mean()),
    "p25": float(df_stats['price'].quantile(0.25)),
    "p50": float(df_stats['price'].quantile(0.50)),
    "p75": float(df_stats['price'].quantile(0.75)),
}

# Distributia preturilor pentru grafic (50 de bins)
hist_counts, hist_edges = np.histogram(df_stats['price'], bins=50)
PRICE_DISTRIBUTION = {
    "counts": hist_counts.tolist(),
    "edges": hist_edges.tolist(),
}

# Top 5 factori de influenta (din coeficientii regresiei liniare)
TOP_FACTORS = [
    {"factor": "Clasa (Business)", "impact": "foarte mare", "direction": "up"},
    {"factor": "Zile ramase pana la zbor", "impact": "mare", "direction": "down"},
    {"factor": "Compania aeriana", "impact": "mare", "direction": "mixed"},
    {"factor": "Numarul de escale", "impact": "mediu", "direction": "up"},
    {"factor": "Durata zborului", "impact": "mediu", "direction": "up"},
]

MODEL_METRICS = {
    "nn": {
        "r2_test": 0.9704035097964436,
        "r2_train": 0.971536711410308,
        "mae": 0.1346824685668715,
        "rmse": 0.19132525384926238
    },
    "poly": {
        "r2_test": 0.9254,
        "mae": 0.2376,
        "rmse": 0.3040
    },
}

app = FastAPI(title="Flight Price Prediction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictRequest(BaseModel):
    features: dict

def build_input_df(features: dict) -> pd.DataFrame:
    row = {col: features.get(col, None) for col in FEATURE_COLUMNS}
    return pd.DataFrame([row], columns=FEATURE_COLUMNS)

def to_price(y_log: float) -> float:
    return float(np.expm1(y_log))

@app.get("/metadata")
def metadata():
    return {
        "feature_columns": FEATURE_COLUMNS,
        "metrics": MODEL_METRICS
    }

@app.get("/options")
def options():
    return {
        "airline": ["Air_India", "AirAsia", "GO_FIRST", "Indigo", "SpiceJet", "Vistara"],
        "source_city": ["Bangalore", "Chennai", "Delhi", "Hyderabad", "Kolkata", "Mumbai"],
        "destination_city": ["Bangalore", "Chennai", "Delhi", "Hyderabad", "Kolkata", "Mumbai"],
        "departure_time": ["Afternoon", "Early_Morning", "Evening", "Late_Night", "Morning", "Night"],
        "arrival_time": ["Afternoon", "Early_Morning", "Evening", "Late_Night", "Morning", "Night"],
        "stops": ["one", "two_or_more", "zero"],
        "class": ["Business", "Economy"]
    }

@app.get("/stats")
def stats():
    return {
        "price_stats": PRICE_STATS,
        "price_distribution": PRICE_DISTRIBUTION,
        "top_factors": TOP_FACTORS,
    }

@app.post("/predict")
def predict(request: PredictRequest):
    X_in = build_input_df(request.features)
    y_log = float(NN_MODEL.predict(X_in)[0])
    price = to_price(y_log)
    return {
        "model": "nn",
        "predicted_log_price": y_log,
        "predicted_price": price
    }

@app.post("/compare")
def compare(request: PredictRequest):
    X_in = build_input_df(request.features)

    y_nn_log = float(NN_MODEL.predict(X_in)[0])
    y_poly_log = float(POLY_MODEL.predict(X_in)[0])

    nn_price = to_price(y_nn_log)
    poly_price = to_price(y_poly_log)

    delta_abs = poly_price - nn_price
    delta_pct = (delta_abs / nn_price * 100) if nn_price != 0 else None

    return {
        "nn": {
            "predicted_log_price": y_nn_log,
            "predicted_price": nn_price
        },
        "poly": {
            "predicted_log_price": y_poly_log,
            "predicted_price": poly_price
        },
        "delta": {
            "absolute": delta_abs,
            "percentage": delta_pct
        },
        "metrics": MODEL_METRICS
    }