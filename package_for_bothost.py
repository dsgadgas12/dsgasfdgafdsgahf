"""Create a Bot-Hosting upload ZIP after webapp has been built."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parent / f"{ROOT.name}_BotHosting.zip"
REQUIRED_FRONTEND = ROOT / "webapp" / "index.html"

if not REQUIRED_FRONTEND.is_file():
    raise SystemExit("Сначала соберите frontend: build-for-bothost.ps1 или ./build-for-bothost.sh")

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
