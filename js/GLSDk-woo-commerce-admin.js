import Utils from "./GLSDk-utils.js";
import GLSDkWeightBasedShipping from "./GLSDk-weight-based-shipping.js";
export default class WooGLSDkAdmin {
  constructor() {
    this.wbs = new GLSDkWeightBasedShipping();
  }

  bootstrap() {
    this.urlParams();
  }

  /**
   * If the export was successfull
   * @param string appLink - the login url
   */
  exportSuccess(appLink) {
    if (appLink.trim().length == 0) {
      return;
    }

    Utils.openNewWindow(appLink, "");
  }

  /**
   * @param int id - the carrier id
   */
  getCarrier(id) {
    for (let x = 0; x < GLSDk_carriers.length; ++x) {
      if (GLSDk_carriers[x].Id == id) {
        return GLSDk_carriers[x];
      }
    }
  }

  /**
   * Show aditional options for carrier
   */
  selectOptions(elem) {
    this.selectServiceLevel(elem, jQuery(".GLSDk__service-level").val());
    // hide the extra options for now
    this.selectExtraOptions(elem, jQuery(".GLSDk__extra-options").val());
  }

  buildOptionsHtml(options, typeFilter, selectedId) {
    let html = "";

    if (!options) return html;

    const filteredOptions = options.filter(
      (option) => option.Type === typeFilter,
    );

    if (filteredOptions.length === 0) return html;

    html += "<option>-</option>";

    filteredOptions.forEach((option) => {
      if (typeFilter === 1 && option.OptionValues) {
        // Service level options
        option.OptionValues.forEach((value) => {
          const selected = selectedId == value.Id ? "selected" : "";
          html += `<option value="${value.Id}" ${selected}>${value.Name}</option>`;
        });
      } else if (typeFilter === 0) {
        // Extra options
        const selected = selectedId == option.Id ? "selected" : "";
        html += `<option value="${option.Id}" ${selected}>${option.Name}</option>`;
      }
    });

    return html;
  }

  updateOptionElement(element, html) {
    element.html(html);
    element.toggleClass("active", !!html);
  }

  /**
   * @param DomElement  elem - the carrier select
   */
  selectServiceLevel(elem, service_id) {
    const carrier_id = elem.val();
    const carrier = this.getCarrier(carrier_id);
    const eServiceLevel = elem.siblings(".GLSDk__service-level");

    const options_html = this.buildOptionsHtml(
      carrier?.OptionList,
      1,
      service_id,
    );
    this.updateOptionElement(eServiceLevel, options_html);
  }

  selectExtraOptions(elem, selected_id) {
    const carrier_id = elem.val();
    const carrier = this.getCarrier(carrier_id);
    const eExtraoptions = elem.siblings(".GLSDk__extra-options");

    const options_html = this.buildOptionsHtml(
      carrier?.OptionList,
      0,
      selected_id,
    );
    this.updateOptionElement(eExtraoptions, options_html);
  }

  selectTab(idx) {
    jQuery(".nav-tab").removeClass("nav-tab-active");
    jQuery(jQuery(".nav-tab").get(idx)).addClass("nav-tab-active");

    jQuery(".tab").removeClass("active");
    jQuery(jQuery(".tab").get(idx)).addClass("active");
  }

  accordion(elem) {
    let $eparent = jQuery(elem).parent();
    if ($eparent.hasClass("open")) {
      $eparent.removeClass("open");
    } else {
      $eparent.addClass("open");
    }
  }

  /**
   * Is there stuff in the url params we care about?
   **/
  urlParams() {
    let parts = document.location.search.split("&");
    for (let x = 0; x < parts.length; ++x) {
      let keyval = parts[x].split("=");
      let key = keyval[0];
      let value = decodeURIComponent(keyval[1]);

      if (key == "CallbackURL") {
        console.log("We are creating a label");
        console.log(GLSDk_label_request);
        this.openLoader(GLSDk_label_request);

        this.monitorLabelStatus(value);
      }

      if (key == "Error") {
        console.log("There where errors", value);
        value = value.replace(/\+/g, " ");
        this.openLoader(value);
        setTimeout(() => {
          this.closeLoader();
        }, 5000);
      }
    }
  }

