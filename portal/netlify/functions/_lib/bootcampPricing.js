// Server-side source of truth for bootcamp pricing. Never trust an amount
// sent by the client -- the client only sends offeringSlug + tier keys, and
// this file resolves those to the actual centavo amount to charge. Mirrors
// the tiers published on clmits.com's #bootcamps section; keep both in sync
// when prices or deadlines change.
//
// Deadlines are in Asia/Manila (+08:00), matching the early-bird cutoffs
// shown on the site. A tier past its deadline is treated as unavailable.

const OFFERINGS = {
    'cloud-de-bundle': {
        title: 'Cloud + Data Engineering Track',
        tiers: {
            early_bird_full: {
                label: 'Early Bird — Full Cash',
                amountCentavos: 2500000,
                totalCentavos: 2500000,
                deadline: '2026-11-20T23:59:59+08:00'
            },
            early_bird_installment: {
                label: 'Early Bird — Installment (₱5,000 down payment today)',
                amountCentavos: 500000,
                totalCentavos: 2900000,
                deadline: '2026-11-20T23:59:59+08:00'
            },
            standard: {
                label: 'Standard Rate',
                amountCentavos: 3500000,
                totalCentavos: 3500000,
                deadline: null
            }
        }
    },
    'gcp-bootcamp': {
        title: 'GCP Associate Cloud Engineer Bootcamp',
        tiers: {
            early_bird: {
                label: 'Early Bird',
                amountCentavos: 2999900,
                totalCentavos: 2999900,
                deadline: '2026-11-20T23:59:59+08:00'
            },
            standard: {
                label: 'Standard Rate',
                amountCentavos: 3500000,
                totalCentavos: 3500000,
                deadline: null
            }
        }
    },
    'python-automation': {
        title: 'Python Automation for IT & Ops',
        tiers: {
            early_bird: {
                label: 'Early Bird',
                amountCentavos: 2100000,
                totalCentavos: 2100000,
                deadline: '2026-11-13T23:59:59+08:00'
            },
            standard: {
                label: 'Standard Rate',
                amountCentavos: 2500000,
                totalCentavos: 2500000,
                deadline: null
            }
        }
    },
    'sql-foundations': {
        title: 'SQL Foundations',
        tiers: {
            early_bird: {
                label: 'Early Bird',
                amountCentavos: 650000,
                totalCentavos: 650000,
                deadline: '2026-10-23T23:59:59+08:00'
            },
            standard: {
                label: 'Standard Rate',
                amountCentavos: 800000,
                totalCentavos: 800000,
                deadline: null
            }
        }
    }
};

function getOffering(slug) {
    return OFFERINGS[slug] || null;
}

// Returns null if the offering/tier doesn't exist, or the tier's early-bird
// deadline has already passed.
function getTier(offeringSlug, tierKey) {
    const offering = getOffering(offeringSlug);
    if (!offering) return null;
    const tier = offering.tiers[tierKey];
    if (!tier) return null;
    if (tier.deadline && new Date() > new Date(tier.deadline)) return null;
    return { ...tier, offeringTitle: offering.title };
}

module.exports = { OFFERINGS, getOffering, getTier };
