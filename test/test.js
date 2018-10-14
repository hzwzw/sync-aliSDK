const async = require('async');
const http = require('http');
const top = require('../lib/api/topClient');

const topClient = new top.TopClient({
  appkey: 'xxx',
  "appsecret": 'ss'
});

async function f1() {
  await topClient.execute('xxx', {})
}

async function f2() {
  console.log("buyinggai")
}

async.waterfall([f1, f2], (e) => {
  console.log(e);
});
