#!/usr/bin/env bash
# Builds every book in the Mandala series into out/<book>/
set -euo pipefail
cd "$(dirname "$0")"

python3 make_book.py --out out/1-mindful-mandalas \
  --title "Mindful Mandalas" --subtitle "50 Original Patterns for Stress Relief & Relaxation" \
  --designs 50 --seed 2026 --style classic

python3 make_book.py --out out/2-easy-mandalas \
  --title "Easy Mandalas" --subtitle "40 Large, Simple Patterns for Beginners & Seniors" \
  --designs 40 --seed 4141 --style easy \
  --tagline "with big, open spaces that are easy to fill." \
  --bg "#1D3557" --palette "#F1FAEE,#A8DADC,#FFB4A2,#E9C46A,#F4A261,#CDB4DB"

python3 make_book.py --out out/3-intricate-mandalas \
  --title "Intricate Mandalas" --subtitle "50 Detailed Patterns for Advanced Colorists" \
  --designs 50 --seed 7373 --style intricate \
  --tagline "packed with fine detail for hours of focus." \
  --bg "#0B0B0F" --palette "#E0AAFF,#C77DFF,#9D4EDD,#FFD60A,#48CAE4,#F72585,#FFFFFF"

python3 make_book.py --out out/4-mandala-garden \
  --title "Mandala Garden" --subtitle "50 Flower Patterns for Peaceful Coloring" \
  --designs 50 --seed 5151 --style floral \
  --tagline "blooming with petals, leaves and flowers." \
  --bg "#2D6A4F" --palette "#FFC8DD,#FFAFCC,#FFF1B5,#BDE0FE,#D8F3DC,#FFB703,#FB8500"
