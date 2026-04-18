#!/bin/bash
# =============================================================================
# alphaN2N App Guide — Build Script
# Generates master PDF + individual chapter PDFs.
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CHAPTER_DIR="out/chapters"
mkdir -p "$CHAPTER_DIR"

# =============================================================================
# 1. Master PDF (all chapters)
# =============================================================================
echo "=== Building master PDF ==="
echo "--- Pass 1/2 ---"
pdflatex -interaction=nonstopmode main.tex > /dev/null 2>&1 || true
echo "--- Pass 2/2 ---"
pdflatex -interaction=nonstopmode main.tex > /dev/null 2>&1 || true
if [ -f main.pdf ]; then
  echo "  -> main.pdf ($(pdfinfo main.pdf 2>/dev/null | grep Pages | awk '{print $2}') pages)"
else
  echo "  !! main.pdf not produced — check main.log"
fi

# =============================================================================
# 2. Individual chapter PDFs
# =============================================================================
echo ""
echo "=== Building chapter PDFs ==="

CHAPTERS=(
  "00-introduction|Introduction"
  "01-app-shell|App Shell"
  "02-auth-public|Authentication & Public Pages"
  "03-pipeline-selector|Pipeline Selector"
  "04-dashboard|Dashboard & Performance"
  "05-content|Content"
  "06-queue-review|Queue & Review"
  "07-tools|Tools: Workflows"
  "08-admin|Admin"
  "09-pipeline-workspace|Pipeline Workspace: x121"
  "A-appendix-modals|Appendix A: Modal Index"
  "B-appendix-icons|Appendix B: Icon Reference"
)

for entry in "${CHAPTERS[@]}"; do
  IFS='|' read -r file title <<< "$entry"

  if [ ! -f "chapters/${file}.tex" ]; then
    continue
  fi

  rm -f "_chapter_tmp.aux" "_chapter_tmp.out" "_chapter_tmp.toc" "_chapter_tmp.log"

  cat > "_chapter_tmp.tex" <<LATEX
\\documentclass[11pt,a4paper,oneside]{book}
\\input{preamble}
\\begin{document}
\\input{chapters/${file}}
\\end{document}
LATEX

  pdflatex -interaction=nonstopmode -halt-on-error _chapter_tmp.tex > /dev/null 2>&1 || true
  if pdflatex -interaction=nonstopmode -halt-on-error _chapter_tmp.tex > /dev/null 2>&1; then
    mv _chapter_tmp.pdf "${CHAPTER_DIR}/${file}.pdf"
    echo "  [ok] ${file}.pdf"
  else
    echo "  [FAIL] ${file}.pdf — see _chapter_tmp.log"
  fi
done

rm -f _chapter_tmp.tex _chapter_tmp.aux _chapter_tmp.log _chapter_tmp.out _chapter_tmp.toc

echo ""
echo "=== Build complete ==="
echo "  Master:   main.pdf"
echo "  Chapters: ${CHAPTER_DIR}/"
