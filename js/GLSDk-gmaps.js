import GLSDkWidget from "./GLSDk-widget";
class GLSDkGmaps {
  constructor(options) {
    console.log("Entered");
    this.isScriptLoaded = false;
    this.markers = [];
    this.map = null;
    this.pickupPoints = [];
    this.options = options;
    this.host = options.host;
    console.log("Icon folder");
    console.log(GLSDk_icon_folder);
    this.icon_folder =
      typeof GLSDk_icon_folder !== "undefined" ? GLSDk_icon_folder : "";
    this.icon_selected = this.icon_folder + "selected.png";
    this.icon_default = this.icon_folder + "default.png";
    this.current_icon = this.icon_default;
    this.moveListeners = [];
    this.carrier_id = null;
    this.carrier_icon_config = {
      30: {
        extension: "svg",
        selectedState: true,
        iconSize: 98,
      },
    };

    this.GLSDkWidget = new GLSDkWidget(options);
  }

  initMap(carrier_id, f_callback) {
    this.carrier_id = carrier_id;
    let me = this;

    this.loadScript(
      "https://maps.googleapis.com/maps/api/js?key=" +
        this.options.gmapskey +
        "&callback=",
      () => {
        console.log("USAO U IF");
        me.isScriptLoaded = true;
        f_callback && f_callback();
        this.loadMap();
      },
    );

    console.log("Initmap Nije usao u if");
  }

  loadScript(url, callback) {
    var script = document.createElement("script");
    script.type = "text/javascript";

    if (script.readyState) {
      /*IE */
      script.onreadystatechange = function () {
        if (script.readyState == "loaded" || script.readyState == "complete") {
          script.onreadystatechange = null;
          calback && callback();
        }
      };
    } else {
      script.onload = function () {
        callback && callback();
      };
    }

    script.src = url;
    document.getElementsByTagName("head")[0].appendChild(script);
  }

  addMarkers(pickupPoints, callback) {
    this.pickupPoints = pickupPoints;

    for (let x = 0; x < pickupPoints.length; ++x) {
      this.markers[x] = this.getMarker(pickupPoints[x]);
      pickupPoints[x].marker = this.markers[x];

      this.markers[x].addListener("click", () => {
        if (typeof callback != "undefined") {
          callback(x);
        }
      });
    }

    this.fitBounds();
  }

  addMapMoveListener(fcallback) {
    this.moveListeners.push(fcallback);
  }

  centerMap(lat, lng) {
    this.map.setCenter(new google.maps.LatLng(lat, lng));
  }

  clearMarkers() {
    if (this.markers.length > 0) {
      for (let i = 0; i < this.markers.length; ++i) {
        this.markers[i].setMap(null);
      }

      this.markers = [];
    }
  }

  fitBounds() {
    var bounds = new google.maps.LatLngBounds();
    for (let x = 0; x < this.markers.length; ++x) {
      bounds.extend(this.markers[x].getPosition());
    }
    this.map.fitBounds(bounds);
    this.bounds = this.map.getBounds();
  }

  getMarker(pickupPoint) {
    console.log("GETMARKER");
    let url = this.getCarrierIconUrl(pickupPoint.Type, 0);
    let options = {
      position: new google.maps.LatLng(pickupPoint.Lat, pickupPoint.Long),
      map: this.map,
      icon: {
        url,
      },
    };
    // ##DJDJ Ako nista odradi kao i u open map
    console.log("PRE IF");
    if (typeof this.carrier_icon_config[this.carrier_id] != "undefined") {
      console.log("IF GET MARKER");
      console.log(this.carrier_icon_config);
      console.log(this.carrier_icon_config[this.carrier_id].iconSize);
      options.icon.size = new google.maps.Size(
        this.carrier_icon_config[this.carrier_id].iconSize,
        this.carrier_icon_config[this.carrier_id].iconSize,
      );
    } else {
      console.log("ELSE GET MARKER");
      options.icon.scaledSize = new google.maps.Size(50, 50);
    }

    console.log("POSLE IF");
    let marker = new google.maps.Marker(options);

    return marker;
  }

  isMapMoving() {
    return this.isMoving || this.isUserMoving;
  }

  async moveEnd() {
    if (this.isMapMoving()) {
      return;
    }

    this.isUserMoving = true;
    let mapCenter = this.map.getCenter();

    for (let i = 0; this.moveListeners && i < this.moveListeners.length; ++i) {
      await this.moveListeners[i]({
        lat: mapCenter.lat(),
        lng: mapCenter.lng(),
      });
    }

    console.log("MOVE LISTENERS ENDED");
    this.isUserMoving = false;
  }

  loadMap() {
    console.log("LOADMAP");
    this.map = new google.maps.Map(document.getElementById("sw-map"), {
      center: { lat: -34.397, lng: 150.644 },
      zoom: 16,
      mapTypeControl: false,
    });

    this.map.addListener("center_changed", () => {
      let center = this.map.getCenter();

      if (this.bounds && !this.bounds.contains(center)) {
        this.moveEnd();
      }
    });
  }

