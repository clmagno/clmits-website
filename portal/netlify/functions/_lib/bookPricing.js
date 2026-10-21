// Server-side source of truth for companion-book pricing. Mirrors the
// pattern in bootcampPricing.js -- the client only ever sends a book slug,
// never an amount.

const BOOKS = {
    phase1: { slug: 'phase1', title: 'Phase 1: Foundations', file: 'Phase_1_Book.html', priceCentavos: 49900 },
    phase2: { slug: 'phase2', title: 'Phase 2: Data Processing & Architecture', file: 'Phase_2_Book.html', priceCentavos: 59900 },
    phase3: { slug: 'phase3', title: 'Phase 3: Big Data & Automation', file: 'Phase_3_Book.html', priceCentavos: 59900 }
};

function getBook(slug) {
    return BOOKS[slug] || null;
}

module.exports = { BOOKS, getBook };
