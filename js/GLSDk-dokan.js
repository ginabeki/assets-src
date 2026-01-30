/**
 * Add any aditional functionality we need in the vendor dashboard
 */
class GLSDkDokan {
  constructor() {}

  export(data) {
    jQuery(
      "<div class='GLSDk-sending'>" + GLSDk_label_sending + "</div>",
    ).insertBefore(".GLSDk-export-btn");
    jQuery.ajax({
      url: dokan.ajaxurl,
      method: "GET",
      data: data,
      success: function (resp) {
        jQuery(".GLSDk-sending").remove();
        jQuery(resp).insertAfter(".GLSDk-export-btn");
      },
      error: function (err) {
        jQuery(".GLSDk-sending").remove();
        jQuery("An error has occurred " + JSON.stringify(err)).insertAfter(
          ".GLSDk-export-btn",
        );
      },
    });
  }

  exportSelected() {
    let selectedIds = [];
    jQuery("input[name='bulk_orders[]']:checked").each(function (idx, elem) {
      selectedIds[idx] = jQuery(elem).val();
    });

    if (selectedIds.length == 0) {
      alert("No orders are selected");
      return;
    }
    let data = {
      action: "GLSDk_dokan_export_selected",
      ids: selectedIds,
    };

    this.export(data);
  }

  exportAll() {
    let data = {
      action: "GLSDk_dokan_export_all",
    };

    this.export(data);
  }
}

jQuery(function () {
  window.GLSDk_dokan = new GLSDkDokan();
});
