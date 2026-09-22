"""Evaluacion HEB-aristo (ticket 07): set de 30 preguntas en 3 familias, contra el webhook del chat.

Por familia:
  cifras     -> exactitud vs SQL escrito a mano (determinista) + Faithfulness de RAGAS con el resultado
                de la herramienta SQL como contexto (que la respuesta no diga mas de lo que trajo la tabla).
  politicas  -> RAGAS: Faithfulness, ResponseRelevancy, LLMContextPrecisionWithReference, LLMContextRecall
                (referencia escrita a mano de los PDF) + cita esperada presente (determinista).
  trampas    -> las 22 trampas (T1-T12 de la auditoria; T13-T22 de tickets, inventario x politica y patrones PDF x CSV; T19 = cada turno, no diario), cada una con sus condiciones (cifra por SQL, regex esperadas y
                prohibidas) + Faithfulness y ResponseRelevancy de RAGAS.
  cruzadas   -> preguntas que obligan a usar las DOS herramientas: cifra por SQL + regla citada con documento
                (determinista) + Faithfulness y ResponseRelevancy.
  imposibles -> tasa de abstencion correcta (determinista). Sin RAGAS: faithfulness sin contexto da 0 aunque la
                abstencion sea perfecta.

Juez: NVIDIA Nemotron-3 Super 120B (gratis y DISTINTO del modelo evaluado, gpt-5-mini). Embeddings del juez:
nemotron-3-embed-1b. Los contextos recuperados se leen de la ejecucion de n8n (salida de las herramientas),
sin tocar el flujo.

Uso:  .venv/Scripts/python tests/ragas/correr.py [familia]
"""
import os
import json, os, re, sys, time, subprocess, datetime, urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(RAIZ)
ENV = {}
for l in open(".env", encoding="utf8"):
    l = l.strip()
    if "=" in l and not l.startswith("#"): k, v = l.split("=", 1); ENV[k] = v
API = ENV["N8N_BASE_URL"].rstrip("/"); CHAT = "ZpkluoNfIEbhI9K8"
FAMILIA = sys.argv[1] if len(sys.argv) > 1 else None

