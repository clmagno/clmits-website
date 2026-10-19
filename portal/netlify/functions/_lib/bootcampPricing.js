// Server-side source of truth for bootcamp pricing. Never trust an amount
// sent by the client -- the client only sends offeringSlug + tier keys, and
// this file resolves those to what to charge. Mirrors clmits.com's
// #bootcamps section; keep both in sync when prices/deadlines change.
//
// Every tier is a list of `installments`: the first is charged immediately
// at registration (bootcamp-checkout.js), the rest are scheduled for later
// and collected one at a time by an admin-generated PayMongo link (there's
// no auto-billing -- GCash can't be silently charged). A single-payment
// tier is just a one-element installments array.
//
// Deadlines are in Asia/Manila (+08:00). A tier past its deadline is treated
// as unavailable.

const OFFERINGS = {
    'cloud-de-bundle': {
        title: 'Cloud + Data Engineering Track',
        tiers: {
            early_bird_full: {
                label: 'Early Bird — Full Cash Payment (Best Value)',
                deadline: '2026-11-20T23:59:59+08:00',
                installments: [
                    { label: 'Down Payment (today)', amountCentavos: 1250000 },
                    { label: 'Balance (on or before Nov 30, 2026)', amountCentavos: 1250000 }
                ]
            },
            early_bird_installment: {
                label: 'Early Bird — Installment Plan',
                deadline: '2026-11-20T23:59:59+08:00',
                installments: [
                    { label: 'Down Payment (today)', amountCentavos: 1250000 },
                    { label: 'Monthly Installment 1', amountCentavos: 550000 },
                    { label: 'Monthly Installment 2', amountCentavos: 550000 },
                    { label: 'Monthly Installment 3', amountCentavos: 550000 }
                ]
            },
            standard: {
                label: 'Standard Rate',
                deadline: null,
                installments: [
                    { label: 'Full Payment (today)', amountCentavos: 3500000 }
                ]
            }
        }
    },
    'gcp-bootcamp': {
        title: 'GCP Associate Cloud Engineer Bootcamp',
        tiers: {
            early_bird: {
                label: 'Early Bird',
                deadline: '2026-11-20T23:59:59+08:00',
                installments: [{ label: 'Full Payment (today)', amountCentavos: 2999900 }]
            },
            standard: {
                label: 'Standard Rate',
                deadline: null,
                installments: [{ label: 'Full Payment (today)', amountCentavos: 3500000 }]
            }
        }
    },
    'python-automation': {
        title: 'Python Automation for IT & Ops',
        tiers: {
            early_bird: {
                label: 'Early Bird',
                deadline: '2026-11-13T23:59:59+08:00',
                installments: [{ label: 'Full Payment (today)', amountCentavos: 2100000 }]
            },
            standard: {
                label: 'Standard Rate',
                deadline: null,
                installments: [{ label: 'Full Payment (today)', amountCentavos: 2500000 }]
            }
        }
    },
    'sql-foundations': {
        title: 'SQL Foundations',
        tiers: {
            early_bird: {
                label: 'Early Bird',
                deadline: '2026-10-23T23:59:59+08:00',
                installments: [{ label: 'Full Payment (today)', amountCentavos: 650000 }]
            },
            standard: {
                label: 'Standard Rate',
                deadline: null,
                installments: [{ label: 'Full Payment (today)', amountCentavos: 800000 }]
            }
        }
    }
};

function getOffering(slug) {
    return OFFERINGS[slug] || null;
}

// Returns null if the offering/tier doesn't exist, or the tier's early-bird
// deadline has already passed. totalCentavos is derived (sum of all
// installments), not stored, so it can never drift out of sync.
function getTier(offeringSlug, tierKey) {
    const offering = getOffering(offeringSlug);
    if (!offering) return null;
    const tier = offering.tiers[tierKey];
    if (!tier) return null;
    if (tier.deadline && new Date() > new Date(tier.deadline)) return null;
    const totalCentavos = tier.installments.reduce((sum, i) => sum + i.amountCentavos, 0);
    return { ...tier, offeringTitle: offering.title, totalCentavos };
}

module.exports = { OFFERINGS, getOffering, getTier };
