const util = require('../topUtil.js');
const RestClient = require('./network.js');
const Stream = require('stream');
const v8 = require('v8');
/**
 * TOP API Client.
 *
 * @param {Object} options, must set `appkey` and `appsecret`.
 * @constructor
 */

function TopBatch(options) {
  if (!(this instanceof TopBatch)) {
    return new TopBatch(options);
  }
  options = options || {};
  if (!options.appkey || !options.appsecret) {
    throw new Error('appkey or appsecret need!');
  }
  this.url = options.url || 'http://gw.api.taobao.com/router/batch';
  this.appkey = options.appkey;
  this.appsecret = options.appsecret;
  this.aliRequest = options.aliRequest;
}

/**
 * Invoke an api by method name.
 *
 * @param {Array} reqs, [{method: xxxx, params: xxxxx}]
 * @param {OBject} publicReq, {mathod: xxxx, params: xxxx}
 * @param {Function(err, response)} callback
 */
TopBatch.prototype.execute = function (reqs, publicReq=null) {
  const that = this;
  return new Promise(function (resolve, reject) {
    if (reqs.length < 1) {
      return reject(new Error('cuo le!'));
    }
    const backupPublic = v8.deserialize(v8.serialize(publicReq));
    that.request(reqs, publicReq, function (err, result) {
      if (err) {
        return reject(err);
      }
      const results = result.split("\r\n-S-\r\n");

      const response = results.map(async (res, index) => {
        let method = reqs[index].method;
        if (typeof method === "undefined") {
          method = publicReq.method;
        }
        let responseName = util.getApiResponseName(method);
        let json = JSON.parse(res);
        let resp = json[responseName];
        if (typeof resp === 'undefined') {
          resp = json;
        }
        const errRes = resp && resp.error_response;
        if (errRes && errRes.code === 15) {
          const param = {...backupPublic.params, ...reqs[index].params};
          // console.log("retry re", param);
          try {
            return await that.aliRequest.execute(method, param);
          }catch (e) {
            return resp;
          }
        }
        if (errRes && errRes.code === 27) {
          resp.error_response.message = '店铺授权已过期, 请到速卖通服务市场续费后，回到控制台重新添加授权'
        }
        return resp;
      });

      Promise.all(response).then(a => resolve(a));
      // resolve(response);
    });
  })
};

/**
 * Request API.
 *
 * @param {Array} reqs, [{method: xxxx, params: xxxxx}]
 * @param {Object} publicReq, {method: xxxx, params: xxxxx}
 * @param {Function(err, result)} callback
 * @public
 */
TopBatch.prototype.request = function (reqs, publicReq=null, callback) {
  const args = {
    timestamp: this.timestamp(),
    format: 'json',
    app_key: this.appkey,
    v: '2.0',
    sign_method: 'md5'
  };

  function linePayload (obj) {
    if (obj.params.sessionInfo) {
      // const now = Date.now();
      // const thirdExpiredTime = obj.params.sessionInfo.sessionExpireTime + 86400000;
      // if (now > thirdExpiredTime) {
      //   let err = new Error('店铺授权已过期, 请到速卖通服务市场续费后，回到控制台重新添加授权');
      //   err.code = 27;
      //   return callback(err);
      // }
      obj.params.session = obj.params.sessionInfo.session;
      delete obj.params.sessionInfo;
    }

    let line = ''

    if (typeof obj.method !== 'undefined') {
      line = 'method=' + obj.method
    }

    for (var key in obj.params) {
      let data = obj.params[key]
      if (typeof data === 'object') {
        data = JSON.stringify(obj.params[key])
      }
      if (line.length > 0) {
        line += '&'
      }
      line = line + key + '=' + data
    }
    return line;
  }

  //关于占位符N的事，如果method和参数都抽象到public，那这个api还有啥意义呢？
  let payload = '';
  if (publicReq !== null) {
    payload = payload + '#PUBLIC#' + linePayload(publicReq)
  }
  for (var i = 0; i < reqs.length ; i++) {
    if (payload.length > 0) {
      payload += "\r\n-S-\r\n";
    }
    payload += linePayload(reqs[i])
  }

  args.sign = this.sign(args, payload);

  let urlStr = this.url + '?'

  for (var key in args) {
    urlStr = urlStr + key + '=' + args[key] + '&';
  }

  const request = RestClient.post(urlStr, {'Content-Type': 'text/plain;charset=UTF-8'}, payload);

  request.end(function(response){
    if (response.statusCode === 200) {
      const data = response.body;
      const errRes = data && data.error_response;
      if (errRes && !errRes.message) {
        errRes.message = errRes.msg || 'xxx';
      }
      if (errRes) {
        callback(errRes, data);
      } else {
        callback(null, data);
      }
    } else {
      const err = new Error('NetWork-Error');
      err.name = 'NetWork-Error';
      err.code = 15;
      err.sub_code = response.statusCode;
      callback(err, null);
    }
  })
};

/**
 * Get now timestamp with 'yyyy-MM-dd HH:mm:ss' format.
 * @return {String}
 */
TopBatch.prototype.timestamp = function () {
  return util.YYYYMMDDHHmmss();
};

/**
 * Sign API request.
 * see http://open.taobao.com/doc/detail.htm?id=111#s6
 *
 * @param  {Object} params
 * @return {String} sign string
 */
TopBatch.prototype.sign = function (args, payload) {
  var sorted = Object.keys(args).sort();
  var basestring = this.appsecret;
  for (var i = 0, l = sorted.length; i < l; i++) {
    var k = sorted[i];
    basestring += k + args[k];
  }
  basestring += payload;
  basestring += this.appsecret;
  return util.md5(basestring).toUpperCase();
};

/**
 * execute top api
 */


exports.TopBatch = TopBatch;
