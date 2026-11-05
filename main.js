// Foreman site behavior: mobile menu, deep links into questions, conditional form
// sections, and Netlify form submission. Loaded in <head> so the "js" class is set
// before first paint; everything else waits for the DOM.
document.documentElement.classList.add("js");

document.addEventListener("DOMContentLoaded", function () {
  setUpMenu();
  openDetailsFromHash();
  window.addEventListener("hashchange", openDetailsFromHash);
  document.querySelectorAll("[data-toggle-form]").forEach(setUpToggles);
  document.querySelectorAll("form.js-form").forEach(setUpForm);
});

function setUpMenu() {
  var toggle = document.querySelector(".menu-toggle");
  var nav = document.getElementById("site-nav");
  if (!toggle || !nav) return;

  function setOpen(open) {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  }

  toggle.addEventListener("click", function () {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  nav.addEventListener("click", function (event) {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });
  window.matchMedia("(min-width: 1020px)").addEventListener("change", function (mq) {
    if (mq.matches) setOpen(false);
  });
}

// Links that end in #question-id open the matching answer.
function openDetailsFromHash() {
  var id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  var target = document.getElementById(id);
  if (target && target.tagName === "DETAILS") target.open = true;
}

// Show a group of fields only for one answer to a radio question, e.g. the owner
// details on the contact form. Fields inside a hidden group stop being required.
function setUpToggles(form) {
  var groups = form.querySelectorAll("[data-show-when]");
  if (!groups.length) return;

  function update() {
    groups.forEach(function (group) {
      var rule = group.getAttribute("data-show-when").split("=");
      var checked = form.querySelector('input[name="' + rule[0] + '"]:checked');
      var show = checked ? checked.value === rule[1] : group.hasAttribute("data-show-by-default");
      group.hidden = !show;
      group.querySelectorAll("[data-required]").forEach(function (el) {
        el.required = show;
      });
    });
  }

  form.addEventListener("change", function (event) {
    if (event.target.type === "radio") update();
  });
  update();
}

function setUpForm(form) {
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    var button = form.querySelector('button[type="submit"]');
    var status = form.querySelector(".form-status");
    var label = button ? button.innerHTML : "";
    if (button) {
      button.disabled = true;
      button.textContent = "Sending…";
    }
    if (status) status.hidden = true;

    // In the design preview there is no Netlify backend, so nothing is sent.
    if (window.FOREMAN_PREVIEW) {
      setTimeout(function () { showDone(form, true); }, 350);
      return;
    }

    var body = new URLSearchParams(new FormData(form)).toString();
    fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Status " + response.status);
        showDone(form, false);
      })
      .catch(function () {
        if (button) {
          button.disabled = false;
          button.innerHTML = label;
        }
        if (status) {
          status.textContent =
            "Your message didn't go through. Check your connection and try again. " +
            "If it keeps failing, message us on LinkedIn and we'll reply there.";
          status.hidden = false;
        }
      });
  });
}

function showDone(form, preview) {
  var panel = document.createElement("div");
  panel.className = "form-done";
  panel.setAttribute("role", "status");
  panel.tabIndex = -1;

  var title = document.createElement("h3");
  title.textContent = form.dataset.doneTitle || "Thank you. We have your message.";
  var text = document.createElement("p");
  text.textContent = form.dataset.doneText || "We reply by email within a few business days.";
  panel.append(title, text);

  if (preview) {
    var note = document.createElement("p");
    note.className = "fine";
    note.textContent = "This is a design preview, so nothing was sent. On the live site, this form delivers to Foreman.";
    panel.append(note);
  }

  form.replaceWith(panel);
  panel.focus({ preventScroll: true });
  var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  panel.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
}
