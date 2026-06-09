import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
from pydantic import BaseModel
import joblib
import json
import os
import re
import unicodedata
import atexit
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import date, timedelta
import numpy as np
import pandas as pd
from dotenv import load_dotenv
import google.generativeai as genai
from supabase import create_client
from apscheduler.schedulers.background import BackgroundScheduler

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = None
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    GEMINI_MODEL = genai.GenerativeModel("gemini-2.5-flash")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
MAIL_USER = os.environ.get("MAIL_USER")
MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
INR_TO_RON = 0.054  # rata de conversie folosita in toata aplicatia

# Service key (nu anon key) — necesar pentru a citi emailurile userilor din auth.users
supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY) if SUPABASE_SERVICE_KEY else None

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

# MAE/RMSE sunt pe scala log (nu INR direct) — valorile mici reflecta scala logaritmica
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

# Permite orice port local (3000, 5173, etc.) — regex in loc de lista fixa
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
    # Coloanele lipsă devin None — pipeline-ul le tratează prin one-hot encoding
    features = clamp_to_training_range(features)
    row = {col: features.get(col, None) for col in FEATURE_COLUMNS}
    return pd.DataFrame([row], columns=FEATURE_COLUMNS)

def to_price(y_log: float) -> float:
    # Modelul a fost antrenat pe log(price+1), deci inversam cu expm1
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

# Compara NN vs regresia polinomiala — folosit in pagina Analiza ML
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

# Parametrii ficsi pentru curba de pret din chat — vrem sa izolam efectul days_left
CHAT_DEFAULT_FEATURES = {
    "airline": "Vistara",
    "flight": "",
    "departure_time": "Morning",
    "arrival_time": "Evening",
    "stops": "zero",
    "duration": 2.5,
}

def _normalize(text: str) -> str:
    # Elimina diacriticele si face lowercase — "București" == "Bucuresti" == "BUCURESTI"
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

# Returneaza 49 predictii (days_left 1..49) — Gemini le primeste ca context si alege optima
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
        f"(cumperi cu {c['days_left']} zile inainte) -> ~{c['predicted_price'] * INR_TO_RON:.0f} RON"
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
(adica cumpara biletul cu {cheapest['days_left']} zile inainte de zbor), pretul estimat este ~{cheapest['predicted_price'] * INR_TO_RON:.0f} RON.
Cea mai scumpa optiune din interval: zbor pe {format_ro_date(today + timedelta(days=priciest['days_left']))}
(~{priciest['predicted_price'] * INR_TO_RON:.0f} RON).

Scrie un raspuns prietenos in limba romana (3-5 propozitii, fara markdown), care:
- mentioneaza ruta si clasa identificate,
- da o recomandare CONCRETA si DIRECT ACTIONABILA: ce data exacta de zbor sa aleaga (nu doar "cu X zile inainte"),
  pentru ca utilizatorul cumpara biletul chiar azi,
- poate mentiona pe scurt 1-2 alternative din lista de mai sus daca data exacta nu e convenabila pentru el,
- foloseste moneda RON (lei romanesti) pentru toate preturile mentionate,
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
        # Fallback text daca Gemini esueaza (rate limit, eroare retea etc.)
        cheapest = min(curve, key=lambda x: x["predicted_price"])
        best_date = format_ro_date(date.today() + timedelta(days=cheapest["days_left"]))
        reply = (
            f"Pentru ruta {trip['source_city']} -> {trip['destination_city']} ({flight_class}), "
            f"daca cumperi azi, cel mai ieftin ar fi sa alegi un zbor care pleaca pe {best_date} "
            f"(~{cheapest['predicted_price'] * INR_TO_RON:.0f} RON)."
        )

    return {"reply": reply, "trip": trip, "price_curve": curve}


# --- Alerte automate pe email ---

_ALERT_AIRLINE_DEFAULTS = {
    "Vistara":   {"stops": "zero",        "departure_time": "Morning",       "arrival_time": "Afternoon", "duration": 2.0},
    "Indigo":    {"stops": "one",          "departure_time": "Evening",       "arrival_time": "Night",     "duration": 3.5},
    "Air_India": {"stops": "zero",         "departure_time": "Early_Morning", "arrival_time": "Morning",   "duration": 2.2},
    "SpiceJet":  {"stops": "one",          "departure_time": "Morning",       "arrival_time": "Evening",   "duration": 4.0},
    "GO_FIRST":  {"stops": "two_or_more",  "departure_time": "Afternoon",     "arrival_time": "Night",     "duration": 5.5},
    "AirAsia":   {"stops": "one",          "departure_time": "Night",         "arrival_time": "Morning",   "duration": 6.0},
}

