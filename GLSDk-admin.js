import "./scss/GLSDk-admin.scss";
import Popper from "popper.js";

import WooGLSDkAdmin from "./js/GLSDk-woo-commerce-admin.js";

class GLSDk {
  constructor() {
    console.log("I'm alive!");
  }

  /**
   *
   */
  bootstrap() {
    this.tooltips();
    this.platform = new WooGLSDkAdmin();

    this.loadAnalytics();
    if (typeof this.platform.bootstrap != "undefined") {
      this.platform.bootstrap();
    }
  }

  tooltips() {
    let toltip = jQuery(".GLSDk-tooltip-message");
    let container = jQuery("#wpcontent");

    if (toltip.size() == 0) {
      return;
    }

    let me = this;
    toltip.each(function (idx, elem) {
      me.attachPopper(elem, container);
    });
  }

  attachPopper(toltip, container) {
    let eToltip = jQuery(toltip);
    let toltipReference = eToltip.siblings(".GLSDk-tooltip-reference");
    let arrow = eToltip.children(".GLSDk-tooltip-message__arrow").get(0);

    var popper = new Popper(toltipReference.get(0), toltip, {
      placement: "left",
      modifiers: {
        flip: {
          behavior: ["top", "left", "bottom"],
        },
        preventOverflow: {
          boundariesElement: container,
        },
        offset: {
          enabled: true,
          offset: "10,10",
        },
        arrow: {
          enabled: true,
          element: arrow,
        },
      },
    });
    setTimeout(() => {
      popper.update();
    }, 200);
  }

  exportSuccess(appLink) {
    this.platform.exportSuccess(appLink);
  }

  /**
   * @param string category
   * @param string action
   * @param string label
   */
  sendAnalyticsEvent(category, action, label) {
    ga("GLSDk.send", "event", category, action, label, { transport: "beacon" });
  }

  loadAnalytics() {
    if (typeof ga == "undefined") {
      (function (i, s, o, g, r, a, m) {
        i["GoogleAnalyticsObject"] = r;
        ((i[r] =
          i[r] ||
          function () {
            (i[r].q = i[r].q || []).push(arguments);
          }),
          (i[r].l = 1 * new Date()));
        ((a = s.createElement(o)), (m = s.getElementsByTagName(o)[0]));
        a.async = 1;
        a.src = g;
        m.parentNode.insertBefore(a, m);
      })(
        window,
        document,
        "script",
        "https://www.google-analytics.com/analytics.js",
        "ga",
      );
    }
    ga("create", "UA-101485643-1", "auto", "GLSDk");
    ga("GLSDk.set", "anonymizeIp", true);
  }

  // FIXED: Added comprehensive JSON parsing with better error handling
  safeJsonParse(data) {
    // If data is already an object, return it directly
    if (data !== null && typeof data === "object" && !Array.isArray(data)) {
      return data;
    }

    // If data is not a string, convert it to string first
    if (typeof data !== "string") {
      try {
        return JSON.parse(JSON.stringify(data));
      } catch (error) {
        throw new Error("Data is not a valid object or string: " + typeof data);
      }
    }

    // Handle string data
    let cleanData = data;

    // Remove NULL prefix if present
    if (cleanData.startsWith("NULL")) {
      const jsonStart = cleanData.indexOf("{");
      if (jsonStart !== -1) {
        cleanData = cleanData.substring(jsonStart);
      } else {
        throw new Error("No JSON object found after NULL prefix");
      }
    }

    // extract JSON from mixed content
    if (cleanData.includes("{") && cleanData.includes("}")) {
      const firstBrace = cleanData.indexOf("{");
      const lastBrace = cleanData.lastIndexOf("}");

      if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
        cleanData = cleanData.substring(firstBrace, lastBrace + 1);
      }
    }

