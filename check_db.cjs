const db = require('better-sqlite3')('sites.db');
const site = db.prepare("SELECT what3words, hoodedPloversLink, siteContact, launchHeight, emergencyMarker, navigateTo, siteguideUrl, weatherStationLink FROM sites WHERE id = 'great-missenden-previously-known-as-landscape'").get();
console.log(site);
