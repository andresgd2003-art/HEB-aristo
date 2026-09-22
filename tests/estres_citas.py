"""Prueba de estres de citas: una pregunta por cada seccion de los 4 PDF. Verifica que la respuesta cite el
documento y la seccion donde vive la respuesta, y que no cite nada que no haya recuperado (cita fantasma).

Verdad: el corpus mismo (corpus/politicas/*.md, secciones ## y ###). Las preguntas las genera un modelo gratuito
(NVIDIA Nemotron) a partir del texto de cada seccion y se cachean en tests/estres_citas_preguntas.json para que
la corrida sea repetible.

Veredicto por pregunta (determinista):
  doc_ok      la respuesta contiene el codigo del documento esperado (PRO-SAC-021, ...)
  seccion_ok  la respuesta contiene el numero de la seccion/subseccion esperada (3, 3.2, P15) o su titulo
  recuperada  el fragmento de esa seccion estuvo entre los contextos que vio el agente
  sin_fantasma todo codigo de documento citado en la respuesta aparece en los contextos recuperados
Cita correcta = doc_ok y seccion_ok y sin_fantasma.

Uso:  .venv/Scripts/python tests/estres_citas.py [--generar] [--solo CODIGO] [--max N]
"""
import os
import json, os, re, sys, time, glob, datetime, urllib.request, urllib.error

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(RAIZ)
ENV = {}
for l in open(".env", encoding="utf8"):
    l = l.strip()
    if "=" in l and not l.startswith("#"): k, v = l.split("=", 1); ENV[k] = v
API = ENV["N8N_BASE_URL"].rstrip("/"); CHAT = os.environ.get("CHAT_WORKFLOW_ID", "ZpkluoNfIEbhI9K8")  # id del flujo cuyas ejecuciones se leen (TEST: ryr0JCeSWnZsa7dy)
CACHE = "tests/estres_citas_preguntas.json"
args = sys.argv[1:]
SOLO = args[args.index("--solo") + 1] if "--solo" in args else None
MAX = int(args[args.index("--max") + 1]) if "--max" in args else 10**6

def http(url, body=None, headers=None, timeout=300):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json", **(headers or {})}, method="POST" if body else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read().decode())

# ---- 1. Secciones del corpus ----
def secciones():
    out = []
    for f in sorted(glob.glob("corpus/politicas/*.md")):
        md = open(f, encoding="utf8").read()
        codigo = re.search(r"^Código: (\S+)", md, re.M).group(1)
        sec, sub, buf = None, None, []
        def cerrar():
            texto = "\n".join(buf).strip()
            if sec and len(texto) >= 150 and "control de cambios" not in sec.lower():
                out.append({"codigo": codigo, "archivo": f.replace(".md", ".pdf"), "seccion": sec, "subseccion": sub, "texto": texto[:2500]})
        for l in md.split("\n"):
            if l.startswith("## "): cerrar(); sec, sub, buf = l[3:].strip(), None, []
            elif l.startswith("### "): cerrar(); sub, buf = l[4:].strip(), []
            else: buf.append(l)
        cerrar()
    return out

# ---- 2. Preguntas (generadas una vez, cacheadas) ----
def generar_pregunta(s):
    prompt = ("Eres una gerente de tienda H-E-B. Escribe UNA pregunta corta y natural, en espanol, que harias a tu asistente y cuya "
              "respuesta este contenida en el siguiente texto de un documento interno. No menciones el nombre ni el codigo del documento "
              "ni el numero de seccion. No uses comillas. Devuelve solo la pregunta.\n\nTexto:\n" + s["texto"])
    for intento in range(6):  # NVIDIA gratuito devuelve 503/429 bajo carga: esperar y reintentar
        try:
            r = http(ENV["NVIDIA_BASE_URL"] + "/chat/completions", {"model": "nvidia/nemotron-3-super-120b-a12b", "temperature": 0.2, "max_tokens": 200,
                     "messages": [{"role": "user", "content": prompt}], "chat_template_kwargs": {"thinking": False}},
                     headers={"Authorization": "Bearer " + ENV["NVIDIA_API_KEY"]}, timeout=120)
            return r["choices"][0]["message"]["content"].strip().split("\n")[0].strip(' "')
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or intento == 5: raise
            time.sleep(15 * (intento + 1))

secs = secciones()
cache = json.load(open(CACHE, encoding="utf8")) if os.path.exists(CACHE) else {}
clave = lambda s: f'{s["codigo"]}|{s["seccion"]}|{s["subseccion"] or ""}'
if "--generar" in args or any(clave(s) not in cache for s in secs):
    for s in secs:
        if clave(s) in cache: continue
        cache[clave(s)] = generar_pregunta(s); print("Q", clave(s)[:70], "->", cache[clave(s)][:90])
        json.dump(cache, open(CACHE, "w", encoding="utf8"), ensure_ascii=False, indent=1)  # incremental

# ---- 3. Verificadores ----
NORM = lambda t: re.sub(r"[‐‑‒–−]", "-", t)
def numero(titulo):
    m = re.match(r"^(P?\d+(?:\.\d+)?)\.?\s", titulo); return m.group(1) if m else None
