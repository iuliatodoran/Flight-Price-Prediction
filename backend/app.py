from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import json
import os
import re
import unicodedata
from datetime import date, timedelta
import numpy as np
import pandas as pd
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = None
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    GEMINI_MODEL = genai.GenerativeModel("gemini-2.5-flash")

NN_MODEL = joblib.load('nn_pipeline.pkl')
POLY_MODEL = joblib.load('poly_pipeline.pkl')

with open('feature_columns.json', 'r') as f:
    FEATURE_COLUMNS = json.load(f)

# Statistici din dataset pentru indicatorul de pret
df_stats = pd.read_csv('Clean_Dataset.csv')
if 'Unnamed: 0' in df_stats.columns:
    df_stats = df_stats.drop('Unnamed: 0', axis=1)

# Modelele au fost antrenate doar pe acest interval de duration/days_left;
# in afara lui, scaler-ul si modelele extrapoleaza si dau predictii nerealiste.
TRAINING_RANGES = {
    "duration": (float(df_stats['duration'].min()), float(df_stats['duration'].max())),
    "days_left": (float(df_stats['days_left'].min()), float(df_stats['days_left'].max())),
}

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

CITIES = ["Bangalore", "Chennai", "Delhi", "Hyderabad", "Kolkata", "Mumbai"]
FLIGHT_CLASSES = ["Economy", "Business"]

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
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictRequest(BaseModel):
    features: dict

class ChatRequest(BaseModel):
    message: str

def clamp_to_training_range(features: dict) -> dict:
    clamped = dict(features)
    for col, (lo, hi) in TRAINING_RANGES.items():
        value = clamped.get(col)
        if value is not None:
            clamped[col] = min(max(float(value), lo), hi)
    return clamped

def build_input_df(features: dict) -> pd.DataFrame:
    features = clamp_to_training_range(features)
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
        "source_city": CITIES,
        "destination_city": CITIES,
        "departure_time": ["Afternoon", "Early_Morning", "Evening", "Late_Night", "Morning", "Night"],
        "arrival_time": ["Afternoon", "Early_Morning", "Evening", "Late_Night", "Morning", "Night"],
        "stops": ["one", "two_or_more", "zero"],
        "class": FLIGHT_CLASSES
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

# --- Asistent AI (Gemini) ---
# Modelul a fost antrenat pe days_left intre 1 si 49 (vezi TRAINING_RANGES);
# acoperim tot intervalul ca sa gasim ziua exacta de zbor cu pretul minim.
DAYS_LEFT_SAMPLES = list(range(1, 50))

RO_MONTHS = [
    "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
    "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
]

def format_ro_date(d: date) -> str:
    return f"{d.day} {RO_MONTHS[d.month - 1]} {d.year}"

CHAT_DEFAULT_FEATURES = {
    "airline": "Vistara",
    "flight": "",
    "departure_time": "Morning",
    "arrival_time": "Evening",
    "stops": "zero",
    "duration": 2.5,
}

def _normalize(text: str) -> str:
    text = text.lower()
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c))

# Cuvinte care de obicei preced orasul de plecare / destinatie in romana,
# folosite pentru a distinge "din X spre Y" de simpla ordine de mentionare.
_SOURCE_PREFIX_RE = re.compile(r"\b(din|de la|dinspre)\s*$")
_DEST_PREFIX_RE = re.compile(r"\b(spre|catre|inspre|in|la|pana in|pana la|pina in|pina la)\s*$")

def extract_trip_info(message: str) -> dict | None:
    """Identifica orasele si clasa local (fara Gemini) — orasele formeaza o lista mica si fixa,
    iar un apel LLM pentru asta ar dubla degeaba consumul din cota zilnica gratuita."""
    norm = _normalize(message)

    mentions = []
    for city in CITIES:
        city_norm = _normalize(city.replace("_", " "))
        match = re.search(re.escape(city_norm), norm)
        if match:
            mentions.append((match.start(), city))
    mentions.sort()

    source = None
    destination = None
    for pos, city in mentions:
        prefix = norm[:pos].rstrip()
        if source is None and _SOURCE_PREFIX_RE.search(prefix):
            source = city
        elif destination is None and _DEST_PREFIX_RE.search(prefix):
            destination = city

    remaining = [city for _, city in mentions if city not in (source, destination)]
    if source is None and remaining:
        source = remaining.pop(0)
    if destination is None and remaining:
        destination = remaining.pop(0)

    flight_class = None
    if re.search(r"\bbusiness\b", norm):
        flight_class = "Business"
    elif re.search(r"\beconomy\b|\beconomic", norm):
        flight_class = "Economy"

    return {"source_city": source, "destination_city": destination, "flight_class": flight_class}

