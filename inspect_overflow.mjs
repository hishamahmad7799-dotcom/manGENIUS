const res = await fetch('http://127.0.0.1:9222/json');
const tabs = await res.json();
const targetTab = tabs.find(t => t.url.includes('client-website/index.html'));
const ws = new WebSocket(targetTab.webSocketDebuggerUrl);

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const docWidth = document.documentElement.offsetWidth;
        const overflowing = [];
        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.right > docWidth + 1 || rect.width > docWidth + 1) {
            overflowing.push({
              tag: el.tagName,
              className: el.className,
              id: el.id,
              width: rect.width,
              right: rect.right
            });
          }
        });
        return { docWidth, windowWidth: window.innerWidth, overflowing };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.id === 1) {
    console.log(JSON.stringify(data.result.result.value, null, 2));
    process.exit(0);
  }
};