  /**
   * Request the label status every 1s
   */
  monitorLabelStatus(callbackUrl) {
    var data = {
      action: "GLSDk_label_status",
      callbackUrl: callbackUrl,
      nonce: my_ajax_object.nonce,
    };

    console.log("MonitorLabel Status func");

    jQuery
      .ajax({
        type: "POST",
        url: ajaxurl,
        data: data,
      })
      .done((data) => {
        console.log("Vraceno je posle monitorlabelstatus2222222");
        console.log(data);
        var parsedData = jQuery.parseJSON(data);

        console.log(parsedData);

        if (typeof parsedData.response != "undefined") {
          console.log("Nije undefined");
          // Check for falta errors
          if (parsedData.httpCode == "200") {
            console.log("200 succ");
            this.loaderMsg(
              GLSDk_label_request + " " + parsedData.response.Finished + "%",
            );
          } else {
            console.log("Error bato");
            this.loaderMsg("Fatal API error " + parsedData.httpCode);
            setTimeout(() => {
              this.closeLoader();
            }, 5000);
            return;
          }

          // Print API errors
          if (parsedData.response.Error.Id > 0) {
            console.log("Error id > 0");
            this.loaderMsg(parsedData.response.Error.Info);
          }

          if (parsedData.response.Error.Id == 902) {
            //No process running
            console.log("Id 902");
            setTimeout(() => {
              this.closeLoader();
            }, 2000);
          }

          if (parsedData.response.Finished == 100) {
            console.log("Gotovo 100");
            if (parsedData.response.LabelFile.length > 0) {
              let labelinfo = GLSDk_label_click.replace(
                "%",
                `<a href="${parsedData.response.LabelFile}" target='_blank'>${GLSDk_label_label}</a>`,
              );
              let noticelist = jQuery("#wp__notice-list");
              noticelist.removeClass("woocommerce-layout__notice-list-hide");
              noticelist.append(
                `<div class="notice notice-info is-dismissible updated">${labelinfo}</div>`,
              );
              window.open(parsedData.response.LabelFile, "_blank");
              this.closeLoader();

              /**
               * Make sure the info is updated without the need to reload the page
               */
              for (
                var x = 0;
                x < parsedData.response.ClientReferenceCodeList.length;
                ++x
              ) {
                var labelresult =
                  parsedData.response.ClientReferenceCodeList[x];
                if (labelresult.Error.Id == 0) {
                  jQuery("#GLSDk-label" + labelresult.ReferenceCode).addClass(
                    "GLSDk-icon-print-printed",
                  );
                } else {
                  jQuery("#GLSDk-label" + labelresult.ReferenceCode).addClass(
                    "GLSDk-icon-print-error",
                  );
                }

                jQuery("#GLSDk-tooltip" + labelresult.ReferenceCode).html(
                  labelresult.message,
                );
              }
            } else {
              let msg = "";
              for (
                var x = 0;
                x < parsedData.response.ClientReferenceCodeList.length;
                ++x
              ) {
                let labelresult =
                  parsedData.response.ClientReferenceCodeList[0];
                if (labelresult.Error.Id > 0) {
                  msg +=
                    "<div class='GLSDk-label-error error'>" +
                    labelresult.Error.Info +
                    "</div>";
                }
                jQuery("#GLSDk-label" + labelresult.ReferenceCode).addClass(
                  "GLSDk-icon-print-error",
                );
                jQuery("#GLSDk-tooltip" + labelresult.ReferenceCode).html(
                  labelresult.message,
                );
              }

              this.loaderMsg(msg);
              setTimeout(() => {
                this.closeLoader();
              }, 5000);
            }
          }

          if (parsedData.response.Finished < 100) {
            console.log("Okini opet");
            this.loaderMsg(
              GLSDk_label_request + " " + parsedData.response.Finished + "%",
            );
            setTimeout(() => {
              this.monitorLabelStatus(callbackUrl);
            }, 2000);
          }
        }
      });
  }

  loaderMsg(message) {
    jQuery(".GLSDk-loader-message").html(message);
  }

  openLoader(message) {
    jQuery("body").append(
      '<div class="GLSDk-loader-wrapper"><div class="GLSDk-loader"><div></div><div></div><div></div></div><div class="GLSDk-loader-message">' +
        message +
        "</div></div>",
    );
  }

  closeLoader() {
    jQuery(".GLSDk-loader-wrapper").remove();
  }
}
