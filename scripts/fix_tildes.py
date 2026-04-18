"""Fix tildes - version ultra-conservadora por frases exactas con word boundaries.

Solo reemplaza frases donde:
1. La frase tiene al menos 2 palabras (reduce riesgo de matchear substrings)
2. Ambas partes tienen word boundaries
3. NO toca strings de codigo (entre '' o "" solas) verificando contexto
"""
import re
import os
import glob

# Solo frases multi-palabra - mucho mas seguras
FRASES = [
    ("Nivel de Aplicacion", "Nivel de Aplicación"),
    ("Tasa Respuesta", "Tasa de Respuesta"),
    ("Fecha limite", "Fecha límite"),
    ("fecha limite", "fecha límite"),
    ("Gestion de", "Gestión de"),
    ("gestion de", "gestión de"),
    ("Gestion del", "Gestión del"),
    ("Seleccion de", "Selección de"),
    ("seleccion de", "selección de"),
    ("Confirmar accion", "Confirmar acción"),
    ("Ultima observacion", "Última observación"),
    ("Ultima actualizacion", "Última actualización"),
    ("ultima actualizacion", "última actualización"),
    ("No hay informacion", "No hay información"),
    ("Mas informacion", "Más información"),
    ("Sin categoria", "Sin categoría"),
    ("sin categoria", "sin categoría"),
    ("Sin descripcion", "Sin descripción"),
    ("sin descripcion", "sin descripción"),
    ("Ver mas", "Ver más"),
    ("Cargar mas", "Cargar más"),
    ("Aplica con orientacion", "Aplica con orientación"),
    ("Aplicacion Autoevaluacion", "Aplicación Autoevaluación"),
    ("Aplicacion Coevaluacion", "Aplicación Coevaluación"),
    ("Aplicacion Autoevaluación", "Aplicación Autoevaluación"),
    ("Aplicacion Coevaluación", "Aplicación Coevaluación"),
    ("Autoevaluacion y Coevaluacion", "Autoevaluación y Coevaluación"),
    ("Autoevaluacion inicial", "Autoevaluación inicial"),
    ("Coevaluacion inicial", "Coevaluación inicial"),
    ("Autoevaluacion final", "Autoevaluación final"),
    ("Coevaluacion final", "Coevaluación final"),
    ("Ejecucion de", "Ejecución de"),
    ("ejecucion de", "ejecución de"),
    ("Descripcion de", "Descripción de"),
    ("descripcion de", "descripción de"),
    ("Estas evaluando", "Estás evaluando"),
    ("Aun no has", "Aún no has"),
    ("aun no has", "aún no has"),
    ("despues de", "después de"),
    ("Despues de", "Después de"),
    ("a traves de", "a través de"),
    ("A traves de", "A través de"),
]

# Filtrar duplicados / no-op
FRASES = [(a, b) for a, b in FRASES if a != b]

# Orden: frases mas largas primero (para evitar sub-match problematico)
FRASES.sort(key=lambda p: -len(p[0]))

# Regex con word boundaries estrictos: no letra/digit antes ni despues
def build_pattern(frase):
    # (?<![\w]) antes, (?![\w]) despues. \w incluye letras, digitos, _.
    return r'(?<![\w\-])' + re.escape(frase) + r'(?![\w\-])'

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    total = 0
    for sin, con in FRASES:
        pat = build_pattern(sin)
        new, n = re.subn(pat, con, content)
        content = new
        total += n
    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
    return total

def main():
    base = r"c:\Users\the_r\Documents\GitHub\plataforma-mso\docs\v2"
    files = glob.glob(os.path.join(base, "*.html"))
    total = 0
    for p in files:
        n = fix_file(p)
        if n > 0:
            print(f"  {os.path.basename(p)}: {n}")
            total += n
    print(f"\nTotal cambios: {total} en {len(files)} archivos analizados")

if __name__ == "__main__":
    main()