def http(url, body=None, headers=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json", **(headers or {})}, method="POST" if body else "GET")
    with urllib.request.urlopen(req, timeout=300) as r: return json.loads(r.read().decode())

def sql(q):
    return subprocess.run(["ssh", "-i", ENV["VPS_KEY"], "root@" + ENV["VPS_HOST"],
        f'docker exec bano_postgres psql -U bano -d bano -tA -c "{q}"'], capture_output=True, text=True, encoding="utf8", check=True).stdout.strip()

def contextos_de_la_ultima_ejecucion():
    """Textos que vio el agente: fragmentos del corpus y resultado del agente SQL anidado."""
    e = http(f"{API}/api/v1/executions?workflowId={CHAT}&limit=1&includeData=true", headers={"X-N8N-API-KEY": ENV["N8N_API_KEY"]})["data"][0]
    run = e["data"]["resultData"]["runData"]; ctx = []
    for nombre in ("consultar_politicas", "consultar_datos"):
        for x in run.get(nombre, []):
            for salida in (x.get("data") or {}).get("ai_tool", []):
                for item in salida:
                    j = item.get("json", {})
                    resp = j.get("response", j)
                    if isinstance(resp, list):
                        for d in resp:
                            # pgvector retrieve-as-tool: [{type:'text', text:'{"pageContent":...,"metadata":...}'}]
                            if isinstance(d, dict) and d.get("type") == "text":
                                try: d = json.loads(d["text"])
                                except Exception: d = {"pageContent": d["text"]}
                            t = d.get("pageContent") if isinstance(d, dict) else None
                            if t: ctx.append(t)
                    elif isinstance(resp, (dict, str)):
                        ctx.append(resp if isinstance(resp, str) else json.dumps(resp, ensure_ascii=False)[:4000])
    return ctx or ["(sin contexto recuperado)"], e["id"]

ABST = re.compile(r"no tengo|no puedo|no hay (una |un |la |el )?(datos|información|registro|política|documento|procedimiento)|no (existe|encontr[eé]|aparece)|no (puedo|es posible) (responder|saber|determinar)|no cuento con|no dispon|fuera del (alcance|periodo)|no está en", re.I)
HIPO = re.compile(r"quincena|clima|promoci[oó]n|día de pago|festivo|probablemente|posiblemente|quizá|tal vez|podría deberse|puede deberse", re.I)
def num(s): return float(re.sub(r"[^0-9.\-]", "", s) or "nan")
def contiene_numero(texto, esperado):
    # Devoluciones: la respuesta puede mostrar el monto negativo como positivo ("devoluciones: $4,451.00"); se compara en valor absoluto.
    n = abs(num(esperado))
    return any(abs(abs(num(m)) - n) <= max(0.01, n * 0.001) for m in re.findall(r"-?\$?\s?\d[\d,]*(?:\.\d+)?", texto) if re.search(r"\d", m))

# ---- 1. Preguntar y recolectar ----
preguntas = [p for p in json.load(open("tests/ragas/preguntas.json", encoding="utf8")) if not FAMILIA or p["familia"] == FAMILIA]
# SOLO=T17,T22 limita a esas trampas (para repetir un caso sin correr las 22)
if os.environ.get("SOLO"): preguntas = [p for p in preguntas if p.get("trampa") in os.environ["SOLO"].split(",")]
muestras = []
for p in preguntas:
    t0 = time.time()
    r = http(f"{API}{os.environ.get('CHAT_PATH', '/webhook/heb-aristo/chat')}", {"input": p["pregunta"]})
    ms = int((time.time() - t0) * 1000)
    # Guiones no separables (U+2011) y similares -> guion normal, para que las citas casen con las regex.
    respuesta = re.sub(r"[‐‑‒–−]", "-", str(r.get("respuesta") or r))
    ctx, exec_id = contextos_de_la_ultima_ejecucion()
    m = {"familia": p["familia"], "pregunta": p["pregunta"], "respuesta": respuesta, "contextos": ctx, "ms": ms, "exec": exec_id}
    if p["familia"] == "cifras":
        esperado = p.get("esperado_texto") or sql(p["sql"])
        m["esperado"] = esperado
        m["exacto"] = (esperado.lower() in respuesta.lower()) if "esperado_texto" in p else contiene_numero(respuesta, esperado)
        m["reference"] = f"La respuesta correcta es {esperado}."
    elif p["familia"] == "politicas":
        m["reference"] = p["referencia"]; m["cita_ok"] = bool(re.search(p["cita"], respuesta))
    elif p["familia"] == "trampas":
        # Cada trampa trae sus propias condiciones: numero(s) esperados por SQL, regex esperadas, regex prohibidas.
        cond = []
        for k in ("sql", "sql2"):
            if k in p:
                esperado = sql(p[k]); m.setdefault("esperado", []).append(esperado); cond.append(contiene_numero(respuesta, esperado))
        if "sql_cualquiera" in p:  # vale cualquiera de varias lecturas (dato diario o total del periodo)
            vals = [sql(q) for q in p["sql_cualquiera"]]; m.setdefault("esperado", []).append("|".join(vals)); cond.append(any(contiene_numero(respuesta, v) for v in vals))
        for k in ("esperado_regex", "esperado_regex2"):
            if k in p: cond.append(bool(re.search(p[k], respuesta, re.I)))
        if "prohibido_regex" in p: cond.append(not re.search(p["prohibido_regex"], respuesta, re.I))
        m["trampa"] = p["trampa"]; m["trampa_ok"] = all(cond); m["condiciones"] = cond
        m["reference"] = p.get("referencia", "Respuesta correcta segun los datos y documentos, sin inventar causas ni cifras.")
    elif p["familia"] == "cruzadas":
        # Cruzadas: la respuesta debe traer la cifra (SQL) Y la cita del documento (y, si aplica, la regla).
        cond = []
        if "sql" in p:
            esperado = sql(p["sql"]); m["esperado"] = esperado; cond.append(contiene_numero(respuesta, esperado))
        if "esperado_texto" in p: cond.append(p["esperado_texto"].lower() in respuesta.lower())
        if "sql_texto" in p: t = sql(p["sql_texto"]); m["esperado"] = t; cond.append(t.lower() in respuesta.lower())
        cond.append(bool(re.search(p["cita"], respuesta)))
        if "esperado_regex" in p: cond.append(bool(re.search(p["esperado_regex"], respuesta, re.I)))
        m["id"] = p["id"]; m["cruzada_ok"] = all(cond); m["condiciones"] = cond
        m["reference"] = "Cifra correcta segun los datos y regla aplicable citada con documento y seccion."
    else:
        m["abstiene"] = bool(ABST.search(respuesta)) and not HIPO.search(respuesta) and not re.search(r"\d{3}[.\- ]\d{3}[.\- ]\d{4}|Guevara", respuesta)
        m["reference"] = "No es posible responder con los datos y documentos disponibles."
    muestras.append(m)
    ok_ = m.get("exacto", m.get("cita_ok", m.get("abstiene", m.get("trampa_ok", m.get("cruzada_ok")))))
    print(("OK " if ok_ else "XX ") + f"[{p['familia']}] {p['pregunta']} ({ms} ms, {len(ctx)} ctx)")

# ---- 2. RAGAS ----
import warnings; warnings.filterwarnings("ignore")
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.metrics import Faithfulness, ResponseRelevancy, LLMContextPrecisionWithReference, LLMContextRecall
from ragas import evaluate, EvaluationDataset
from ragas.dataset_schema import SingleTurnSample
juez = LangchainLLMWrapper(ChatOpenAI(model="nvidia/nemotron-3-super-120b-a12b", base_url=ENV["NVIDIA_BASE_URL"], api_key=ENV["NVIDIA_API_KEY"],
    temperature=0, max_tokens=3000, timeout=180, max_retries=3, model_kwargs={"extra_body": {"chat_template_kwargs": {"thinking": False}}}))
emb = LangchainEmbeddingsWrapper(OpenAIEmbeddings(model="nvidia/nemotron-3-embed-1b", base_url=ENV["NVIDIA_BASE_URL"], api_key=ENV["NVIDIA_API_KEY"], check_embedding_ctx_length=False))
METRICAS = {
    "cifras": [Faithfulness(llm=juez)],
    "politicas": [Faithfulness(llm=juez), ResponseRelevancy(llm=juez, embeddings=emb), LLMContextPrecisionWithReference(llm=juez), LLMContextRecall(llm=juez)],
    "trampas": [Faithfulness(llm=juez), ResponseRelevancy(llm=juez, embeddings=emb)],
    "cruzadas": [Faithfulness(llm=juez), ResponseRelevancy(llm=juez, embeddings=emb)],
    # imposibles: sin RAGAS a proposito. Faithfulness sobre una abstencion sin contexto da 0 aunque la
    # respuesta sea perfecta; lo que importa ahi es la tasa de abstencion correcta (determinista).
}
resumen = {}
for fam, mets in METRICAS.items():
    ms_ = [m for m in muestras if m["familia"] == fam]
    if not ms_: continue
    ds = EvaluationDataset(samples=[SingleTurnSample(user_input=m["pregunta"], response=m["respuesta"], retrieved_contexts=m["contextos"], reference=m["reference"]) for m in ms_])
    res = evaluate(ds, metrics=mets, show_progress=False, raise_exceptions=False)
    df = res.to_pandas()
    for i, m in enumerate(ms_):
        for col in df.columns:
            if col in ("user_input", "response", "retrieved_contexts", "reference"): continue
            m["ragas_" + col] = None if df[col].isna().iloc[i] else round(float(df[col].iloc[i]), 3)
    resumen[fam] = {col: round(float(df[col].mean()), 3) for col in df.columns if col not in ("user_input", "response", "retrieved_contexts", "reference")}

# ---- 3. Reporte ----
fecha = datetime.datetime.now().strftime("%Y-%m-%d-%H-%M")
os.makedirs("resultados", exist_ok=True)
json.dump(muestras, open(f"resultados/ragas_{fecha}.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
cif = [m for m in muestras if m["familia"] == "cifras"]; pol = [m for m in muestras if m["familia"] == "politicas"]; imp = [m for m in muestras if m["familia"] == "imposibles"]; tra = [m for m in muestras if m["familia"] == "trampas"]; cru = [m for m in muestras if m["familia"] == "cruzadas"]
lineas = [f"# Evaluación HEB-aristo — {fecha}", "",
    f"Prompt v{sql('select prompt_version from heb_turnos order by creado_en desc limit 1') or '?'} · juez NVIDIA nemotron-3-super-120b · {len(muestras)} preguntas · latencia media {int(sum(m['ms'] for m in muestras)/len(muestras))} ms", "",
    "| Familia | n | Determinista | RAGAS |", "|---|---|---|---|"]
if cif: lineas.append(f"| cifras | {len(cif)} | exactitud {sum(m['exacto'] for m in cif)}/{len(cif)} | " + ", ".join(f"{k}={v}" for k, v in resumen.get("cifras", {}).items()) + " |")
if pol: lineas.append(f"| políticas | {len(pol)} | cita esperada {sum(m['cita_ok'] for m in pol)}/{len(pol)} | " + ", ".join(f"{k}={v}" for k, v in resumen.get("politicas", {}).items()) + " |")
if imp: lineas.append(f"| imposibles | {len(imp)} | abstención correcta {sum(m['abstiene'] for m in imp)}/{len(imp)} | " + ", ".join(f"{k}={v}" for k, v in resumen.get("imposibles", {}).items()) + " |")
if tra: lineas.append(f"| trampas | {len(tra)} | trampa superada {sum(m['trampa_ok'] for m in tra)}/{len(tra)} | " + ", ".join(f"{k}={v}" for k, v in resumen.get("trampas", {}).items()) + " |")
if cru: lineas.append(f"| cruzadas | {len(cru)} | cifra + cita {sum(m['cruzada_ok'] for m in cru)}/{len(cru)} | " + ", ".join(f"{k}={v}" for k, v in resumen.get("cruzadas", {}).items()) + " |")
lineas += ["", "## Detalle", "", "| familia | pregunta | ok | ms | métricas |", "|---|---|---|---|---|"]
for m in muestras:
    ok = m.get("exacto", m.get("cita_ok", m.get("abstiene", m.get("trampa_ok", m.get("cruzada_ok")))))
    mets = ", ".join(f"{k[6:]}={v}" for k, v in m.items() if k.startswith("ragas_"))
    lineas.append(f"| {m['familia']} | {m['pregunta']} | {'✓' if ok else '✗'} | {m['ms']} | {mets} |")
open(f"resultados/ragas_{fecha}.md", "w", encoding="utf8").write("\n".join(lineas) + "\n")
print("\n".join(lineas[:len(lineas) - len(muestras) - 4]))
print(f"-> resultados/ragas_{fecha}.md / .json")
