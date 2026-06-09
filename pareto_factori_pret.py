import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.ticker as mtick
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline

# ── Date ─────────────────────────────────────────────────────────────────────
df = pd.read_csv("backend/Clean_Dataset.csv")
if "Unnamed: 0" in df.columns:
    df = df.drop("Unnamed: 0", axis=1)

num_features = ["duration", "days_left"]
Q1, Q3 = df[num_features].quantile(0.25), df[num_features].quantile(0.75)
IQR = Q3 - Q1
df = df[~((df[num_features] < Q1 - 1.5 * IQR) | (df[num_features] > Q3 + 1.5 * IQR)).any(axis=1)]

cat_features = [
    "airline", "source_city", "departure_time", "stops",
    "arrival_time", "destination_city", "class"
]

X = df.drop("price", axis=1)
y = np.log1p(df["price"])

# ── Model ─────────────────────────────────────────────────────────────────────
pipe = Pipeline([
    ("pre", ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), cat_features),
        ("num", StandardScaler(), num_features),
    ])),
    ("lr", LinearRegression()),
])
pipe.fit(X, y)

# ── Extragere coeficienți ─────────────────────────────────────────────────────
ohe = pipe.named_steps["pre"].named_transformers_["cat"]
cat_cols = list(ohe.get_feature_names_out(cat_features))
all_cols = cat_cols + num_features
coefs = pipe.named_steps["lr"].coef_

coef_df = pd.DataFrame({"feature": all_cols, "coef": coefs})

def get_group(fname):
    for orig in cat_features:
        if fname.startswith(orig + "_"):
            return orig
    return fname

coef_df["group"] = coef_df["feature"].apply(get_group)

# Calcul impact
group_impact = {}
for grp, sub in coef_df.groupby("group"):
    if grp in num_features:
        group_impact[grp] = abs(sub["coef"].iloc[0])
    else:
        group_impact[grp] = sub["coef"].max() - sub["coef"].min()

labels_ro = {
    "class":            "Clasa (Business/Economy)",
    "days_left":        "Zile rămase până la zbor",
    "airline":          "Compania aeriană",
    "stops":            "Număr de escale",
    "duration":         "Durata zborului",
    "source_city":      "Oraș de plecare",
    "destination_city": "Oraș de destinație",
    "departure_time":   "Oră de plecare",
    "arrival_time":     "Oră de sosire",
}

# Sortare descrescătoare
items = sorted(group_impact.items(), key=lambda x: x[1], reverse=True)
labels = [labels_ro.get(k, k) for k, _ in items]
values = [v for _, v in items]

total = sum(values)
# Calculăm valorile cumulate ca sumă brută pentru a le mapa pe axa stângă
cumulative_values = np.cumsum(values) 
# Procentul calculat corect pentru axa dreaptă
cumulative_perc = (cumulative_values / total) * 100

# ── Grafic Pareto Modificat ───────────────────────────────────────────────────
fig, ax1 = plt.subplots(figsize=(12, 6.5)) # Mărit puțin pe înălțime pentru etichete

bars = ax1.bar(labels, values, color="#2c5f8a", edgecolor="#1a3f5c",
               linewidth=0.8, zorder=2)
ax1.set_ylabel("Amplitudinea coeficientului (scala log-preț)", fontsize=11)
ax1.set_xlabel("Factor de influență", fontsize=11)
ax1.set_xticks(range(len(labels)))
# Am mărit rotația la 35 de grade pentru a elimina suprapunerile de text
ax1.set_xticklabels(labels, rotation=35, ha="right", fontsize=10)
ax1.grid(axis="y", linestyle="--", alpha=0.4, zorder=1)

# CRUCIAL PENTRU PARETO: Alinierea axelor stânga-dreapta
ax1.set_ylim(0, total * 1.05) 

ax2 = ax1.twinx()
# Plotăm linia roșie direct raportată la procentul corect
ax2.plot(range(len(labels)), cumulative_perc, color="#d62728", marker="o",
         linewidth=2, markersize=6, label="Pondere cumulativă (%)", zorder=3)

ax2.axhline(y=80, color="#d62728", linestyle="--", linewidth=1, alpha=0.55, zorder=2)
ax2.text(len(labels) - 0.6, 82, "Prag 80%", color="#d62728", fontsize=9, ha="right")

ax2.yaxis.set_major_formatter(mtick.PercentFormatter())
ax2.set_ylabel("Pondere cumulativă (%)", fontsize=11)
# Forțăm axa procentuală să fie fix de la 0 la 105%, perfect aliniată cu axa stângă
ax2.set_ylim(0, 105) 

# Adăugare etichete de valori deasupra barelor
for bar, val in zip(bars, values):
    ax1.text(
        bar.get_x() + bar.get_width() / 2,
        bar.get_height() + total * 0.01,
        f"{val:.3f}", ha="center", va="bottom", fontsize=8,
    )

ax1.set_title(
    "Grafic Pareto – contribuția factorilor la variația prețului biletelor de avion\n"
    "(amplitudinea coeficienților regresiei liniare, pe scala log-preț)",
    fontsize=12, pad=14,
)
ax2.legend(loc="center right", fontsize=9)
fig.tight_layout()
fig.savefig("pareto_factori_pret.png", dpi=200, bbox_inches="tight")
print("Salvat corect: pareto_factori_pret.png")
plt.show()