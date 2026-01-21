/* ============================================================
   BYPLAN — process-snake.js (optional)
   Adds active state cycling (visual cue).
   ============================================================ */
(() => {
  const doc = document;
  const list = doc.getElementById("stepsList");
  if (!list) return;

  const items = Array.from(list.querySelectorAll("li"));
  if (!items.length) return;

  const setActive = (idx) => {
    items.forEach((li, i) => {
      li.classList.toggle("is-active", i === idx);
      li.classList.toggle("is-done", i < idx);
    });
  };

  setActive(0);

  let userInteracted = false;
  items.forEach((li, i) => li.addEventListener("click", () => { userInteracted = true; setActive(i); }));

  const section = doc.getElementById("process");
  if (!section) return;

  const io = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return;

    let i = 0;
    const timer = setInterval(() => {
      if (userInteracted){ clearInterval(timer); return; }
      i = (i + 1) % items.length;
      setActive(i);
    }, 2400);

    io.disconnect();
  }, { threshold: 0.25 });

  io.observe(section);
})();
