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

      const sanitize = function(s) {
        if (!s) return s;
        if (typeof s !== 'string') return undefined;
        const stripped = s.replace(/(<([^>]+)>)/gi, "");
        return stripped.length > 120 ? stripped.substr(0, 119) + '…' : stripped;
      };

      let lastEventTracked;
      const trackEvent = function(type, data) {
        // Discard duplicate events
        if (lastEventTracked && lastEventTracked.type === type && lastEventTracked.data && lastEventTracked.data.object_product && lastEventTracked.data.object_product.string_sku && data && data.object_product && data.object_product.string_sku === lastEventTracked.data.object_product.string_sku) {
          return;
        }
        lastEventTracked = { type: type, data: data };
        window.WonderPush.push(['trackEvent', type, data]);
      };

      const getProductJson = function() {
        const objs = [];
        Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
          .forEach(function(_) {
            try {
              let textContent = _.textContent || '';
              // Replace line breaks with spaces to make parsing more robust
              textContent = textContent.replace(/\n+/g, ' ');
              const item = JSON.parse(textContent);
              if (Array.isArray(item)) {
                item.forEach(function(x) { objs.push(x); });
              } else {
                objs.push(item);
              }
            } catch (e) {
              console.warn('[WonderPush] unable to parse ld+json data, e-commerce features might not work as expected', e);
            }
          });
        return objs.find(function(_) { return _['@type'] === 'Product' || _['@type'] === 'http://schema.org/Product'; });
      };

      const productJsonToWonderPushJson = function(product) {
        const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
        let price = parseFloat(offer?.price);
        if (isNaN(price)) price = null;

        const cleanup = function(s) { return (s||"").replace(/^https?:\/\/schema.org\//, ''); };
        const cleanupDateString = function(dateString) {
          if (!dateString) return undefined;
          try {
            const d = new Date(dateString);
            if (isNaN(d)) return undefined;
            return d.toISOString();
          } catch (e) {}
        };
        let image;
        if (product.image) {
          const imageObject = Array.isArray(product.image) ? product.image[0] : product.image;
          image = typeof imageObject === 'string' ? imageObject : typeof imageObject === 'object' ? imageObject.contentUrl : undefined;
        }
        return ({
          string_type: typeof product['@type'] === 'string' ? product['@type'] : undefined,
          string_image: typeof image === 'string' ? image : undefined,
          string_name: sanitize(product.name),
          string_description: sanitize(product.description),
          string_sku: typeof product.sku === 'string' ? product.sku : undefined,
          string_gtin13: typeof product.gtin13 === 'string' ? product.gtin13 : undefined,
          object_offers: offer ? {
            string_type: typeof offer['@type'] === 'string' ? offer['@type'] : undefined,
            float_price: typeof price === 'number' ? price : undefined,
            string_priceCurrency: typeof offer.priceCurrency === 'string' ? offer.priceCurrency : undefined,
            date_priceValidUntil: cleanupDateString(offer.priceValidUntil),
            string_url: typeof offer.url === 'string' ? offer.url : undefined,
            string_itemCondition: cleanup(offer.itemCondition),
            string_availability: cleanup(offer.availability),
          } : undefined,
          object_brand: product.brand ? {
            string_name: typeof product.brand.name === 'string' ? (product.brand.name || undefined) : undefined,
            string_type: typeof product.brand['@type'] === 'string' ? (product.brand['@type'] || undefined) : undefined,
          } : undefined,
        });
      };

      const addToCartHandler = function() {
        const product = getProductJson();
        if (!product) return;
        trackEvent('AddToCart', {
          object_product: productJsonToWonderPushJson(product),
          string_url: window.location.href,
        });
      };

      const removeFromCartHandler = function() {
        const product = getProductJson();
        if (!product) return;
        trackEvent('RemoveFromCart', {
          object_product: productJsonToWonderPushJson(product),
          string_url: window.location.href,
        });
      };

      let lastExitEventDate;
      let lastExitEventUrl;
      const exitHandler = function() {
        const product = getProductJson();
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

      const purchaseHandler = function() {
        // Do nothing if thankYouPageUrl isn't configured or if it isn't present in the current URL
        if (!options.thankYouPageUrl || (""+window.location.href).indexOf(options.thankYouPageUrl) < 0) {
          return;
        }
        const product = getProductJson();
        trackEvent('Purchase', product ? {
          object_product: productJsonToWonderPushJson(product),
          string_url: window.location.href,
        } : undefined);
      };

      // Register handlers
      const registeredHandlers = [];
      let connectionCheckInterval;
      const registerHandlers = function() {
        if (connectionCheckInterval) clearInterval(connectionCheckInterval);
        const register = function(query, handler) {
          if (!handler) return;
          Array.from(document.querySelectorAll(query)).forEach(function (elt) {
            elt.addEventListener('click', handler);
            registeredHandlers.push({elt: elt, handler:handler});
          });
        };
        // Un-register previous handlers
        registeredHandlers.forEach(function(e) {
          if (e.elt && e.handler) {
            e.elt.removeEventListener('click', e.handler);
          }
        });
        registeredHandlers.splice();
        if (options.addToCartButtonQuerySelector) register(options.addToCartButtonQuerySelector, addToCartHandler);
        if (options.removeFromCartButtonQuerySelector) register(options.removeFromCartButtonQuerySelector, removeFromCartHandler);
        connectionCheckInterval = setInterval(function() {
          const disconnected = registeredHandlers.find(function(x) {
            return !x.elt.isConnected;
          });
          if (disconnected) registerHandlers();
        }, 1000);
      };

      document.addEventListener('mouseout', function(e) {
        if (!e.toElement && !e.relatedTarget) {
          exitHandler(e);
        }
      });

      // Listen for URL changes
      let url = window.location.href;
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
