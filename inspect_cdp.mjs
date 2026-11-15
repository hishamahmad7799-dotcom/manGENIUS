const res = await fetch('http://127.0.0.1:9222/json');
const tabs = await res.json();
const targetTab = tabs.find(t => t.url.includes('client-website/index.html'));
if (!targetTab) {
  console.error('Target tab not found!');
  process.exit(1);
}
const ws = new WebSocket(targetTab.webSocketDebuggerUrl);

ws.onopen = () => {
  // Set mobile device metrics override (iPhone X / 12 / 13 width: 375, height: 812)
  ws.send(JSON.stringify({
    id: 1,
    method: 'Emulation.setDeviceMetricsOverride',
    params: {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    }
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.id === 1) {
    // After device metrics override, evaluate
    ws.send(JSON.stringify({
      id: 2,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const toggle = document.querySelector('.mobile-nav-toggle');
          const header = document.querySelector('.header-container');
          const logo = document.querySelector('.brand-logo img');
          const getBox = el => el ? {
            x: el.getBoundingClientRect().x,
            y: el.getBoundingClientRect().y,
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
            right: el.getBoundingClientRect().right
          } : null;
          return {
            windowInnerWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            header: getBox(header),
            toggle: getBox(toggle),
            logo: getBox(logo),
            toggleDisplay: getComputedStyle(toggle).display
          };
        })()`,
        returnByValue: true
      }
    }));
  } else if (data.id === 2) {
    console.log(JSON.stringify(data.result.result.value, null, 2));
    process.exit(0);
  }
};
