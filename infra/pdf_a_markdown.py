"""Bootstrap de politicas/*.pdf -> corpus/politicas/*.md con encabezados reales.

Reproducible: `python infra/pdf_a_markdown.py`. Las tablas que pdftotext desalinea (auditoria
T12) se sustituyen por las transcritas a mano en tablas_politicas.py. Los .md resultantes son
la fuente que se ingiere (ticket 03).
"""
import re, subprocess, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from tablas_politicas import aplicar

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SAL = RAIZ / "corpus" / "politicas"; SAL.mkdir(parents=True, exist_ok=True)

def pdftotext(pdf, *flags):
    return subprocess.run(["pdftotext", "-enc", "UTF-8", *flags, str(pdf), "-"],
                          capture_output=True, text=True, encoding="utf-8", check=True).stdout

def parrafo(t):
    """Un parrafo; o una lista si trae vinetas ('• a • b') o pasos ('1 El ... 2 Se ...') pegados."""
    if not t: return []
    if "• " in t:
        intro, *items = t.split("• ")
        return ([intro.strip(), ""] if intro.strip() else []) + [("- " + x.strip()) for x in items if x.strip()] + [""]
    if re.match(r"^\d{1,2} [A-ZÁÉÍÓÚ]", t):
        return [re.sub(r"^(\d+) ", lambda m: m.group(1) + ". ", x)
                for x in re.split(r"\s(?=\d{1,2} [A-ZÁÉÍÓÚ])", t)] + [""]
    return [t, ""]

for pdf in sorted((RAIZ / "politicas").glob("*.pdf")):
    # Los titulos de subseccion vienen pegados al parrafo en modo normal; en -layout salen solos.
    lay = pdftotext(pdf, "-layout")
    subtitulos = sorted({l.strip() for l in lay.split("\n")
                         if re.match(r"^\s*\d+\.\d+ (?!\d+ de )\S", l) and len(l.strip()) < 90},
                        key=len, reverse=True)
    lineas = []
    for l in pdftotext(pdf).replace("\f", "\n").split("\n"):
        l = l.strip()
        if not l: continue
        if l.startswith("H-E-B México — Documento interno ficticio"): continue
        if re.match(r"^Página \d+$", l) or re.search(r"· Versión \d+\.\d+$", l): continue
        # Una linea que empieza en minuscula continua la anterior (corte de pagina o de vineta).
        cabecera = re.match(r"^\d+\. |^P\d+\. |^\d+\.\d+ |^•", l) or l.startswith("Este documento")
        if len(lineas) > 4 and not cabecera and (l[0].islower() or not re.search(r"[.:;?!)]$", lineas[-1])) \
                and not re.match(r"^\d+\. |^P\d+\. ", lineas[-1]):
            lineas[-1] += " " + l
        else:
            lineas.append(l)
    titulo = lineas[0]
    cod = re.search(r"Código: (\S+)", lineas[1]).group(1)
    m = re.match(r"(\S+) (\d+\.\d+) (\d+ de \w+ de \d{4}) (.+?) (Uso interno)$", lineas[3])
    out = [f"# {titulo}", "", f"Código: {cod} · Versión {m.group(2)} · Vigente desde {m.group(3)} · {m.group(4)} · {m.group(5)}", ""]
    for l in lineas[4:]:
        if l.startswith("Este documento es material ficticio"): continue
        if re.match(r"^\d+\. \S", l) and len(l) < 70:
            out += [f"## {l}", ""]
        elif (sub := next((t for t in subtitulos if l == t or l.startswith(t + " ")), None)):
            out += [f"### {sub}", ""] + parrafo(l[len(sub):].strip())
        elif re.match(r"^P\d+\. ", l):  # FAQ: pregunta + respuesta en la misma linea
            q, sep, a = l.partition("? ")
            out += [f"### {q}?" if sep else f"### {l}", ""] + (parrafo(a) if sep else [])
        else:
            out += parrafo(l)
    out = aplicar(pdf.stem, out)
    (SAL / (pdf.stem + ".md")).write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
    print(pdf.stem, "->", sum(1 for x in out if x.startswith("## ")), "secciones,",
          sum(1 for x in out if x.startswith("### ")), "subsecciones")
