"""Create a Bot-Hosting upload ZIP after webapp has been built."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parent / f"{ROOT.name}_BotHosting.zip"
REQUIRED_FRONTEND = ROOT / "webapp" / "index.html"

if not REQUIRED_FRONTEND.is_file():
    raise SystemExit("Сначала соберите frontend: build-for-bothost.ps1 или ./build-for-bothost.sh")

# Do not silently package an old webapp bundle that lacks the current LIVE demo rail
# and withdrawal-request UI from frontend/src/App.tsx.
js_bundles = list((ROOT / "webapp" / "assets").glob("*.js"))
if not js_bundles:
    raise SystemExit("В webapp/assets нет JS-сборки. Сначала выполните build-for-bothost.sh")
bundle_text = "\\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in js_bundles)
required_ui_markers = ("ДЕМО", "Мои заявки", "Заявки на вывод", "Выполнено вручную")
missing_ui_markers = [marker for marker in required_ui_markers if marker not in bundle_text]
if missing_ui_markers:
    raise SystemExit(
        "webapp устарел и не содержит обновлённый интерфейс: "
        + ", ".join(missing_ui_markers)
        + ". Пересоберите frontend командой ./build-for-bothost.sh"
    )

for catalog_name in ("gifts.json", "cases.json"):
    if not (ROOT / "backend" / "catalog" / catalog_name).is_file():
        raise SystemExit(f"Отсутствует файл каталога backend/catalog/{catalog_name}")

EXCLUDED_DIRS = {"node_modules", ".venv", "__pycache__", ".git", ".pytest_cache", ".mypy_cache"}
EXCLUDED_FILES = {".env", ".env.local", ".env.production", ".DS_Store"}

files_added = 0
with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        parts = set(relative.parts)
        if relative.parts[:2] == ("frontend", "dist") or parts & EXCLUDED_DIRS:
            continue
        if path.name in EXCLUDED_FILES:
            continue
        if path.suffix in {".pyc", ".pyo", ".sqlite", ".sqlite3", ".db", ".log"}:
            continue
        if path.name.endswith((".sqlite3-shm", ".sqlite3-wal")):
            continue
        archive.write(path, relative.as_posix())
        files_added += 1

print(f"Создан архив: {OUTPUT}")
print(f"Файлов: {files_added}; webapp включён.")
