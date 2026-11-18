const http = require('http');
const fs = require('fs');
const path = require('path');

require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: false });

const nameHandler = require('./api/name');
const historyHandler = require('./api/history');

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/' || url.pathname === '/index.html') {
    const htmlPath = path.join(__dirname, 'index.html');
    fs.readFile(htmlPath, (err, data) => {
      if (err) {
        res.statusCode = 500;
        res.end('页面读取失败');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (url.pathname === '/api/name') {
    return nameHandler(req, res);
  }

  if (url.pathname === '/api/history') {
    return historyHandler(req, res);
  }

  res.statusCode = 404;
  res.end('Not Found');
});

server.listen(port, () => {
  console.log(`AI 起名平台已启动：http://localhost:${port}`);
});
