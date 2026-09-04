/** Google Apps Script catalogue adapter. Deploy as a Web App and keep the token in Script Properties. */
function doGet(event) {
  const token = PropertiesService.getScriptProperties().getProperty('CATALOG_TOKEN');
  if (!token || event.parameter.token !== token) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
  }
  const sheet = SpreadsheetApp.getActive().getSheetByName('Product Catalogue');
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.shift();
  const products = values.map(function (row) {
    const item = {};
    headers.forEach(function (header, index) { item[header] = row[index]; });
    ['additionalImages','colours','sizes','variants','customisationOptions','labels','tags'].forEach(function (key) { item[key] = item[key] ? item[key].split('|').map(function (v) { return v.trim(); }) : []; });
    ['regularPrice','salePrice','customisationCharge','stockQuantity'].forEach(function (key) { item[key] = item[key] === '' ? null : Number(item[key]); });
    ['customisable','madeToOrder','visibility','featured','bestseller','newArrival'].forEach(function (key) { item[key] = String(item[key]).toLowerCase() === 'true'; });
    try { item.variantPricing = JSON.parse(item.variantPricing || '{}'); } catch (_) { item.variantPricing = {}; }
    return item;
  }).filter(function (item) { return item.visibility; });
  return ContentService.createTextOutput(JSON.stringify({ products: products })).setMimeType(ContentService.MimeType.JSON);
}