    // Parse the clean JSON
    try {
      return JSON.parse(cleanData);
    } catch (parseError) {
      throw new Error("Invalid JSON format: " + parseError.message);
    }
  }

  // FIXED: Updated printlabel method with better JSON handling
  printlabel(event, orderid) {
    event.stopPropagation();

    var data = {
      action: "GLSDk_print_label",
      orderid: orderid,
      nonce: my_ajax_object.nonce,
    };

    this.openLoader(GLSDk_label_request);

    jQuery
      .ajax({
        type: "POST",
        url: ajaxurl,
        data: data,
        dataType: "text", // Keep as text to handle mixed responses
      })
      .done((data) => {
        try {
          // FIXED: Use the safe JSON parser
          const parsedData = this.safeJsonParse(data);

          // FIXED: Better validation of parsed data
          if (!parsedData) {
            throw new Error("No data received from server");
          }

          // Process the parsed data
          if (parsedData.response) {
            if (parsedData.response.Error && parsedData.response.Error.Id > 0) {
              this.loaderMsg(parsedData.response.Error.Info);
              setTimeout(() => {
                this.closeLoader();
              }, 2000);
            }

            if (parsedData.response.CallbackURL) {
              this.monitorLabelStatus(parsedData.response.CallbackURL);
            }
          }

          if (parsedData.errors && Array.isArray(parsedData.errors)) {
            this.loaderMsg(parsedData.errors.join("<br/>"));
            setTimeout(() => {
              this.closeLoader();
            }, 5000);
          }
        } catch (error) {
          console.error("Error processing print label response:", error);
          console.log("Raw response data:", data); // ADDED: Debug logging
          this.loaderMsg("Error processing response: " + error.message);
          setTimeout(() => {
            this.closeLoader();
          }, 2000);
        }
      })
      .fail((jqXHR, textStatus, errorThrown) => {
        try {
          // FIXED: Use safe parser for error responses too
          const parsedData = this.safeJsonParse(jqXHR.responseText);

          if (
            parsedData &&
            parsedData.response &&
            parsedData.response.CallbackURL
          ) {
            this.monitorLabelStatus(parsedData.response.CallbackURL);
            return;
          }
        } catch (error) {
          console.error("Error handling failed request:", error);
          console.log("Raw error response:", jqXHR.responseText); // ADDED: Debug logging
        }

        this.loaderMsg("Request failed: " + (errorThrown || textStatus));
        setTimeout(() => {
          this.closeLoader();
        }, 2000);
      });
  }

  // FIXED: Updated monitorLabelStatus method with better JSON handling
  monitorLabelStatus(callbackUrl) {
    var data = {
      action: "GLSDk_label_status",
      callbackUrl: callbackUrl,
      nonce: my_ajax_object.nonce,
    };

    jQuery
      .ajax({
        type: "POST",
        url: ajaxurl,
        data: data,
        dataType: "text", // Keep as text to handle mixed responses
      })
      .done((data) => {
        try {
          // FIXED: Use the safe JSON parser
          const parsedData = this.safeJsonParse(data);

          if (!parsedData) {
            throw new Error("No status data received from server");
          }

          if (parsedData.response) {
            // Check for fatal errors
            if (parsedData.httpCode == "200") {
              this.loaderMsg(
                GLSDk_label_request + " " + parsedData.response.Finished + "%",
              );
            } else {
              this.loaderMsg("Fatal API error " + parsedData.httpCode);
              setTimeout(() => {
                this.closeLoader();
              }, 5000);
              return;
            }

            // FIXED: Better error checking
            if (parsedData.response.Error && parsedData.response.Error.Id > 0) {
              this.loaderMsg(parsedData.response.Error.Info);

              if (parsedData.response.Error.Id == 902) {
                setTimeout(() => {
                  this.closeLoader();
                }, 2000);
              }
            }

            if (parsedData.response.Finished == 100) {
              if (
                parsedData.response.LabelFile &&
                parsedData.response.LabelFile.length > 0
              ) {
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

                // Update label status indicators
                if (
                  parsedData.response.ClientReferenceCodeList &&
                  parsedData.response.ClientReferenceCodeList.length > 0
                ) {
                  for (
                    var x = 0;
                    x < parsedData.response.ClientReferenceCodeList.length;
                    ++x
                  ) {
                    var labelresult =
                      parsedData.response.ClientReferenceCodeList[x];

                    if (labelresult.Error && labelresult.Error.Id == 0) {
                      jQuery(
                        "#GLSDk-label" + labelresult.ReferenceCode,
                      ).addClass("GLSDk-icon-print-printed");
                    } else {
                      jQuery(
                        "#GLSDk-label" + labelresult.ReferenceCode,
                      ).addClass("GLSDk-icon-print-error");
                    }

                    if (labelresult.message) {
                      jQuery("#GLSDk-tooltip" + labelresult.ReferenceCode).html(
                        labelresult.message,
                      );
                    }
                  }
                }
              } else {
                let msg = "";
                if (
                  parsedData.response.ClientReferenceCodeList &&
                  parsedData.response.ClientReferenceCodeList.length > 0
                ) {
                  for (
                    var x = 0;
                    x < parsedData.response.ClientReferenceCodeList.length;
                    ++x
                  ) {
                    let labelresult =
                      parsedData.response.ClientReferenceCodeList[x];
                    if (labelresult.Error && labelresult.Error.Id > 0) {
                      msg +=
                        "<div class='GLSDk-label-error error'>" +
                        labelresult.Error.Info +
                        "</div>";
                    }
                    jQuery("#GLSDk-label" + labelresult.ReferenceCode).addClass(
                      "GLSDk-icon-print-error",
                    );

                    if (labelresult.message) {
                      jQuery("#GLSDk-tooltip" + labelresult.ReferenceCode).html(
                        labelresult.message,
                      );
                    }
                  }
                }

                this.loaderMsg(msg || "No label file was generated");
                setTimeout(() => {
                  this.closeLoader();
                }, 5000);
              }
            }

            if (parsedData.response.Finished < 100) {
              this.loaderMsg(
                GLSDk_label_request + " " + parsedData.response.Finished + "%",
              );
              setTimeout(() => {
                this.monitorLabelStatus(callbackUrl);
              }, 2000);
            }
          } else {
            this.loaderMsg("Invalid response format");
            setTimeout(() => {
              this.closeLoader();
            }, 2000);
          }
        } catch (error) {
          console.error("Error processing label status:", error);
          console.log("Raw status response:", data); // ADDED: Debug logging
          this.loaderMsg("Error processing label status: " + error.message);
          setTimeout(() => {
            this.closeLoader();
          }, 2000);
        }
      })
      .fail((jqXHR, textStatus, errorThrown) => {
        try {
          // FIXED: Use safe parser for error responses
          const parsedData = this.safeJsonParse(jqXHR.responseText);

          if (
            parsedData &&
            parsedData.response &&
            parsedData.response.Finished < 100
          ) {
            this.loaderMsg(
              GLSDk_label_request + " " + parsedData.response.Finished + "%",
            );
            setTimeout(() => {
              this.monitorLabelStatus(callbackUrl);
            }, 2000);
            return;
          }
        } catch (error) {
          console.error("Error handling failed status request:", error);
          console.log("Raw error response:", jqXHR.responseText); // ADDED: Debug logging
        }

        this.loaderMsg(
          "Label status request failed: " + (errorThrown || textStatus),
        );
        setTimeout(() => {
          this.closeLoader();
        }, 2000);
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

jQuery(function () {
  window.GLSDk = new GLSDk();
  window.GLSDk.bootstrap();
  window.Popper = Popper;
});