  geocode(queryparts, f_callback) {
    if (typeof google == "undefined") {
      setTimeout(() => {
        this.geocode(shippingData, f_callback);
      }, 200);
      return;
    }

    this.clearMarkers();
    let geocoder = new google.maps.Geocoder();
    let me = this;

    console.log("geocoding ", queryparts);

    let query = "components=country:" + queryparts.country;
    if (queryparts.address && queryparts.address.match(/^([0-9\-]+)$/)) {
      if (
        queryparts.country.toUpperCase() == "PT" &&
        typeof missingZipPT != "undefined"
      ) {
        let zip4dig = queryparts.address.substring(0, 4);
        for (let i = 0; i < missingZipPT.length; ++i) {
          if (missingZipPT[i].zipcode == zip4dig) {
            let queryResults = [
              {
                display_name: missingZipPT[i].display_name,
                lat: missingZipPT[i].lat,
                lon: missingZipPT[i].lng,
              },
            ];
            return f_callback(queryResults);
          }
        }
      }
    }

    if (queryparts.components) {
      query += "|" + queryparts.components;
    } else if (queryparts.address.match(/^[0-9]/)) {
      query += "|postal_code:" + queryparts.address;
    } else {
      query += "&address=" + queryparts.address;
    }

    jQuery.get(
      "https://maps.google.com/maps/api/geocode/json?sensor=false&key=" +
        this.options.gmapskey +
        "&" +
        query,
      function (response) {
        let results = response.results;
        let status = response.status;

        console.log(results);
        let geocode = { iso2: "", lat: "", lng: "" };

        if (status != "OK") {
          console.log(
            "Geocode was not successful for the following reason: " + status,
            response.error_msg,
          );
          f_callback(geocode);
          return;
        }

        let places = [];
        for (let i = 0; i < results.length; ++i) {
          geocode = results[i];
          let display_name = "";
          for (
            let j = 0;
            geocode.address_components && j < geocode.address_components.length;
            ++j
          ) {
            display_name +=
              (display_name ? ", " : "") +
              geocode.address_components[j].long_name;
          }
          places.push({
            iso2: me.getCountryCodeFromResult(geocode),
            display_name,
            lat: geocode.geometry.location.lat,
            lng: geocode.geometry.location.lng,
          });
        }

        f_callback(places);
      },
    );
  }

  getCountryCodeFromResult(geocode) {
    if (typeof geocode.address_components == "undefined") {
      return "";
    }

    let components = geocode.address_components;
    for (let i = 0; i < components.length; ++i) {
      let types = components[i].types;

      for (let j = 0; j < types.length; ++j) {
        if (types[j] == "country") {
          return components[i].short_name;
        }
      }
    }
  }

  geocodeAddressParts(f_callback, city, country, postalcode, streetname) {
    if (typeof postalcode != "undefined") {
      if (country == "PT" || country == "Portugal") {
        postalcode = postalcode.substr(0, 4);
      }
    }

    let components = "postal_code:" + postalcode + "|locality:" + city;

    this.geocode({ country, components: components }, (places) => {
      f_callback(places[0]);
    });
  }

  setCarrierId(carrier_id) {
    this.carrier_id = carrier_id;
  }

  selectPoint(idx) {
    console.log("Selectpoint");
    for (let i = 0; i < this.markers.length; ++i) {
      let point = this.pickupPoints[i];
      console.log(point);
      let icon = {
        url: this.getCarrierIconUrl(point.Type, idx == i),
      };

      if (typeof this.carrier_icon_config[this.carrier_id] != "undefined") {
        icon.size = new google.maps.Size(
          this.carrier_icon_config[this.carrier_id].iconSize,
          this.carrier_icon_config[this.carrier_id].iconSize,
        );
      } else {
        icon.scaledSize = new google.maps.Size(50, 50);
      }
      console.log("SetICOD");
      console.log(icon);
      this.markers[i].setIcon(icon);
    }
  }

  setCarrierId(carrier_id) {
    this.carrier_id = carrier_id;
  }

  getCarrierIconUrl(type, selected) {
    let carrier_icon_url;

    let file_extension =
      "." +
      (typeof this.carrier_icon_config[this.carrier_id] != "undefined"
        ? this.carrier_icon_config[this.carrier_id].extension
        : "png");
    let selectedextension =
      typeof this.carrier_icon_config[this.carrier_id] != "undefined" &&
      this.carrier_icon_config[this.carrier_id].selectedState &&
      selected
        ? "_s"
        : "";

    if (selected && !selectedextension) {
      return this.icon_selected;
    }

    if (
      type &&
      typeof GLSDk_carrier_imgs != "undefined" &&
      GLSDk_carrier_imgs.indexOf(this.carrier_id + "_" + type + file_extension)
    ) {
      console.log("getCarrierIconUrl 1");
      carrier_icon_url =
        this.icon_folder +
        "" +
        this.carrier_id +
        "_" +
        type +
        selectedextension +
        file_extension;
    } else {
      console.log("getCarrierIconUrl 2");
      console.log(this.carrier_id);
      // ##DJDJ Ne znam zasto je svg, pogledaj da vratis kako je bilo
      carrier_icon_url =
        this.icon_folder + this.carrier_id + selectedextension + ".png";
    }

    return carrier_icon_url;
  }
}

export default GLSDkGmaps;