def cita_seccion(respuesta, s):
    """Numero de la subseccion (3.2 / P15) o, si no hay, de la seccion (3); o el titulo (4+ palabras seguidas)."""
    objetivo = s["subseccion"] or s["seccion"]; n = numero(objetivo)
    ok = False
    if n:
        if n.startswith("P"): ok = re.search(rf"\b{n}\b", respuesta) is not None
        elif "." in n: ok = re.search(rf"(?<![\d.]){re.escape(n)}(?![\d])", respuesta) is not None
        else: ok = re.search(rf"(§\s*{n}\b|secci[oó]n\s+{n}\b|\b{n}\.\s|\b{n}\.\d\b|\b{n}\s*[—-]\s)", respuesta, re.I) is not None
        if not ok and s["subseccion"]:  # citar la seccion madre tambien vale
            ns = numero(s["seccion"])
            ok = ns is not None and re.search(rf"(§\s*{ns}\b|secci[oó]n\s+{ns}\b|\b{ns}\.\s)", respuesta, re.I) is not None
    titulo = re.sub(r"^(P?\d+(?:\.\d+)?)\.?\s+", "", objetivo)
    palabras = [w for w in re.findall(r"\w+", titulo.lower()) if len(w) > 3][:4]
    if palabras and all(w in respuesta.lower() for w in palabras): ok = True
    return ok
CODIGOS = ["FAQ-OPS-001", "MAN-OPS-007", "POL-OPS-014", "PRO-SAC-021"]
def contextos_ultima():
    e = http(f"{API}/api/v1/executions?workflowId={CHAT}&limit=1&includeData=true", headers={"X-N8N-API-KEY": ENV["N8N_API_KEY"]})["data"][0]
    ctx = []
    for x in e["data"]["resultData"]["runData"].get("consultar_politicas", []):
        for salida in (x.get("data") or {}).get("ai_tool", []):
            for item in salida:
                for d in item.get("json", {}).get("response", []) or []:
                    try: ctx.append(json.loads(d["text"])["pageContent"])
                    except Exception: pass
    return ctx

# ---- 4. Correr ----
res = []
for s in secs[:MAX]:
    if SOLO and s["codigo"] != SOLO: continue
    pregunta = cache[clave(s)]
    t0 = time.time()
    r = http(f"{API}{os.environ.get('CHAT_PATH', '/webhook/heb-aristo/chat')}", {"input": pregunta})
    ms = int((time.time() - t0) * 1000)
    resp = NORM(str(r.get("respuesta") or r))
    ctx = contextos_ultima()
    cabeceras = [c.split("\n")[0] for c in ctx]
    citados = [c for c in CODIGOS if c in resp]
    docs_ctx = {c for c in CODIGOS if any(c in h for h in cabeceras)}
    ARCH = {"FAQ-OPS-001": "faq_gerentes", "MAN-OPS-007": "manual_apertura", "POL-OPS-014": "politica_mermas", "PRO-SAC-021": "procedimiento_devoluciones"}
    citados = [c for c in CODIGOS if c in resp or ARCH[c] in resp]
    archivo = os.path.basename(s["archivo"])
    v = {"doc_ok": s["codigo"] in resp or archivo.replace(".pdf", "") in resp, "seccion_ok": cita_seccion(resp, s),
         "recuperada": any((s["codigo"] in h or archivo in h) and (s["subseccion"] or s["seccion"]) in h for h in cabeceras),
         "sin_fantasma": all(c in docs_ctx for c in citados)}
    v["cita_correcta"] = v["doc_ok"] and v["seccion_ok"] and v["sin_fantasma"]
    res.append({**s, "texto": None, "pregunta": pregunta, "respuesta": resp, "cabeceras": cabeceras, "ms": ms, **v})
    print(("OK " if v["cita_correcta"] else "XX ") + f'{s["codigo"]} {(s["subseccion"] or s["seccion"])[:45]:<46} {ms:>6} ms  ' + ("" if v["cita_correcta"] else json.dumps({k: v[k] for k in v if not v[k]}, ensure_ascii=False)))

# ---- 5. Reporte ----
fecha = datetime.datetime.now().strftime("%Y-%m-%d-%H-%M"); os.makedirs("resultados", exist_ok=True)
json.dump(res, open(f"resultados/citas_{fecha}.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
L = [f"# Estrés de citas — {fecha}", "", f"{len(res)} preguntas (una por sección de los 4 PDF). Cita correcta = documento + sección + sin citas fantasma.", "",
     "| Documento | n | cita correcta | doc | sección | recuperada | sin fantasma |", "|---|---|---|---|---|---|---|"]
for c in CODIGOS + ["TOTAL"]:
    xs = [x for x in res if c == "TOTAL" or x["codigo"] == c]
    if xs: L.append(f"| {c} | {len(xs)} | **{sum(x['cita_correcta'] for x in xs)}/{len(xs)}** | {sum(x['doc_ok'] for x in xs)} | {sum(x['seccion_ok'] for x in xs)} | {sum(x['recuperada'] for x in xs)} | {sum(x['sin_fantasma'] for x in xs)} |")
L += ["", "## Fallos", ""]
for x in res:
    if not x["cita_correcta"]:
        L += [f"- **{x['codigo']} › {x['seccion']}" + (f" › {x['subseccion']}" if x["subseccion"] else "") + f"** — {json.dumps({k: x[k] for k in ('doc_ok','seccion_ok','recuperada','sin_fantasma') if not x[k]})}",
              f"  - P: {x['pregunta']}", f"  - R: {x['respuesta'][:400].replace(chr(10), ' ')}", ""]
open(f"resultados/citas_{fecha}.md", "w", encoding="utf8").write("\n".join(L) + "\n")
print("\n".join(L[:8 + len(CODIGOS)])); print("->", f"resultados/citas_{fecha}.md")
