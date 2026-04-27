function SilidoxSiteNav({ repoUrl, homeUrl }) {
  const nav = document.createElement("div");

  nav.innerHTML = `
    <a href="${homeUrl}" title="Home" aria-label="Home">⌂</a>
    <a href="${repoUrl}" title="GitHub" aria-label="GitHub"> GitHub </a>
  `;

  nav.style.cssText = `
    position: fixed;
    right: 16px;
    top: 16px;
    z-index: 9999;
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 10px;
    border-radius: 999px;
    background: rgba(0,0,0,.72);
    backdrop-filter: blur(8px);
    font-family: system-ui, sans-serif;
  `;

  nav.querySelectorAll("a").forEach(a => {
    a.style.cssText = `
      color: white;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
    `;
  });

  document.body.appendChild(nav);
}