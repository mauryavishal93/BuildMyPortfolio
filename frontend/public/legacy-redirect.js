(function () {
  const legacyHosts = new Set([
    'buildmyportfolio.onrender.com',
    'www.buildmyportfolio.onrender.com',
    'buildmyportfolio.com',
    'www.buildmyportfolio.com'
  ]);
  const targetHost = 'personacraftpro.onrender.com';
  const host = window.location.hostname.toLowerCase();

  if (legacyHosts.has(host)) {
    const target = `https://${targetHost}${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(target);
  }
})();
