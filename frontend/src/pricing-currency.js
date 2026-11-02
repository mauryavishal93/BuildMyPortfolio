export function preferredPricingCurrency(locale = globalThis.navigator?.language) {
  try {
    return new Intl.Locale(locale || 'en-US').region === 'IN' ? 'INR' : 'USD';
  } catch {
    return 'USD';
  }
}

export function formatCurrencyPrice(amount, currency, locale = globalThis.navigator?.language || 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'USD' ? 2 : 0,
    maximumFractionDigits: currency === 'USD' ? 2 : 0
  }).format(amount);
}
