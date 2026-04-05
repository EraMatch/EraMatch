#!/usr/bin/env python3
"""
Benchmark document parsing latency for the current extractor stack vs Docling.

Usage examples:
  python backend/scripts/benchmark_document_parsers.py --input "samples/*.pdf"
  python backend/scripts/benchmark_document_parsers.py --input "samples/**/*.*" --repeat 3
  python backend/scripts/benchmark_document_parsers.py --files a.pdf b.docx c.xlsx

Notes:
- "current" parser uses the same lightweight libraries used in the worker path:
  pdfplumber, python-docx, pandas/openpyxl, plain text decode.
- "docling" parser is optional. If docling is not installed, it is skipped.
"""

from __future__ import annotations

import argparse
import csv
import glob
import io
import logging
import os
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable


SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".doc", ".csv", ".xlsx", ".xls", ".md", ".txt"}


def configure_pdf_logging(quiet_pdf_warnings: bool) -> None:
    """Reduce noisy font warnings from pdfminer/pdfplumber for cleaner benchmark output."""
    # Keep benchmark output focused on latency, not framework startup logs.
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

    if not quiet_pdf_warnings:
        return
    for logger_name in [
        "pdfminer",
        "pdfminer.psparser",
        "pdfminer.pdffont",
        "pdfplumber",
        "RapidOCR",
        "rapidocr",
        "onnxruntime",
        "tensorflow",
    ]:
        logging.getLogger(logger_name).setLevel(logging.ERROR)


@dataclass
class RunResult:
    file_path: str
    parser_name: str
    ok: bool
    elapsed_ms: float
    chars: int
    error: str = ""


def read_file_bytes(path: Path) -> bytes:
    with path.open("rb") as f:
        return f.read()


def parse_with_current(path: Path, file_bytes: bytes) -> str:
    ext = path.suffix.lower()

    if ext == ".pdf":
        try:
            import pdfplumber
        except ImportError as exc:
            raise RuntimeError("pdfplumber is not installed") from exc
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            parts: list[str] = []
            for page in pdf.pages:
                txt = page.extract_text() or ""
                if txt:
                    parts.append(txt)
            return "\n\n".join(parts)

    if ext in {".doc", ".docx"}:
        try:
            from docx import Document
        except ImportError as exc:
            raise RuntimeError("python-docx is not installed") from exc
        doc = Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs if p.text and p.text.strip())

    if ext in {".csv", ".xlsx", ".xls"}:
        try:
            import pandas as pd
        except ImportError as exc:
            raise RuntimeError("pandas/openpyxl is not installed") from exc

        if ext == ".csv":
            df = pd.read_csv(io.BytesIO(file_bytes))
        else:
            df = pd.read_excel(io.BytesIO(file_bytes))

        rows = ["\t".join(str(c) for c in df.columns)]
        for _, row in df.iterrows():
            rows.append("\t".join(str(v) for v in row.values))
        return "\n".join(rows)

    if ext in {".md", ".txt"}:
        return file_bytes.decode("utf-8", errors="replace")

    return file_bytes.decode("utf-8", errors="replace")


def parse_with_docling(path: Path, _: bytes) -> str:
    try:
        from docling.document_converter import DocumentConverter
    except ImportError as exc:
        raise RuntimeError("docling is not installed") from exc

    converter = DocumentConverter()
    result = converter.convert(str(path))

    # Prefer markdown output where available; fallback to text representation.
    doc = getattr(result, "document", None)
    if doc is not None:
        if hasattr(doc, "export_to_markdown"):
            return doc.export_to_markdown()
        if hasattr(doc, "export_to_text"):
            return doc.export_to_text()
    return str(result)


def run_once(path: Path, parser_name: str, parser_fn: Callable[[Path, bytes], str]) -> RunResult:
    try:
        file_bytes = read_file_bytes(path)
        start = time.perf_counter()
        text = parser_fn(path, file_bytes)
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return RunResult(
            file_path=str(path),
            parser_name=parser_name,
            ok=True,
            elapsed_ms=elapsed_ms,
            chars=len(text or ""),
        )
    except Exception as exc:
        error_text = str(exc)
        if parser_name == "docling" and ("WinError 1314" in error_text or "required privilege" in error_text.lower()):
            error_text = (
                f"{error_text} | Hint: enable Windows Developer Mode or run terminal as Administrator "
                "to allow symlink creation for HuggingFace cache used by Docling."
            )
        elapsed_ms = 0.0
        return RunResult(
            file_path=str(path),
            parser_name=parser_name,
            ok=False,
            elapsed_ms=elapsed_ms,
            chars=0,
            error=error_text,
        )


