#!/bin/bash
# Build bundle-defer.js from deferred source files in the established load order.
set -e

JS_DIR="assets/js"
OUT="$JS_DIR/bundle-defer.js"

FILES=(
  reviews-more-modal.js
  reviews-carousel.js
  anketa-modal.js
  reviews-plan.js
)

> "$OUT"
for f in "${FILES[@]}"; do
  if [ -f "$JS_DIR/$f" ]; then
    echo "/* === $f === */" >> "$OUT"
    cat "$JS_DIR/$f" >> "$OUT"
    echo "" >> "$OUT"
    echo ";" >> "$OUT"
  else
    echo "WARNING: $JS_DIR/$f not found, skipping"
  fi
done

echo "Deferred bundle built: $(wc -l < "$OUT") lines → $OUT"
