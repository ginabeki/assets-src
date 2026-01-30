import Utils from "./GLSDk-utils.js";

export default class Woocommerce {
  constructor(ajax_url = "") {
    this.ajax_url = ajax_url;
  }

  /**
   * @return true if this is the checkout page
   */
  isCheckout() {
    console.log("Checkout");
    return jQuery("body").hasClass("woocommerce-checkout");
  }

  /*
   * If there is only one method available woo will use a hidden field for the selected carrier
   *  + Generic Methods do not have an instance id
   */
  getShippingMethodId() {
    // Detect WooCommerce Block Checkout
    const isBlockCheckout = jQuery(".wc-block-checkout").length > 0;

    if (isBlockCheckout) {
      console.log(
        "🧩 Detected block checkout, trying to fetch shipping method...",
      );

      // Try finding shipping info in Woo's React data attributes
      let methodContainer = jQuery("[data-shipping-method-id]:first");

      if (methodContainer.length > 0) {
        const methodId = methodContainer.data("shipping-method-id");
        console.log("✅ Found block-based method ID:", methodId);
        return Utils.removeNonNumeric(methodId);
      }

      // Try WooCommerce Blocks JS store (works in newer Woo versions)
      if (
        window.wc &&
        window.wc.blocksStore &&
        window.wc.blocksStore.getState
      ) {
        try {
          const state = window.wc.blocksStore.getState();
          const rates = state.shippingRates;
          if (rates && rates.length > 0) {
            const active = rates.find((r) => r.selected);
            if (active) {
              console.log(
                "✅ Found active shipping method in wc.blocksStore:",
                active,
              );
              return Utils.removeNonNumeric(active.rate_id || active.id);
            }
          }
        } catch (err) {
          console.warn("⚠️ Could not read from wc.blocksStore:", err);
        }
      }

      console.warn("⚠️ No shipping method found yet in block checkout.");
      return "";
    }

    // Classic checkout (legacy template)
    let eCheckbox = jQuery("input[name='shipping_method[0]']:checked");
    let eHidden = jQuery("input[name='shipping_method[0]']");
    let shippingMethod = eCheckbox.length > 0 ? eCheckbox.val() : eHidden.val();

    if (!shippingMethod || typeof shippingMethod !== "string") {
      console.warn("⚠️ No shipping method found yet (classic checkout).");
      return "";
    }

    if (shippingMethod.indexOf(":") > 0) {
      const parts = shippingMethod.split(":");
      return Utils.removeNonNumeric(parts[0]);
    }

    return shippingMethod;
  }

  /**
   * Wordpress won't send session cookies to wp-admin and the session handling in woocommerce is so poorly documented we are better off
   * extracting necessary info client side our selves. We're emulating their checkout.js
   * @return an object containing address parts
   */
  getShippingData() {
    // Detect checkout type
    const isBlockCheckout = jQuery(".wc-block-checkout").length > 0;

    let s_country, state, postcode, city, address, address_2;
    let s_state, s_postcode, s_city, s_address, s_address_2;

    if (isBlockCheckout) {
      // BLOCK CHECKOUT - Use block-specific selectors
      console.log("Reading Block Checkout data");

      // Try shipping fields first, then billing as fallback
      s_address =
        jQuery("#shipping-address_1").val() ||
        jQuery("#billing-address_1").val() ||
        "";
      s_address_2 =
        jQuery("#shipping-address_2").val() ||
        jQuery("#billing-address_2").val() ||
        "";
      s_city =
        jQuery("#shipping-city").val() || jQuery("#billing-city").val() || "";
      s_postcode =
        jQuery("#shipping-postcode").val() ||
        jQuery("#billing-postcode").val() ||
        "";
      s_state =
        jQuery("#shipping-state").val() || jQuery("#billing-state").val() || "";

      // Country detection for Block Checkout (multiple possible selectors)
      const countrySelectors = [
        "#components-form-token-input-0", // Primary block country field
        'input[aria-label*="Country"]', // Aria label fallback
        "#shipping-country", // Might exist in some themes
        "#billing-country", // Billing fallback
      ];

      for (const selector of countrySelectors) {
        const element = jQuery(selector);
        if (element.length && element.val()) {
          s_country = element.val();
          console.log(
            `Found country using selector: ${selector} = ${s_country}`,
          );
          break;
        }
      }

      // If still not found, try getting text from select options
      if (!s_country) {
        const countryText =
          jQuery("#shipping-country option:selected").text() ||
          jQuery("#billing-country option:selected").text();
        if (countryText) {
          s_country = countryText;
          console.log(`Found country from option text: ${s_country}`);
        }
      }
    } else {
      // CLASSIC CHECKOUT - Original code
      console.log("Reading Classic Checkout data");

      s_country =
        jQuery("#shipping-country").val() || jQuery("#billing-country").val();
      state = jQuery("#billing_state").val();
      postcode = jQuery("input#billing_postcode").val();
      city = jQuery("#billing_city").val();
      address = jQuery("input#billing_address_1").val();
      address_2 = jQuery("input#billing_address_2").val();

      s_state = state;
      s_postcode = postcode;
      s_city = city;
      s_address = address;
      s_address_2 = address_2;

      // Check if shipping to different address
      if (jQuery("#ship-to-different-address").find("input").is(":checked")) {
        s_country = jQuery("#shipping_country").val();
        s_state = jQuery("#shipping_state").val();
        s_postcode = jQuery("input#shipping_postcode").val();
        s_city = jQuery("#shipping_city").val();
        s_address = jQuery("input#shipping_address_1").val();
        s_address_2 = jQuery("input#shipping_address_2").val();
      }
    }

    // Final check - if country is still undefined, set empty string
    if (!s_country) {
      console.log(
        "Country still not found - will be populated when form loads",
      );
      s_country = "";
    } else {
      console.log(`Final country value: ${s_country}`);
    }

    const shippingData = {
      Address: {
        Lat: "",
        Long: "",
        Streetname1: s_address || "",
        Streetname2: s_address_2 || "",
        HouseNumber: "",
        NumberExtension: "",
        PostalCode: s_postcode || "",
        s_postcode: s_postcode || "",
        City: s_city || "",
        Country: s_country || "",
        State: s_state || "",
      },
      post_data: jQuery("form.checkout").serialize(),
      CarrierId: jQuery("#shipping_carrier_id").val() || 0,
    };

    window.GLSDk_shipping_address = shippingData;
    return shippingData;
  }