def collect_files(input_glob: str | None, files: list[str]) -> list[Path]:
    paths: list[Path] = []

    if input_glob:
        for p in glob.glob(input_glob, recursive=True):
            pp = Path(p)
            if pp.is_file():
                paths.append(pp)

    for f in files:
        pp = Path(f)
        if pp.is_file():
            paths.append(pp)

    # Deduplicate while preserving order
    dedup: dict[str, Path] = {}
    for p in paths:
        dedup[str(p.resolve())] = p

    filtered = [p for p in dedup.values() if p.suffix.lower() in SUPPORTED_EXTENSIONS]
    return filtered


def summarize(results: Iterable[RunResult]) -> str:
    by_parser: dict[str, list[RunResult]] = {}
    for r in results:
        by_parser.setdefault(r.parser_name, []).append(r)

    lines: list[str] = []
    for parser_name, rows in by_parser.items():
        ok_rows = [r for r in rows if r.ok]
        fail_rows = [r for r in rows if not r.ok]
        latencies = [r.elapsed_ms for r in ok_rows]
        if latencies:
            mean_ms = statistics.mean(latencies)
            p50_ms = statistics.median(latencies)
            p95_ms = statistics.quantiles(latencies, n=100)[94] if len(latencies) >= 20 else max(latencies)
            lines.append(
                f"{parser_name}: ok={len(ok_rows)} fail={len(fail_rows)} "
                f"mean={mean_ms:.1f}ms p50={p50_ms:.1f}ms p95={p95_ms:.1f}ms"
            )
        else:
            lines.append(f"{parser_name}: ok=0 fail={len(fail_rows)}")
    return "\n".join(lines)


def write_csv(path: Path, rows: list[RunResult]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["file_path", "parser", "ok", "elapsed_ms", "chars", "error"])
        for r in rows:
            writer.writerow([r.file_path, r.parser_name, r.ok, f"{r.elapsed_ms:.3f}", r.chars, r.error])


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark current parser vs Docling")
    parser.add_argument("--input", help="Glob for input files, e.g. samples/**/*.pdf")
    parser.add_argument("--files", nargs="*", default=[], help="Explicit files")
    parser.add_argument("--repeat", type=int, default=1, help="Number of repetitions per parser per file")
    parser.add_argument("--csv-out", default="", help="Optional CSV output path")
    parser.add_argument("--skip-docling", action="store_true", help="Skip Docling parser")
    parser.add_argument("--no-quiet-pdf-warnings", action="store_true", help="Show raw pdfminer/pdfplumber warnings")
    args = parser.parse_args()

    configure_pdf_logging(quiet_pdf_warnings=not args.no_quiet_pdf_warnings)

    files = collect_files(args.input, args.files)
    if not files:
        print("No supported files found. Supported:", ", ".join(sorted(SUPPORTED_EXTENSIONS)))
        return 1

    parser_fns: list[tuple[str, Callable[[Path, bytes], str]]] = [("current", parse_with_current)]
    if not args.skip_docling:
        parser_fns.append(("docling", parse_with_docling))

    results: list[RunResult] = []

    print(f"Benchmarking {len(files)} file(s), repeat={args.repeat}")
    for f in files:
        print(f"\nFile: {f}")
        for parser_name, parser_fn in parser_fns:
            run_rows: list[RunResult] = []
            for _ in range(max(args.repeat, 1)):
                row = run_once(f, parser_name, parser_fn)
                run_rows.append(row)
                results.append(row)

            ok_rows = [r for r in run_rows if r.ok]
            if ok_rows:
                ms = statistics.mean(r.elapsed_ms for r in ok_rows)
                chars = ok_rows[-1].chars
                print(f"  {parser_name:<8} ok  mean={ms:.1f}ms  chars={chars}")
            else:
                print(f"  {parser_name:<8} fail {run_rows[-1].error}")

    print("\nSummary")
    print(summarize(results))

    if args.csv_out:
        out_path = Path(args.csv_out)
        write_csv(out_path, results)
        print(f"\nWrote CSV: {out_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
