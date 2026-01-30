import "./scss/GLSDk.scss";
import "./css/leaflet.css";

import WooCommerce from "./js/GLSDk-woo-commerce.js";
import GLSDkWidget from "./js/GLSDk-widget.js";

/**
 * Class GLSDk depends on jQuery.
 * Check if we are meant to append a map
 *
 * Platform dependent functions marked with @platformDependent
 */
class GLSDk {
  constructor(ajax_url) {
    console.log("GLSDkCONSTRUCT");
    this.markers = []; //pickup {lat, lng}
    this.isMapLoaded = false;
    this.gmaps_key = typeof GLSDk_maps_key == "undefined" ? "" : GLSDk_maps_key;
    this.openMapMarkerIcons = {};
    this.ajax_url = ajax_url; // platform dependent

    this.platform = new WooCommerce(this.ajax_url);

    this.platform.isCheckout();
    // 🚀 Initialize carrier before anything else
    setTimeout(() => {
      const carrierId = this.platform.getShippingMethodId();
      if (carrierId) {
        this.platform.setCarrier(carrierId);
        console.log("✅ Initial carrier set:", carrierId);
      } else {
        console.log("⚠️ No initial carrier found");
      }
    }, 500);

    this.init();
  }

  init() {
    console.log("Entered init");
    this.GLSDkWidget = new GLSDkWidget({
      host: "https://GLSDk.me",
      address: this.platform.getShippingData().Address,
      labels: {},
      mapParentContainer: "body",
      buttonParentContainer: "body",
      buttonClass: "",
      ajax_url: this.ajax_url,
      carrierId: this.platform.getShippingData().CarrierId,
      onPointSelected: () => {},
      gmapskey: typeof GLSDk_maps_key == "undefined" ? "" : GLSDk_maps_key,
    });
    this.GLSDkWidget.init();
    console.log("Finished init");
  }

  getPickupLocations(evt) {
    console.log("Choose Pickup Location");

    const loaderHtml = `
      <div class="GLSDk-loader-btn" style="position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background-color: rgba(0, 0, 0, 0.7) !important; z-index: 999999 !important; display: flex !important; justify-content: center !important; align-items: center !important;">
          <div class="loader-squares">
              <div class="loader-square"></div>
              <div class="loader-square"></div>
              <div class="loader-square"></div>
          </div>
      </div>`;

    jQuery("body").append(loaderHtml);

    // Safety check
    if (!this.GLSDkWidget) {
      console.error("GLSDkWidget not initialized yet!");
      jQuery(".GLSDk-loader-btn").remove();
      alert("Please wait, loading...");
      return;
    }

    this.GLSDkWidget.openMap();

    // Hide loader when map is loaded
    setTimeout(() => {
      jQuery(".GLSDk-loader-btn").remove();
    }, 3000);
  }
}
jQuery(document.body).on(
  "updated_checkout updated_shipping_method",
  function () {
    if (window.GLSDk && window.GLSDk.platform) {
      const carrierId = window.GLSDk.platform.getShippingMethodId() || 0;
      window.GLSDk.platform.setCarrier(carrierId);
      console.log(
        "WooCommerce checkout updated — carrier re-synced:",
        carrierId,
      );
    }
  },
);

// Expose GLSDk class globally
window.GLSDk = GLSDk;

// Initialize with retry pattern - keeps trying until woocommerce_params is available
(function initGLSDk() {
  if (
    typeof woocommerce_params !== "undefined" &&
    woocommerce_params.ajax_url
  ) {
    console.log(
      "🚀 Initializing GLSDk with ajax_url:",
      woocommerce_params.ajax_url,
    );
    window.GLSDk = new GLSDk(woocommerce_params.ajax_url);
  } else {
    setTimeout(initGLSDk, 100);
  }
})();
