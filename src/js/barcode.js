/*
 * RaffBarcode — a tiny, dependency-free Code 128 barcode generator.
 *
 * Why Code 128 and not EAN/UPC: our reference numbers look like "raf-0001"
 * (letters, digits, a hyphen). Code 128 encodes the full printable ASCII set,
 * so it can carry the reference verbatim. EAN/UPC are digits-only and fixed
 * length, which would force us to invent a numeric mapping — fragile and
 * pointless when a keyboard-wedge scanner reads Code 128 perfectly.
 *
 * Everything here runs offline. The output is an SVG string so it renders
 * crisply on screen and prints at any size without pixelation.
 *
 * UMD wrapper so the same file works under Node (for testing) and the browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RaffBarcode = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The 107 Code 128 symbols. Each string is the widths of its 6 bars/spaces
  // (bar, space, bar, space, bar, space). Index === the symbol's value.
  var PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213',
    '122312', '132212', '221213', '221312', '231212', '112232', '122132',
    '122231', '113222', '123122', '123221', '223211', '221132', '221231',
    '213212', '223112', '312131', '311222', '321122', '321221', '312212',
    '322112', '322211', '212123', '212321', '232121', '111323', '131123',
    '131321', '112313', '132113', '132311', '211313', '231113', '231311',
    '112133', '112331', '132131', '113123', '113321', '133121', '313121',
    '211331', '231131', '213113', '213311', '213131', '311123', '311321',
    '331121', '312113', '312311', '332111', '314111', '221411', '431111',
    '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114',
    '413111', '241112', '134111', '111242', '121142', '121241', '114212',
    '124112', '124211', '411212', '421112', '421211', '212141', '214121',
    '412121', '111143', '111341', '131141', '114113', '114311', '411113',
    '411311', '113141', '114131', '311141', '411131', '211412', '211214',
    '211232', '2331112'
  ];

  var START_B = 104;   // Start Code B (covers letters, digits, punctuation)
  var STOP = 106;

  /**
   * Encodes an ASCII string (values 0..94 in Code B) into the list of symbol
   * values, including start, checksum, and stop. Characters outside the Code B
   * printable range are rejected so we never emit a broken barcode.
   */
  function encodeValues(text) {
    var values = [START_B];
    var sum = START_B;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i) - 32; // Code B: space (32) -> value 0
      if (code < 0 || code > 94) {
        throw new Error('حرف غير مدعوم في الباركود: "' + text[i] + '"');
      }
      values.push(code);
      sum += code * (i + 1); // weighted checksum
    }
    values.push(sum % 103);  // check symbol
    values.push(STOP);
    return values;
  }

  /** Turns symbol values into a flat run-length list of module widths. */
  function valuesToModules(values) {
    var widths = [];
    for (var i = 0; i < values.length; i++) {
      var pattern = PATTERNS[values[i]];
      for (var j = 0; j < pattern.length; j++) {
        widths.push(parseInt(pattern[j], 10));
      }
    }
    return widths;
  }

  /**
   * Builds an SVG barcode for `text`.
   * opts: { moduleWidth, height, margin, showText, textSize, color, background, fontFamily }
   */
  function toSVG(text, opts) {
    opts = opts || {};
    var mw = opts.moduleWidth || 2;         // px per narrowest module
    var height = opts.height || 70;         // bar height
    var margin = opts.margin != null ? opts.margin : 10;
    var showText = opts.showText !== false; // print the human-readable code
    var textSize = opts.textSize || 14;
    var color = opts.color || '#1a1a1a';
    var background = opts.background || '#ffffff';
    var fontFamily = opts.fontFamily || 'monospace';

    var modules = valuesToModules(encodeValues(text));

    var totalModules = 0;
    for (var i = 0; i < modules.length; i++) totalModules += modules[i];

    var barsWidth = totalModules * mw;
    var textGap = showText ? textSize + 6 : 0;
    var width = barsWidth + margin * 2;
    var totalHeight = height + margin * 2 + textGap;

    var rects = [];
    var x = margin;
    var isBar = true; // Code 128 always starts with a bar
    for (var k = 0; k < modules.length; k++) {
      var w = modules[k] * mw;
      if (isBar) {
        rects.push('<rect x="' + x.toFixed(2) + '" y="' + margin +
          '" width="' + w.toFixed(2) + '" height="' + height + '" fill="' + color + '"/>');
      }
      x += w;
      isBar = !isBar;
    }

    var textEl = '';
    if (showText) {
      textEl = '<text x="' + (width / 2).toFixed(2) + '" y="' +
        (margin + height + textGap - 2) + '" text-anchor="middle" ' +
        'font-family="' + fontFamily + '" font-size="' + textSize +
        '" letter-spacing="1" fill="' + color + '">' +
        escapeXml(text) + '</text>';
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width.toFixed(0) +
      '" height="' + totalHeight.toFixed(0) + '" viewBox="0 0 ' + width.toFixed(0) +
      ' ' + totalHeight.toFixed(0) + '">' +
      '<rect width="100%" height="100%" fill="' + background + '"/>' +
      rects.join('') + textEl + '</svg>';
  }

  function escapeXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** True if every character can be represented (so the UI can warn early). */
  function canEncode(text) {
    if (!text) return false;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i) - 32;
      if (code < 0 || code > 94) return false;
    }
    return true;
  }

  return { toSVG: toSVG, canEncode: canEncode };
}));
