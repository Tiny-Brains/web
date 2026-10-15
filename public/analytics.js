// GOOGLE ANALYTICS, the half of Google's snippet that is normally inline. index.html loads gtag.js
// from googletagmanager.com and then this file, which queues the commands gtag.js reads on arrival.
//
// A FILE AND NOT AN INLINE <script>, because nginx.conf's policy on index.html is script-src 'self'
// with no 'unsafe-inline': pasted inline, this would be refused and the tag would load and send
// nothing. The measurement id is here, in index.html's loader URL and in docs/theme/head.hbs (the
// book, which has no such policy and carries the snippet whole); change all three together.
//
// No page_view of our own: GA4's enhanced measurement counts a router navigation (a pushState) as
// a page view, so the application carries no analytics code.
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('js', new Date());

gtag('config', 'G-N0LK2NVJ6P');
