/* ============================================================
   byplan — process-stepper.js
   Turns #stepsList (rendered from Google Sheets) into a horizontal stepper.

   Requirements:
   - In HTML, keep <ol id="stepsList"> ... </ol> (filled by app.js)
   - After this script loads, it will replace #stepsList with .process-stepper
   ============================================================ */

(() => {
  const doc = document;
  const qs = (sel, root = doc) => root.querySelector(sel);
  const qsa = (sel, root = doc) => Array.from(root.querySelectorAll(sel));

  const getStepData = (li) => {
    const titleEl = li.querySelector("strong");
    const title = (titleEl?.textContent || "").trim();

    // description: prefer <p>, but fallback to remaining text
    const pEls = qsa("p", li);
    const text = pEls.length
      ? pEls.map(p => (p.textContent || "").trim()).filter(Boolean).join("\n\n")
      : (li.textContent || "").replace(title, "").trim();

    return { title: title || "Шаг", text };
  };

  const buildStepper = (listEl) => {
    if (!listEl || listEl.dataset.upgraded === "1") return;
    const items = qsa("li", listEl);
    if (items.length === 0) return;

    const steps = items.map(getStepData);

    const stepper = doc.createElement("div");
    stepper.className = "process-stepper";

    const rail = doc.createElement("div");
    rail.className = "process-stepper__rail";
    rail.setAttribute("role", "tablist");
    rail.setAttribute("aria-label", "Этапы работы");

    const panel = doc.createElement("div");
    panel.className = "process-stepper__panel";
    panel.setAttribute("role", "tabpanel");

    const kicker = doc.createElement("div");
    kicker.className = "process-stepper__kicker";

    const title = doc.createElement("h3");
    title.className = "process-stepper__title";

    const text = doc.createElement("p");
    text.className = "process-stepper__text";

    panel.append(kicker, title, text);

    const tabs = steps.map((s, i) => {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "process-stepper__tab";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", "false");
      btn.dataset.index = String(i);

      const dot = doc.createElement("div");
      dot.className = "process-stepper__dot";
      dot.textContent = String(i + 1);

      const label = doc.createElement("span");
      label.className = "process-stepper__label";
      label.textContent = s.title;

      btn.append(dot, label);
      rail.append(btn);
      return btn;
    });

    stepper.append(rail, panel);

    // Replace original list
    listEl.dataset.upgraded = "1";
    listEl.replaceWith(stepper);

    let active = 0;
    let userInteracted = false;

    const setActive = (idx, opts = { scrollIntoView: true, animate: true }) => {
      const n = steps.length;
      active = Math.max(0, Math.min(n - 1, idx));

      tabs.forEach((t, i) => {
        t.classList.toggle("is-active", i === active);
        t.classList.toggle("is-done", i < active);
        t.setAttribute("aria-selected", i === active ? "true" : "false");
      });

      const progress = n > 1 ? (active / (n - 1)) : 0;
      stepper.style.setProperty("--progress", String(progress));

      kicker.textContent = `Шаг ${active + 1} из ${n}`;
      title.textContent = steps[active].title;

      // Render text with line breaks
      const raw = steps[active].text || "";
      text.textContent = raw;

      if (opts.animate){
        panel.classList.remove("is-animate");
        // force reflow
        void panel.offsetWidth;
        panel.classList.add("is-animate");
      }

      if (opts.scrollIntoView){
        try{ tabs[active].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }catch(e){}
      }
    };

    // Click navigation
    rail.addEventListener("click", (e) => {
      const btn = e.target.closest(".process-stepper__tab");
      if (!btn) return;
      userInteracted = true;
      setActive(parseInt(btn.dataset.index, 10), { scrollIntoView: true, animate: true });
    });

    // Keyboard navigation
    rail.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      userInteracted = true;
      setActive(active + (e.key === "ArrowRight" ? 1 : -1), { scrollIntoView: true, animate: true });
    });

    // Optional autoplay: once section enters view, cycle steps (stops on interaction)
    const section = doc.getElementById("process");
    if (section){
      const io = new IntersectionObserver((entries) => {
        const on = entries.some(x => x.isIntersecting);
        if (!on) return;

        let i = 0;
        const timer = setInterval(() => {
          if (userInteracted){ clearInterval(timer); return; }
          i = (i + 1) % steps.length;
          setActive(i, { scrollIntoView: false, animate: true });
        }, 2600);

        io.disconnect();
      }, { threshold: 0.25 });

      io.observe(section);
    }

    // Initial
    setActive(0, { scrollIntoView: false, animate: false });
  };

  const init = () => {
    const list = qs("#stepsList");
    if (!list) return;

    // If already filled, build immediately
    if (list.querySelector("li")){
      buildStepper(list);
      return;
    }

    // Else wait for Google Sheets render
    const mo = new MutationObserver(() => {
      if (!list.isConnected){ mo.disconnect(); return; }
      if (list.querySelector("li")){
        mo.disconnect();
        buildStepper(list);
      }
    });
    mo.observe(list, { childList: true, subtree: true });
  };

  if (doc.readyState !== "loading") init();
  else doc.addEventListener("DOMContentLoaded", init);
})();
