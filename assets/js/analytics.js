// Google Analytics 4 for the public pages of foreman-capital.com.
// It is not included in the portal, so nothing from client, member or applicant pages is sent.
// To change the property, replace the Measurement ID below.
(function () {
  var MEASUREMENT_ID = "G-HNN6FGZ0EP"";

  // Respect the browser's Global Privacy Control signal.
  if (navigator.globalPrivacyControl === true) return;

  // Send only the page address and campaign tags (utm_* and gclid), never anything else in the URL.
  var keep = new URLSearchParams();
  new URLSearchParams(location.search).forEach(function (value, key) {
    if (/^utm_/.test(key) || key === "gclid") keep.set(key, value);
  });
  var query = keep.toString();
  var pageLocation = location.origin + location.pathname + (query ? "?" + query : "");

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    page_location: pageLocation,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });

  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + MEASUREMENT_ID;
  document.head.appendChild(script);
})();