def predict_price_curve(source_city: str, destination_city: str, flight_class: str) -> list[dict]:
    curve = []
    for days_left in DAYS_LEFT_SAMPLES:
        features = {
            **CHAT_DEFAULT_FEATURES,
            "source_city": source_city,
            "destination_city": destination_city,
            "class": flight_class,
            "days_left": days_left,
        }
        X_in = build_input_df(features)
        y_log = float(NN_MODEL.predict(X_in)[0])
        curve.append({"days_left": days_left, "predicted_price": to_price(y_log)})
    return curve

def generate_chat_reply(message: str, trip: dict, curve: list[dict]) -> str:
    today = date.today()
    cheapest = min(curve, key=lambda x: x["predicted_price"])
    priciest = max(curve, key=lambda x: x["predicted_price"])
    cheapest_flight_date = today + timedelta(days=cheapest["days_left"])

    # Top 3 cele mai ieftine zile, ca alternative concrete daca data exacta nu e convenabila
    cheapest_alternatives = sorted(curve, key=lambda x: x["predicted_price"])[:3]
    alternatives_text = "\n".join(
        f"- zbor pe {format_ro_date(today + timedelta(days=c['days_left']))} "
        f"(cumperi cu {c['days_left']} zile inainte) -> ~{c['predicted_price']:.0f} INR"
        for c in cheapest_alternatives
    )

    prompt = f"""Esti asistentul AI al aplicatiei SkyTiming, care recomanda cel mai bun moment de cumparare a biletelor de avion
pe baza unui model de Machine Learning antrenat pe date reale de zboruri din India (R² ≈ 0.97).

Intrebarea utilizatorului: "{message}"

Ruta identificata: {trip['source_city']} -> {trip['destination_city']}, clasa {trip['flight_class']}.
Data de azi: {format_ro_date(today)}.

Presupunem ca utilizatorul cumpara biletul AZI. Modelul a calculat pretul estimat pentru fiecare zi de zbor posibila
(in functie de cu cate zile inainte se cumpara fata de data zborului). Iata cele mai ieftine 3 optiuni concrete:
{alternatives_text}

Cea mai ieftina optiune: daca alege un zbor care pleaca pe {format_ro_date(cheapest_flight_date)}
(adica cumpara biletul cu {cheapest['days_left']} zile inainte de zbor), pretul estimat este ~{cheapest['predicted_price']:.0f} INR.
Cea mai scumpa optiune din interval: zbor pe {format_ro_date(today + timedelta(days=priciest['days_left']))}
(~{priciest['predicted_price']:.0f} INR).

Scrie un raspuns prietenos in limba romana (3-5 propozitii, fara markdown), care:
- mentioneaza ruta si clasa identificate,
- da o recomandare CONCRETA si DIRECT ACTIONABILA: ce data exacta de zbor sa aleaga (nu doar "cu X zile inainte"),
  pentru ca utilizatorul cumpara biletul chiar azi,
- poate mentiona pe scurt 1-2 alternative din lista de mai sus daca data exacta nu e convenabila pentru el,
- are un ton natural, de asistent personal, nu de raport tehnic.
"""
    response = GEMINI_MODEL.generate_content(prompt)
    return response.text.strip()

@app.post("/chat")
def chat(request: ChatRequest):
    if GEMINI_MODEL is None:
        return {
            "reply": "Asistentul AI nu este disponibil momentan (lipseste cheia API Gemini).",
            "trip": None,
            "price_curve": None,
        }

    trip = extract_trip_info(request.message)
    if not trip or not trip["source_city"] or not trip["destination_city"]:
        return {
            "reply": (
                "Nu am putut identifica ruta din intrebarea ta. "
                "Poti sa-mi spui orasul de plecare si destinatia? "
                f"Orase disponibile: {', '.join(CITIES)}."
            ),
            "trip": trip,
            "price_curve": None,
        }
    if trip["source_city"] == trip["destination_city"]:
        return {
            "reply": "Orasul de plecare si destinatia par sa fie identice — poti reformula ruta?",
            "trip": trip,
            "price_curve": None,
        }

    flight_class = trip["flight_class"] or "Economy"
    trip = {**trip, "flight_class": flight_class}
    curve = predict_price_curve(trip["source_city"], trip["destination_city"], flight_class)

    try:
        reply = generate_chat_reply(request.message, trip, curve)
    except Exception:
        cheapest = min(curve, key=lambda x: x["predicted_price"])
        best_date = format_ro_date(date.today() + timedelta(days=cheapest["days_left"]))
        reply = (
            f"Pentru ruta {trip['source_city']} -> {trip['destination_city']} ({flight_class}), "
            f"daca cumperi azi, cel mai ieftin ar fi sa alegi un zbor care pleaca pe {best_date} "
            f"(~{cheapest['predicted_price']:.0f} INR)."
        )

    return {"reply": reply, "trip": trip, "price_curve": curve}