  /**
   * We must run this onload
   * And on method change
   * because people may never change the carrier or select a pickup point
   */
  setCarrier(carrier_id) {
    console.log("Set carrier id");
    console.log("CarrierIDDDD", carrier_id);
    this.carrier_id =
      typeof carrier_id != "undefined"
        ? carrier_id
        : this.getShippingMethodId();
    jQuery("#shipping_carrier_id").val(this.carrier_id);
  }

  /**
   * @param Pickup pickup
   */
  setPickupPoint(pickup) {
    console.log("SET PICKUP POINT @#@#");
    console.log(pickup);
    let pickup_label =
      pickup.Information.Name + " " + pickup.Information.Address;

    let req = {
      action: "GLSDk_set_pickup_point",
      shipping_pickup_label: pickup_label,
      GLSDk_pickup_extended: jQuery(".GLSDk_mapfields" + pickup.PointId).val(),
      "GLSDk-pickup__description": pickup_label,
      shipping_pickup_id: pickup.PointId,
      shipping_carrier_id: window.carrier_id,
      GLSDk_nonce: GLSDk_vars.nonce,
    };

    jQuery
      .getJSON(this.ajax_url, req, (data) => {
        console.log(data);

        // Set the pickup point ID in the hidden inputs
        // jQuery("#GLSDkpickup").val(pickup.PointId);

        // // Create and populate hidden fields
        // const hiddenFields = [
        //   { id: "GLSDkpickup", value: pickup.PointId },
        //   { id: "shipping_pickup_id", value: pickup.PointId },
        //   { id: "shipping_pickup_label", value: pickup_label },
        //   { id: "shipping_carrier_id", value: window.carrier_id },
        // ];

        // hiddenFields.forEach((field) => {
        //   let element = jQuery(`#${field.id}`);
        //   if (element.length === 0) {
        //     element = jQuery(
        //       `<input type="hidden" id="${field.id}" name="${field.id}" />`
        //     );
        //     jQuery("form.checkout").append(element);
        //   }
        //   element.val(field.value);
        // });

        // console.log("Added the GLSDkpickup value");
        // console.log(
        //   "GLSDkeepickupppppp",
        //   jQuery("#GLSDkpickup").val()
        // );

        // Display pickup point data below the select button
        const pickupButtons = document.querySelectorAll(".GLSDk-pick-location");
        pickupButtons.forEach((button) => {
          // Remove any existing pickup label display
          const existingLabel = button.parentNode.querySelector(
            ".pickup-label-display",
          );
          if (existingLabel) {
            existingLabel.remove();
          }

          // Create new pickup label display element
          const labelDisplay = document.createElement("div");
          labelDisplay.className = "pickup-label-display";
          labelDisplay.style.cssText =
            "margin-top: 10px; padding: 8px; background-color: #f0f0f0; border-radius: 4px; font-size: 14px; color: #333;";
          labelDisplay.innerHTML = `<strong>Selected Pickup Location:</strong><br>${pickup_label}`;

          // Insert after the button
          button.parentNode.insertBefore(labelDisplay, button.nextSibling);
        });
      })
      .fail((err) => {
        console.log(
          "Fatal error widget requesting points do we have an API bug?",
          err.responseText,
        );
      });

    // Is there extra info ?
    if (jQuery(".GLSDk_mapfields" + pickup.PointId).length > 0) {
      jQuery("#shipping_pickup_extended").val(
        jQuery(".GLSDk_mapfields" + pickup.PointId).val(),
      );
    }
  }
}
