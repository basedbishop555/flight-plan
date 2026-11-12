/* docs.js: tap-to-copy on the Docs page */
document.querySelectorAll("[data-copy]").forEach(function (el) {
  el.addEventListener("click", function () {
    var t = document.getElementById("toast");
    (navigator.clipboard ? navigator.clipboard.writeText(el.getAttribute("data-copy")) : Promise.reject()).then(function () { t.textContent = "copied"; }, function () { t.textContent = "copy failed"; })
      .then(function () { t.style.opacity = 1; setTimeout(function () { t.style.opacity = 0; }, 900); });
  });
});
