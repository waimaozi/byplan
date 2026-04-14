#!/bin/bash
# Build bundle.css from source CSS files
# Order matters! theme.css first (variables), then styles.css (base), then components
set -e

CSS_DIR="assets/css"
OUT="$CSS_DIR/bundle.css"

FILES=(
  theme.css
  styles.css
  hero.css
  polish.css
  story.css
  story-cta-bottom.css
  process-snake.css
  reviews-slider.css
  bio.css
  cases.css
  cases-slider.css
  principles-slider.css
  anketa-modal.css
  reviews-plan.css
  faq.css
  contact.css
)

> "$OUT"
for f in "${FILES[@]}"; do
  if [ -f "$CSS_DIR/$f" ]; then
    echo "/* === $f === */" >> "$OUT"
    cat "$CSS_DIR/$f" >> "$OUT"
    echo "" >> "$OUT"
  else
    echo "WARNING: $CSS_DIR/$f not found, skipping"
  fi
done

echo "Bundle built: $(wc -l < "$OUT") lines → $OUT"
