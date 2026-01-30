/**
 * plug into the  dom and  append GLSDk settings
 * Save on change via ajax
 * We can't save rule by rule withough pluggin into the checkout
 * Currently only the instance id is saved
 */
export default class GLSDkWeightBasedShipping {
  constructor() {
    console.log("GLSDk options for WeightBasedShipping");
    this.init();
  }

  init() {
    //not a shipping method page
    if (typeof GLSDk_carrier == "undefined") {
      return;
    }

    const regexInstance = /instance_id=([0-9]*)/.exec(window.location.search);

    if (!regexInstance) {
      console.log(
        "invalid url params cannot find instance_id " + window.location.search,
      );
      return;
    }

    this.instance_id = regexInstance[1];
    this.attachGLSDkOptions();
  }

  /**
   * Save our options for this instance
   */
  saveOptions(elem) {
    var data = {
      data: this.eForm.serializeArray(),
      instance_id: this.instance_id,
      action: "GLSDk_wbs_settings",
    };

    jQuery.post(ajaxurl, data, function (resp) {
      console.log("response ", resp);
    });

    console.log(this.eForm, "Saveoptions ", data);

    jQuery(".GLSDk-optionvalues").hide();
    var extraOption = jQuery(".GLSDk-extraoptions").val();
    jQuery("#GLSDk-extraoptions" + extraOption).show();
  }

  /**
   * Attach the GLSDk options under the title
   */
  attachGLSDkOptions() {
    var eGLSDkOptions = jQuery(
      "<form id='GLSDkoptions' class=\"wbs-GLSDkoptions\"></form>",
    );
    var oHtml = "";

    //no options , nothing to do
    if (typeof GLSDk_carrier.OptionList == "undefined") {
      return;
    }

    //GLSDk_extraoptions
    //GLSDk_checkboxes
    //Add a Save button
    let htmlServiceLevels = "";
    let htmlExtraOptions = "";
    let htmlCheckboxes = "";
    let htmlExtravalues = "";
    for (var x = 0; x < GLSDk_carrier.OptionList.length; ++x) {
      const option = GLSDk_carrier.OptionList[x];

      if (option.Type == 1) {
        if (typeof option.OptionValues != "undefined") {
          for (var i = 0; i < option.OptionValues.length; ++i) {
            let optionChild = option.OptionValues[i];
            let selected =
              GLSDk_options["service_level"] == optionChild.Id
                ? "selected"
                : "";
            htmlServiceLevels +=
              "<option value='" +
              optionChild.Id +
              "' " +
              selected +
              ">" +
              optionChild.Name +
              "</option>";
          }
        }
      } else if (GLSDk_extraoptions.includes(option.Id + "")) {
        let selected =
          GLSDk_options["extraoptions"] == option.Id ? "selected" : "";
        htmlExtraOptions +=
          "<option value='" +
          option.Id +
          "' " +
          selected +
          ">" +
          option.Name +
          "</option>";
        if (option.OptionFields && option.OptionFields.length > 0) {
          for (var j = 0; j < option.OptionFields.length; ++j) {
            if (option.OptionFields[j].OptionValues) {
              var optionField = option.OptionFields[j];
              htmlExtravalues +=
                '<select class="GLSDk-optionvalues" id="GLSDk-extraoptions' +
                option.Id +
                '" name="extraoptions' +
                option.Id +
                '" onchange=\"GLSDk.platform.wbs.saveOptions(jQuery(this))\">';
              for (var i = 0; i < optionField.OptionValues.length; ++i) {
                let optionChild = optionField.OptionValues[i];
                console.log("OptionChild ", optionChild);
                let selected =
                  GLSDk_options["extraoptions" + option.Id] == optionChild.Id
                    ? "selected"
                    : "";
                htmlExtravalues +=
                  "<option value='" +
                  optionChild.Id +
                  "' " +
                  selected +
                  ">" +
                  optionChild.Name +
                  "</option>";
              }
              htmlExtravalues += "</select>";
            }
          }
        }
      } else {
        const keys = Object.keys(GLSDk_checkboxes);
        for (var i = 0; i < keys.length; ++i) {
          if (option.Id == keys[i]) {
            let optionName = GLSDk_checkboxes[option.Id];
            let checked =
              GLSDk_options[optionName] == option.Id ? "checked" : "";
            htmlCheckboxes +=
              '<span class="wbs-GLSDk-option"><input ' +
              checked +
              ' class="wbs-rse-checkbox"  onchange="GLSDk.platform.wbs.saveOptions(jQuery(this))" type="checkbox" name="' +
              optionName +
              '" value="' +
              option.Id +
              '"/>' +
              GLSDk_checkboxes[option.Id] +
              "</span>";
          }
        }
      }
    }

    if (htmlServiceLevels.length > 0) {
      oHtml +=
        '<span class="wbs-GLSDk-option"><label>' +
        GLSDk_labels.servicelevel +
        '</label> <select name="service_level"  onchange="GLSDk.platform.wbs.saveOptions(jQuery(this))"><option>-</option>' +
        htmlServiceLevels +
        "</select></span>";
    }

    if (htmlExtraOptions.length > 0) {
      oHtml +=
        '<span class="wbs-GLSDk-option"><label>' +
        GLSDk_labels.extraoptions +
        '</label> <select class=\'GLSDk-extraoptions\' name="extraoptions"  onchange="GLSDk.platform.wbs.saveOptions(jQuery(this))"><option>-</option>' +
        htmlExtraOptions +
        "</select> " +
        htmlExtravalues +
        " </span>";
    }

    oHtml += htmlCheckboxes;

    //Pickup Behaviour?
    if (GLSDk_carrier.HasPickup) {
      let selecthtml =
        '<select class="GLSDk-extraoptions" name="pickupbehaviour" onchange=\"GLSDk.platform.wbs.saveOptions(jQuery(this))\">';
      for (var x = 0; x < 3; ++x) {
        let selected = GLSDk_options["pickupbehaviour"] == x ? "selected" : "";
        selecthtml += `<option value="${x}" ${selected}>${GLSDk_labels["pickup" + x]}</option>`;
      }
      selecthtml += "</select>";

      oHtml += `<span class=\"wbs-GLSDk-option\"><label>${GLSDk_labels.pickupbehaviour}</label> ${selecthtml}</span>`;
    }

    if (oHtml.length > 0) {
      eGLSDkOptions.html("<h3>GLSDk Settings</h3>" + oHtml);
      eGLSDkOptions.insertAfter(jQuery("#mainform"));
      this.eForm = jQuery("#GLSDkoptions");
      this.saveOptions(jQuery(".GLSDk-extraoptions"));
    }
  }
}
