if ("serviceWorker" in navigator) {
  globalThis.addEventListener("load", function () {
    globalThis.navigator.serviceWorker.register("/sw.js").then(function (registration) {
      console.log("ServiceWorker registration successful with scope: ", registration.scope);
    }, function (err) {
      console.log("ServiceWorker registration failed: ", err);
    });
  });
}
