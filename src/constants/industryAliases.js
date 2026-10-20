// Maps common free-text industry labels (Apollo/LinkedIn-style, as seen in
// imported CSVs) to the closest matching GICS industry from industries.js.
// Used to keep the accounts.industry field constrained even when data comes
// in through the CSV import path rather than the Add/Edit Account dropdown.

import { GICS_INDUSTRY_LIST } from './industries';

const GICS_SET = new Set(GICS_INDUSTRY_LIST.map(function (s) { return s.toLowerCase(); }));

// key: lowercase, trimmed free-text label -> value: exact GICS industry string
export const INDUSTRY_ALIASES = {
  'information technology & services': 'IT Services',
  'information technology and services': 'IT Services',
  'it services and it consulting': 'IT Services',
  'it services/consulting': 'IT Services',
  'technology/it services': 'IT Services',
  'computer software': 'Software',
  'internet': 'Interactive Media & Services',
  'financial services': 'Diversified Financial Services',
  'banking': 'Banks',
  'bfsi': 'Diversified Financial Services',
  'bfsi / banking': 'Banks',
  'bfsi/banking': 'Banks',
  'banking & financial services': 'Banks',
  'investment management': 'Diversified Financial Services',
  'insurance': 'Insurance',
  'insurance (bfsi)': 'Insurance',
  'retail': 'Broadline Retail',
  'retail/ecommerce': 'Broadline Retail',
  'retail / ecommerce': 'Broadline Retail',
  'wholesale': 'Distributors',
  'retail / wholesale': 'Distributors',
  'apparel & fashion': 'Textiles, Apparel & Luxury Goods',
  'retail / apparel & fashion': 'Textiles, Apparel & Luxury Goods',
  'automotive': 'Automobiles',
  'automotive / motor vehicle manufacturing': 'Automobiles',
  'automotive / manufacturing': 'Automobiles',
  'automotive aftermarket / auto parts': 'Auto Components',
  'automotive services / vehicle repair': 'Diversified Consumer Services',
  'telecom': 'Diversified Telecommunication Services',
  'telecommunications': 'Diversified Telecommunication Services',
  'communications': 'Diversified Telecommunication Services',
  'electrical/electronic manufacturing': 'Electrical Equipment',
  'machinery': 'Machinery',
  'automation machinery manufacturing': 'Machinery',
  'industrial automation': 'Machinery',
  'industrial automation / engineering & technology': 'Machinery',
  'industrial manufacturing / motion & control': 'Machinery',
  'industrial manufacturing / tools & hardware': 'Machinery',
  'manufacturing/industrial equipment': 'Machinery',
  'mechanical or industrial engineering': 'Machinery',
  'metal manufacturing / heat treatment': 'Metals & Mining',
  'outdoor power equipment / manufacturing': 'Machinery',
  'plumbing products / manufacturing': 'Building Products',
  'consumer electronics / home appliances': 'Household Durables',
  'furniture company': 'Household Durables',
  'utilities': 'Multi-Utilities',
  'energy / utilities': 'Multi-Utilities',
  'oil & energy': 'Integrated Oil & Gas',
  'oil and gas': 'Integrated Oil & Gas',
  'oil & industries': 'Integrated Oil & Gas',
  'mining': 'Metals & Mining',
  'mining & metals': 'Metals & Mining',
  'chemicals': 'Chemicals',
  'higher education': 'Diversified Consumer Services',
  'education': 'Diversified Consumer Services',
  'law practice': 'Professional Services',
  'management consulting': 'Professional Services',
  'business consulting and services': 'Professional Services',
  'human resources': 'Professional Services',
  'management': 'Professional Services',
  'publishing': 'Media',
  'media production': 'Media',
  'entertainment': 'Entertainment',
  'sporting goods': 'Leisure Products',
  'health, wellness & fitness': 'Diversified Consumer Services',
  'hospital & health care': 'Health Care Providers & Services',
  'hospitals and health care': 'Health Care Providers & Services',
  'medical devices': 'Health Care Equipment & Supplies',
  'medical devices / healthcare equipment': 'Health Care Equipment & Supplies',
  'medical equipment manufacturing': 'Health Care Equipment & Supplies',
  'pharmaceuticals': 'Pharmaceuticals',
  'logistics': 'Air Freight & Logistics',
  'logistics & supply chain': 'Air Freight & Logistics',
  'transportation/trucking/railroad': 'Ground Transportation',
  'rail transportation': 'Ground Transportation',
  'airlines/aviation': 'Passenger Airlines',
  'airlines': 'Passenger Airlines',
  'airlines and aviation': 'Passenger Airlines',
  'aviation and aerospace component manufacturing': 'Aerospace & Defense',
  'defense & space': 'Aerospace & Defense',
  'construction': 'Construction & Engineering',
  'environmental services': 'Commercial Services & Supplies',
  'consumer services': 'Diversified Consumer Services',
  'food & beverage': 'Food Products',
  'food & beverages': 'Food Products',
  'food production': 'Food Products',
  'semiconductors': 'Semiconductors & Semiconductor Equipment',
  'data center infrastructure / it infrastructure': 'IT Services',
  'technology': 'Software',
  'other': null,
};

// Returns an exact GICS industry string, or null if there is no confident
// match (left null rather than guessing, so it can be classified by hand).
export function normalizeIndustry(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  if (GICS_SET.has(key)) {
    return GICS_INDUSTRY_LIST.find(function (s) { return s.toLowerCase() === key; });
  }
  if (Object.prototype.hasOwnProperty.call(INDUSTRY_ALIASES, key)) {
    return INDUSTRY_ALIASES[key];
  }
  return null;
}
