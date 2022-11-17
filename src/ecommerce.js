(function () {

  /**
   * WonderPush E-commerce plugin
   * @class Ecommerce
   * @param {external:WonderPushPluginSDK} WonderPushSDK - The WonderPush SDK instance provided automatically on intanciation.
   * @param {Ecommerce.Options} options - The plugin options.
   */
  /**
   * @typedef {Object} Ecommerce.Options
   * @property {string} [thankYouPageUrl] - A pattern contained the URL of your thank-you page, no wildcards. Be careful not to match other pages.
   * @property {string} [addToCartButtonQuerySelector] - A query selector that matches your add-to-cart button(s) with document.querySelectorAll. See https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll
   * @property {string} [removeFromCartButtonQuerySelector] - A query selector that matches your remove-from or empty cart button(s) with document.querySelectorAll. See https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll
   */
  /**
   * The WonderPush JavaScript SDK instance.
   * @external WonderPushPluginSDK
   * @see {@link https://wonderpush.github.io/wonderpush-javascript-sdk/latest/WonderPushPluginSDK.html|WonderPush JavaScript Plugin SDK reference}
   */
  WonderPush.registerPlugin("ecommerce", {
    window: function (WonderPushSDK, options) {
      window.WonderPush = window.WonderPush || [];
      options = options || {};

      var sanitize = function(s) {
        if (!s) return s;
        var stripped = s.replace(/(<([^>]+)>)/gi, "");
        return stripped.length > 120 ? stripped.substr(0, 119) + '…' : stripped;
      };

      var lastEventTracked;
      var trackEvent = function(type, data) {
        // Discard duplicate events
        if (lastEventTracked && lastEventTracked.type === type && lastEventTracked.data && lastEventTracked.data.object_product && lastEventTracked.data.object_product.string_sku && data && data.object_product && data.object_product.string_sku === lastEventTracked.data.object_product.string_sku) {
          return;
        }
        lastEventTracked = { type: type, data: data };
        window.WonderPush.push(['trackEvent', type, data]);
      };

      var getProductJson = function() {
        var objs = [];
        Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
          .forEach(function(_) {
            try {
              var textContent = _.textContent || '';
              // Replace line breaks with spaces to make parsing more robust
              textContent = textContent.replace(/\n+/g, ' ');
              var item = JSON.parse(textContent);
              if (Array.isArray(item)) {
                item.forEach(x => objs.push(x));
              } else {
                objs.push(item);
              }
            } catch (e) {
              console.warn('[WonderPush] unable to parse ld+json data, e-commerce features might not work as expected', e);
            }
          })
        return objs.find(function(_) { return _['@type'] === 'Product' || _['@type'] === 'http://schema.org/Product'; });
      };

      var productJsonToWonderPushJson = function(product) {
        var price = parseFloat(product.offers.price);
        if (isNaN(price)) price = null;

        var cleanup = function(s) { return (s||"").replace(/^https?:\/\/schema.org\//, ''); };
        var cleanupDateString = function(dateString) {
          if (!dateString) return undefined;
          try {
            var d = new Date(dateString);
            if (isNaN(d)) return undefined;
            return d.toISOString();
          } catch (e) {}
        };
        return ({
          string_type: product['@type'],
          string_image: (
            (product.image && Array.isArray(product.image)) ? (product.image.length && product.image[0]) : (typeof product.image === 'string' ? product.image : undefined)
          ) || undefined,
          string_name: sanitize(product.name),
          string_description: sanitize(product.description),
          string_sku: product.sku,
          string_gtin13: product.gtin13,
          object_offers: product.offers ? {
            string_type: product.offers['@type'],
            float_price: price,
            string_priceCurrency: product.offers.priceCurrency,
            date_priceValidUntil: cleanupDateString(product.offers.priceValidUntil),
            string_url: product.offers.url,
            string_itemCondition: cleanup(product.offers.itemCondition),
            string_availability: cleanup(product.offers.availability),
          } : undefined,
          object_brand: product.brand ? {
            string_name: product.brand.name || undefined,
            string_type: product.brand['@type'] || undefined,
          } : undefined,
        });
      };

      var addToCartHandler = function() {
        var product = getProductJson();
        if (!product) return;
        trackEvent('AddToCart', {
          object_product: productJsonToWonderPushJson(product),
          string_url: window.location.href,
        });
      };

      var removeFromCartHandler = function() {
        var product = getProductJson();
        if (!product) return;
        trackEvent('RemoveFromCart', {
          object_product: productJsonToWonderPushJson(product),
          string_url: window.location.href,
        });
      };

      var lastExitEventDate;
      var lastExitEventUrl;
      var exitHandler = function() {
        var product = getProductJson();
        if (!product) return;
        // Fire at most every 5 minutes for a given url
        if (lastExitEventUrl === window.location.href && lastExitEventDate && (+new Date() - lastExitEventDate.getTime()) < 5 * 60000) {
          return;
        }
        lastExitEventDate = new Date();
        lastExitEventUrl = window.location.href;
        trackEvent('Exit', {
          object_product: productJsonToWonderPushJson(product),
          string_url: window.location.href,
        });
      };

      var purchaseHandler = function() {
        // Do nothing if thankYouPageUrl isn't configured or if it isn't present in the current URL
        if (!options.thankYouPageUrl || (""+window.location.href).indexOf(options.thankYouPageUrl) < 0) {
          return;
        }
        var product = getProductJson();
        trackEvent('Purchase', product ? {
          object_product: productJsonToWonderPushJson(product),
          string_url: window.location.href,
        } : undefined);
      };

      // Register handlers
      var registeredHandlers = [];
      var registerHandlers = function() {
        var register = function(query, handler) {
          if (!handler) return;
          Array.from(document.querySelectorAll(query)).forEach(function (elt) {
            elt.addEventListener('click', handler);
            registeredHandlers.push([elt, handler]);
          });
        };
        // Un-register previous handlers
        registeredHandlers.forEach(function(e) {
          var elt = e[0];
          var h = e[1];
          if (elt && h) {
            elt.removeEventListener('click', h);
          }
        });
        registeredHandlers = [];
        if (options.addToCartButtonQuerySelector) register(options.addToCartButtonQuerySelector, addToCartHandler);
        if (options.removeFromCartButtonQuerySelector) register(options.removeFromCartButtonQuerySelector, removeFromCartHandler);
      };

      document.addEventListener('mouseout', function(e) {
        if (!e.toElement && !e.relatedTarget) {
          exitHandler(e);
        }
      });

      // Listen for URL changes
      var url = window.location.href;
      setInterval(function() {
        if (window.location.href === url) return;
        url = window.location.href;
        purchaseHandler();
        registerHandlers();
      }, 1000);

      purchaseHandler();
      registerHandlers();
    }
  });
})();
