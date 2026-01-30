var Bpost_label_label = GLSDkData.Bpost_label_label;
var Bpost_label_click = GLSDkData.Bpost_label_click;
var Bpost_label_request = GLSDkData.Bpost_label_request;
jQuery(function () {
  let eHeader = jQuery("body.post-type-shop_order .wrap h1");

  if (GLSDkData.is_single_order) {
    eHeader.append(
      '<a href="#!" onclick="GLSDk.printlabel(event,' +
        GLSDkData.post_id +
        ')" class="page-title-action Bpost-btn-print-label">' +
        GLSDkData.GLSDk_label_label +
        "</a>",
    );
  }

  if (GLSDkData.export_message !== "") {
    var eGLSDk = jQuery(GLSDkData.export_message);
    jQuery(".wp-header-end").before(eGLSDk);
    GLSDkData.exportSuccess(GLSDkData.login_url);
    console.log(eGLSDk.get(0));
  }
});
