#!/bin/bash
# Build bundle.js from source JS files in the established load order.
set -e

JS_DIR="assets/js"
OUT="$JS_DIR/bundle.js"

FILES=(
  config.js
  sheets.js
  app-core.js
  app.js
  principles-slider.js
  polish.js
  story.js
  process-snake.js
  bio.js
  cases.js
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

echo "Bundle built: $(wc -l < "$OUT") lines → $OUT"
