/**
 * Add any aditional functionality we need in the vendor dashboard
 */
class GLSDkWCFM {
  constructor() {
    /**
     * Because wcfm will first build the structure for the rules and only then set hte values
     */
    this.shipping_methods = [
      "wcfmmp_shipping_rates_by_weight",
      "wcfmmp_shipping_rates",
    ];

    if (jQuery("#enable_store_shipping").size() > 0) {
      this.appendSelectors();
    }

    /**
     * On save if keys are set then check if they produced a valid token
     */
    jQuery("#wcfm_settings_save_button").on("click", (evt) => {
      if (
        jQuery("input[name='GLSDk_public_key']").val() &&
        jQuery("input[name='GLSDk_private_key']").val()
      ) {
        setTimeout(() => {
          this.checkIfKeysAreValid();
        }, 500);
      }
    });
  }

  appendSelectors() {
    var eCarrierOption = jQuery(
      "<div><p class='wcfm_title'><strong>GLSDk</strong></p></div>",
    );
    var eCarriers = jQuery(
      "<select class='wcfm-select GLSDk_carrier'><option>-</option>",
    );

    for (var x = 0; x < GLSDk_carriers.length; ++x) {
      eCarriers.append(
        "<option value='" +
          GLSDk_carriers[x].Id +
          "'>" +
          GLSDk_carriers[x].Name +
          "</option>",
      );
    }

    eCarrierOption.append(eCarriers);

    for (var x = 0; x < this.shipping_methods.length; ++x) {
      this.appendGLSDkTo(this.shipping_methods[x], eCarrierOption);
    }

    setTimeout(() => {
      this.setSelectedCarrier();
    }, 1000);
  }

  checkIfKeysAreValid() {
    const data = { action: "GLSDk_check_keys" };
    jQuery.getJSON(ajaxurl, data, function (resp) {
      if (resp.err) {
        alert(resp.err);
      }
      console.log(resp);
    });
  }

  /**
   *
   */
  setSelectedCarrier() {
    for (var x = 0; x < this.shipping_methods.length; ++x) {
      let rule_name = "GLSDk_" + this.shipping_methods[x];
      let rules = window[rule_name];
      let elem = jQuery("#" + this.shipping_methods[x]).find(".GLSDk_carrier");
      console.log("settting rules for " + rule_name, rules);
      if (typeof rules != "undefined") {
        for (let i = 0; i < rules.length; ++i) {
          jQuery(elem.get(i)).val(rules[i]);
        }
      }
    }
  }

  /**
   * @param string - selector - The name of the selector
   * @param element - eCarrierOption - a template for the carrier select
   */
  appendGLSDkTo(selector, eCarrierOption) {
    let elem = jQuery("#" + selector).find(".country_select");
    if (elem.size() == 0) {
      setTimeout(() => {
        this.appendGLSDkTo(selector, eCarrierOption);
      }, 500);
      return;
    }

    var eSelect = eCarrierOption.find("select");
    console.log(eSelect);
    eSelect.attr("name", "GLSDk_" + selector + "[]");

    eCarrierOption.clone().insertAfter(elem);
  }

  exportOrder(orderid) {
    jQuery(".notice").remove();
    jQuery("#GLSDk-export-status").html(GLSDk_label_sending);
    jQuery.ajax({
      url: wcfm_params.ajax_url,
      type: "GET",
      data: {
        action: "GLSDk_wcfm_export_order",
        orderid: orderid,
      },
      success: function (resp) {
        console.log(resp);
        jQuery("#GLSDk-export-status").html("");
        jQuery(".wcfm-top-element-container").append(resp);
      },
      error: function (err) {
        jQuery("#GLSDk-export-status").html(JSON.stringify(err));
        console.log("Error exporting " + orderid, err);
      },
    });
  }

  exportSelectedOrders() {
    jQuery(".notice").remove();
    jQuery("#GLSDk-export-status").html(GLSDk_label_sending);
    var orderids = [];
    jQuery(".GLSDk-wcfm-checkbox").each(function (idx, elem) {
      if (jQuery(this).is(":checked")) {
        orderids.push(jQuery(this).val());
      }
    });

    console.log("exporting ", orderids);
    if (orderids.length == 0) {
      alert("No orders where selected");
      return;
    }

    jQuery.ajax({
      url: wcfm_params.ajax_url,
      type: "GET",
      data: {
        action: "GLSDk_wcfm_export_orders",
        orderids: orderids,
      },
      success: function (resp) {
        console.log(resp);
        jQuery("#GLSDk-export-status").html("");
        jQuery(".wcfm-top-element-container").append(resp);
      },
      error: function (err) {
        jQuery("#GLSDk-export-status").html(JSON.stringify(err));
        console.log("Error exporting " + orderids, err);
      },
    });
  }
}

jQuery(function () {
  window.GLSDk_wcfm = new GLSDkWCFM();
});
