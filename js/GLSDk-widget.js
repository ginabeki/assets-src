// eslint-disable-next-line prop-types

import GLSDkOpenMap2 from "./GLSDk-open-map.js";
import GLSDkGmaps from "./GLSDk-gmaps.js";
import Woocommerce from "./GLSDk-woo-commerce.js";

class GLSDkWidget {
  constructor(options) {
    this.pickupPoints = [];
    this.selectedPoint = null;
    this.options = options;

    this.markers = [];
    this.host = options.host || "https://GLSDk.me";
    this.debug = options.debug || 0;

    this.mapParentContainer = options.mapParentContainer || "body";
    this.buttonParentContainer = options.buttonParentContainer || "";
    this.buttonClass = this.options.button_class || "";
    this.labels = this.options.labels || {};

    this.platform = new Woocommerce(options.ajax_url);
    this.timeoutKeyDown = null;
    this.searchRunning = false;
    this.address = this.options.address || null;
    this.carrier_id = this.options.carrierId || 0;
    this.weekdaynames = [
      GLSDk_monday,
      GLSDk_tuesday,
      GLSDk_wednesday,
      GLSDk_thursday,
      GLSDk_friday,
      GLSDk_saturday,
      GLSDk_sunday,
    ];
    this.selectedDisplayOption = 0;
    this.cacheResults = {};

    this.lastMandatoryCarrierId = null; // Track which carrier we showed toast for
    this.hasShownToastForCarrier = false; // Track if we've shown toast for current carrier

    // Initialize checkout type detection
    this.checkoutType = this.detectCheckoutType();
    this.isPickupRequired = false;

    // Initialize checkout-specific functionality
    this.initializeCheckout();

    // Expose widget globally for access from other modules
    window.GLSDkWidget = this;
  }

