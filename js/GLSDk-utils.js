/**
 * Singleton object we can use for platform independent stuff
 */
class GLSDkUtils {
  constructor() {}

  /**
   * Inject script into the page
   * @param string srcOrContents - URL for external script or script contents
   * @param boolean isExternal - true for external script, false for inline
   */
  injectScript(srcOrContents, isExternal = true) {
    const script = document.createElement("script");

    if (isExternal) {
      script.src = srcOrContents;
    } else {
      script.textContent = srcOrContents;
    }

    document.body.appendChild(script);
  }

  /**
   * Removes all not numeric chars from the string
   *
   * @param string string - the input string
   * @return the string without chars that are not numbers
   */
  removeNonNumeric(string) {
    return string.replace(/\D/g, "");
  }

  /**
   * Check if the given url exists and is valid
   * We use this to check if the carrier icon exists given
   * a url path and the naming convention {carrier_id}.svg
   * Make sure the correct protocol is appended to the url http != https
   *
   * @return true it the url exists and is valid
   */
  isUrlValid(url) {
    var http = new XMLHttpRequest();
    http.open("HEAD", url, false);
    http.send();
    return http.status == 200;
  }

  /**
   * Open a new window with the provided URL
   * @string url
   * @return bool if the window was opened, false if popup blocker enabled
   */
  openNewWindow(url, options) {
    let newWin = window.open(url, "_blank", options);
    let blocked =
      !newWin || newWin.closed || typeof newWin.closed == "undefined";

    return !blocked;
  }
}

let utils = new GLSDkUtils();
export default utils;
