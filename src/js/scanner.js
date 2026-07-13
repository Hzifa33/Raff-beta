/*
 * RaffScanner — detects input from a USB/Bluetooth barcode scanner.
 *
 * How keyboard-wedge scanners work: to the operating system they look exactly
 * like a keyboard. When a barcode is scanned, the device "types" the decoded
 * text extremely fast and then sends an Enter key. There is no driver and no
 * device API — so we detect a scan by its *timing signature*: a burst of
 * characters arriving far faster than any human could type, terminated by
 * Enter.
 *
 * We attach one global keydown listener. If characters arrive with tiny gaps
 * (below a threshold) and the line ends in Enter, we treat the buffer as a
 * scan and fire onScan(code). Human typing (slow, with normal gaps) never
 * triggers it, so the app stays usable normally. A focused text input can opt
 * out via the data-no-scan attribute when needed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RaffScanner = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createScanner(options) {
    options = options || {};
    // Max gap (ms) between two keystrokes for them to count as "same scan".
    var maxGap = options.maxGap || 35;
    // A scan must be at least this many chars (filters stray Enter presses).
    var minLength = options.minLength || 3;
    var onScan = options.onScan || function () {};

    var buffer = '';
    var lastTime = 0;
    var enabled = true;

    function onKeydown(e) {
      if (!enabled) return;

      var now = Date.now();
      var gap = now - lastTime;
      lastTime = now;

      // A large gap means a new (possibly human) sequence starts here.
      if (gap > maxGap) buffer = '';

      if (e.key === 'Enter') {
        // End of a scan line. Only accept it if it arrived as a fast burst.
        if (buffer.length >= minLength && gap <= maxGap) {
          var code = buffer.trim();
          buffer = '';
          // Don't hijack Enter inside a field the user is deliberately typing
          // in, unless that field explicitly wants scans.
          var el = document.activeElement;
          var typingField = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
          var wantsScan = el && el.hasAttribute && el.hasAttribute('data-scan-target');
          if (code && (!typingField || wantsScan)) {
            e.preventDefault();
            onScan(code);
          }
        } else {
          buffer = '';
        }
        return;
      }

      // Only accumulate single visible characters (ignore Shift, arrows, etc.).
      if (e.key.length === 1) {
        buffer += e.key;
      }
    }

    document.addEventListener('keydown', onKeydown, true);

    return {
      enable: function () { enabled = true; },
      disable: function () { enabled = false; },
      destroy: function () { document.removeEventListener('keydown', onKeydown, true); },
    };
  }

  return { createScanner: createScanner };
}));