  getFormChange() {
    let debounceTimer;
    let previousSelectedText = "";
    let $shippingLoader = null;
    jQuery(".wc-block-checkout__form").on("change", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        // Extract latest address data when form changes
        this.extractAddressData(true);

        const selectedText = this.getSelectedShippingText();

        // Only proceed if the selection has actually changed
        if (selectedText !== previousSelectedText) {
          previousSelectedText = selectedText;
          window.selectedText = selectedText;

          // Note: carrier_id is now extracted directly by API interceptor
        } else {
          // Remove loader if selection hasn't changed
          jQuery("#shipping-loader").remove();
        }
      }, 500);
    });
    this.enableButton();
  }

  // New helper method to get the selected shipping text
  getSelectedShippingText() {
    // Try to get the checked radio button's label text
    let selectedText = jQuery("fieldset.wc-block-checkout__shipping-option")
      .find(".wc-block-components-radio-control__input:checked")
      .closest("label")
      .find(".wc-block-components-radio-control__label")
      .text();

    // Fallback if nothing is selected
    if (!selectedText) {
      jQuery("fieldset.wc-block-checkout__shipping-option")
        .find(".wc-block-components-radio-control__option-layout")
        .each(function () {
          selectedText = jQuery(this)
            .find(".wc-block-components-radio-control__label")
            .text();
          return false; // Break after first item
        });
    }

    return selectedText;
  }

  detectCheckoutType() {
    // More comprehensive checkout type detection
    if (
      jQuery(".wc-block-checkout").length > 0 ||
      jQuery("[data-block-name='woocommerce/checkout']").length > 0 ||
      (window.wp && window.wp.data && window.wp.data.select("wc/store/cart"))
    ) {
      return "block";
    }

    if (
      jQuery("form.checkout").length > 0 ||
      jQuery(".woocommerce-checkout").length > 0 ||
      jQuery("#place_order").length > 0
    ) {
      return "classic";
    }

    return "unknown";
  }

  isBlockCheckout() {
    return this.checkoutType === "block";
  }

  isClassicCheckout() {
    return this.checkoutType === "classic";
  }

  initializeCheckout() {
    // Extract initial address data
    setTimeout(() => {
      if (this.isBlockCheckout()) {
        this.extractAddressData(true);
        this.initializeBlockCheckout();
      } else if (this.isClassicCheckout()) {
        this.extractClassicAddressData();
        this.initializeClassicCheckout();
      }
    }, 500); // Small delay to ensure form elements are available

    // Set up global reference for compatibility
    window.GLSDkPickupManager = this;
  }

  initializeBlockCheckout() {
    // Set up API interceptor for block checkout
    this.setupAPIInterceptor();

    jQuery(document).ready(() => {
      this.waitForBlockCheckoutElements();
    });
  }

  setupAPIInterceptor() {
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const [resource, config] = args;

      // Debug: Log all fetch requests to WC API
      if (
        typeof resource === "string" &&
        resource.includes("/wp-json/wc/store/")
      ) {
      }

      // Check if this is the shipping rate selection API call
      if (
        typeof resource === "string" &&
        resource.includes("/wp-json/wc/store/v1/cart/select-shipping-rate")
      ) {
        try {
          // Extract carrier_id from the request body before sending
          if (config && config.body) {
            try {
              const requestData = JSON.parse(config.body);

              if (requestData.rate_id) {
                const carrierId = this.extractCarrierIdFromMethodId(
                  requestData.rate_id,
                );
                if (carrierId) {
                  this.carrier_id = carrierId;
                  window.carrier_id = carrierId;

                  // Set the carrier ID for the map interface if available
                  if (this.mapinterface && this.mapinterface.setCarrierId) {
                    this.mapinterface.setCarrierId(this.carrier_id);
                  }
                }
              }
            } catch (parseError) {}
          }

          const response = await originalFetch(...args);

          // Process the response
          if (response.ok) {
            this.removeAllPickupButtons();
            setTimeout(() => this.checkShippingRates(), 200);
          } else {
          }

          return response;
        } catch (error) {
          console.error("Error in shipping rate API call:", error);
          return originalFetch(...args);
        }
      }

      // For all other requests, use original fetch
      return originalFetch(...args);
    };

    // Also intercept XMLHttpRequest for older implementations
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._url = url;
      return originalXHROpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      // Debug: Log all XHR calls to WC API
      if (this._url && this._url.includes("/wp-json/wc/store/")) {
      }

      if (
        this._url &&
        this._url.includes("/wp-json/wc/store/v1/cart/select-shipping-rate")
      ) {
        // Try to extract carrier_id from request data
        if (args[0] && window.GLSDkPickupManager) {
          try {
            const requestData = JSON.parse(args[0]);

            if (requestData.rate_id) {
              const carrierId =
                window.GLSDkPickupManager.extractCarrierIdFromMethodId(
                  requestData.rate_id,
                );
              if (carrierId) {
                window.GLSDkPickupManager.carrier_id = carrierId;
                window.carrier_id = carrierId;

                // Set the carrier ID for the map interface if available
                if (
                  window.GLSDkPickupManager.mapinterface &&
                  window.GLSDkPickupManager.mapinterface.setCarrierId
                ) {
                  window.GLSDkPickupManager.mapinterface.setCarrierId(
                    carrierId,
                  );
                }
              }
            }
          } catch (parseError) {}
        }

        const originalOnLoad = this.onload;
        this.onload = function (event) {
          if (this.status >= 200 && this.status < 300) {
            // Use a reference to the manager instance
            if (window.GLSDkPickupManager) {
              window.GLSDkPickupManager.removeAllPickupButtons();
              setTimeout(
                () => window.GLSDkPickupManager.checkShippingRates(),
                200,
              );
            }
          } else {
          }

          if (originalOnLoad) {
            originalOnLoad.call(this, event);
          }
        };
      }

      return originalXHRSend.call(this, ...args);
    };

    // Also intercept jQuery AJAX calls if jQuery is available
    if (window.jQuery) {
      const originalAjax = jQuery.ajax;
      jQuery.ajax = function (options) {
        // Debug: Log all jQuery AJAX calls to WC API
        if (options.url && options.url.includes("/wp-json/wc/store/")) {
        }

        if (
          options.url &&
          options.url.includes("/wp-json/wc/store/v1/cart/select-shipping-rate")
        ) {
          // Try to extract carrier_id from request data
          if (options.data && window.GLSDkPickupManager) {
            try {
              let requestData = options.data;
              if (typeof requestData === "string") {
                requestData = JSON.parse(requestData);
              }

              if (requestData.rate_id) {
                const carrierId =
                  window.GLSDkPickupManager.extractCarrierIdFromMethodId(
                    requestData.rate_id,
                  );
                if (carrierId) {
                  window.GLSDkPickupManager.carrier_id = carrierId;
                  window.carrier_id = carrierId;

                  // Set the carrier ID for the map interface if available
                  if (
                    window.GLSDkPickupManager.mapinterface &&
                    window.GLSDkPickupManager.mapinterface.setCarrierId
                  ) {
                    window.GLSDkPickupManager.mapinterface.setCarrierId(
                      carrierId,
                    );
                  }
                }
              }
            } catch (parseError) {}
          }

          const originalSuccess = options.success;
          options.success = function (data, textStatus, jqXHR) {
            if (window.GLSDkPickupManager) {
              window.GLSDkPickupManager.removeAllPickupButtons();
              setTimeout(
                () => window.GLSDkPickupManager.checkShippingRates(),
                200,
              );
            }

            if (originalSuccess) {
              originalSuccess.call(this, data, textStatus, jqXHR);
            }
          };

          const originalError = options.error;
          options.error = function (jqXHR, textStatus, errorThrown) {
            if (originalError) {
              originalError.call(this, jqXHR, textStatus, errorThrown);
            }
          };
        }

        return originalAjax.call(this, options);
      };
    }
  }

  extractCarrierIdFromMethodId(methodId) {
    // Pattern: shipping_GLSDk_<carrier_id>:instance_id
    // Example: shipping_GLSDk_123:1 or shipping_GLSDk_456
    const regex = /shipping_GLSDk_(\d+)/;
    const match = methodId.match(regex);

    if (match && match[1]) {
      const carrierId = parseInt(match[1]);
      return carrierId;
    }

    return null;
  }

  waitForBlockCheckoutElements() {
    let hasRunCheckVisibility = false;
    let hasRunPlaceOrderCheck = false;

    // Check visibility for shipping options (run only once)
    const checkVisibility = setInterval(() => {
      const inputElement = jQuery(
        ".wc-block-components-shipping-rates-control__package",
      );
      if (inputElement.is(":visible") && !hasRunCheckVisibility) {
        hasRunCheckVisibility = true;
        clearInterval(checkVisibility);

        this.setupBlockShippingHandlers();
      }
    }, 500);

    // Check visibility for "Place Order" button (run only once)
    const placeOrderCheck = setInterval(() => {
      const placeOrderButton = jQuery(
        ".wc-block-components-checkout-place-order-button",
      );
      if (placeOrderButton.is(":visible") && !hasRunPlaceOrderCheck) {
        hasRunPlaceOrderCheck = true;
        clearInterval(placeOrderCheck);

        this.setupBlockPlaceOrderHandler();
      }
    }, 500);
  }

  setupBlockShippingHandlers() {
    // Extract address data first
    this.extractAddressData(true);

    window.selectedText = this.getSelectedShippingText();

    // Try to extract initial carrier_id if we have WP data store available
    this.extractInitialCarrierId();

    this.getFormChange();
    this.getOnClick();
  }

  extractInitialCarrierId() {
    if (window.wp && window.wp.data) {
      try {
        const cartData = window.wp.data.select("wc/store/cart").getCartData();

        if (cartData && cartData.shippingRates && cartData.shippingRates[0]) {
          const shippingRates = cartData.shippingRates[0].shipping_rates;
          const selectedRate = shippingRates.find(
            (rate) => rate.selected === true,
          );

          if (selectedRate && selectedRate.rate_id) {
            const carrierId = this.extractCarrierIdFromMethodId(
              selectedRate.rate_id,
            );
            if (carrierId) {
              this.carrier_id = carrierId;
              window.carrier_id = carrierId;

              // Set the carrier ID for the map interface if available
              if (this.mapinterface && this.mapinterface.setCarrierId) {
                this.mapinterface.setCarrierId(this.carrier_id);
              }
            } else {
            }
          }
        }
      } catch (error) {}
    } else {
    }
  }

  extractAddressData(isBlockCheckout = true) {
    let address,
      address2,
      city,
      postalCode,
      state,
      country = "";

    if (isBlockCheckout) {
      // Block checkout field extraction
      address =
        jQuery("#shipping-address_1").val() ||
        jQuery("#billing-address_1").val() ||
        "";
      address2 =
        jQuery("#shipping-address_2").val() ||
        jQuery("#billing-address_2").val() ||
        "";
      city =
        jQuery("#shipping-city").val() || jQuery("#billing-city").val() || "";
      postalCode =
        jQuery("#shipping-postcode").val() ||
        jQuery("#billing-postcode").val() ||
        "";
      state =
        jQuery("#shipping-state").val() || jQuery("#billing-state").val() || "";

      // Block checkout country detection
      const countrySelectors = [
        "#components-form-token-input-0",
        'input[aria-label*="Country/Region"]',
        "#shipping-country option:selected",
        "#billing-country option:selected",
      ];

      for (const selector of countrySelectors) {
        const element = jQuery(selector);
        if (element.length) {
          country = selector.includes("option:selected")
            ? element.text()
            : element.val();
          break;
        }
      }
    } else {
      // Classic checkout - check if shipping to different address
      const useShipping = jQuery("#ship-to-different-address input").is(
        ":checked",
      );
      const prefix = useShipping ? "shipping" : "billing";

      address = jQuery(`#${prefix}_address_1`).val() || "";
      address2 = jQuery(`#${prefix}_address_2`).val() || "";
      city = jQuery(`#${prefix}_city`).val() || "";
      postalCode = jQuery(`#${prefix}_postcode`).val() || "";
      state = jQuery(`#${prefix}_state`).val() || "";
      country = jQuery(`#${prefix}_country option:selected`).text() || "";
    }

    // Update the address object
    this.options.address = {
      Lat: "",
      Long: "",
      Streetname1: address,
      Streetname2: address2,
      HouseNumber: "",
      NumberExtension: "",
      PostalCode: postalCode,
      s_postcode: postalCode,
      City: city,
      Country: country,
      State: state,
    };

    // Set global variable for compatibility
    window.GLSDk_shipping_address = {
      Address: this.options.address,
      ...(isBlockCheckout
        ? {}
        : {
            post_data: jQuery("form.checkout").serialize(),
            CarrierId: this.carrier_id || 0,
          }),
    };
  }

  setupBlockPlaceOrderHandler() {
    jQuery(".wc-block-components-checkout-place-order-button").on(
      "click",
      (e) => {
        let shipping_pickup_id = jQuery("#shipping_pickup_id").val();

        // Check if current shipping method requires pickup and no pickup point is selected
        if (
          this.isPickupRequired &&
          (!shipping_pickup_id || shipping_pickup_id === "")
        ) {
          e.preventDefault();
          this.showPickupMandatoryModal();
          return false;
        }
      },
    );
  }

  initializeClassicCheckout() {
    jQuery(document).ready(() => {
      // Check for classic checkout elements
      const checkClassicCheckout = setInterval(() => {
        const checkoutForm = jQuery("form.checkout, .woocommerce-checkout");
        if (checkoutForm.length > 0) {
          clearInterval(checkClassicCheckout);
          this.setupClassicCheckoutHandlers();
        }
      }, 500);
    });
  }

  async setupClassicCheckoutHandlers() {
    // Listen for form changes to pick up shipping data
    jQuery('form[name="checkout"]').on("change", () => {
      this.handleClassicShippingChange();
    });
  }

  async handleClassicShippingChange() {
    // Extract address data first
    this.extractClassicAddressData();
  }

  extractClassicAddressData() {
    this.extractAddressData(false);
  }

  getClassicSelectedShippingMethod() {
    // Try to get checked radio button
    let checkedRadio = jQuery('#shipping_method input[type="radio"]:checked');
    let selectedText = checkedRadio
      .siblings("label")
      .text()
      .split(":")[0]
      .trim();

    // Fallback: get first shipping method if none selected
    if (!selectedText) {
      const shippingMethodsList = document.querySelector("#shipping_method");
      if (shippingMethodsList) {
        const shippingMethodItems = shippingMethodsList.querySelectorAll("li");
        shippingMethodItems.forEach((item) => {
          const labelElement = item.querySelector("label");
          if (labelElement) {
            const labelText = labelElement.textContent.trim();
            selectedText = labelText.split(":")[0].trim();
          }
        });
      }
    }

    return selectedText;
  }

  createModal(config) {
    const modal = jQuery("<div>", {
      id: config.id,
      css: {
        display: "block",
        position: "fixed",
        "z-index": "9999",
        left: "0",
        top: "0",
        width: "100%",
        height: "100%",
        overflow: "auto",
        "background-color": "rgba(0,0,0,0.4)",
      },
    });

    const modalContent = jQuery("<div>", {
      css: {
        "background-color": "#fefefe",
        margin: "15% auto",
        padding: "20px",
        border: "1px solid #888",
        width: "80%",
        "max-width": "500px",
        "border-radius": "5px",
        "text-align": "center",
      },
    });

    const closeButton = jQuery("<span>", {
      text: "×",
      css: {
        color: "#aaa",
        float: "right",
        "font-size": "28px",
        "font-weight": "bold",
        cursor: "pointer",
      },
    });

    const message = jQuery("<p>", {
      text: config.message,
      css: {
        "font-size": "16px",
        margin: "20px 0",
        color: "#333",
      },
    });

    modalContent.append(closeButton);
    modalContent.append(message);

    // Add custom buttons if provided
    if (config.buttons) {
      config.buttons.forEach((buttonConfig) => {
        const button = jQuery("<button>", buttonConfig.props);
        modalContent.append(button);
        if (buttonConfig.handler) {
          button.on("click", buttonConfig.handler);
        }
      });
    }

    modal.append(modalContent);
    jQuery("body").append(modal);

    const closeModal = () => modal.remove();

    closeButton.on("click", closeModal);
    jQuery(window).on("click", (event) => {
      if (jQuery(event.target).is(modal)) {
        closeModal();
      }
    });

    return { modal, closeModal };
  }

  showPickupMandatoryModal() {
    const { closeModal } = this.createModal({
      id: "pickupMandatoryModal",
      message: GLSDk_mandatory_point,
      buttons: [
        {
          props: {
            text: GLSDk_choose_pickup_location || "Choose Pickup Location",
            class: "button alt GLSDk-pick-location",
          },
          handler: (event) => {
            closeModal();
            event.preventDefault();
            this.handlePickupButtonClick();
          },
        },
        {
          props: {
            text: "OK",
            css: {
              "background-color": "#666",
              color: "white",
              border: "none",
              padding: "6px 10px",
              "border-radius": "4px",
              cursor: "pointer",
              "margin-left": "10px",
            },
          },
          handler: closeModal,
        },
      ],
    });
  }

  checkShippingRates() {
    // This method will be called by the API interceptor
    // Note: carrier_id is now extracted directly from the API request
    if (this.isBlockCheckout()) {
      // For block checkout, get the selected method text and extract address
      const selectedText = this.getSelectedShippingText();
      if (selectedText) {
        window.selectedText = selectedText;
        // Extract latest address data
        this.extractAddressData(true);
      }
    }
  }

  getOnClick() {
    jQuery("#sw-query-btn").on("click", () => {
      this.geocodeQuery(true);
    });

    jQuery('form[name="checkout"]').on("change", () => {
      // This function will be triggered when any form field inside the "checkout" form is changed
      this.getFormShippingData();
      // You can perform your desired actions here
    });
  }

  getFormShippingData() {
    // Use the improved address extraction for classic checkout
    this.extractClassicAddressData();
  }

  getGLSDkId(mage_id) {
    var carrier_id = mage_id.match(/([\d]+)_pickup/);
    if (carrier_id != null) {
      return carrier_id[1];
    }

    for (let x = 0; x < GLSDk_carriers.length; ++x) {
      if (GLSDk_carriers[x].ClassName === mage_id) {
        return typeof GLSDk_carriers[x].Id == "object"
          ? GLSDk_carriers[x].Id["0"]
          : GLSDk_carriers[x].Id;
      }
    }

    return 0;
  }

  /*
   * Adds the map to the page
   */
  init() {
    this.options.address && this.setAddress(this.options.address);
    this.loadScripts();

    !this.options.address &&
      localStorage.getItem("GLSDkAddress") &&
      this.setAddress(JSON.parse(localStorage.getItem("GLSDkAddress")));

    // Add pickup button functionality for WooCommerce checkout
    this.initPickupButtons();
  }

  initPickupButtons() {
    // Setup event listeners for shipping method changes
    this.setupPickupEventListeners();

    // Check initial state
    setTimeout(() => this.checkShippingRatesForPickup(), 1000);
  }

  setupPickupEventListeners() {
    // WordPress data store listener
    if (window.wp && window.wp.data) {
      window.wp.data.subscribe(() => {
        this.checkShippingRatesForPickup();
      });
    }

    // API interceptor for shipping rate changes
    const originalFetch = window.fetch;
    const self = this;

    window.fetch = async (...args) => {
      const [resource, config] = args;

      if (
        typeof resource === "string" &&
        resource.includes("/wp-json/wc/store/v1/cart/select-shipping-rate")
      ) {
        try {
          const response = await originalFetch(...args);

          if (response.ok) {
            self.removeAllPickupButtons();
            self.clearPickupPointData();
            setTimeout(() => self.checkShippingRatesForPickup(), 200);
          }

          return response;
        } catch (error) {
          return originalFetch(...args);
        }
      }

      return originalFetch(...args);
    };

    // DOM change listeners as fallback
    document.addEventListener("change", (event) => {
      if (event.target.matches('input[name*="shipping"]')) {
        this.removeAllPickupButtons();
        this.clearPickupPointData();
        setTimeout(() => this.checkShippingRatesForPickup(), 100);
      }
    });

    document.addEventListener("updated_checkout", () => {
      this.removeAllPickupButtons();
      this.clearPickupPointData();
      setTimeout(() => this.checkShippingRatesForPickup(), 200);
    });
  }
  showToast(message, duration = 4000) {
    // Remove any existing toasts first
    jQuery(".GLSDk-toast").remove();

    const toast = jQuery("<div>", {
      html: message,
      class: "GLSDk-toast", // Add class for easier targeting
      css: {
        position: "fixed",
        bottom: "40px",
        right: "40px",
        background: "#111",
        color: "#fff",
        padding: "14px 20px",
        "border-radius": "6px",
        "font-size": "15px",
        "box-shadow": "0 3px 10px rgba(0,0,0,0.3)",
        "z-index": "99999",
        opacity: "0",
        transition: "opacity 0.3s ease",
      },
    });

    jQuery("body").append(toast);
    setTimeout(() => toast.css("opacity", "1"), 50);
    setTimeout(() => toast.fadeOut(400, () => toast.remove()), duration);
  }

  checkShippingRatesForPickup() {
    if (!window.wp || !window.wp.data) return;

    try {
      const placeOrderBtn = jQuery(
        ".wc-block-components-checkout-place-order-button, #place_order",
      );

      const cartData = window.wp.data.select("wc/store/cart").getCartData();
      if (!cartData || !cartData.shippingRates || !cartData.shippingRates[0]) {
        return;
      }

      const shippingRates = cartData.shippingRates[0].shipping_rates;
      const selectedRate = shippingRates.find((rate) => rate.selected === true);
      if (!selectedRate) return;

      this.currentSelectedRate = selectedRate;

      // --- Extract meta info safely ---
      const pickupMandatoryMeta = selectedRate.meta_data?.find(
        (meta) => meta.key === "pickup_mandatory",
      );
      const pickupMandatoryValue = pickupMandatoryMeta
        ? pickupMandatoryMeta.value
        : "0";

      // ✅ Check BOTH hidden field and localStorage for pickup ID
      const pickupIdField = jQuery("#shipping_pickup_id").val();
      const pickupIdStorage = localStorage.getItem("GLSDkPointId");
      const pickupId = pickupIdField || pickupIdStorage;

      // Get current carrier ID
      const currentCarrierId = this.extractCarrierIdFromMethodId(
        selectedRate.rate_id,
      );

      // --- Handle each pickup state ---
      if (pickupMandatoryValue === "1") {
        // 🔸 Mandatory pickup
        this.isPickupRequired = true;

        if (!pickupId || pickupId === "") {
          // No pickup selected - disable button
          this.disableButton();

          // Remove any existing notice
          jQuery("#pickup-required-notice").remove();

          // ✅ ONLY show toast if we haven't shown it for this carrier yet
          // OR if we switched back to this carrier after switching away
          if (
            !this.hasShownToastForCarrier ||
            this.lastMandatoryCarrierId !== currentCarrierId
          ) {
            this.showToast(
              "<strong>Pickup required:</strong> Please select a pickup location to complete checkout.",
            );
            this.hasShownToastForCarrier = true;
            this.lastMandatoryCarrierId = currentCarrierId;
          }
        } else {
          // ✅ Pickup IS selected - enable button and clear flags
          this.isPickupRequired = false;
          this.enableButton();
          jQuery("#pickup-required-notice").remove();
          this.hasShownToastForCarrier = false;
          this.lastMandatoryCarrierId = null;
        }
      } else if (pickupMandatoryValue === "2") {
        // 🚫 Pickup impossible - immediately clear everything
        this.isPickupRequired = false;
        this.removeAllPickupButtons();
        this.clearPickupPointData();
        this.clearPickupSessionData();
        this.enableButton();

        // ✅ IMMEDIATELY remove any notices/toasts
        jQuery("#pickup-required-notice").remove();
        jQuery(".GLSDk-toast").remove();
        this.hasShownToastForCarrier = false;
        this.lastMandatoryCarrierId = null;
      } else {
        // 🟢 Optional pickup - immediately clear everything
        this.isPickupRequired = false;
        this.enableButton();

        // ✅ IMMEDIATELY remove any notices/toasts
        jQuery("#pickup-required-notice").remove();
        jQuery(".GLSDk-toast").remove();
        this.hasShownToastForCarrier = false;
        this.lastMandatoryCarrierId = null;
      }

      // --- Set carrier_id for the map ---
      if (currentCarrierId) {
        this.carrier_id = currentCarrierId;
        window.carrier_id = currentCarrierId;

        if (this.mapinterface && this.mapinterface.setCarrierId) {
          this.mapinterface.setCarrierId(this.carrier_id);
        }
      }

      // --- Add pickup button if needed ---
      const hasPickup = this.hasPickupCapability(selectedRate);
      if (pickupMandatoryValue !== "2" && hasPickup) {
        this.addPickupButton(selectedRate);
      } else {
        this.removeAllPickupButtons();
        // Only clear if no pickup is selected
        if (!pickupId) {
          this.clearPickupPointData();
          this.clearPickupSessionData();
        }
      }
    } catch (error) {
      console.error("Error checking shipping rates:", error);
    }
  }

  selectPoint(pickup) {
    this.selectedPoint = pickup;

    // 🧱 Ensure all hidden fields exist and are set
    const hiddenFields = [
      { id: "GLSDkpickup", value: pickup.PointId },
      { id: "shipping_pickup_id", value: pickup.PointId },
      {
        id: "shipping_pickup_label",
        value: `${pickup.Information.Name} ${pickup.Information.Address}`,
      },
      {
        id: "shipping_carrier_id",
        value: this.carrier_id || window.carrier_id || pickup.Carrier.Id,
      },
    ];

    hiddenFields.forEach((field) => {
      let element = jQuery(`#${field.id}`);
      if (element.length === 0) {
        element = jQuery(
          `<input type="hidden" id="${field.id}" name="${field.id}" />`,
        );
        jQuery("form.checkout, .wc-block-checkout").append(element);
      }
      element.val(field.value);
    });

    // Store in localStorage
    localStorage.setItem("GLSDkPointId", pickup.PointId);
    localStorage.setItem("GLSDkPointLabel", pickup.Information.Name);

    // Update pickup description display
    if (jQuery("#GLSDk-pickup__description").length) {
      jQuery("#GLSDk-pickup__description").show();
    }
    if (jQuery(".GLSDk-pickup__description").length) {
      jQuery(".GLSDk-pickup__description")
        .show()
        .html(pickup.Information.Name + " " + pickup.Information.Address);
    }

    /** Validate additional fields if required **/
    let eFieldInfo = jQuery("#sw-map-selected-point");
    if (this.selectedDisplayOption == 1) {
      eFieldInfo = jQuery("#sw-list-points");
    }

    if (
      typeof pickup.MapFieldsSelect != "undefined" &&
      pickup.MapFieldsSelect.length > 0
    ) {
      let extrasValid = true;
      eFieldInfo.find(".GLSDk_mapfields" + pickup.PointId).each((idx, elem) => {
        let eExtra = jQuery(elem);
        if (!eExtra.val()) {
          alert(
            jQuery(
              jQuery(".GLSDk_mapfieldslabel" + pickup.PointId).get(idx),
            ).text() +
              ": " +
              this.options.labels.mapfieldmandatory,
          );
          extrasValid = false;
        }
      });

      if (!extrasValid) {
        return false;
      }
    }

    const pickupPoint = {
      id_carrier: this.carrier_id,
      pickup_id: this.selectedPoint.PointId,
      pickup_label:
        (this.selectedPoint.Information.Name
          ? this.selectedPoint.Information.Name + "<br/>"
          : "") + this.selectedPoint.Information.Address,
      action: "GLSDk_save_pickup",
    };

    // Handle extra fields
    eFieldInfo
      .find(".GLSDk_mapfields" + this.selectedPoint.PointId)
      .each(function (idx, elem) {
        let fieldid = jQuery(elem).attr("data-id");
        let fieldvalue = jQuery(elem).val();
        if (!pickupPoint["OptionFields"]) {
          pickupPoint["OptionFields"] = [];
        }
        pickupPoint["OptionFields"].push({ Id: fieldid, Value: fieldvalue });
        localStorage.setItem(fieldid + "val", fieldvalue);
      });

    // Save pickup point
    if (typeof this.options.ajax_url == "undefined") {
      this.options.onPointSelected(pickup, "");
    } else {
      this.platform.setPickupPoint(pickup);
    }

    // ✅ CRITICAL: Set flag to indicate point was just selected
    this.isPickupRequired = false; // Reset the requirement flag

    // Enable the button immediately
    this.enableButton();

    // Remove any notices
    jQuery("#pickup-required-notice").remove();

    // Close the map
    this.closeMap();
    jQuery("#myModal").hide();

    // Force enable place order button for both Block and Classic checkout
    jQuery("#place_order, .wc-block-components-checkout-place-order-button")
      .prop("disabled", false)
      .css({
        "background-color": "black",
        cursor: "pointer",
        opacity: "1",
      });

    // ✅ Wait a moment for DOM to update, then re-check to ensure button stays enabled
    setTimeout(() => {
      if (jQuery("#shipping_pickup_id").val()) {
        this.enableButton();
        jQuery("#pickup-required-notice").remove();
      }
    }, 100);

    this.hasShownToastForCarrier = false;
    this.lastMandatoryCarrierId = null;

    // Remove any active toasts
    jQuery(".GLSDk-toast").remove();

    return true;
  }

  hasPickupCapability(rate) {
    if (!rate.meta_data) {
      return false;
    }

    // Debug: log all meta_data to see what's available

    const hasPickupMeta = rate.meta_data.find(
      (meta) => meta.key === "has_pickup" && meta.value === "1",
    );

    return !!hasPickupMeta;
  }

  /**
   * Check if the current carrier/rate is international
   * Returns true if is_international meta is found and set to true/1
   */
  isInternationalCarrier(rate) {
    if (!rate || !rate.meta_data) {
      return null;
    }

    const isInternationalMeta = rate.meta_data.find(
      (meta) => meta.key === "is_international",
    );

    if (isInternationalMeta) {
      // Check if value is truthy (true, '1', 1)
      return (
        isInternationalMeta.value === true ||
        isInternationalMeta.value === "1" ||
        isInternationalMeta.value === 1
      );
    }

    return null; // Meta key not found
  }

  /**
   * Get checkout address from backend
   */
  getCheckoutAddress(callback) {
    if (!this.platform.ajax_url) {
      console.error("Ajax URL not available");
      callback(null);
      return;
    }

    jQuery
      .get(this.platform.ajax_url, {
        action: "GLSDk_get_checkout_address",
      })
      .done((response) => {
        try {
          const data =
            typeof response === "string" ? JSON.parse(response) : response;
          callback(data);
        } catch (error) {
          console.error("Error parsing checkout address response:", error);
          callback(null);
        }
      })
      .fail((error) => {
        console.error("Error fetching checkout address:", error);
        callback(null);
      });
  }

  /**
   * Check if address has changed by comparing key fields
   */
  hasAddressChanged(currentAddress, backendAddress) {
    if (!currentAddress || !backendAddress) {
      return true; // Consider changed if either is missing
    }

    // Compare key fields
    const fieldsToCompare = [
      { current: "Country", backend: "country" },
      { current: "City", backend: "city" },
      { current: "PostalCode", backend: "postcode" },
      { current: "Streetname1", backend: "address_1" },
      { current: "State", backend: "state" },
    ];

    for (const field of fieldsToCompare) {
      const currentValue = (currentAddress[field.current] || "")
        .toString()
        .trim();
      const backendValue = (backendAddress[field.backend] || "")
        .toString()
        .trim();

      if (currentValue !== backendValue) {
        return true;
      }
    }

    return false; // No changes detected
  }

  /**
   * Proceed with bpost geocoding after address validation
   */
  proceedWithBpostGeocoding(address, f_callback) {
    // For bpost plugin, determine the country based on is_international meta key
    let countryForGeocoding = address.Country || "BE"; // Default to address country or Belgium

    if (this.currentSelectedRate) {
      const isInternational = this.isInternationalCarrier(
        this.currentSelectedRate,
      );

      if (isInternational === false) {
        // Not international - always use Belgium
        countryForGeocoding = "BE";
      } else if (isInternational === true) {
        // International - use the actual address country
        countryForGeocoding = address.Country || "BE";
      } else {
        // Meta key not found - use address country or fall back to Belgium
        countryForGeocoding = address.Country || "BE";
      }
    }

    this.mapinterface.geocodeAddressPartsBpost(
      (geocode) => {
        if (!geocode.lat) {
          return this.mapinterface.geocodeAddressPartsBpost(
            (geocode) => {
              f_callback(geocode);
            },
            address.City,
            countryForGeocoding,
          );
        }

        f_callback(geocode);
      },
      address.City,
      countryForGeocoding,
      address.PostalCode,
      address.Streetname1,
    );
  }

  isCurrentShippingMethodPickupRequired() {
    // For block checkout
    if (this.isBlockCheckout() && window.wp && window.wp.data) {
      try {
        const cartData = window.wp.data.select("wc/store/cart").getCartData();

        if (
          !cartData ||
          !cartData.shippingRates ||
          !cartData.shippingRates[0]
        ) {
          return false;
        }

        const shippingRates = cartData.shippingRates[0].shipping_rates;
        const selectedRate = shippingRates.find(
          (rate) => rate.selected === true,
        );

        if (selectedRate) {
          const isPickupMandatory = this.isPickupMandatory(selectedRate);
          return isPickupMandatory;
        }
      } catch (error) {
        console.error("Error checking block checkout shipping rates:", error);
      }
    }

    // For classic checkout - check if current shipping method has pickup_mandatory
    if (this.isClassicCheckout()) {
      // Try to get the selected shipping method and check if it has pickup_mandatory
      const selectedMethodElement = jQuery(
        'input[name^="shipping_method"]:checked',
      );
      if (selectedMethodElement.length) {
        // For classic checkout, we need to check if pickup is mandatory for the selected method
        // This would typically be set when the shipping rates are loaded
        // For now, check if pickup button exists as fallback
        const pickupButtonExists = jQuery(".GLSDk-pick-location").length > 0;
        return pickupButtonExists;
      }
    }

    return false;
  }

  isPickupMandatory(rate) {
    if (!rate.meta_data) {
      return false;
    }

    // Debug: log all meta_data to see what's available

    const pickupMandatoryMeta = rate.meta_data.find(
      (meta) => meta.key === "pickup_mandatory" && meta.value === "1",
    );

    return !!pickupMandatoryMeta;
  }

  addPickupButton(selectedRate) {
    this.removeAllPickupButtons();

    const shippingElement = this.findShippingMethodElement(
      selectedRate.rate_id,
    );

    if (!shippingElement) {
      return;
    }

    // Ensure carrier_id is extracted and set before creating the button
    if (!this.carrier_id) {
      const carrierId = this.extractCarrierIdFromMethodId(selectedRate.rate_id);
      if (carrierId) {
        this.carrier_id = carrierId;
        window.carrier_id = carrierId;

        // Set the carrier ID for the map interface if available
        if (this.mapinterface && this.mapinterface.setCarrierId) {
          this.mapinterface.setCarrierId(this.carrier_id);
        }
      }
    }

    const button = this.createPickupButton(selectedRate);
    const insertionPoint = this.findInsertionPoint(shippingElement);

    if (insertionPoint) {
      insertionPoint.appendChild(button);
    }
  }

  findShippingMethodElement(rateId) {
    const selectors = [
      `input[value="${rateId}"]`,
      `input[id*="${rateId}"]`,
      `[data-rate-id="${rateId}"]`,
      `input[name*="shipping"][value*="${rateId.split(":")[1]}"]`,
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }

    return null;
  }

  findInsertionPoint(shippingElement) {
    const candidates = [
      shippingElement.closest("li"),
      shippingElement.closest(
        ".wc-block-components-shipping-rates-control__option",
      ),
      shippingElement.closest("label"),
      shippingElement.parentElement,
    ].filter(Boolean);

    return candidates[0] || shippingElement.parentElement;
  }

  createPickupButton(selectedRate) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "button alt GLSDk-pick-location";
    button.textContent =
      window.GLSDk_choose_pickup_location || "Choose Pickup Location";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      this.handlePickupButtonClick(selectedRate);
    });

    return button;
  }

  handlePickupButtonClick(selectedRate) {
    // Check if all required address fields are filled
    if (!this.areAddressFieldsFilled()) {
      this.showAddressRequiredMessage();
      return;
    }

    // Set carrier_id for pickup system - use the carrier_id we got from the API check
    // but fallback to selectedRate.instance_id if needed
    if (this.carrier_id && this.carrier_id !== 0) {
      window.carrier_id = this.carrier_id;
    } else {
      window.carrier_id = selectedRate && selectedRate.instance_id;
    }

    // Use the existing openMap functionality
    this.openMap();
  }

  removeAllPickupButtons() {
    const existingButtons = document.querySelectorAll(".GLSDk-pick-location");
    existingButtons.forEach((button) => button.remove());
  }

  clearPickupPointData() {
    // 🧠 Only clear if NO pickup is currently selected
    const currentPickup = jQuery("#GLSDkpickup").val();

    if (currentPickup && currentPickup !== "") {
      return;
    }

    const fieldsToClean = [
      "#shipping_pickup_id",
      "#shipping_pickup_label",
      "#shipping_carrier_id",
      "#shipping_pickup_extended",
      "#GLSDkpickup",
    ];

    fieldsToClean.forEach((selector) => {
      const field = jQuery(selector);
      if (field.length) {
        field.val("");
      }
    });

    jQuery(
      ".pickup-label-display, .selected-pickup-point, .pickup-point-display, .selected-pickup-info",
    ).remove();

    jQuery(".GLSDk-pickup__description").html("").hide();

    if (this.selectedPickupPoint) {
      this.selectedPickupPoint = null;
    }

    localStorage.removeItem("GLSDkPointId");
    localStorage.removeItem("GLSDkPointLabel");
  }

  clearPickupSessionData() {
    // Prevent multiple simultaneous requests
    if (this.clearingSession) {
      return;
    }

    this.clearingSession = true;

    // Make AJAX request to clear pickup point session data
    jQuery.ajax({
      url: this.options.ajax_url,
      type: "POST",
      data: {
        action: "GLSDk_clear_pickup_session_data",
        nonce: GLSDk_vars.nonce,
      },
      success: (response) => {
        this.clearingSession = false;
      },
      error: (xhr, status, error) => {
        console.error("❌ Error clearing pickup session data:", error);
        this.clearingSession = false;
      },
    });
  }

  areAddressFieldsFilled() {
    // Extract current address data
    if (this.isBlockCheckout()) {
      this.extractAddressData(true);
    } else {
      this.extractClassicAddressData();
    }

    const address = this.options.address;

    // Check required fields
    const requiredFields = ["Streetname1", "City", "PostalCode", "Country"];

    for (const field of requiredFields) {
      if (!address[field] || address[field].trim() === "") {
        return false;
      }
    }

    return true;
  }

  showAddressRequiredMessage() {
    this.createModal({
      id: "addressModal",
      message:
        "Please fill in all required address fields before selecting a pickup location.",
      buttons: [
        {
          props: {
            text: "OK",
            css: {
              "background-color": "#666",
              color: "white",
              border: "none",
              padding: "6px 10px",
              "border-radius": "4px",
              cursor: "pointer",
              "margin-left": "10px",
            },
          },
          handler: function () {
            jQuery("#addressModal").remove();
          },
        },
      ],
    });
  }

  addPointInfo(p, selected, extra_class, parentContainer) {
    if (typeof extra_class == "undefined") {
      extra_class = "";
    }

    let open =
      typeof p.WorkingHoursRaw != "undefined" && p.WorkingHoursRaw
        ? JSON.parse(p.WorkingHoursRaw)
        : [];
    let openhtml = "";
    let m2f = "";
    let wkd = "";
    let local = p.Information.Address;

    /* ----------------------
        / To replace when we have an actual format for it  */
    let openHours = [];

    /* LEGACY code that we are using to transform the raw data into something we can work with  ----------- */
    let regexFormatDev = new RegExp(
      /([a-zA-Z0-9]+)\_([a-zA-Z0-9]+)\_([a-zA-Z0-9]+)\_([a-zA-Z0-9]+)\_([a-zA-Z0-9]+)\_([a-zA-Z0-9]+)\_([a-zA-Z0-9]+)/,
      "g",
    );
    let regexFormatLive = new RegExp(
      /([a-zA-Z0-9]+)\_([a-zA-Z0-9]+)\_([a-zA-Z0-9]+)\_([a-zA-Z0-9]+)/,
      "g",
    );
    let regexFormat = regexFormatLive;
    let regDay = 1; /* Monday, Tuesday ..*/
    let regOpenIdx = 4; /* 1,2,... */
    let regTypeIdx = 2; /* Open | closing */

    if (
      Object.keys(open).length > 0 &&
      Object.keys(open).shift().match(regexFormatDev)
    ) {
      regexFormat = regexFormatDev;
      regTypeIdx = 3;
      regOpenIdx = 7;
    }

    for (let key in open) {
      let value = open[key];

      if (key.match(regexFormat)) {
        let res = regexFormat.exec(key);
        let dayname = res[regDay];
        let openidx = parseInt(res[regOpenIdx]) - 1;
        let dayidx = this.weekdaynames.indexOf(dayname);

        if (typeof openHours[dayidx] == "undefined") {
          openHours[dayidx] = [];
        }

        if (typeof openHours[dayidx][openidx] == "undefined") {
          openHours[dayidx][openidx] = {
            OpenTime: "",
            CloseTime: "",
          };
        }

        openHours[dayidx][openidx][
          res[regTypeIdx] == "Closing" ? "CloseTime" : "OpenTime"
        ] = value;
      }
    }

    /* Make sure it's sorted */
    for (let i = 0; i < openHours.length; ++i) {
      /* Sometimes it's closed on monday meaning there's nothing at idx 0*/
      if (typeof openHours[i] != "undefined") {
        let schedule = openHours[i];
        schedule.sort((a, b) => {
          let aopen = parseInt(a.OpenTime.substring(0, 2));
          let bopen = parseInt(b.OpenTime.substring(0, 2));
          return aopen - bopen;
        });
      }
    }

    /* Group data set
        Label can be:
        First day - last day with same schedule
        Every day */

    open = typeof p.WorkingHours != "undefined" ? p.WorkingHours : openHours;
    /** It's a hash, not an array **/
    let ndaysopen = Object.keys(open).length;
    let fromday = this.weekdaynames[0];
    let previousTime = "";
    let hourshtml = "";
    let fromdayidx = 0;
    let toDay = "";
    /*-------*/

    for (let i = 0; i < 7; ++i) {
      let day = open[i];
      let dayhtml = "";
      let today = this.weekdaynames[i];

      dayhtml += `<div class="sw-point-info-day">`;
      hourshtml = "";

      for (let j = 0; day && j < day.length; ++j) {
        let hours = day[j];
        if (hours.OpenTime == null && hours.CloseTime == "23:59") {
          hourshtml += "24h";
        } else {
          hourshtml +=
            (hourshtml ? " | " : "") +
            `<span>${hours.OpenTime ? hours.OpenTime : ""} - ${
              hours.CloseTime ? hours.CloseTime : ""
            }</span>`;
        }
      }

      /** last day or different time, print last **/
      if ((previousTime && previousTime != hourshtml) || i == 6) {
        /** not a lot of sense in mon-mon*/
        let isinterval = i - fromdayidx > 2;
        let islast = i == 6;

        if (previousTime) {
          toDay =
            islast && hourshtml == previousTime
              ? this.weekdaynames[i]
              : this.weekdaynames[i - 1];
          dayhtml += `<label>${
            (isinterval && fromday ? fromday + " - " : "") + toDay
          }:</label><span>${previousTime}</span></div>`;
          openhtml += dayhtml;
        }

        if (islast && hourshtml && hourshtml != previousTime) {
          openhtml += `<div class="sw-point-info-day"><label>${this.weekdaynames[i]}:</label><span>${hourshtml}</span></div></div>`;
        }

        fromday = i < ndaysopen - 1 ? this.weekdaynames[i] : "";
        fromdayidx = i;
        previousTime = hourshtml;
      } else {
        previousTime = hourshtml;
      }
    }

    if (!openhtml && previousTime) {
      openhtml = `<label>${fromday} - ${
        this.weekdaynames[ndaysopen - 1]
      }: </label><span>${previousTime}</span></div>`;
    }

    /* / END LEGACY code ----------- */

    let ePointInfo = jQuery(`<div class="sw-point-info ${extra_class}">
  <h4 class='sw-point-info-name'>${p.Information.Name}</h4>
  <div class='sw-point-info-addr'>${local}</div>
  ${
    p.Distance !== null
      ? `<div class='sw-point-info-distance'>` +
        GLSDk_distance +
        " " +
        ` ${p.Distance} ` +
        GLSDk_meter +
        " " +
        `</div>`
      : ""
  }
  <div class='sw-point-info-open'>${this.getWorkingDays(p.WorkingHours)}</div>
</div>`);

    /* Is there aditional information required?  */
    if (typeof p.MapFieldsSelect != "undefined") {
      let moreFields = p.MapFieldsSelect;
      for (let k = 0; k < moreFields.length; ++k) {
        ePointInfo.append(
          `<div class="sw-point-info-additional"><label>${moreFields[k]}</label><input data-id="${moreFields[k]}" class="GLSDk_mapfields${p.PointId}" type="text"  id="${moreFields[k]}${p.PointId}"/></div>`,
        );
      }
    }

    let btn = jQuery(
      `<button class="sw-point-info-btn ${selected ? "selected" : ""}">${
        selected ? GLSDk_selected : GLSDk_select
      }</button>`,
    );
    btn.on("click", () => {
      this.selectPoint(p);
    });

    ePointInfo.append(btn);
    parentContainer.append(ePointInfo);
  }

  /**
   * Append custom style
   * @param string css - a string with the style to inject
   */
  addCustomStyle(css) {
    var style = document.createElement("style");
    style.type = "text/css";

    if (style.styleSheet) {
      style.styleSheet.cssText = css;
    } else {
      style.appendChild(document.createTextNode(css));
    }

    document.getElementsByTagName("head")[0].appendChild(style);
  }

  addMapHtml() {
    let addresstr = "";
    /* Ireland does not have postal codes */
    if (this.options.address.Streetname1) {
      addresstr = this.options.address.PostalCode
        ? this.options.address.PostalCode
        : this.options.address.Streetname1;
    }
    let maphtml = `<div id="sw">
    <div id="sw__overlay"></div>
    <div id="sw__container">
      <div id="sw-search">
        <div id="sw-query-wrapper">
          <input type="text" id="sw-query" placeholder="${addresstr}">
        </div>
        <div id="sw-query-results"></div>
        <div id="query-options">
        </div>
      </div>
      <div id="sw-display-options">
      </div> 
      <div id="sw-map-wrapper" class="sw-tab selected">
        <div class="sw-query-results-description"></div>
        <div id="sw-map" class="GLSDk-pickup__map"></div>
        <div id="sw-map-error"></div> 
        <div id="sw-map-selected-point"></div>
      </div>  
      <div class='sw-tab'>
        <div class="sw-query-results-description"></div>
        <div id="sw-list-points"></div>
      </div>
      <div id="sw-map-message"></div>
      <div id="sw-search-status">
        <div class="sw-loader"><div></div><div></div><div></div></div>
      </div>
    </div>
  </div>`;
    jQuery(this.mapParentContainer).append(maphtml);

    // Add GLSDk-background class to sw-loader divs
    jQuery(".sw-loader div").addClass("GLSDk-background");
    let displayOptions = jQuery("#sw-display-options");
    let optMap = jQuery(
      `<span class='sw-display-option selected'>` + GLSDk_map + `</span>`,
    );
    let optList = jQuery(
      `<span class='sw-display-option'">` + GLSDk_list + `</span>`,
    );

    optMap.on("click", () => {
      this.selectDisplayOption(0);
    });
    optList.on("click", () => {
      this.selectDisplayOption(1);
    });

    displayOptions.append(optMap);
    displayOptions.append(optList);

    let queryopt = jQuery("#sw-query-wrapper");
    let searchbtn = jQuery(
      `<button id="sw-query-btn"">` + GLSDk_search + `</button>`,
    );
    queryopt.append(searchbtn);

    searchbtn.on("click", () => {
      this.geocodeQuery(true);
    });

    let queryinput = jQuery("#sw-query");
    queryinput.on("keyup", (evt) => {
      if (evt.keyCode == 13) {
        this.geocodeQuery();
      }

      this.timeoutKeyDown && clearTimeout(this.timeoutKeyDown);
      this.timeoutKeyDown = setTimeout(() => {
        this.geocodeQuery();
      }, 300);
    });

    jQuery("#sw__overlay").click(() => {
      this.closeMap();
    });
  }

  /**
   * @param decimal lat
   * @param decimal lng
   */
  centerMap(lat, lng) {
    this.mapinterface.centerMap(lat, lng);
  }

  /**
   * Hide the map
   */
  closeMap() {
    jQuery("#sw").removeClass("open");
    jQuery("html,body").scrollTop(this.userScroll);
  }

  displayMessage(msg) {
    jQuery("#sw-map-message").addClass("open");

    if (msg.Id == 99) {
      jQuery("#sw-map-message").html(GLSDk_no_points_found);
    } else {
      jQuery("#sw-map-message").html(msg);
    }
  }

  /**
   * Display the possible option to the user in a list under the search input
   */

  //
  // ##DJDJ Bpost stuff
  displayPlaces(places) {
    jQuery(".sw-query-results-description").html("");

    this.queryResults = places;
    let resultsContainer = jQuery("#sw-query-results");

    let html = "";
    for (let i = 0; i < places.length; ++i) {
      if (typeof places[i].address.PostalCode != "undefined") {
        html += `<div class="sw-query-result" data-idx="${i}">${places[i].display_name}</div>`;
      }
    }

    if (!html) {
      html = GLSDk_no_results;
    }

    resultsContainer.html(html);
    jQuery(".sw-query-result").on("click", (evt) => {
      let idx = jQuery(evt.target).attr("data-idx");

      if (parseInt(idx) == "isNaN" || idx > this.queryResults.length) {
        return;
      }

      let place = this.queryResults[idx];

      this.options.address.Lat = place.lat;
      this.options.address.Long = place.lng;

      jQuery("#sw-query-results").html("");
      jQuery("#sw-query").val(place.display_name);
      if (typeof place.address != "undefined") {
        for (let prop in place.address) {
          if (place.address[prop] && place.address[prop].length > 0) {
            this.options.address[prop] = place.address[prop];
          }
        }
      }
      this.options.address.Streetname1 = place.address.Streetname1;
      this.fetchPoints(this.options.address);
    });
  }

  hashLatLng(point) {
    let latstr = (point.lat + "").replace(".", "-");
    let lngstr = (point.lng + "").replace(".", "-");

    return "r" + latstr + "_" + lngstr;
  }

  displayResults(data) {
    this.mapinterface.clearMarkers();
    jQuery("#sw__container").removeClass("searching");
    this.pickupPointsLoadStop();
    jQuery(".sw-query-results-description").html(
      "<div class='sw-query-results-description'>" +
        GLSDk_the +
        data.Count +
        GLSDk_closest +
        "</div>",
    );

    setTimeout(() => {
      this.pickupPoints = data.Point;
      this.mapChanged = Date.now();

      this.updateList(this.pickupPoints);
      this.mapinterface.addMarkers(this.pickupPoints, (idx) => {
        let parent = jQuery("#sw-map-selected-point");
        parent.html("");
        this.addPointInfo(this.pickupPoints[idx], 0, "", parent);
        this.mapinterface.selectPoint(idx);
      });

      // ✅ Remove loader now that points are loaded and map is ready
      setTimeout(() => {
        jQuery(".GLSDk-loader-btn").fadeOut(300, function () {
          jQuery(this).remove();
        });
      }, 300);
    }, 100);
  }

  /***
   * Get Points from the API and display them
   **/
  fetchPoints(address, fresolve) {
    if (!this.isBlockCheckout()) {
      this.carrier_id = jQuery("#shipping_carrier_id").val();
      this.setCarrierId(jQuery("#shipping_carrier_id").val());
    }

    this.selectedPoint = null;

    jQuery("#sw-map-selected-point").html("");
    jQuery("#sw-map-message").removeClass("open");
    jQuery(".sw-query-results-description").html("");

    if (!this.mapinterface.isMapMoving()) {
      jQuery("#sw__container").addClass("searching");
    }

    if (
      typeof this.cacheResults[
        this.hashLatLng({
          lat: this.options.address.Lat,
          lng: this.options.address.Long,
        })
      ] != "undefined"
    ) {
      this.displayResults(
        this.cacheResults[
          this.hashLatLng({
            lat: this.options.address.Lat,
            lng: this.options.address.Long,
          })
        ],
      );
    }

    let req = {
      Address: address,
      CarrierId: this.carrier_id,
      action: "GLSDk_pickup_locations",
    };

    jQuery
      .getJSON(this.options.ajax_url, req, (data) => {
        this.mapinterface.clearMarkers();
        /* We have the points remove the loader */
        this.pickupPointsLoadStop();

        jQuery("#sw-map-wrapper").removeClass("loading");
        this.searchRunning = false;

        jQuery("#sw__container").removeClass("searching");

        this.searchRunning = false;

        // ✅ Handle user-friendly error messages
        if (data.Error && data.Error.Id != 0) {
          let userMessage = "";

          // Customize known error types
          if (
            data.Error.Info &&
            (data.Error.Info.toLowerCase().includes("invalid") ||
              data.Error.Info.toLowerCase().includes("not found"))
          ) {
            userMessage =
              "⚠️ Please check your address — we couldn’t find any pickup points near that location.";
          } else if (
            data.Error.Info &&
            data.Error.Info.toLowerCase().includes("timeout")
          ) {
            userMessage =
              "⚠️ The request took too long. Please try again in a moment.";
          } else {
            // Default fallback for unexpected errors
            userMessage =
              "⚠️ Something went wrong while searching for pickup points. Please verify your address or try again.";
          }

          // Use displayMessage() to show the clean message
          this.displayMessage(userMessage);
          console.warn("Pickup location error:", data.Error.Info || data.Error);
          return;
        }

        // ✅ Continue if no error and points exist
        if (data.Point && data.Point.length > 0) {
          this.cacheResults[
            this.hashLatLng({
              lat: this.options.address.Lat,
              lng: this.options.address.Long,
            })
          ] = data;
          this.displayResults(data);
        } else {
          this.displayMessage(
            "⚠️ No pickup points found for the provided address.",
          );
        }

        if (typeof fresolve != "undefined") {
          /* We want to make sure changes are commited to the dom before we declare we're done */
          setTimeout(() => {
            fresolve();
          }, 300);
        }
      })
      .fail((err) => {
        this.displayMessage(GLSDk_no_points_found);
      });
  }

  geocodeQuery(isButtonClick = false) {
    jQuery("#sw-query-results").html("");

    let queryval = jQuery("#sw-query").val();

    this.options.address.Lat = null;
    this.options.address.Long = null;

    if (queryval.length < 4) {
      return;
    }

    if (jQuery("#components-form-token-input-0").length) {
      this.options.address.Country = jQuery(
        "#components-form-token-input-0",
      ).val();
    } else if (jQuery("#shipping-country option:selected").length) {
      this.options.address.Country = jQuery(
        "#shipping-country option:selected",
      ).text();
    } else if (jQuery("#shipping-country").length > 0) {
      this.options.address.Country = jQuery(
        "#shipping-country option:selected",
      ).text();
    } else if (jQuery("#select2-billing_country-container").length > 0) {
      this.options.address.Country = jQuery(
        "#select2-billing_country-container",
      ).text();
    }

    if (GLSDk_PLUGIN_URL.includes("bpost") && isButtonClick) {
      // For bpost plugin, determine the country based on is_international meta key
      let countryForGeocoding = "BE"; // Default to Belgium

      if (this.currentSelectedRate) {
        const isInternational = this.isInternationalCarrier(
          this.currentSelectedRate,
        );

        if (isInternational === false) {
          // Not international - always use Belgium
          countryForGeocoding = "BE";
        } else if (isInternational === true) {
          // International - fetch the actual shipping country
          countryForGeocoding = this.options.address.Country || "BE";
        } else {
          // Meta key not found - fall back to Belgium for safety
          countryForGeocoding = "BE";
        }
      }

      this.mapinterface.geocodeBpost(
        {
          address: queryval,
          country: countryForGeocoding,
        },
        (resp) => {
          this.displayPlaces(resp);
        },
      );
    } else {
      this.mapinterface.geocode(
        {
          address: queryval,
        },
        (resp) => {
          this.displayPlaces(resp);
        },
      );
    }
  }

  /**
   *
   * @param shippingData, the address parts
   * @param f_callback , the function to call when all mighty google returns a result
   */
  geocodeAddress(address, f_callback) {
    if (address.country == "Portugal" && typeof missingZipPT != "undefined") {
      /* Is this a postal code we know is not geocodable in nominatim? */
      let zip4dig = address.postcode.substring(0, 4);
      for (let i = 0; i < missingZipPT.length; ++i) {
        if (missingZipPT[i].zipcode == zip4dig) {
          this.queryResults = [
            {
              display_name: missingZipPT[i].display_name,
              lat: missingZipPT[i].lat,
              lng: missingZipPT[i].lng,
              address: {
                street: "street",
                postcode: address.postcode,
                city: missingZipPT[i].display_name,
                country_code: address.country,
              },
            },
          ];
          f_callback(this.queryResults);
          return;
        }
      }
    }

    if (
      (GLSDk_PLUGIN_URL.includes("bpost") &&
        this.options.address.Country == "BE") ||
      this.options.address.Country == "be" ||
      this.options.address.Country == "Belgium"
    ) {
      // First, get the latest checkout address from backend
      this.getCheckoutAddress((checkoutResponse) => {
        let finalAddress = address; // Default to current address

        if (
          checkoutResponse &&
          checkoutResponse.success &&
          checkoutResponse.data &&
          checkoutResponse.data.shipping_address
        ) {
          const backendAddress = checkoutResponse.data.shipping_address;

          // Cross-reference with current address - check if they're different
          const addressChanged = this.hasAddressChanged(
            address,
            backendAddress,
          );

          if (addressChanged) {
            // Update address with backend data
            finalAddress = {
              Country: backendAddress.country,
              City: backendAddress.city,
              PostalCode: backendAddress.postcode,
              Streetname1: backendAddress.address_1,
              Streetname2: backendAddress.address_2,
              State: backendAddress.state,
            };

            // Update this.options.address for future use
            this.options.address = Object.assign(
              this.options.address,
              finalAddress,
            );
          } else {
          }
        } else {
        }

        // Now proceed with bpost geocoding using the final address
        this.proceedWithBpostGeocoding(finalAddress, f_callback);
      });
    } else {
      this.mapinterface.geocodeAddressParts(
        (geocode) => {
          if (!geocode.lat) {
            return this.mapinterface.geocodeAddressParts(
              (geocode) => {
                f_callback(geocode);
              },
              address.City,
              address.Country,
            );
          }

          f_callback(geocode);
        },
        address.City,
        address.Country,
        address.PostalCode,
        address.Streetname1,
      );
    }
  }

  mapMoved(mapcenter) {
    jQuery("#sw-point-info").html("");
    return new Promise((resolve, reject) => {
      this.options.address.Lat = mapcenter.lat;
      this.options.address.Long = mapcenter.lng;
      this.fetchPoints(this.options.address, resolve);
    });
  }

  loadScripts() {
    /* not defined or version < 1.7 compare only subversion for simplicity **/
    if (
      typeof jQuery == "undefined" ||
      parseInt(jQuery.fn.jquery.substring(2, 2)) < 7
    ) {
      var me = this;
      this.loadScript(
        "https://code.jquery.com/jquery-3.7.0.min.js",
        function () {
          me.scriptsLoaded();
          if (me.options.oninit) {
            me.options.oninit();
          }
        },
      );
    } else {
      this.scriptsLoaded();
      if (this.options.oninit) {
        this.options.oninit();
      }
    }
  }

  /**
   * @param String url - the url of the script to load
   * @param String callback - the name of the function to call after the script is loaded
   */
  loadScript(url, callback) {
    var script = document.createElement("script");
    script.type = "text/javascript";

    if (script.readyState) {
      /*IE */
      script.onreadystatechange = () => {
        if (script.readyState == "loaded" || script.readyState == "complete") {
          script.onreadystatechange = null;
          calback && callback();
        }
      };
    } else {
      script.onload = () => {
        callback && callback();
      };
    }

    script.src = url;
    document.getElementsByTagName("head")[0].appendChild(script);
  }

  /**
   * @param string url
   */
  static loadStyle(url) {
    var style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = url;

    document.getElementsByTagName("head")[0].appendChild(style);
  }

  openMap() {
    // Show loader FIRST
    const loaderHtml = `
    <div class="GLSDk-loader-btn" style="position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background-color: rgba(0, 0, 0, 0.7) !important; z-index: 999999 !important; display: flex !important; justify-content: center !important; align-items: center !important;">
        <div class="loader-squares">
            <div class="loader-square"></div>
            <div class="loader-square"></div>
            <div class="loader-square"></div>
        </div>
    </div>`;

    jQuery("body").append(loaderHtml);

    if (!this.isBlockCheckout()) {
      var platform = new Woocommerce();
      this.options.address = platform.getShippingData().Address;
    }

    this.userScroll = jQuery("html,body").scrollTop();
    jQuery("html,body").scrollTop(0);
    jQuery("#sw").addClass("open");
    jQuery("#sw-map-wrapper").addClass("loading");
    jQuery("#sw-query").val(this.options.address.Streetname1);
    this.selectDisplayOption(0);

    if (this.options.address.Streetname1) {
      if (!this.options.address.lat) {
        this.geocodeAddress(this.options.address, (geo) => {
          geo.length && (geo = geo[0]);
          this.options.address.Lat = geo.lat;
          this.options.address.Long = geo.lng;
          this.fetchPoints(this.options.address);
        });
      } else {
        this.fetchPoints(this.options.address);
      }
    } else {
      // Remove loader if no address
      jQuery(".GLSDk-loader-btn").remove();
    }
  }

  getShippingData() {
    let shippingData = [];
    this.getBlockShippingData();
    shippingData["Address"] = this.options.address;
    // shippingData["CarrierId"] = this.carrier_id;
    return shippingData;
  }

  getBlockShippingData() {
    // Use the improved address extraction method
    this.extractAddressData(true);

    return {
      Address: this.options.address,
      CarrierId: this.carrier_id || 0,
    };
  }

  pickupPointsLoadStop() {
    jQuery("#sw-map-wrapper").removeClass("loading");
    this.searchRunning = false;
  }

  /***
   * Select the display option
   * @param idx - int -  0: map, 1: list
   */
  selectDisplayOption(idx) {
    let eoptions = jQuery(".sw-display-option, .sw-tab");
    this.selectedDisplayOption = idx;
    eoptions.removeClass("selected");
    jQuery(eoptions.get(idx)).addClass("selected");
    jQuery(jQuery(".sw-tab").get(idx)).addClass("selected");

    if (
      idx == 0 &&
      typeof this.mapinterface != "undefined" &&
      this.mapinterface.pickupPoints.length > 0
    ) {
      this.mapinterface.fitBounds();
    }
  }

  setCarrierId(carrier_id) {
    this.carrier_id = carrier_id;
    this.mapinterface.setCarrierId(carrier_id);
  }

  /**
   * @param address - object in the same format as we send to the API
   *
   **/
  setAddress(address) {
    if (!address.Streetname1 || !address.Name) {
      return;
    }
    this.options.address = address;
    localStorage.setItem("GLSDkAddress", JSON.stringify(address));
  }

  /**
   * Called when load scripts ends we must grant that jquery exists
   */
  scriptsLoaded() {
    this.eSearchStatus = jQuery("#search-status");
    this.addMapHtml();

    if (this.options.gmapskey) {
      this.mapinterface = new GLSDkGmaps(this.options, this);
    } else {
      this.mapinterface = new GLSDkOpenMap2(this.options, this);
    }
    this.mapinterface.initMap();
    this.mapinterface.addMapMoveListener((mapcenter) => {
      return this.mapMoved(mapcenter);
    });
  }

  updateList(points) {
    jQuery("#sw-list-points").html("");
    let parent = jQuery("#sw-list-points");

    for (let i = 0; i < points.length; ++i) {
      this.addPointInfo(points[i], 0, "", parent);
    }
  }

  disableButton() {
    jQuery(".wc-block-components-checkout-place-order-button").prop(
      "disabled",
      true,
    );

    // Add CSS styles for the disabled state
    jQuery(".wc-block-components-checkout-place-order-button").css({
      "background-color": "grey",
      cursor: "not-allowed",
      opacity: "0.5", // Optional: to give it a more disabled look
    });
  }

  enableButton() {
    jQuery(".wc-block-components-checkout-place-order-button").prop(
      "disabled",
      false,
    );

    // Reset CSS styles for the enabled state
    jQuery(".wc-block-components-checkout-place-order-button").css({
      "background-color": "black",
      cursor: "pointer",
      opacity: "1", // Reset opacity to make it fully visible
    });
  }

  getWorkingDays(workingHours) {
    if (!workingHours) {
      return "";
    }

    const dayGroups = [];
    let htmlHours = "";

    for (let day = 0; day < 7; day++) {
      if (workingHours[day]) {
        const hourString = this.formatWorkingHours(workingHours[day]);
        const lastGroup = dayGroups[dayGroups.length - 1];

        if (
          lastGroup &&
          lastGroup.hours === hourString &&
          lastGroup.end + 1 === day
        ) {
          lastGroup.end = day;
        } else {
          dayGroups.push({ start: day, end: day, hours: hourString });
        }
      }
    }

    dayGroups.forEach((group) => {
      /** Valid hour intervals must contain at least one number **/
      if (group.hours.match(/\d+/) !== null) {
        const dayRange =
          group.start === group.end
            ? this.getDayName(group.start)
            : `${this.getDayName(group.start)} - ${this.getDayName(group.end)}`;
        htmlHours += `<div class="sw-point-info-day" style="margin-bottom: -10px"><label>${dayRange}</label>: ${group.hours}</div>`;
      }
    });

    return htmlHours;
  }

  formatWorkingHours(hourIntervals) {
    return hourIntervals
      .map((hour) => {
        return hour.OpenTime && hour.CloseTime
          ? `${hour.OpenTime} - ${hour.CloseTime}`
          : "";
      })
      .filter(Boolean)
      .join(" | ");
  }

  getDayName(day) {
    return this.weekdaynames[day];
  }
}

export default GLSDkWidget;
