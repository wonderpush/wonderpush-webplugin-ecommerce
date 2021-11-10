(function () {

  /**
   * WonderPush E-commerce plugin 
   * @class Ecommerce
   * @param {external:WonderPushPluginSDK} WonderPushSDK - The WonderPush SDK instance provided automatically on intanciation.
   * @param {Ecommerce.Options} options - The plugin options.
   */
  /**
   * @typedef {Object} Ecommerce.Options
   * @property {string} [thankYouPageUrl] - The path to your purchase thank-you page. Should start with /. Example: /thank-you.html
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
        return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
          .map(function(_) {
            try {
              return JSON.parse(_.textContent);
            } catch (e) {
              return {};
            }
          }).find(function(_) { return _['@type'] === 'Product'; });
      };

      var productJsonToWonderPushJson = function(product) {
        return ({
          string_type: product['@type'],
          string_image: product.image && product.image.length && product.image[0] || undefined,
          string_name: product.name,
          string_description: product.description,
          string_sku: product.sku,
          string_gtin13: product.gtin13,
          object_offers: product.offers ? {
            string_type: product.offers['@type'],
            string_price: product.offers.price,
            string_priceCurrency: product.offers.priceCurrency,
            string_priceValidUntil: product.offers.priceValidUntil,
            string_url: product.offers.url,
            string_itemCondition: product.offers.itemCondition,
            string_availability: product.offers.availability,
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
        trackEvent('AddToCart', { object_product: productJsonToWonderPushJson(product) });
      };

      var removeFromCartHandler = function() {
        var product = getProductJson();
        if (!product) return;
        trackEvent('RemoveFromCart', { object_product: productJsonToWonderPushJson(product) });
      };

      var exitHandler = function() {
        var product = getProductJson();
        trackEvent('Exit', { object_product: productJsonToWonderPushJson(product) });
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
        registerHandlers();
      }, 1000);

      registerHandlers();
    }
  });
})();
