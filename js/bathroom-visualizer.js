// Pure logic for the bathroom photo visualizer: given a scope-question answer
// or a fixture quantity, decide which visual item (key + label) should be
// shown as a chip on the uploaded photo. No DOM, no icons — icons stay owned
// by js/script.js's MATERIAL_ICON_SVG, which already has an entry for every
// key this module can return.
//
// This is a mockup, not a real rendering: js/script.js overlays a plain icon
// badge on the customer's own photo, it does not generate or edit the image.
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BathroomVisualizer = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var IS_MOCK_VISUALIZATION = true;

  // demolition is intentionally absent: it has no purchasable/visual
  // category, same reason materials picker excludes it from
  // categoriesFromLines.
  var SCOPE_VISUAL_MAP = {
    floorFinish: {
      tile: { key: "floorTile", label: "Floor tile" },
      flooring: { key: "flooring", label: "Other flooring" },
      none: null,
    },
    walls: {
      tile: { key: "wallTile", label: "Wall tile" },
      paint: { key: "wallPaint", label: "Wall paint" },
      none: null,
    },
    paintCeiling: {
      true: { key: "ceilingPaint", label: "Ceiling paint" },
      false: null,
    },
  };

  function visualItemForScopeField(fieldKey, value) {
    var options = SCOPE_VISUAL_MAP[fieldKey];
    if (!options) return null;
    var item = options[value];
    return item ? { key: item.key, label: item.label } : null;
  }

  function visualItemForFixture(fixtureKey, qty, label) {
    var n = typeof qty === "number" ? qty : parseInt(String(qty).trim(), 10);
    if (!n || n <= 0) return null;
    return { key: fixtureKey, label: n + " " + label };
  }

  return {
    IS_MOCK_VISUALIZATION: IS_MOCK_VISUALIZATION,
    visualItemForScopeField: visualItemForScopeField,
    visualItemForFixture: visualItemForFixture,
  };
});