def _send_alert_email(to_email: str, alert: dict, predicted_price: float) -> None:
    price_ron = predicted_price * INR_TO_RON
    threshold_ron = alert["price_threshold"] * INR_TO_RON
    route = f"{alert.get('source_city', '')} → {alert.get('destination_city', '')}"
    flight_date_str = alert.get("flight_date", "necunoscută")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"SkyTiming: Moment bun de cumpărat — {route}"
    msg["From"] = MAIL_USER
    msg["To"] = to_email

    body = (
        f"Salut!\n\n"
        f"Prețul estimat pentru zborul tău monitorizat a scăzut sub pragul setat.\n\n"
        f"Rută:              {route}\n"
        f"Companie:          {alert.get('airline', '')}\n"
        f"Clasă:             {alert.get('class', 'Economy')}\n"
        f"Data zborului:     {flight_date_str}\n\n"
        f"Preț estimat:      {price_ron:.0f} RON\n"
        f"Pragul tău:        {threshold_ron:.0f} RON\n\n"
        f"Acesta este un moment bun de cumpărat!\n\n"
        f"Deschide aplicația SkyTiming pentru mai multe detalii.\n"
    )
    msg.attach(MIMEText(body, "plain", "utf-8"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(MAIL_USER, MAIL_PASSWORD)
        server.sendmail(MAIL_USER, to_email, msg.as_string())

def check_and_send_alerts() -> None:
    if not supabase_admin or not MAIL_USER or not MAIL_PASSWORD:
        logging.warning("check_and_send_alerts: lipsesc credențiale (supabase_admin/MAIL_USER/MAIL_PASSWORD)")
        return

    try:
        resp = supabase_admin.from_("favorites").select("*").not_.is_("price_threshold", "null").execute()
        alerts = resp.data or []
    except Exception as e:
        logging.error(f"check_and_send_alerts: eroare la citirea alertelor din Supabase: {e}")
        return

    logging.info(f"check_and_send_alerts: procesez {len(alerts)} alertă/alerte")
    today = date.today()
    sent = 0

    for alert in alerts:
        fav_id = alert.get("id")
        flight_date_str = alert.get("flight_date")
        if not flight_date_str:
            logging.info(f"  [{fav_id}] skip — fără flight_date")
            continue

        try:
            flight_date_obj = date.fromisoformat(str(flight_date_str)[:10])
            days_left = (flight_date_obj - today).days
        except (ValueError, TypeError) as e:
            logging.warning(f"  [{fav_id}] skip — flight_date invalid: {e}")
            continue

        if days_left <= 0:
            logging.info(f"  [{fav_id}] skip — zborul a trecut (days_left={days_left})")
            continue

        # Clampam manual aici pentru ca build_input_df face acelasi lucru, dar vrem valoarea in log
        lo, hi = int(TRAINING_RANGES["days_left"][0]), int(TRAINING_RANGES["days_left"][1])
        days_left_clamped = min(max(days_left, lo), hi)

        airline = alert.get("airline", "Indigo")
        d = _ALERT_AIRLINE_DEFAULTS.get(airline, _ALERT_AIRLINE_DEFAULTS["Indigo"])

        features = {
            "airline": airline,
            "flight": "",
            "source_city": alert.get("source_city"),
            "destination_city": alert.get("destination_city"),
            "departure_time": alert.get("departure_time") or d["departure_time"],
            "arrival_time": alert.get("arrival_time") or d["arrival_time"],
            "stops": alert.get("stops") or d["stops"],
            "class": alert.get("class", "Economy"),
            "duration": alert.get("duration") or d["duration"],
            "days_left": days_left_clamped,
        }

        X_in = build_input_df(features)
        predicted_price = to_price(float(NN_MODEL.predict(X_in)[0]))
        threshold = alert["price_threshold"]
        logging.info(f"  [{fav_id}] predicție={predicted_price:.0f} INR, prag={threshold} INR, days_left={days_left}")

        if predicted_price <= threshold:
            try:
                user_resp = supabase_admin.auth.admin.get_user_by_id(alert["user_id"])
                user_email = user_resp.user.email if user_resp and user_resp.user else None
                if user_email:
                    _send_alert_email(user_email, alert, predicted_price)
                    logging.info(f"  [{fav_id}] email trimis la {user_email}")
                    sent += 1
                else:
                    logging.warning(f"  [{fav_id}] email negăsit pentru user_id={alert['user_id']}")
            except Exception as e:
                logging.error(f"  [{fav_id}] eroare la trimiterea emailului: {e}")

    logging.info(f"check_and_send_alerts: terminat — {sent} email(uri) trimise")

# Porneste la startup si ruleaza la fiecare 24h; atexit il opreste cand serverul se inchide
_scheduler = BackgroundScheduler()
_scheduler.add_job(check_and_send_alerts, "interval", hours=24)
_scheduler.start()
atexit.register(lambda: _scheduler.shutdown(wait=False))

@app.post("/test-alerts")
def test_alerts():
    """Declanșează manual verificarea alertelor (doar pentru testare)."""
    try:
        check_and_send_alerts()
        return {"status": "ok", "message": "Verificare completă — vezi logurile serverului pentru detalii"}
    except Exception as e:
        return {"status": "error", "message": str(e)}