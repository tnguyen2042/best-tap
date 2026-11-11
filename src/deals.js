// Limited-time deals and benefits listed on a card in catalog.json.
// A deal is { emoji, text, until?: 'YYYY-MM-DD', tag?: string }. tag "activate" means you must turn it on.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function activeDeals(card, now = new Date()) {
  return (card.deals || [])
    .filter((d) => !d.until || now <= new Date(d.until + 'T23:59:59'))
    .slice()
    .sort((a, b) => (a.until || '9999') < (b.until || '9999') ? -1 : (a.until || '9999') > (b.until || '9999') ? 1 : 0);
}

// "⏰ by Dec 31" within 60 days, "by Dec 31" this year, "to Sep 30, 2027" later.
export function dealWhen(deal, now = new Date()) {
  if (!deal.until) return deal.tag || '';
  const d = new Date(deal.until + 'T12:00:00');
  const day = MONTHS[d.getMonth()] + ' ' + d.getDate();
  const sameYear = d.getFullYear() === now.getFullYear();
  const text = (deal.tag === 'activate' || sameYear ? 'by ' : 'to ') + day + (sameYear ? '' : ', ' + d.getFullYear());
  const soon = d.getTime() - now.getTime() < 60 * 24 * 3600 * 1000;
  return (soon ? '⏰ ' : '') + text;
}
