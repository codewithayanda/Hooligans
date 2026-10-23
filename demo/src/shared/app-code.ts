import { fakeAnonKey } from './keys.js';

/** The script every demo page loads: what a small single-page app does when it opens. */
export function appCode(): string {
  return `var root = document.getElementById('app');
var anonKey = '${fakeAnonKey()}';

fetch('/api/track', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ page: location.pathname }),
});

// A page that tries to reach another machine. Hooligans has to block this request.
fetch('http://10.255.255.1/hooligans-demo').catch(function () {});

// How an app reads a Supabase style table with its public key.
fetch('/rest/v1/orders?select=*&limit=1', {
  headers: { apikey: anonKey, authorization: 'Bearer ' + anonKey },
}).catch(function () {});

fetch('/api/users').catch(function () {});
fetch('/api/stats').catch(function () {});
fetch('/api/activity').catch(function () {});

fetch('/api/products')
  .then(function (response) { return response.json(); })
  .then(function (products) {
    if (!root) return;
    var list = document.createElement('ul');
    products.forEach(function (product) {
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = '/products/' + product.id;
      link.textContent = product.name;
      item.appendChild(link);
      list.appendChild(item);
    });
    root.textContent = '';
    root.appendChild(list);
  });
`;
}
